import { compareStrategies, type BacktestStrategy, type PricePoint } from "../lib/backtest";
import { isIsoDate } from "../lib/date";
import { z } from "zod";
import { MarketDataError, isMarketDataError } from "./errors";
import { EodhdProvider } from "./providers/eodhd";
import { FixtureMarketDataProvider } from "./providers/fixture";
import type { MarketAsset, MarketDataProvider } from "./providers/types";

export interface ApiDependencies {
  provider?: MarketDataProvider;
}

interface BacktestAsset extends MarketAsset {
  source?: "provider" | "custom-csv";
  prices?: PricePoint[];
}

interface BacktestRequestBody {
  assets: BacktestAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital?: boolean;
}

const MAX_ASSETS_PER_BACKTEST = 6;
const MAX_STRATEGIES_PER_BACKTEST = 6;
const MAX_CUSTOM_PRICE_ROWS = 20_000;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD dates.")
  .refine(isIsoDate, "Use a valid calendar date.");

const assetSchema = z.object({
  symbol: z.string().trim().min(1, "Asset symbol is required.").max(80, "Asset symbol is too long."),
  code: z.string().trim().min(1, "Asset code is required.").max(80, "Asset code is too long."),
  name: z.string().trim().min(1, "Asset name is required.").max(180, "Asset name is too long."),
  exchange: z.string().max(40).optional(),
  type: z.string().max(80).optional(),
  currency: z.string().max(20).optional()
});

const pricePointSchema = z.object({
  date: isoDateSchema,
  close: z.number().finite().positive("Custom CSV prices must be positive USD values."),
  adjustedClose: z.number().finite().positive().optional()
});

const backtestAssetSchema = assetSchema
  .extend({
    source: z.enum(["provider", "custom-csv"]).optional(),
    prices: z.array(pricePointSchema).max(MAX_CUSTOM_PRICE_ROWS, "Custom CSV uploads are limited to 20,000 price rows.").optional()
  })
  .superRefine((asset, context) => {
    if (asset.source === "custom-csv" && (!asset.prices || asset.prices.length === 0)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom CSV assets must include at least one parsed price row."
      });
    }
  });

const strategySchema = z
  .object({
    id: z.string().trim().min(1, "Strategy id is required."),
    name: z.string().trim().min(1, "Strategy name is required."),
    type: z.enum(["dca", "lump-sum"]),
    startDate: isoDateSchema,
    endDate: isoDateSchema,
    initialInvestment: z.number().finite().nonnegative(),
    recurringContribution: z.number().finite().nonnegative(),
    frequency: z.enum(["daily", "weekly", "monthly"]),
    transactionFee: z.number().finite().nonnegative(),
    cashDragPercent: z.number().finite().gt(-100, "Cash drag must be greater than -100%.")
  })
  .refine((strategy) => strategy.initialInvestment > 0 || strategy.recurringContribution > 0, {
    message: "At least one investment amount must be greater than zero."
  })
  .refine((strategy) => strategy.startDate <= strategy.endDate, {
    message: "Start date must be before or equal to end date."
  });

const backtestRequestSchema = z.object({
  assets: z
    .array(backtestAssetSchema)
    .min(1, "Select at least one asset.")
    .max(MAX_ASSETS_PER_BACKTEST, `Select ${MAX_ASSETS_PER_BACKTEST} or fewer assets.`),
  strategies: z
    .array(strategySchema)
    .min(1, "Configure at least one strategy.")
    .max(MAX_STRATEGIES_PER_BACKTEST, `Configure ${MAX_STRATEGIES_PER_BACKTEST} or fewer strategies.`),
  normalizeCapital: z.boolean().optional()
});

export function createApiHandler(dependencies: ApiDependencies = {}) {
  const provider = dependencies.provider ?? createProviderFromEnvironment();

  return async function handleApiRequest(request: Request): Promise<Response> {
    const url = new URL(request.url);

    try {
      if (request.method === "GET" && url.pathname === "/api/health") {
        return jsonResponse({ ok: true });
      }

      if (request.method === "GET" && url.pathname === "/api/assets/search") {
        const query = url.searchParams.get("q") ?? "";
        if (query.length > 80) {
          throw new MarketDataError("bad_request", "Asset search query is too long.", 400);
        }
        const assets = await getProviderSearchResults(provider, query);
        return jsonResponse({ assets });
      }

      if (request.method === "POST" && url.pathname === "/api/backtests") {
        const body = validateBacktestRequest(await parseJsonRequest(request));
        const dateRange = getBacktestDateRange(body.strategies);
        const results = [];
        const errors = [];

        for (const asset of body.assets) {
          try {
            const prices =
              asset.source === "custom-csv"
                ? asset.prices ?? []
                : await getProviderHistoricalPrices(provider, {
                    symbol: asset.symbol,
                    from: dateRange.startDate,
                    to: dateRange.endDate
                  });
            const resultAsset = toPublicAsset(asset);
            const comparison = compareStrategies(prices, body.strategies, {
              normalizeCapital: body.normalizeCapital ?? true
            });
            for (const result of comparison.results) {
              results.push({
                ...result,
                asset: resultAsset,
                runId: `${resultAsset.symbol}:${result.strategyId}`
              });
            }
          } catch (error) {
            errors.push(normalizeError(error, asset.symbol));
          }
        }

        if (results.length === 0 && errors.length > 0) {
          return jsonResponse({ error: errors[0], errors }, errors[0].status);
        }

        return jsonResponse({
          results,
          errors,
          generatedAt: new Date().toISOString()
        });
      }

      return jsonResponse({ error: { code: "not_found", message: "Route not found." } }, 404);
    } catch (error) {
      const normalized = normalizeError(error);
      return jsonResponse({ error: normalized }, normalized.status);
    }
  };
}

async function parseJsonRequest(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new MarketDataError("bad_request", "Request body must be valid JSON.", 400);
  }
}

function toPublicAsset(asset: BacktestAsset): MarketAsset {
  const { symbol, code, name, exchange, type, currency } = asset;
  return { symbol, code, name, exchange, type, currency };
}

export function createProviderFromEnvironment(): MarketDataProvider {
  if (process.env.QDCA_USE_MOCK_DATA === "true") {
    return new FixtureMarketDataProvider();
  }

  return new EodhdProvider({
    apiKey: process.env.EODHD_API_KEY
  });
}

async function getProviderSearchResults(provider: MarketDataProvider, query: string): Promise<MarketAsset[]> {
  try {
    return await provider.searchAssets(query);
  } catch (error) {
    throw normalizeProviderError(error, "Asset search failed while contacting the market data provider.");
  }
}

async function getProviderHistoricalPrices(
  provider: MarketDataProvider,
  request: { symbol: string; from: string; to: string }
): Promise<PricePoint[]> {
  try {
    return await provider.getHistoricalPrices(request);
  } catch (error) {
    throw normalizeProviderError(error, "Price history failed while contacting the market data provider.");
  }
}

function normalizeProviderError(error: unknown, fallbackMessage: string): MarketDataError {
  if (isMarketDataError(error)) {
    return error;
  }

  return new MarketDataError("upstream_error", fallbackMessage, 502);
}

function validateBacktestRequest(input: unknown): BacktestRequestBody {
  const parsed = backtestRequestSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Invalid backtest request.";
    throw new MarketDataError("bad_request", message, 400);
  }
  return parsed.data;
}

function getBacktestDateRange(strategies: BacktestStrategy[]): { startDate: string; endDate: string } {
  return strategies.reduce(
    (range, strategy) => ({
      startDate: strategy.startDate < range.startDate ? strategy.startDate : range.startDate,
      endDate: strategy.endDate > range.endDate ? strategy.endDate : range.endDate
    }),
    { startDate: strategies[0].startDate, endDate: strategies[0].endDate }
  );
}

function normalizeError(error: unknown, symbol?: string): { code: string; message: string; status: number; symbol?: string } {
  if (isMarketDataError(error)) {
    return { code: error.code, message: error.message, status: error.status, symbol };
  }

  if (error instanceof Error) {
    return { code: "bad_request", message: error.message, status: 400, symbol };
  }

  return { code: "upstream_error", message: "Unexpected server error.", status: 500, symbol };
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json"
    }
  });
}

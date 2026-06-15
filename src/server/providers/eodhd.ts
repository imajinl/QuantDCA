import { z } from "zod";
import type { PricePoint } from "../../lib/backtest";
import { isIsoDate } from "../../lib/date";
import { MarketDataError } from "../errors";
import type { HistoricalPriceRequest, MarketAsset, MarketDataProvider } from "./types";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface EodhdProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxCacheEntries?: number;
  now?: () => number;
  timeoutMs?: number;
}

const searchItemSchema = z
  .object({
    Code: z.string().optional(),
    code: z.string().optional(),
    Symbol: z.string().optional(),
    symbol: z.string().optional(),
    Name: z.string().optional(),
    name: z.string().optional(),
    Exchange: z.string().optional(),
    exchange: z.string().optional(),
    Type: z.string().optional(),
    type: z.string().optional(),
    Currency: z.string().optional(),
    currency: z.string().optional()
  })
  .passthrough();

const historyItemSchema = z
  .object({
    date: z.string(),
    close: z.union([z.number(), z.string()]),
    adjusted_close: z.union([z.number(), z.string()]).optional(),
    adjustedClose: z.union([z.number(), z.string()]).optional()
  })
  .passthrough();

export class EodhdProvider implements MarketDataProvider {
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxCacheEntries: number;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(options: EodhdProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.baseUrl = options.baseUrl ?? "https://eodhd.com/api";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 200);
    this.now = options.now ?? Date.now;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  async searchAssets(query: string): Promise<MarketAsset[]> {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      return [];
    }
    if (trimmedQuery.length > 80) {
      throw new MarketDataError("bad_request", "Asset search query is too long.", 400);
    }

    return this.withCache(`search:${trimmedQuery.toLowerCase()}`, 15 * 60_000, async () => {
      const json = await this.fetchJson(`/search/${encodeURIComponent(trimmedQuery)}`, {});
      if (!Array.isArray(json)) {
        throw new MarketDataError("upstream_error", "EODHD search returned an unexpected payload.", 502);
      }

      return json
        .map((item) => normalizeSearchItem(item))
        .filter((asset): asset is MarketAsset => asset !== null)
        .slice(0, 20);
    });
  }

  async getHistoricalPrices(request: HistoricalPriceRequest): Promise<PricePoint[]> {
    const symbol = request.symbol.trim();
    if (!symbol) {
      throw new MarketDataError("invalid_symbol", "Symbol is required.", 422);
    }
    if (symbol.length > 80) {
      throw new MarketDataError("invalid_symbol", "Symbol is too long.", 422);
    }

    return this.withCache(`history:${symbol}:${request.from}:${request.to}`, 6 * 60 * 60_000, async () => {
      const json = await this.fetchJson(`/eod/${encodeURIComponent(symbol)}`, {
        from: request.from,
        to: request.to,
        period: "d"
      });

      if (!Array.isArray(json)) {
        throw new MarketDataError("upstream_error", "EODHD historical endpoint returned an unexpected payload.", 502);
      }

      const prices = json
        .map((item) => normalizeHistoryItem(item))
        .filter((point): point is PricePoint => point !== null);

      if (prices.length === 0) {
        throw new MarketDataError("no_data", `No historical data found for ${symbol}.`, 422);
      }

      return prices;
    });
  }

  private async fetchJson(path: string, params: Record<string, string>): Promise<unknown> {
    if (!this.apiKey) {
      throw new MarketDataError("missing_api_key", "EODHD_API_KEY is not configured on the server.", 503);
    }

    const url = new URL(`${this.baseUrl}${path}`);
    url.searchParams.set("api_token", this.apiKey);
    url.searchParams.set("fmt", "json");
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, this.timeoutMs > 0 ? { signal: AbortSignal.timeout(this.timeoutMs) } : undefined);
    } catch (error) {
      const message =
        error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
          ? "EODHD request timed out."
          : "Could not reach EODHD.";
      throw new MarketDataError("upstream_error", message, 502);
    }

    if (response.status === 429) {
      throw new MarketDataError("rate_limited", "EODHD rate limit reached.", 429);
    }
    if (!response.ok) {
      throw new MarketDataError("upstream_error", `EODHD request failed with HTTP ${response.status}.`, 502);
    }

    let json: unknown;
    try {
      json = await response.json();
    } catch {
      throw new MarketDataError("upstream_error", "EODHD returned a non-JSON response.", 502);
    }
    if (isApiErrorPayload(json)) {
      throw new MarketDataError("invalid_symbol", sanitizeEodhdMessage(json.message), 422);
    }

    return json;
  }

  private async withCache<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
    const cached = this.cache.get(key) as CacheEntry<T> | undefined;
    if (cached && cached.expiresAt > this.now()) {
      return cached.value;
    }

    const value = await load();
    this.pruneExpiredCache();
    while (this.cache.size >= this.maxCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) {
        break;
      }
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { expiresAt: this.now() + ttlMs, value });
    return value;
  }

  private pruneExpiredCache(): void {
    const now = this.now();
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }
}

function normalizeSearchItem(item: unknown): MarketAsset | null {
  const parsed = searchItemSchema.safeParse(item);
  if (!parsed.success) {
    return null;
  }

  const raw = parsed.data;
  const code = raw.Code ?? raw.code ?? raw.Symbol ?? raw.symbol ?? "";
  const exchange = raw.Exchange ?? raw.exchange;
  const name = raw.Name ?? raw.name ?? code;
  if (!code) {
    return null;
  }

  return {
    symbol: code.includes(".") || !exchange ? code : `${code}.${exchange}`,
    code,
    name,
    exchange,
    type: raw.Type ?? raw.type,
    currency: raw.Currency ?? raw.currency
  };
}

function normalizeHistoryItem(item: unknown): PricePoint | null {
  const parsed = historyItemSchema.safeParse(item);
  if (!parsed.success) {
    return null;
  }

  const close = Number(parsed.data.close);
  const adjustedRaw = parsed.data.adjusted_close ?? parsed.data.adjustedClose;
  const parsedAdjustedClose = adjustedRaw === undefined ? undefined : Number(adjustedRaw);

  if (!isIsoDate(parsed.data.date) || !Number.isFinite(close) || close <= 0) {
    return null;
  }

  return {
    date: parsed.data.date,
    close,
    adjustedClose:
      parsedAdjustedClose !== undefined && Number.isFinite(parsedAdjustedClose) && parsedAdjustedClose > 0
        ? parsedAdjustedClose
        : undefined
  };
}

function isApiErrorPayload(json: unknown): json is { message: string } {
  if (!json || typeof json !== "object") {
    return false;
  }
  const maybeError = json as { code?: unknown; message?: unknown };
  return typeof maybeError.message === "string" && maybeError.message.length > 0 && !Array.isArray(json);
}

function sanitizeEodhdMessage(message: string): string {
  if (/api[_-]?token|api[_-]?key|EODHD_API_KEY|secret/i.test(message)) {
    return "EODHD rejected the request.";
  }

  return message.slice(0, 240);
}

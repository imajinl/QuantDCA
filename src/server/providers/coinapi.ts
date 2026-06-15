import { z } from "zod";
import type { PricePoint } from "../../lib/backtest";
import { isIsoDate } from "../../lib/date";
import { MarketDataError } from "../errors";
import type { HistoricalPriceRequest, MarketAsset, MarketDataProvider } from "./types";

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface CoinApiProviderOptions {
  apiKey?: string;
  assetMetadataTtlMs?: number;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxCacheEntries?: number;
  now?: () => number;
  timeoutMs?: number;
}

interface NormalizedCoinApiAsset {
  assetId: string;
  name: string;
  dataSymbolsCount: number;
  volume1DayUsd: number;
}

const assetItemSchema = z
  .object({
    asset_id: z.string().optional(),
    name: z.string().optional(),
    type_is_crypto: z.union([z.number(), z.boolean()]).optional(),
    data_symbols_count: z.union([z.number(), z.string()]).optional(),
    volume_1day_usd: z.union([z.number(), z.string()]).optional()
  })
  .passthrough();

const historyItemSchema = z
  .object({
    time_period_start: z.string(),
    rate_close: z.union([z.number(), z.string()])
  })
  .passthrough();

export class CoinApiProvider implements MarketDataProvider {
  private readonly apiKey?: string;
  private readonly assetMetadataTtlMs: number;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxCacheEntries: number;
  private readonly now: () => number;
  private readonly timeoutMs: number;
  private readonly cache = new Map<string, CacheEntry<unknown>>();

  constructor(options: CoinApiProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.assetMetadataTtlMs = options.assetMetadataTtlMs ?? 24 * 60 * 60_000;
    this.baseUrl = options.baseUrl ?? "https://rest.coinapi.io";
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

    const normalizedQuery = trimmedQuery.toLowerCase();
    const assets = await this.getCryptoAssets();

    return assets
      .map((asset) => ({ asset, rank: rankCryptoAsset(asset, normalizedQuery) }))
      .filter((entry) => entry.rank < 99)
      .sort((left, right) => {
        if (left.rank !== right.rank) {
          return left.rank - right.rank;
        }
        if (left.asset.volume1DayUsd !== right.asset.volume1DayUsd) {
          return right.asset.volume1DayUsd - left.asset.volume1DayUsd;
        }
        if (left.asset.dataSymbolsCount !== right.asset.dataSymbolsCount) {
          return right.asset.dataSymbolsCount - left.asset.dataSymbolsCount;
        }
        return left.asset.assetId.localeCompare(right.asset.assetId);
      })
      .slice(0, 20)
      .map(({ asset }) => toMarketAsset(asset));
  }

  async getHistoricalPrices(request: HistoricalPriceRequest): Promise<PricePoint[]> {
    const baseAssetId = (request.provider?.id === "coinapi" ? request.provider.symbol : request.symbol).trim().toUpperCase();
    const quoteAssetId = (request.provider?.quote ?? "USD").trim().toUpperCase();
    if (!baseAssetId) {
      throw new MarketDataError("invalid_symbol", "CoinAPI base asset is required.", 422);
    }
    if (baseAssetId.length > 80 || quoteAssetId.length > 20) {
      throw new MarketDataError("invalid_symbol", "CoinAPI asset identifier is too long.", 422);
    }
    if (!isIsoDate(request.from) || !isIsoDate(request.to) || request.from > request.to) {
      throw new MarketDataError("bad_request", "CoinAPI history requires a valid YYYY-MM-DD date range.", 400);
    }

    const cacheKey = `history:${baseAssetId}:${quoteAssetId}:${request.from}:${request.to}`;
    return this.withCache(cacheKey, 6 * 60 * 60_000, async () => {
      const json = await this.fetchJson(`/v1/exchangerate/${encodeURIComponent(baseAssetId)}/${encodeURIComponent(quoteAssetId)}/history`, {
        period_id: "1DAY",
        time_start: `${request.from}T00:00:00.000Z`,
        time_end: `${request.to}T23:59:59.999Z`,
        limit: String(dailyLimit(request.from, request.to))
      });

      if (!Array.isArray(json)) {
        throw new MarketDataError("upstream_error", "CoinAPI historical endpoint returned an unexpected payload.", 502);
      }

      const deduped = new Map<string, PricePoint>();
      for (const item of json) {
        const point = normalizeHistoryItem(item, request.from, request.to);
        if (point) {
          deduped.set(point.date, point);
        }
      }
      const prices = Array.from(deduped.values()).sort((left, right) => left.date.localeCompare(right.date));

      if (prices.length === 0) {
        throw new MarketDataError("no_data", `No CoinAPI historical data found for ${baseAssetId}/${quoteAssetId}.`, 422);
      }

      return prices;
    });
  }

  private async getCryptoAssets(): Promise<NormalizedCoinApiAsset[]> {
    return this.withCache("assets:crypto", this.assetMetadataTtlMs, async () => {
      const json = await this.fetchJson("/v1/assets", {});
      if (!Array.isArray(json)) {
        throw new MarketDataError("upstream_error", "CoinAPI assets endpoint returned an unexpected payload.", 502);
      }

      return json
        .map((item) => normalizeAssetItem(item))
        .filter((asset): asset is NormalizedCoinApiAsset => asset !== null);
    });
  }

  private async fetchJson(path: string, params: Record<string, string>): Promise<unknown> {
    if (!this.apiKey) {
      throw new MarketDataError("missing_api_key", "COINAPI_API_KEY is not configured on the server.", 503);
    }

    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(
        url,
        this.timeoutMs > 0
          ? { headers: { "X-CoinAPI-Key": this.apiKey }, signal: AbortSignal.timeout(this.timeoutMs) }
          : { headers: { "X-CoinAPI-Key": this.apiKey } }
      );
    } catch (error) {
      const message =
        error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError")
          ? "CoinAPI request timed out."
          : "Could not reach CoinAPI.";
      throw new MarketDataError("upstream_error", message, 502);
    }

    if (response.status === 429) {
      throw new MarketDataError("rate_limited", "CoinAPI rate limit reached.", 429);
    }
    if (!response.ok) {
      throw new MarketDataError("upstream_error", `CoinAPI request failed with HTTP ${response.status}.`, 502);
    }

    try {
      return await response.json();
    } catch {
      throw new MarketDataError("upstream_error", "CoinAPI returned a non-JSON response.", 502);
    }
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

function normalizeAssetItem(item: unknown): NormalizedCoinApiAsset | null {
  const parsed = assetItemSchema.safeParse(item);
  if (!parsed.success) {
    return null;
  }

  const raw = parsed.data;
  if (raw.type_is_crypto !== 1 && raw.type_is_crypto !== true) {
    return null;
  }

  const assetId = raw.asset_id?.trim().toUpperCase() ?? "";
  if (!assetId) {
    return null;
  }

  return {
    assetId,
    name: raw.name?.trim() || assetId,
    dataSymbolsCount: Number(raw.data_symbols_count ?? 0) || 0,
    volume1DayUsd: Number(raw.volume_1day_usd ?? 0) || 0
  };
}

function normalizeHistoryItem(item: unknown, from: string, to: string): PricePoint | null {
  const parsed = historyItemSchema.safeParse(item);
  if (!parsed.success) {
    return null;
  }

  const date = parsed.data.time_period_start.slice(0, 10);
  const close = Number(parsed.data.rate_close);
  if (!isIsoDate(date) || date < from || date > to || !Number.isFinite(close) || close <= 0) {
    return null;
  }

  return { date, close };
}

function toMarketAsset(asset: NormalizedCoinApiAsset): MarketAsset {
  return {
    symbol: asset.assetId,
    code: asset.assetId,
    name: asset.name,
    exchange: "Crypto",
    type: "Crypto",
    currency: "USD",
    assetClass: "crypto",
    dataProvider: "Coin API",
    provider: {
      id: "coinapi",
      label: "Coin API",
      assetClass: "crypto",
      symbol: asset.assetId,
      quote: "USD"
    }
  };
}

function rankCryptoAsset(asset: NormalizedCoinApiAsset, query: string): number {
  const assetId = asset.assetId.toLowerCase();
  const name = asset.name.toLowerCase();

  if (assetId === query) return 0;
  if (assetId.startsWith(query)) return 1;
  if (name.startsWith(query)) return 2;
  if (assetId.includes(query)) return 3;
  if (name.includes(query)) return 4;
  return 99;
}

function dailyLimit(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T00:00:00.000Z`);
  const days = Math.floor((end - start) / 86_400_000) + 1;
  return Math.min(Math.max(days + 10, 100), 100_000);
}

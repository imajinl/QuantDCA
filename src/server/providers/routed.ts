import type { PricePoint } from "../../lib/backtest";
import { MarketDataError } from "../errors";
import type { HistoricalPriceRequest, MarketAsset, MarketDataProvider } from "./types";

export interface RoutedMarketDataProviderOptions {
  stockProvider: MarketDataProvider;
  cryptoProvider: MarketDataProvider;
}

interface SearchOutcome {
  assets: MarketAsset[];
  error: unknown;
}

export class RoutedMarketDataProvider implements MarketDataProvider {
  private readonly stockProvider: MarketDataProvider;
  private readonly cryptoProvider: MarketDataProvider;

  constructor(options: RoutedMarketDataProviderOptions) {
    this.stockProvider = options.stockProvider;
    this.cryptoProvider = options.cryptoProvider;
  }

  async searchAssets(query: string): Promise<MarketAsset[]> {
    const [stockOutcome, cryptoOutcome] = await Promise.all([
      searchProvider(this.stockProvider, query),
      searchProvider(this.cryptoProvider, query)
    ]);
    const assets = [...stockOutcome.assets, ...cryptoOutcome.assets]
      .sort((left, right) => rankAsset(left, query) - rankAsset(right, query))
      .slice(0, 20);

    if (assets.length > 0) {
      return assets;
    }

    if (cryptoOutcome.error) {
      throw cryptoOutcome.error;
    }
    if (stockOutcome.error) {
      throw stockOutcome.error;
    }

    return [];
  }

  async getHistoricalPrices(request: HistoricalPriceRequest): Promise<PricePoint[]> {
    if (request.provider?.id === "eodhd" || request.dataProvider === "EODHD" || request.assetClass === "stock") {
      return this.stockProvider.getHistoricalPrices(request);
    }

    if (request.provider?.id === "coinapi" || request.dataProvider === "Coin API" || request.assetClass === "crypto") {
      return this.cryptoProvider.getHistoricalPrices(request);
    }

    throw new MarketDataError("bad_request", "Provider-backed assets must include provider metadata.", 400);
  }
}

async function searchProvider(provider: MarketDataProvider, query: string): Promise<SearchOutcome> {
  try {
    return { assets: await provider.searchAssets(query), error: null };
  } catch (error) {
    return { assets: [], error };
  }
}

function rankAsset(asset: MarketAsset, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  const symbol = asset.symbol.toLowerCase();
  const code = asset.code.toLowerCase();
  const name = asset.name.toLowerCase();

  if (symbol === normalizedQuery || code === normalizedQuery) return 0;
  if (symbol.startsWith(normalizedQuery) || code.startsWith(normalizedQuery)) return 1;
  if (name.startsWith(normalizedQuery)) return 2;
  if (symbol.includes(normalizedQuery) || code.includes(normalizedQuery)) return 3;
  if (name.includes(normalizedQuery)) return 4;
  return 99;
}

import type { PricePoint } from "../../lib/backtest";

export interface MarketAsset {
  symbol: string;
  code: string;
  name: string;
  exchange?: string;
  type?: string;
  currency?: string;
}

export interface HistoricalPriceRequest {
  symbol: string;
  from: string;
  to: string;
}

export interface MarketDataProvider {
  searchAssets(query: string): Promise<MarketAsset[]>;
  getHistoricalPrices(request: HistoricalPriceRequest): Promise<PricePoint[]>;
}

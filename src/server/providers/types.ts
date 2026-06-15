import type { PricePoint } from "../../lib/backtest";

export type MarketAssetClass = "stock" | "crypto" | "custom";
export type MarketDataProviderId = "eodhd" | "coinapi";
export type MarketDataProviderLabel = "EODHD" | "Coin API";
export type AssetDataProviderLabel = MarketDataProviderLabel | "Custom CSV";

export interface ProviderRoutingMetadata {
  id: MarketDataProviderId;
  label: MarketDataProviderLabel;
  assetClass: Exclude<MarketAssetClass, "custom">;
  symbol: string;
  quote?: string;
}

export interface MarketAsset {
  symbol: string;
  code: string;
  name: string;
  exchange?: string;
  type?: string;
  currency?: string;
  assetClass?: MarketAssetClass;
  dataProvider?: AssetDataProviderLabel;
  provider?: ProviderRoutingMetadata;
}

export interface HistoricalPriceRequest {
  symbol: string;
  from: string;
  to: string;
  provider?: ProviderRoutingMetadata;
  assetClass?: MarketAssetClass;
  dataProvider?: AssetDataProviderLabel;
}

export interface MarketDataProvider {
  searchAssets(query: string): Promise<MarketAsset[]>;
  getHistoricalPrices(request: HistoricalPriceRequest): Promise<PricePoint[]>;
}

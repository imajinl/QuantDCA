import { addDays } from "../../lib/date";
import type { PricePoint } from "../../lib/backtest";
import { MarketDataError } from "../errors";
import type { HistoricalPriceRequest, MarketAsset, MarketDataProvider } from "./types";

const assets: MarketAsset[] = [
  { symbol: "AAPL.US", code: "AAPL", name: "Apple Inc.", exchange: "US", type: "Common Stock", currency: "USD" },
  { symbol: "MSFT.US", code: "MSFT", name: "Microsoft Corporation", exchange: "US", type: "Common Stock", currency: "USD" },
  { symbol: "BTC-USD.CC", code: "BTC-USD", name: "Bitcoin USD", exchange: "CC", type: "Crypto", currency: "USD" }
];

export class FixtureMarketDataProvider implements MarketDataProvider {
  async searchAssets(query: string): Promise<MarketAsset[]> {
    const needle = query.toLowerCase();
    return assets.filter(
      (asset) =>
        asset.symbol.toLowerCase().includes(needle) ||
        asset.code.toLowerCase().includes(needle) ||
        asset.name.toLowerCase().includes(needle)
    );
  }

  async getHistoricalPrices(request: HistoricalPriceRequest): Promise<PricePoint[]> {
    const asset = assets.find((candidate) => candidate.symbol === request.symbol);
    if (!asset) {
      throw new MarketDataError("invalid_symbol", `Unknown fixture symbol ${request.symbol}.`, 422);
    }

    const start = request.from;
    const end = request.to;
    const series: PricePoint[] = [];
    let cursor = start;
    let index = 0;
    const crypto = asset.type === "Crypto";
    const base = asset.symbol.startsWith("AAPL") ? 132 : asset.symbol.startsWith("MSFT") ? 240 : 32_000;
    const drift = asset.symbol.startsWith("BTC") ? 18 : asset.symbol.startsWith("MSFT") ? 0.18 : 0.12;

    while (cursor <= end) {
      const weekday = new Date(`${cursor}T00:00:00.000Z`).getUTCDay();
      if (crypto || (weekday !== 0 && weekday !== 6)) {
        const seasonal = Math.sin(index / 18) * (crypto ? 950 : 3.2);
        const close = base + index * drift + seasonal;
        series.push({
          date: cursor,
          close: Number(close.toFixed(2)),
          adjustedClose: Number((close * 0.992).toFixed(2))
        });
        index += 1;
      }
      cursor = addDays(cursor, 1);
    }

    if (series.length === 0) {
      throw new MarketDataError("no_data", `No fixture data for ${request.symbol}.`, 422);
    }

    return series;
  }
}

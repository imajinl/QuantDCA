import { EodhdProvider } from "./eodhd";

describe.skipIf(!process.env.EODHD_API_KEY || process.env.QDCA_RUN_LIVE_TESTS !== "1")("EodhdProvider live smoke test", () => {
  it("fetches live EODHD search and historical data when EODHD_API_KEY is present", async () => {
    const provider = new EodhdProvider({ apiKey: process.env.EODHD_API_KEY });
    const assets = await provider.searchAssets("AAPL");
    expect(assets.length).toBeGreaterThan(0);

    const aapl = assets.find((asset) => asset.symbol.includes("AAPL")) ?? assets[0];
    const prices = await provider.getHistoricalPrices({ symbol: aapl.symbol, from: "2024-01-01", to: "2024-01-31" });
    expect(prices.length).toBeGreaterThan(0);
  });
});

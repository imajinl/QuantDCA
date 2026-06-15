import { CoinApiProvider } from "./coinapi";

describe.skipIf(!process.env.COINAPI_API_KEY || process.env.QDCA_RUN_LIVE_TESTS !== "1")("CoinApiProvider live smoke test", () => {
  it("fetches live CoinAPI crypto search and historical exchange-rate data when COINAPI_API_KEY is present", async () => {
    const provider = new CoinApiProvider({ apiKey: process.env.COINAPI_API_KEY });
    const assets = await provider.searchAssets("BTC");
    expect(assets.length).toBeGreaterThan(0);

    const bitcoin = assets.find((asset) => asset.code === "BTC") ?? assets[0];
    const prices = await provider.getHistoricalPrices({
      symbol: bitcoin.symbol,
      from: "2024-01-01",
      to: "2024-01-07",
      provider: bitcoin.provider
    });
    expect(prices.length).toBeGreaterThan(0);
  });
});

import { createApiHandler } from "./api";
import { MarketDataError } from "./errors";
import type { MarketDataProvider } from "./providers/types";

const asset = { symbol: "AAPL.US", code: "AAPL", name: "Apple Inc.", exchange: "US", type: "Common Stock" };
const strategy = {
  id: "monthly-dca",
  name: "Monthly DCA",
  type: "dca" as const,
  startDate: "2024-01-01",
  endDate: "2024-01-05",
  initialInvestment: 100,
  recurringContribution: 100,
  frequency: "daily" as const,
  transactionFee: 0,
  cashDragPercent: 0
};

function request(path: string, init?: RequestInit): Request {
  return new Request(`http://localhost${path}`, init);
}

describe("API handler", () => {
  it("returns asset search results", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(async () => [asset]),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });

    const response = await handler(request("/api/assets/search?q=AAPL"));
    await expect(response.json()).resolves.toEqual({ assets: [asset] });
  });

  it("runs a successful backtest", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn(async () => [
        { date: "2024-01-01", close: 10, adjustedClose: 9 },
        { date: "2024-01-02", close: 10, adjustedClose: 9 },
        { date: "2024-01-03", close: 10, adjustedClose: 9 },
        { date: "2024-01-04", close: 10, adjustedClose: 9 },
        { date: "2024-01-05", close: 10, adjustedClose: 9 }
      ])
    };
    const handler = createApiHandler({ provider });

    const response = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({ assets: [asset], strategies: [strategy], normalizeCapital: true })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].asset.symbol).toBe("AAPL.US");
    expect(body.results[0].metrics.numberOfPurchases).toBe(5);
  });

  it("runs a custom CSV asset without calling the provider for prices", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });
    const customAsset = {
      symbol: "CSV-CUSTOM",
      code: "CSV-CUSTOM",
      name: "custom-prices.csv",
      exchange: "Uploaded",
      type: "Custom CSV",
      currency: "USD",
      source: "custom-csv",
      prices: [
        { date: "2024-01-01", close: 10 },
        { date: "2024-01-02", close: 11 },
        { date: "2024-01-03", close: 12 },
        { date: "2024-01-04", close: 13 },
        { date: "2024-01-05", close: 14 }
      ]
    };

    const response = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({ assets: [customAsset], strategies: [strategy], normalizeCapital: true })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(provider.getHistoricalPrices).not.toHaveBeenCalled();
    expect(body.results).toHaveLength(1);
    expect(body.results[0].asset).toMatchObject({ symbol: "CSV-CUSTOM", type: "Custom CSV" });
    expect(body.results[0].asset).not.toHaveProperty("prices");
  });

  it("rejects malformed backtest requests before calling the provider", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });

    const missingAssetResponse = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({ assets: [], strategies: [strategy] })
      })
    );
    expect(missingAssetResponse.status).toBe(400);
    await expect(missingAssetResponse.json()).resolves.toMatchObject({ error: { code: "bad_request" } });

    const malformedStrategyResponse = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          assets: [asset],
          strategies: [{ ...strategy, startDate: "2024-01-10", endDate: "2024-01-01" }]
        })
      })
    );
    expect(malformedStrategyResponse.status).toBe(400);
    await expect(malformedStrategyResponse.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "Start date must be before or equal to end date." }
    });

    const emptyCustomCsvResponse = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          assets: [{ ...asset, source: "custom-csv", prices: [] }],
          strategies: [strategy]
        })
      })
    );
    expect(emptyCustomCsvResponse.status).toBe(400);
    await expect(emptyCustomCsvResponse.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "Custom CSV assets must include at least one parsed price row." }
    });
    expect(provider.getHistoricalPrices).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with an explicit client error", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });

    const response = await handler(
      request("/api/backtests", {
        method: "POST",
        body: "{not-json"
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "Request body must be valid JSON." }
    });
    expect(provider.getHistoricalPrices).not.toHaveBeenCalled();
  });

  it("rejects invalid calendar dates and oversized comparison requests", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });

    const invalidDateResponse = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          assets: [asset],
          strategies: [{ ...strategy, startDate: "2024-02-31" }]
        })
      })
    );
    expect(invalidDateResponse.status).toBe(400);
    await expect(invalidDateResponse.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "Use a valid calendar date." }
    });

    const oversizedResponse = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          assets: Array.from({ length: 7 }, (_, index) => ({ ...asset, symbol: `AAPL${index}.US`, code: `AAPL${index}` })),
          strategies: [strategy]
        })
      })
    );
    expect(oversizedResponse.status).toBe(400);
    await expect(oversizedResponse.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "Select 6 or fewer assets." }
    });

    const oversizedStrategiesResponse = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          assets: [asset],
          strategies: Array.from({ length: 7 }, (_, index) => ({ ...strategy, id: `strategy-${index}` }))
        })
      })
    );
    expect(oversizedStrategiesResponse.status).toBe(400);
    await expect(oversizedStrategiesResponse.json()).resolves.toMatchObject({
      error: { code: "bad_request", message: "Configure 6 or fewer strategies." }
    });
    expect(provider.getHistoricalPrices).not.toHaveBeenCalled();
  });

  it("does not leak provider configuration in API responses", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(async () => [asset]),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });

    const response = await handler(request("/api/assets/search?q=AAPL"));
    const text = await response.text();

    expect(text).not.toContain("EODHD_API_KEY");
    expect(text).not.toContain("api_token");
    expect(text).not.toContain("eodhd.com");
  });

  it("sanitizes unexpected provider errors in search and backtest responses", async () => {
    const searchProvider: MarketDataProvider = {
      searchAssets: vi.fn(async () => {
        throw new Error("api_token=secret leaked");
      }),
      getHistoricalPrices: vi.fn()
    };
    const searchHandler = createApiHandler({ provider: searchProvider });
    const searchResponse = await searchHandler(request("/api/assets/search?q=AAPL"));
    const searchText = await searchResponse.text();

    expect(searchResponse.status).toBe(502);
    expect(searchText).toContain("Asset search failed while contacting the market data provider.");
    expect(searchText).not.toContain("api_token");
    expect(searchText).not.toContain("secret");

    const backtestProvider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn(async () => {
        throw new Error("api_token=secret leaked");
      })
    };
    const backtestHandler = createApiHandler({ provider: backtestProvider });
    const backtestResponse = await backtestHandler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({ assets: [asset], strategies: [strategy] })
      })
    );
    const backtestText = await backtestResponse.text();

    expect(backtestResponse.status).toBe(502);
    expect(backtestText).toContain("Price history failed while contacting the market data provider.");
    expect(backtestText).not.toContain("api_token");
    expect(backtestText).not.toContain("secret");
  });

  it("returns missing API key errors", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(async () => {
        throw new MarketDataError("missing_api_key", "EODHD_API_KEY is not configured on the server.", 503);
      }),
      getHistoricalPrices: vi.fn()
    };
    const handler = createApiHandler({ provider });

    const response = await handler(request("/api/assets/search?q=AAPL"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe("missing_api_key");
  });

  it("returns bad symbol and upstream failures from backtests", async () => {
    const badSymbolProvider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn(async () => {
        throw new MarketDataError("invalid_symbol", "Invalid symbol.", 422);
      })
    };
    const badHandler = createApiHandler({ provider: badSymbolProvider });
    const badResponse = await badHandler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({ assets: [asset], strategies: [strategy] })
      })
    );
    expect(badResponse.status).toBe(422);
    await expect(badResponse.json()).resolves.toMatchObject({ error: { code: "invalid_symbol" } });

    const upstreamProvider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn(async () => {
        throw new MarketDataError("upstream_error", "Upstream failed.", 502);
      })
    };
    const upstreamHandler = createApiHandler({ provider: upstreamProvider });
    const upstreamResponse = await upstreamHandler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({ assets: [asset], strategies: [strategy] })
      })
    );
    expect(upstreamResponse.status).toBe(502);
    await expect(upstreamResponse.json()).resolves.toMatchObject({ error: { code: "upstream_error" } });
  });

  it("returns successful assets with per-asset errors for partial failures", async () => {
    const provider: MarketDataProvider = {
      searchAssets: vi.fn(),
      getHistoricalPrices: vi.fn(async ({ symbol }) => {
        if (symbol === "BAD.US") {
          throw new MarketDataError("no_data", "No historical data found for BAD.US.", 422);
        }
        return [
          { date: "2024-01-01", close: 10 },
          { date: "2024-01-02", close: 10 },
          { date: "2024-01-03", close: 10 },
          { date: "2024-01-04", close: 10 },
          { date: "2024-01-05", close: 10 }
        ];
      })
    };
    const handler = createApiHandler({ provider });

    const response = await handler(
      request("/api/backtests", {
        method: "POST",
        body: JSON.stringify({
          assets: [asset, { ...asset, symbol: "BAD.US", code: "BAD", name: "Bad Data" }],
          strategies: [strategy]
        })
      })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.results).toHaveLength(1);
    expect(body.errors).toEqual([
      { code: "no_data", message: "No historical data found for BAD.US.", status: 422, symbol: "BAD.US" }
    ]);
  });
});

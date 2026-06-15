import { CoinApiProvider } from "./coinapi";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("CoinApiProvider", () => {
  it("normalizes and ranks crypto search results from asset metadata", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { asset_id: "ETH", name: "Ethereum", type_is_crypto: 1, data_symbols_count: 20_000, volume_1day_usd: 300 },
        { asset_id: "BTC", name: "Bitcoin", type_is_crypto: 1, data_symbols_count: 30_000, volume_1day_usd: 500 },
        { asset_id: "BTG", name: "Bitcoin Gold", type_is_crypto: 1, data_symbols_count: 2_000, volume_1day_usd: 10 },
        { asset_id: "USD", name: "US Dollar", type_is_crypto: 0 }
      ])
    ) as unknown as typeof fetch;
    const provider = new CoinApiProvider({ apiKey: "test", fetchImpl });

    await expect(provider.searchAssets("bt")).resolves.toEqual([
      {
        symbol: "BTC",
        code: "BTC",
        name: "Bitcoin",
        exchange: "Crypto",
        type: "Crypto",
        currency: "USD",
        assetClass: "crypto",
        dataProvider: "Coin API",
        provider: {
          id: "coinapi",
          label: "Coin API",
          assetClass: "crypto",
          symbol: "BTC",
          quote: "USD"
        }
      },
      {
        symbol: "BTG",
        code: "BTG",
        name: "Bitcoin Gold",
        exchange: "Crypto",
        type: "Crypto",
        currency: "USD",
        assetClass: "crypto",
        dataProvider: "Coin API",
        provider: {
          id: "coinapi",
          label: "Coin API",
          assetClass: "crypto",
          symbol: "BTG",
          quote: "USD"
        }
      }
    ]);
  });

  it("normalizes historical exchange rates from rate_close", async () => {
    const fetchImpl = vi.fn(async (input, init) => {
      const url = new URL(String(input));
      expect(url.pathname).toBe("/v1/exchangerate/BTC/USD/history");
      expect(url.searchParams.get("period_id")).toBe("1DAY");
      expect(url.searchParams.get("time_start")).toBe("2024-01-01T00:00:00.000Z");
      expect(url.searchParams.get("time_end")).toBe("2024-01-03T23:59:59.999Z");
      expect(Number(url.searchParams.get("limit"))).toBeGreaterThanOrEqual(100);
      expect((init?.headers as Record<string, string>)["X-CoinAPI-Key"]).toBe("test");
      return jsonResponse([
        { time_period_start: "2024-01-01T00:00:00.0000000Z", rate_close: "43000.25" },
        { time_period_start: "2024-01-02T00:00:00.0000000Z", rate_close: 43100.5 },
        { time_period_start: "not-a-date", rate_close: 43200 },
        { time_period_start: "2024-01-03T00:00:00.0000000Z", rate_close: -1 }
      ]);
    }) as unknown as typeof fetch;
    const provider = new CoinApiProvider({ apiKey: "test", fetchImpl });

    await expect(
      provider.getHistoricalPrices({
        symbol: "BTC",
        from: "2024-01-01",
        to: "2024-01-03",
        provider: { id: "coinapi", label: "Coin API", assetClass: "crypto", symbol: "BTC", quote: "USD" }
      })
    ).resolves.toEqual([
      { date: "2024-01-01", close: 43000.25 },
      { date: "2024-01-02", close: 43100.5 }
    ]);
  });

  it("throws a missing-key error before calling upstream", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const provider = new CoinApiProvider({ fetchImpl });

    await expect(provider.searchAssets("BTC")).rejects.toMatchObject({ code: "missing_api_key", status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps non-JSON, rate limit, and HTTP failures to clear provider errors", async () => {
    const htmlFetch = vi.fn(async () => new Response("<html>nope</html>", { status: 200 })) as unknown as typeof fetch;
    const htmlProvider = new CoinApiProvider({ apiKey: "test", fetchImpl: htmlFetch });
    await expect(htmlProvider.searchAssets("BTC")).rejects.toMatchObject({
      code: "upstream_error",
      message: "CoinAPI returned a non-JSON response.",
      status: 502
    });

    const rateLimitedFetch = vi.fn(async () => jsonResponse({ message: "too many requests" }, 429)) as unknown as typeof fetch;
    const rateLimitedProvider = new CoinApiProvider({ apiKey: "test", fetchImpl: rateLimitedFetch });
    await expect(rateLimitedProvider.searchAssets("BTC")).rejects.toMatchObject({ code: "rate_limited", status: 429 });

    const failedFetch = vi.fn(async () => jsonResponse({ message: "server error" }, 500)) as unknown as typeof fetch;
    const failedProvider = new CoinApiProvider({ apiKey: "test", fetchImpl: failedFetch });
    await expect(failedProvider.searchAssets("BTC")).rejects.toMatchObject({
      code: "upstream_error",
      message: "CoinAPI request failed with HTTP 500.",
      status: 502
    });
  });

  it("maps network failures and empty historical data to clear errors", async () => {
    const networkFetch = vi.fn(async () => {
      throw new TypeError("COINAPI_API_KEY=test leaked");
    }) as unknown as typeof fetch;
    const networkProvider = new CoinApiProvider({ apiKey: "test", fetchImpl: networkFetch });
    await expect(networkProvider.searchAssets("BTC")).rejects.toMatchObject({
      code: "upstream_error",
      message: "Could not reach CoinAPI.",
      status: 502
    });

    const emptyFetch = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const emptyProvider = new CoinApiProvider({ apiKey: "test", fetchImpl: emptyFetch });
    await expect(emptyProvider.getHistoricalPrices({ symbol: "BTC", from: "2024-01-01", to: "2024-01-31" })).rejects.toMatchObject({
      code: "no_data",
      status: 422
    });
  });

  it("caches asset metadata across repeated searches", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ asset_id: "BTC", name: "Bitcoin", type_is_crypto: 1 }])) as unknown as typeof fetch;
    const provider = new CoinApiProvider({ apiKey: "test", fetchImpl, now: () => 1 });

    await provider.searchAssets("btc");
    await provider.searchAssets("bitcoin");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

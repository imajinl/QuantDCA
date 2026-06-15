import { EodhdProvider } from "./eodhd";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe("EodhdProvider", () => {
  it("normalizes search results", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ Code: "AAPL", Name: "Apple Inc.", Exchange: "US", Type: "Common Stock", Currency: "USD" }])
    ) as unknown as typeof fetch;
    const provider = new EodhdProvider({ apiKey: "test", fetchImpl });

    await expect(provider.searchAssets("apple")).resolves.toEqual([
      {
        symbol: "AAPL.US",
        code: "AAPL",
        name: "Apple Inc.",
        exchange: "US",
        type: "Common Stock",
        currency: "USD"
      }
    ]);
  });

  it("normalizes historical prices with adjusted close", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([
        { date: "2024-01-02", close: "100.50", adjusted_close: "99.25" },
        { date: "2024-02-31", close: "101.00", adjusted_close: "100.00" }
      ])
    ) as unknown as typeof fetch;
    const provider = new EodhdProvider({ apiKey: "test", fetchImpl });

    await expect(provider.getHistoricalPrices({ symbol: "AAPL.US", from: "2024-01-01", to: "2024-01-31" })).resolves.toEqual([
      { date: "2024-01-02", close: 100.5, adjustedClose: 99.25 }
    ]);
  });

  it("throws a missing-key error before calling upstream", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const provider = new EodhdProvider({ fetchImpl });

    await expect(provider.searchAssets("AAPL")).rejects.toMatchObject({ code: "missing_api_key", status: 503 });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("maps network and non-JSON upstream failures to sanitized errors", async () => {
    const networkFetch = vi.fn(async () => {
      throw new TypeError("api_token=test leaked");
    }) as unknown as typeof fetch;
    const networkProvider = new EodhdProvider({ apiKey: "test", fetchImpl: networkFetch });
    await expect(networkProvider.searchAssets("AAPL")).rejects.toMatchObject({
      code: "upstream_error",
      message: "Could not reach EODHD.",
      status: 502
    });

    const htmlFetch = vi.fn(async () => new Response("<html>nope</html>", { status: 200 })) as unknown as typeof fetch;
    const htmlProvider = new EodhdProvider({ apiKey: "test", fetchImpl: htmlFetch });
    await expect(htmlProvider.searchAssets("AAPL")).rejects.toMatchObject({
      code: "upstream_error",
      message: "EODHD returned a non-JSON response.",
      status: 502
    });
  });

  it("maps rate limits and empty historical data to clear errors", async () => {
    const rateLimitedFetch = vi.fn(async () => jsonResponse({ message: "too many requests" }, 429)) as unknown as typeof fetch;
    const rateLimitedProvider = new EodhdProvider({ apiKey: "test", fetchImpl: rateLimitedFetch });
    await expect(rateLimitedProvider.searchAssets("AAPL")).rejects.toMatchObject({ code: "rate_limited", status: 429 });

    const emptyFetch = vi.fn(async () => jsonResponse([])) as unknown as typeof fetch;
    const emptyProvider = new EodhdProvider({ apiKey: "test", fetchImpl: emptyFetch });
    await expect(emptyProvider.getHistoricalPrices({ symbol: "BAD.US", from: "2024-01-01", to: "2024-01-31" })).rejects.toMatchObject({
      code: "no_data",
      status: 422
    });
  });

  it("sanitizes token-bearing EODHD error payloads", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "invalid api_token=test leaked" })) as unknown as typeof fetch;
    const provider = new EodhdProvider({ apiKey: "test", fetchImpl });

    await expect(provider.searchAssets("AAPL")).rejects.toMatchObject({
      code: "invalid_symbol",
      message: "EODHD rejected the request.",
      status: 422
    });
  });

  it("caches repeated requests", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ Code: "MSFT", Name: "Microsoft Corporation", Exchange: "US" }])
    ) as unknown as typeof fetch;
    const provider = new EodhdProvider({ apiKey: "test", fetchImpl, now: () => 1 });

    await provider.searchAssets("msft");
    await provider.searchAssets("msft");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("evicts older cache entries when the cache reaches its limit", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ Code: "MSFT", Name: "Microsoft Corporation", Exchange: "US" }])
    ) as unknown as typeof fetch;
    const provider = new EodhdProvider({ apiKey: "test", fetchImpl, maxCacheEntries: 1, now: () => 1 });

    await provider.searchAssets("msft");
    await provider.searchAssets("apple");
    await provider.searchAssets("msft");

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

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
      jsonResponse([{ date: "2024-01-02", close: "100.50", adjusted_close: "99.25" }])
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

  it("caches repeated requests", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse([{ Code: "MSFT", Name: "Microsoft Corporation", Exchange: "US" }])
    ) as unknown as typeof fetch;
    const provider = new EodhdProvider({ apiKey: "test", fetchImpl, now: () => 1 });

    await provider.searchAssets("msft");
    await provider.searchAssets("msft");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

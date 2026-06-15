import { compareStrategies, runBacktest, type BacktestStrategy, type PricePoint } from "./backtest";

const dailyPrices: PricePoint[] = [
  { date: "2024-01-01", close: 10 },
  { date: "2024-01-02", close: 11 },
  { date: "2024-01-03", close: 12 },
  { date: "2024-01-04", close: 13 },
  { date: "2024-01-05", close: 14 }
];

function strategy(overrides: Partial<BacktestStrategy> = {}): BacktestStrategy {
  return {
    id: "dca",
    name: "Daily DCA",
    type: "dca",
    startDate: "2024-01-01",
    endDate: "2024-01-05",
    initialInvestment: 0,
    recurringContribution: 100,
    frequency: "daily",
    transactionFee: 0,
    cashDragPercent: 0,
    ...overrides
  };
}

describe("backtest engine", () => {
  it("runs regular DCA purchases", () => {
    const result = runBacktest(dailyPrices, strategy(), { targetCapital: 500 });

    expect(result.metrics.numberOfPurchases).toBe(5);
    expect(result.metrics.totalInvested).toBe(500);
    expect(result.metrics.unitsAccumulated).toBeCloseTo(42.2594, 4);
    expect(result.series.at(-1)?.portfolioValue).toBeCloseTo(591.63, 2);
  });

  it("invests lump-sum capital on the first available date", () => {
    const result = runBacktest(
      dailyPrices,
      strategy({
        id: "lump",
        name: "Lump Sum",
        type: "lump-sum",
        initialInvestment: 100,
        recurringContribution: 100,
        frequency: "weekly",
        endDate: "2024-01-15"
      }),
      { targetCapital: 300 }
    );

    expect(result.metrics.numberOfPurchases).toBe(1);
    expect(result.transactions[0]).toMatchObject({ date: "2024-01-01", grossAmount: 300, price: 10 });
    expect(result.metrics.unitsAccumulated).toBe(30);
  });

  it("handles weekly and monthly contribution schedules", () => {
    const prices = [
      { date: "2024-01-01", close: 10 },
      { date: "2024-01-08", close: 10 },
      { date: "2024-02-01", close: 10 }
    ];

    const weekly = runBacktest(prices, strategy({ frequency: "weekly", endDate: "2024-01-08" }), { targetCapital: 200 });
    const monthly = runBacktest(prices, strategy({ frequency: "monthly", endDate: "2024-02-01" }), { targetCapital: 200 });

    expect(weekly.transactions.map((transaction) => transaction.date)).toEqual(["2024-01-01", "2024-01-08"]);
    expect(monthly.transactions.map((transaction) => transaction.date)).toEqual(["2024-01-01", "2024-02-01"]);
  });

  it("keeps month-end schedules anchored after clamped months", () => {
    const prices = [
      { date: "2024-01-31", close: 10 },
      { date: "2024-02-29", close: 10 },
      { date: "2024-03-31", close: 10 }
    ];

    const result = runBacktest(
      prices,
      strategy({ frequency: "monthly", startDate: "2024-01-31", endDate: "2024-03-31" }),
      { targetCapital: 300 }
    );

    expect(result.transactions.map((transaction) => transaction.dueDate)).toEqual([
      "2024-01-31",
      "2024-02-29",
      "2024-03-31"
    ]);
  });

  it("moves non-trading-day purchases to the next available price date", () => {
    const result = runBacktest(
      [{ date: "2024-01-02", close: 10 }],
      strategy({ startDate: "2024-01-01", endDate: "2024-01-02", initialInvestment: 100, recurringContribution: 0 }),
      { targetCapital: 100 }
    );

    expect(result.transactions[0]).toMatchObject({ dueDate: "2024-01-01", date: "2024-01-02" });
  });

  it("deducts transaction fees before buying units", () => {
    const result = runBacktest(
      dailyPrices,
      strategy({ initialInvestment: 101, recurringContribution: 0, transactionFee: 1 }),
      { targetCapital: 101 }
    );

    expect(result.transactions[0]).toMatchObject({ grossAmount: 101, fee: 1, netAmount: 100, units: 10 });
    expect(result.metrics.feesPaid).toBe(1);
    expect(result.metrics.averagePurchasePrice).toBe(10.1);
  });

  it("rejects scheduled contributions that would be fully consumed by fees", () => {
    expect(() =>
      runBacktest(dailyPrices, strategy({ initialInvestment: 100, recurringContribution: 0, transactionFee: 100 }), {
        targetCapital: 100
      })
    ).toThrow("Transaction fee must be lower than every scheduled contribution.");
  });

  it("applies cash drag from the requested start date and caps buys to available cash", () => {
    const result = runBacktest(
      [{ date: "2024-01-01", close: 10 }],
      strategy({
        startDate: "2023-01-01",
        endDate: "2024-01-01",
        initialInvestment: 100,
        recurringContribution: 0,
        cashDragPercent: -50
      }),
      { targetCapital: 100 }
    );

    expect(result.transactions[0].grossAmount).toBeCloseTo(50, 0);
    expect(result.metrics.finalValue).toBeCloseTo(50, 0);
    expect(result.metrics.totalReturn).toBeCloseTo(-0.5, 1);
  });

  it("rejects empty or unusable price series", () => {
    expect(() => runBacktest([], strategy(), { targetCapital: 100 })).toThrow("Price series is empty");
    expect(() => runBacktest([{ date: "2024-01-01", close: 0 }], strategy(), { targetCapital: 100 })).toThrow(
      "usable positive prices"
    );
    expect(() => runBacktest([{ date: "2024-02-31", close: 10 }], strategy(), { targetCapital: 100 })).toThrow(
      "usable positive prices"
    );
    expect(() => runBacktest(dailyPrices, strategy({ startDate: "2024-02-31" }), { targetCapital: 100 })).toThrow(
      "valid YYYY-MM-DD calendar dates"
    );
  });

  it("rejects non-finite strategy inputs and target capital", () => {
    expect(() => runBacktest(dailyPrices, strategy({ initialInvestment: Number.NaN }), { targetCapital: 100 })).toThrow(
      "Initial investment must be a finite number."
    );
    expect(() =>
      runBacktest(dailyPrices, strategy({ recurringContribution: Number.POSITIVE_INFINITY }), { targetCapital: 100 })
    ).toThrow("Recurring contribution must be a finite number.");
    expect(() => runBacktest(dailyPrices, strategy({ cashDragPercent: Number.NaN }), { targetCapital: 100 })).toThrow(
      "Cash drag must be a finite number."
    );
    expect(() => runBacktest(dailyPrices, strategy(), { targetCapital: Number.NaN })).toThrow(
      "Target capital must be a finite number."
    );
  });

  it("equalizes capital across multiple strategies by default", () => {
    const comparison = compareStrategies(dailyPrices, [
      strategy({ id: "small", name: "Small", recurringContribution: 50 }),
      strategy({ id: "large", name: "Large", recurringContribution: 100 })
    ]);

    expect(comparison.normalizedTargetCapital).toBe(500);
    expect(comparison.results.map((result) => result.metrics.totalInvested)).toEqual([500, 500]);
  });

  it("uses adjusted close when available", () => {
    const result = runBacktest(
      [
        { date: "2024-01-01", close: 20, adjustedClose: 10 },
        { date: "2024-01-02", close: 40, adjustedClose: 20 }
      ],
      strategy({ initialInvestment: 100, recurringContribution: 0, startDate: "2024-01-01", endDate: "2024-01-02" }),
      { targetCapital: 100 }
    );

    expect(result.priceSource).toBe("adjusted-close");
    expect(result.transactions[0]).toMatchObject({ price: 10, units: 10 });
    expect(result.series.at(-1)?.portfolioValue).toBe(200);
  });

  it("falls back to close when adjusted close is only partially available", () => {
    const result = runBacktest(
      [
        { date: "2024-01-01", close: 20, adjustedClose: 10 },
        { date: "2024-01-02", close: 40 }
      ],
      strategy({ initialInvestment: 100, recurringContribution: 0, startDate: "2024-01-01", endDate: "2024-01-02" }),
      { targetCapital: 100 }
    );

    expect(result.priceSource).toBe("close");
    expect(result.transactions[0]).toMatchObject({ price: 20, units: 5 });
    expect(result.series.at(-1)?.portfolioValue).toBe(200);
  });

  it("keeps undeployed cash in final portfolio value when scheduled buys cannot execute", () => {
    const result = runBacktest(
      [{ date: "2024-01-01", close: 10 }],
      strategy({ initialInvestment: 100, recurringContribution: 100, startDate: "2024-01-01", endDate: "2024-01-05" }),
      { targetCapital: 500 }
    );

    expect(result.metrics.totalInvested).toBe(100);
    expect(result.metrics.remainingCash).toBe(400);
    expect(result.metrics.finalValue).toBe(500);
    expect(result.metrics.totalReturn).toBe(0);
  });

  it("does not execute scheduled buys that cannot reach an in-range price date", () => {
    const result = runBacktest(
      [{ date: "2024-01-02", close: 10 }],
      strategy({
        startDate: "2024-01-01",
        endDate: "2024-01-03",
        frequency: "daily",
        initialInvestment: 0,
        recurringContribution: 100
      }),
      { targetCapital: 300 }
    );

    expect(result.transactions.map((transaction) => transaction.dueDate)).toEqual(["2024-01-01", "2024-01-02"]);
    expect(result.transactions.map((transaction) => transaction.date)).toEqual(["2024-01-02", "2024-01-02"]);
  });

  it("sorts duplicate and unsorted prices before calculation", () => {
    const result = runBacktest(
      [
        { date: "2024-01-03", close: 30 },
        { date: "2024-01-01", close: 10 },
        { date: "2024-01-01", close: 20 }
      ],
      strategy({ initialInvestment: 100, recurringContribution: 0, startDate: "2024-01-01", endDate: "2024-01-03" }),
      { targetCapital: 100 }
    );

    expect(result.transactions[0].price).toBe(20);
    expect(result.series.map((point) => point.date)).toEqual(["2024-01-01", "2024-01-03"]);
  });

  it("chooses adjusted close from the active strategy window", () => {
    const comparison = compareStrategies(
      [
        { date: "2023-12-29", close: 50 },
        { date: "2024-01-01", close: 20, adjustedClose: 10 },
        { date: "2024-01-02", close: 40, adjustedClose: 20 }
      ],
      [
        strategy({
          id: "active-adjusted",
          name: "Active Adjusted",
          initialInvestment: 100,
          recurringContribution: 0,
          startDate: "2024-01-01",
          endDate: "2024-01-02"
        })
      ]
    );

    const result = comparison.results[0];
    expect(result.priceSource).toBe("adjusted-close");
    expect(result.transactions[0]).toMatchObject({ price: 10, units: 10 });
    expect(result.series.at(-1)?.portfolioValue).toBe(200);
  });

  it("scales normalized DCA contributions proportionally across the configured schedule", () => {
    const result = runBacktest(
      dailyPrices,
      strategy({
        initialInvestment: 100,
        recurringContribution: 50,
        startDate: "2024-01-01",
        endDate: "2024-01-03"
      }),
      { targetCapital: 400 }
    );

    expect(result.transactions.map((transaction) => transaction.grossAmount)).toEqual([200, 100, 100]);
    expect(result.metrics.totalInvested).toBe(400);
  });
});

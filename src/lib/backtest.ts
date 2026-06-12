import { addDays, addMonthsClamped, compareIsoDates, daysBetween } from "./date";

export type ContributionFrequency = "daily" | "weekly" | "monthly";
export type StrategyType = "dca" | "lump-sum";

export interface PricePoint {
  date: string;
  close: number;
  adjustedClose?: number;
}

export interface NormalizedPricePoint {
  date: string;
  close: number;
  adjustedClose?: number;
  price: number;
}

export interface BacktestStrategy {
  id: string;
  name: string;
  type: StrategyType;
  startDate: string;
  endDate: string;
  initialInvestment: number;
  recurringContribution: number;
  frequency: ContributionFrequency;
  transactionFee: number;
  cashDragPercent: number;
}

export interface BacktestOptions {
  normalizeCapital?: boolean;
  targetCapital?: number;
}

export interface Transaction {
  id: string;
  strategyId: string;
  dueDate: string;
  date: string;
  grossAmount: number;
  fee: number;
  netAmount: number;
  price: number;
  units: number;
}

export interface PortfolioPoint {
  date: string;
  price: number;
  investedCapital: number;
  marketValue: number;
  cashValue: number;
  portfolioValue: number;
  units: number;
}

export interface BacktestMetrics {
  totalInvested: number;
  remainingCash: number;
  finalValue: number;
  totalReturn: number;
  cagr: number;
  maxDrawdown: number;
  volatility: number;
  bestTimingImpact: number | null;
  worstTimingImpact: number | null;
  numberOfPurchases: number;
  averagePurchasePrice: number;
  unitsAccumulated: number;
  feesPaid: number;
}

export interface BacktestResult {
  strategyId: string;
  strategyName: string;
  targetCapital: number;
  priceSource: "adjusted-close" | "close";
  metrics: BacktestMetrics;
  transactions: Transaction[];
  series: PortfolioPoint[];
}

export interface StrategyComparison {
  results: BacktestResult[];
  normalizedTargetCapital: number | null;
}

interface PlannedContribution {
  dueDate: string;
  grossAmount: number;
}

export function compareStrategies(
  prices: PricePoint[],
  strategies: BacktestStrategy[],
  options: BacktestOptions = {}
): StrategyComparison {
  if (strategies.length === 0) {
    throw new Error("At least one strategy is required.");
  }

  const normalizedPrices = normalizePriceSeries(prices);
  const normalizeCapital = options.normalizeCapital ?? true;
  const plannedCapitalByStrategy = strategies.map((strategy) => calculatePlannedCapital(strategy));
  const targetCapital = normalizeCapital
    ? options.targetCapital ?? Math.max(...plannedCapitalByStrategy)
    : null;

  return {
    normalizedTargetCapital: targetCapital,
    results: strategies.map((strategy, index) =>
      runBacktest(normalizedPrices, strategy, {
        targetCapital: targetCapital ?? plannedCapitalByStrategy[index]
      })
    )
  };
}

export function runBacktest(
  prices: PricePoint[] | NormalizedPricePoint[],
  strategy: BacktestStrategy,
  options: Required<Pick<BacktestOptions, "targetCapital">>
): BacktestResult {
  validateStrategy(strategy);
  const normalizedPrices =
    prices.length > 0 && "price" in prices[0] ? (prices as NormalizedPricePoint[]) : normalizePriceSeries(prices);
  const activePrices = normalizedPrices.filter(
    (point) => compareIsoDates(point.date, strategy.startDate) >= 0 && compareIsoDates(point.date, strategy.endDate) <= 0
  );

  if (activePrices.length === 0) {
    throw new Error("No historical prices are available in the requested date range.");
  }

  const targetCapital = roundMoney(options.targetCapital);
  if (targetCapital <= 0) {
    throw new Error("Target capital must be greater than zero.");
  }

  const plannedContributions = planContributions(strategy, targetCapital);
  const transactions = scheduleTransactions(plannedContributions, activePrices, strategy);
  if (transactions.length === 0) {
    throw new Error("No purchases could be scheduled against the available price series.");
  }

  const transactionsByDate = new Map<string, Transaction[]>();
  for (const transaction of transactions) {
    const existing = transactionsByDate.get(transaction.date) ?? [];
    existing.push(transaction);
    transactionsByDate.set(transaction.date, existing);
  }

  let units = 0;
  let investedCapital = 0;
  let cashValue = targetCapital;
  let previousDate = activePrices[0].date;
  let feesPaid = 0;
  const series: PortfolioPoint[] = [];
  const annualCashRate = strategy.cashDragPercent / 100;

  for (const pricePoint of activePrices) {
    const elapsedDays = Math.max(daysBetween(previousDate, pricePoint.date), 0);
    cashValue = applyCashDrag(cashValue, annualCashRate, elapsedDays);

    for (const transaction of transactionsByDate.get(pricePoint.date) ?? []) {
      cashValue = Math.max(0, cashValue - transaction.grossAmount);
      investedCapital += transaction.grossAmount;
      feesPaid += transaction.fee;
      units += transaction.units;
    }

    const marketValue = units * pricePoint.price;
    series.push({
      date: pricePoint.date,
      price: pricePoint.price,
      investedCapital: roundMoney(investedCapital),
      marketValue: roundMoney(marketValue),
      cashValue: roundMoney(cashValue),
      portfolioValue: roundMoney(marketValue + cashValue),
      units: roundUnits(units)
    });
    previousDate = pricePoint.date;
  }

  const finalPoint = series[series.length - 1];
  const totalInvested = roundMoney(transactions.reduce((sum, transaction) => sum + transaction.grossAmount, 0));
  const netInvested = transactions.reduce((sum, transaction) => sum + transaction.netAmount, 0);
  const unitsAccumulated = roundUnits(transactions.reduce((sum, transaction) => sum + transaction.units, 0));
  const averagePurchasePrice = unitsAccumulated > 0 ? roundMoney(netInvested / unitsAccumulated) : 0;
  const finalPrice = activePrices[activePrices.length - 1].price;
  const timingImpacts = transactions
    .filter((transaction) => transaction.units > 0)
    .map((transaction) => finalPrice / transaction.price - 1);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    targetCapital,
    priceSource: normalizedPrices.some((point) => point.adjustedClose !== undefined) ? "adjusted-close" : "close",
    metrics: {
      totalInvested,
      remainingCash: finalPoint.cashValue,
      finalValue: finalPoint.portfolioValue,
      totalReturn: totalInvested > 0 ? finalPoint.portfolioValue / totalInvested - 1 : 0,
      cagr: calculateCagr(totalInvested, finalPoint.portfolioValue, strategy.startDate, finalPoint.date),
      maxDrawdown: calculateMaxDrawdown(series.map((point) => point.portfolioValue)),
      volatility: calculateAnnualizedVolatility(series.map((point) => point.portfolioValue)),
      bestTimingImpact: timingImpacts.length > 0 ? Math.max(...timingImpacts) : null,
      worstTimingImpact: timingImpacts.length > 0 ? Math.min(...timingImpacts) : null,
      numberOfPurchases: transactions.length,
      averagePurchasePrice,
      unitsAccumulated,
      feesPaid: roundMoney(feesPaid)
    },
    transactions,
    series
  };
}

export function normalizePriceSeries(prices: PricePoint[]): NormalizedPricePoint[] {
  if (prices.length === 0) {
    throw new Error("Price series is empty.");
  }

  const deduped = new Map<string, NormalizedPricePoint>();
  for (const point of prices) {
    const price = point.adjustedClose ?? point.close;
    if (!point.date || !Number.isFinite(price) || price <= 0 || !Number.isFinite(point.close) || point.close <= 0) {
      continue;
    }

    deduped.set(point.date, {
      date: point.date,
      close: point.close,
      adjustedClose: point.adjustedClose,
      price
    });
  }

  const normalized = Array.from(deduped.values()).sort((left, right) => compareIsoDates(left.date, right.date));
  if (normalized.length === 0) {
    throw new Error("Price series does not contain usable positive prices.");
  }

  return normalized;
}

export function calculatePlannedCapital(strategy: BacktestStrategy): number {
  validateStrategy(strategy);
  const recurringDates = recurringContributionDates(strategy);
  return roundMoney(strategy.initialInvestment + strategy.recurringContribution * recurringDates.length);
}

function planContributions(strategy: BacktestStrategy, targetCapital: number): PlannedContribution[] {
  if (strategy.type === "lump-sum") {
    return [{ dueDate: strategy.startDate, grossAmount: targetCapital }];
  }

  const contributions: PlannedContribution[] = [];
  const initialInvestment = Math.min(strategy.initialInvestment, targetCapital);
  if (initialInvestment > 0) {
    contributions.push({ dueDate: strategy.startDate, grossAmount: initialInvestment });
  }

  let remainingCapital = roundMoney(targetCapital - initialInvestment);
  if (remainingCapital <= 0) {
    return contributions;
  }

  const recurringDates = recurringContributionDates(strategy);
  if (recurringDates.length === 0) {
    return contributions;
  }

  const baseContribution = roundMoney(remainingCapital / recurringDates.length);
  recurringDates.forEach((dueDate, index) => {
    const isLast = index === recurringDates.length - 1;
    const grossAmount = isLast ? remainingCapital : Math.min(baseContribution, remainingCapital);
    if (grossAmount > 0) {
      contributions.push({ dueDate, grossAmount: roundMoney(grossAmount) });
      remainingCapital = roundMoney(remainingCapital - grossAmount);
    }
  });

  return contributions;
}

function recurringContributionDates(strategy: BacktestStrategy): string[] {
  if (strategy.recurringContribution <= 0) {
    return [];
  }

  const dates: string[] = [];
  let cursor = strategy.initialInvestment > 0 ? nextContributionDate(strategy.startDate, strategy.frequency) : strategy.startDate;

  while (compareIsoDates(cursor, strategy.endDate) <= 0) {
    dates.push(cursor);
    cursor = nextContributionDate(cursor, strategy.frequency);
  }

  return dates;
}

function nextContributionDate(date: string, frequency: ContributionFrequency): string {
  if (frequency === "daily") return addDays(date, 1);
  if (frequency === "weekly") return addDays(date, 7);
  return addMonthsClamped(date, 1);
}

function scheduleTransactions(
  plannedContributions: PlannedContribution[],
  prices: NormalizedPricePoint[],
  strategy: BacktestStrategy
): Transaction[] {
  const transactions: Transaction[] = [];
  const priceDates = prices.map((point) => point.date);

  plannedContributions.forEach((contribution, index) => {
    const executionDate = findNextPriceDate(priceDates, contribution.dueDate);
    if (!executionDate) {
      return;
    }

    const price = prices.find((point) => point.date === executionDate);
    if (!price) {
      return;
    }

    const fee = Math.min(roundMoney(strategy.transactionFee), contribution.grossAmount);
    const netAmount = roundMoney(Math.max(contribution.grossAmount - fee, 0));
    transactions.push({
      id: `${strategy.id}-${index + 1}`,
      strategyId: strategy.id,
      dueDate: contribution.dueDate,
      date: executionDate,
      grossAmount: roundMoney(contribution.grossAmount),
      fee,
      netAmount,
      price: price.price,
      units: roundUnits(netAmount / price.price)
    });
  });

  return transactions;
}

function findNextPriceDate(priceDates: string[], dueDate: string): string | null {
  for (const priceDate of priceDates) {
    if (compareIsoDates(priceDate, dueDate) >= 0) {
      return priceDate;
    }
  }
  return null;
}

function validateStrategy(strategy: BacktestStrategy): void {
  if (!strategy.id || !strategy.name) {
    throw new Error("Strategy id and name are required.");
  }
  if (compareIsoDates(strategy.startDate, strategy.endDate) > 0) {
    throw new Error("Start date must be before or equal to end date.");
  }
  if (strategy.initialInvestment < 0 || strategy.recurringContribution < 0) {
    throw new Error("Investment amounts cannot be negative.");
  }
  if (strategy.initialInvestment === 0 && strategy.recurringContribution === 0) {
    throw new Error("At least one investment amount must be greater than zero.");
  }
  if (strategy.transactionFee < 0) {
    throw new Error("Transaction fee cannot be negative.");
  }
  if (strategy.cashDragPercent <= -100) {
    throw new Error("Cash drag must be greater than -100%.");
  }
}

function applyCashDrag(cashValue: number, annualRate: number, elapsedDays: number): number {
  if (cashValue === 0 || annualRate === 0 || elapsedDays === 0) {
    return cashValue;
  }
  return cashValue * Math.pow(1 + annualRate, elapsedDays / 365.25);
}

function calculateCagr(totalInvested: number, finalValue: number, startDate: string, endDate: string): number {
  const elapsedDays = daysBetween(startDate, endDate);
  if (totalInvested <= 0 || finalValue <= 0 || elapsedDays <= 0) {
    return 0;
  }
  return Math.pow(finalValue / totalInvested, 365.25 / elapsedDays) - 1;
}

function calculateMaxDrawdown(values: number[]): number {
  let peak = values[0] ?? 0;
  let maxDrawdown = 0;

  for (const value of values) {
    peak = Math.max(peak, value);
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, value / peak - 1);
    }
  }

  return maxDrawdown;
}

function calculateAnnualizedVolatility(values: number[]): number {
  const returns: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous > 0 && current > 0) {
      returns.push(current / previous - 1);
    }
  }

  if (returns.length < 2) {
    return 0;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(252);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000_000) / 1_000_000_000;
}

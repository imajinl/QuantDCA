import { addDays, addMonthsClamped, compareIsoDates, daysBetween, isIsoDate } from "./date";

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

interface ScheduledTransaction extends Transaction {
  plannedGrossAmount: number;
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
  const useAdjustedClose = activePrices.every((point) => point.adjustedClose !== undefined);
  const pricedActivePrices = activePrices.map((point) => ({
    ...point,
    price: useAdjustedClose ? point.adjustedClose! : point.close
  }));

  if (!Number.isFinite(options.targetCapital)) {
    throw new Error("Target capital must be a finite number.");
  }

  const targetCapital = roundMoney(options.targetCapital);
  if (targetCapital <= 0) {
    throw new Error("Target capital must be greater than zero.");
  }

  const plannedContributions = planContributions(strategy, targetCapital);
  const scheduledTransactions = scheduleTransactions(plannedContributions, pricedActivePrices, strategy);
  if (scheduledTransactions.length === 0) {
    throw new Error("No purchases could be scheduled against the available price series.");
  }
  if (scheduledTransactions.some((transaction) => transaction.plannedGrossAmount <= strategy.transactionFee)) {
    throw new Error("Transaction fee must be lower than every scheduled contribution.");
  }

  const transactionsByDate = new Map<string, ScheduledTransaction[]>();
  for (const transaction of scheduledTransactions) {
    const existing = transactionsByDate.get(transaction.date) ?? [];
    existing.push(transaction);
    transactionsByDate.set(transaction.date, existing);
  }

  let units = 0;
  let investedCapital = 0;
  let cashValue = targetCapital;
  let previousDate = strategy.startDate;
  let feesPaid = 0;
  const transactions: Transaction[] = [];
  const series: PortfolioPoint[] = [];
  const annualCashRate = strategy.cashDragPercent / 100;

  for (const pricePoint of pricedActivePrices) {
    const elapsedDays = Math.max(daysBetween(previousDate, pricePoint.date), 0);
    cashValue = applyCashDrag(cashValue, annualCashRate, elapsedDays);

    for (const scheduledTransaction of transactionsByDate.get(pricePoint.date) ?? []) {
      const grossAmount = roundMoney(Math.min(scheduledTransaction.plannedGrossAmount, cashValue));
      if (grossAmount <= 0) {
        continue;
      }

      const fee = Math.min(roundMoney(strategy.transactionFee), grossAmount);
      const netAmount = roundMoney(Math.max(grossAmount - fee, 0));
      if (netAmount <= 0) {
        continue;
      }
      const transaction: Transaction = {
        id: scheduledTransaction.id,
        strategyId: scheduledTransaction.strategyId,
        dueDate: scheduledTransaction.dueDate,
        date: scheduledTransaction.date,
        price: scheduledTransaction.price,
        grossAmount,
        fee,
        netAmount,
        units: roundUnits(netAmount / pricePoint.price)
      };

      cashValue = roundMoney(Math.max(0, cashValue - grossAmount));
      investedCapital += transaction.grossAmount;
      feesPaid += transaction.fee;
      units += transaction.units;
      transactions.push(transaction);
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

  if (transactions.length === 0) {
    throw new Error("No purchases could be executed with the available cash and price series.");
  }

  const finalPoint = series[series.length - 1];
  const totalInvested = roundMoney(transactions.reduce((sum, transaction) => sum + transaction.grossAmount, 0));
  const unitsAccumulated = roundUnits(transactions.reduce((sum, transaction) => sum + transaction.units, 0));
  const averagePurchasePrice = unitsAccumulated > 0 ? roundMoney(totalInvested / unitsAccumulated) : 0;
  const finalPrice = pricedActivePrices[pricedActivePrices.length - 1].price;
  const timingImpacts = transactions
    .filter((transaction) => transaction.units > 0)
    .map((transaction) => finalPrice / transaction.price - 1);

  return {
    strategyId: strategy.id,
    strategyName: strategy.name,
    targetCapital,
    priceSource: useAdjustedClose ? "adjusted-close" : "close",
    metrics: {
      totalInvested,
      remainingCash: finalPoint.cashValue,
      finalValue: finalPoint.portfolioValue,
      totalReturn: targetCapital > 0 ? finalPoint.portfolioValue / targetCapital - 1 : 0,
      cagr: calculateCagr(targetCapital, finalPoint.portfolioValue, strategy.startDate, finalPoint.date),
      maxDrawdown: calculateMaxDrawdown(series.map((point) => point.portfolioValue)),
      volatility: calculateAnnualizedVolatility(series),
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
    if (!point.date || !isIsoDate(point.date) || !Number.isFinite(point.close) || point.close <= 0) {
      continue;
    }

    const adjustedClose =
      point.adjustedClose !== undefined && Number.isFinite(point.adjustedClose) && point.adjustedClose > 0
        ? point.adjustedClose
        : undefined;
    deduped.set(point.date, {
      date: point.date,
      close: point.close,
      adjustedClose,
      price: point.close
    });
  }

  const normalized = Array.from(deduped.values()).sort((left, right) => compareIsoDates(left.date, right.date));
  if (normalized.length === 0) {
    throw new Error("Price series does not contain usable positive prices.");
  }

  const useAdjustedClose = normalized.every((point) => point.adjustedClose !== undefined);
  return normalized.map((point) => ({
    ...point,
    price: useAdjustedClose ? point.adjustedClose! : point.close
  }));
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

  const configuredContributions = configuredDcaContributions(strategy);
  const configuredCapital = roundMoney(
    configuredContributions.reduce((sum, contribution) => sum + contribution.grossAmount, 0)
  );
  if (configuredCapital <= 0) {
    return [];
  }

  const scale = targetCapital / configuredCapital;
  let remainingCapital = targetCapital;
  return configuredContributions.flatMap((contribution, index) => {
    const isLast = index === configuredContributions.length - 1;
    const grossAmount = isLast ? remainingCapital : Math.min(roundMoney(contribution.grossAmount * scale), remainingCapital);
    remainingCapital = roundMoney(remainingCapital - grossAmount);
    if (grossAmount > 0) {
      return [{ dueDate: contribution.dueDate, grossAmount: roundMoney(grossAmount) }];
    }
    return [];
  });
}

function configuredDcaContributions(strategy: BacktestStrategy): PlannedContribution[] {
  const contributions: PlannedContribution[] = [];
  if (strategy.initialInvestment > 0) {
    contributions.push({ dueDate: strategy.startDate, grossAmount: strategy.initialInvestment });
  }

  for (const dueDate of recurringContributionDates(strategy)) {
    contributions.push({ dueDate, grossAmount: strategy.recurringContribution });
  }
  return contributions;
}

function recurringContributionDates(strategy: BacktestStrategy): string[] {
  if (strategy.recurringContribution <= 0) {
    return [];
  }

  const dates: string[] = [];
  if (strategy.frequency === "monthly") {
    const firstMonthOffset = strategy.initialInvestment > 0 ? 1 : 0;
    let monthOffset = firstMonthOffset;
    let cursor = addMonthsClamped(strategy.startDate, monthOffset);

    while (compareIsoDates(cursor, strategy.endDate) <= 0) {
      dates.push(cursor);
      monthOffset += 1;
      cursor = addMonthsClamped(strategy.startDate, monthOffset);
    }

    return dates;
  }

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
): ScheduledTransaction[] {
  const transactions: ScheduledTransaction[] = [];
  const priceDates = prices.map((point) => point.date);
  const pricesByDate = new Map(prices.map((point) => [point.date, point]));

  plannedContributions.forEach((contribution, index) => {
    const executionDate = findNextPriceDate(priceDates, contribution.dueDate);
    if (!executionDate) {
      return;
    }

    const price = pricesByDate.get(executionDate);
    if (!price) {
      return;
    }

    const plannedGrossAmount = roundMoney(contribution.grossAmount);
    transactions.push({
      id: `${strategy.id}-${index + 1}`,
      strategyId: strategy.id,
      dueDate: contribution.dueDate,
      date: executionDate,
      grossAmount: plannedGrossAmount,
      plannedGrossAmount,
      fee: 0,
      netAmount: plannedGrossAmount,
      price: price.price,
      units: 0
    });
  });

  return transactions;
}

function findNextPriceDate(priceDates: string[], dueDate: string): string | null {
  let low = 0;
  let high = priceDates.length - 1;
  let candidate: string | null = null;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const priceDate = priceDates[mid];
    if (compareIsoDates(priceDate, dueDate) >= 0) {
      candidate = priceDate;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return candidate;
}

function validateStrategy(strategy: BacktestStrategy): void {
  if (!strategy.id || !strategy.name) {
    throw new Error("Strategy id and name are required.");
  }
  assertFiniteNumber(strategy.initialInvestment, "Initial investment");
  assertFiniteNumber(strategy.recurringContribution, "Recurring contribution");
  assertFiniteNumber(strategy.transactionFee, "Transaction fee");
  assertFiniteNumber(strategy.cashDragPercent, "Cash drag");
  if (!isIsoDate(strategy.startDate) || !isIsoDate(strategy.endDate)) {
    throw new Error("Strategy dates must be valid YYYY-MM-DD calendar dates.");
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

function assertFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
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

function calculateAnnualizedVolatility(series: PortfolioPoint[]): number {
  const returns: number[] = [];
  const intervals: number[] = [];
  for (let index = 1; index < series.length; index += 1) {
    const previous = series[index - 1];
    const current = series[index];
    const elapsedDays = daysBetween(previous.date, current.date);
    if (previous.portfolioValue > 0 && current.portfolioValue > 0 && elapsedDays > 0) {
      returns.push(current.portfolioValue / previous.portfolioValue - 1);
      intervals.push(elapsedDays);
    }
  }

  if (returns.length < 2) {
    return 0;
  }

  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance = returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  const averageIntervalDays = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  return Math.sqrt(variance) * Math.sqrt(365.25 / averageIntervalDays);
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000_000) / 1_000_000_000;
}

import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  CircleDollarSign,
  Database,
  Download,
  FileJson,
  Info,
  Loader2,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  X
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import type { BacktestStrategy, ContributionFrequency, PricePoint, StrategyType, Transaction } from "./lib/backtest";
import { CustomCsvParseError, parseCustomPriceCsv } from "./lib/customCsv";
import { isIsoDate } from "./lib/date";
import { formatCompactCurrency, formatCurrency, formatNumber, formatPercent } from "./lib/format";
import { LogoMark, MarketingSite } from "./MarketingSite";
import type { MarketAsset } from "./server/providers/types";

interface ApiBacktestResult {
  runId: string;
  asset: MarketAsset;
  strategyId: string;
  strategyName: string;
  targetCapital: number;
  priceSource: "adjusted-close" | "close";
  metrics: {
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
  };
  transactions: Transaction[];
  series: Array<{
    date: string;
    price: number;
    investedCapital: number;
    marketValue: number;
    cashValue: number;
    portfolioValue: number;
    units: number;
  }>;
}

interface ApiError {
  code: string;
  message: string;
  status: number;
  symbol?: string;
  dataProvider?: string;
}

interface ApiBacktestResponse {
  results?: ApiBacktestResult[];
  errors?: ApiError[];
  generatedAt?: string;
  error?: ApiError;
}

interface SelectedAsset extends MarketAsset {
  source?: "provider" | "custom-csv";
  prices?: PricePoint[];
}

const colors = ["#2E63E6", "#0E9D94", "#C2790B", "#7B5CF0", "#D14D6B", "#5B6675"];

interface StrategyFieldErrors {
  name?: string;
  startDate?: string;
  endDate?: string;
  initialInvestment?: string;
  recurringContribution?: string;
  transactionFee?: string;
  cashDragPercent?: string;
}

const defaultStrategies: BacktestStrategy[] = [
  {
    id: "monthly-dca",
    name: "Monthly DCA",
    type: "dca",
    startDate: "2021-01-04",
    endDate: "2024-12-31",
    initialInvestment: 1000,
    recurringContribution: 500,
    frequency: "monthly",
    transactionFee: 1,
    cashDragPercent: 0
  },
  {
    id: "lump-sum",
    name: "Lump Sum",
    type: "lump-sum",
    startDate: "2021-01-04",
    endDate: "2024-12-31",
    initialInvestment: 1000,
    recurringContribution: 500,
    frequency: "monthly",
    transactionFee: 1,
    cashDragPercent: 0
  }
];

export function App() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";

  if (path !== "/app") {
    return <MarketingSite path={path} />;
  }

  return <DashboardApp />;
}

async function readApiJson<T>(response: Response, context: string): Promise<T> {
  const text = await response.text();
  const trimmed = text.trimStart();

  if (!trimmed) {
    return {} as T;
  }

  if (trimmed.startsWith("<")) {
    throw new Error(
      `${context} could not reach the QuantDCA API. The /api route returned HTML instead of JSON, so the backend is not being served for this environment.`
    );
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`${context} returned invalid JSON. Check that /api routes are served by the QuantDCA backend.`);
  }
}

function apiErrorMessage(body: { error?: ApiError }, fallback: string): string {
  return body.error?.message ?? fallback;
}

function validateStrategiesForRun(strategies: BacktestStrategy[]): string | null {
  for (const strategy of strategies) {
    const label = strategy.name.trim() || "Unnamed strategy";
    if (!strategy.name.trim()) {
      return "Every strategy needs a name.";
    }
    if (!isIsoDate(strategy.startDate) || !isIsoDate(strategy.endDate)) {
      return `${label}: Use valid YYYY-MM-DD calendar dates.`;
    }
    if (strategy.startDate > strategy.endDate) {
      return `${label}: Start date must be before or equal to end date.`;
    }
    if (!Number.isFinite(strategy.initialInvestment) || !Number.isFinite(strategy.recurringContribution)) {
      return `${label}: Investment amounts must be finite numbers.`;
    }
    if (strategy.initialInvestment < 0 || strategy.recurringContribution < 0) {
      return `${label}: Investment amounts cannot be negative.`;
    }
    if (strategy.initialInvestment === 0 && strategy.recurringContribution === 0) {
      return `${label}: At least one investment amount must be greater than zero.`;
    }
    if (!Number.isFinite(strategy.transactionFee)) {
      return `${label}: Transaction fee must be a finite number.`;
    }
    if (strategy.transactionFee < 0) {
      return `${label}: Transaction fee cannot be negative.`;
    }
    if (!Number.isFinite(strategy.cashDragPercent)) {
      return `${label}: Cash drag must be a finite number.`;
    }
    if (strategy.cashDragPercent <= -100) {
      return `${label}: Cash drag must be greater than -100%.`;
    }
  }

  return null;
}

function validateStrategyFields(strategy: BacktestStrategy): StrategyFieldErrors {
  const errors: StrategyFieldErrors = {};

  if (!strategy.name.trim()) {
    errors.name = "Every strategy needs a name.";
  }
  if (!isIsoDate(strategy.startDate)) {
    errors.startDate = "Use a valid YYYY-MM-DD start date.";
  }
  if (!isIsoDate(strategy.endDate)) {
    errors.endDate = "Use a valid YYYY-MM-DD end date.";
  }
  if (isIsoDate(strategy.startDate) && isIsoDate(strategy.endDate) && strategy.startDate > strategy.endDate) {
    errors.startDate = "Start date must be before or equal to end date.";
    errors.endDate = "End date must be after or equal to start date.";
  }
  if (!Number.isFinite(strategy.initialInvestment)) {
    errors.initialInvestment = "Initial investment must be a finite number.";
  } else if (strategy.initialInvestment < 0) {
    errors.initialInvestment = "Initial investment cannot be negative.";
  }
  if (!Number.isFinite(strategy.recurringContribution)) {
    errors.recurringContribution = "Recurring contribution must be a finite number.";
  } else if (strategy.recurringContribution < 0) {
    errors.recurringContribution = "Recurring contribution cannot be negative.";
  }
  if (
    Number.isFinite(strategy.initialInvestment) &&
    Number.isFinite(strategy.recurringContribution) &&
    strategy.initialInvestment === 0 &&
    strategy.recurringContribution === 0
  ) {
    errors.initialInvestment = "At least one investment amount must be greater than zero.";
    errors.recurringContribution = "At least one investment amount must be greater than zero.";
  }
  if (!Number.isFinite(strategy.transactionFee)) {
    errors.transactionFee = "Transaction fee must be a finite number.";
  } else if (strategy.transactionFee < 0) {
    errors.transactionFee = "Transaction fee cannot be negative.";
  }
  if (!Number.isFinite(strategy.cashDragPercent)) {
    errors.cashDragPercent = "Cash drag must be a finite number.";
  } else if (strategy.cashDragPercent <= -100) {
    errors.cashDragPercent = "Cash drag must be greater than -100%.";
  }

  return errors;
}

function partialFailureMessage(errors: ApiError[]): string {
  const details = errors
    .slice(0, 3)
    .map((error) => `${error.symbol ?? "Asset"}${error.dataProvider ? ` (${error.dataProvider})` : ""}: ${error.message}`)
    .join(" ");
  const remaining = errors.length > 3 ? ` ${errors.length - 3} more asset${errors.length - 3 === 1 ? "" : "s"} failed.` : "";
  return `Some assets could not be backtested. ${details}${remaining}`;
}

function DashboardApp() {
  const assetSearchStatusId = useId();
  const assetSearchResultsId = useId();
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MarketAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [strategies, setStrategies] = useState<BacktestStrategy[]>(defaultStrategies);
  const [normalizeCapital, setNormalizeCapital] = useState(true);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [completedSearchQuery, setCompletedSearchQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [runWarning, setRunWarning] = useState<string | null>(null);
  const [results, setResults] = useState<ApiBacktestResult[]>([]);
  const [resultsStale, setResultsStale] = useState(false);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [csvUploadStatus, setCsvUploadStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const nextStrategyId = useRef(1);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchStatus("idle");
      setSearchError(null);
      setCompletedSearchQuery("");
      return;
    }

    const controller = new AbortController();
    const currentQuery = query.trim();
    const timer = window.setTimeout(async () => {
      setSearchStatus("loading");
      setSearchError(null);
      try {
        const response = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const body = await readApiJson<{ assets?: MarketAsset[]; error?: ApiError }>(response, "Asset search");
        if (!response.ok) {
          throw new Error(apiErrorMessage(body, "Asset search failed."));
        }
        setSearchResults(body.assets ?? []);
        setCompletedSearchQuery(currentQuery);
        setSearchStatus("idle");
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setSearchStatus("error");
          setSearchResults([]);
          setCompletedSearchQuery("");
          setSearchError(searchError instanceof Error ? searchError.message : "Asset search failed.");
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const selectedRun = useMemo(
    () => results.find((result) => result.runId === selectedRunId) ?? results[0] ?? null,
    [results, selectedRunId]
  );

  const bestRun = useMemo(() => {
    if (results.length === 0) return null;
    return results.reduce((best, result) => (result.metrics.finalValue > best.metrics.finalValue ? result : best), results[0]);
  }, [results]);

  const secondBestRun = useMemo(() => {
    if (results.length < 2) return null;
    const sortedResults = [...results].sort((left, right) => right.metrics.finalValue - left.metrics.finalValue);
    return sortedResults[1];
  }, [results]);

  const dateRange = useMemo(() => {
    return strategies.reduce(
      (range, strategy) => ({
        startDate: strategy.startDate < range.startDate ? strategy.startDate : range.startDate,
        endDate: strategy.endDate > range.endDate ? strategy.endDate : range.endDate
      }),
      { startDate: strategies[0].startDate, endDate: strategies[0].endDate }
    );
  }, [strategies]);
  const strategyErrors = useMemo(
    () => new Map(strategies.map((strategy) => [strategy.id, validateStrategyFields(strategy)])),
    [strategies]
  );

  const lastDataDate = selectedRun?.series.at(-1)?.date ?? null;
  const bestAdvantage = bestRun && secondBestRun ? bestRun.metrics.finalValue - secondBestRun.metrics.finalValue : 0;
  const bestAdvantagePercent =
    bestRun && secondBestRun && secondBestRun.metrics.finalValue > 0
      ? bestAdvantage / secondBestRun.metrics.finalValue
      : 0;
  const totalInvested = useMemo(() => selectedRun?.metrics.totalInvested ?? 0, [selectedRun]);
  const noSearchResults =
    query.trim().length >= 2 &&
    searchStatus === "idle" &&
    completedSearchQuery === query.trim() &&
    searchResults.length === 0;
  const assetSearchStatus =
    searchStatus === "loading"
      ? `Searching for ${query.trim()}.`
      : searchStatus === "error" && searchError
        ? searchError
        : noSearchResults
          ? `No assets found for ${completedSearchQuery}.`
          : searchResults.length > 0
            ? `${searchResults.length} asset result${searchResults.length === 1 ? "" : "s"} available.`
            : "Enter at least two characters to search assets.";

  function invalidateResults() {
    if (results.length > 0) {
      setResultsStale(true);
    }
    setRunWarning(null);
  }

  function addAsset(asset: MarketAsset) {
    setError(null);
    setCsvUploadStatus(null);
    invalidateResults();
    setSelectedAssets((current) => (current.some((selected) => assetKey(selected) === assetKey(asset)) ? current : [...current, { ...asset, source: "provider" }]));
    setQuery("");
    setSearchResults([]);
    setSearchError(null);
    setCompletedSearchQuery("");
  }

  function removeAsset(key: string) {
    invalidateResults();
    setSelectedAssets((current) => current.filter((asset) => assetKey(asset) !== key));
  }

  async function uploadCustomCsv(file: File | null) {
    setError(null);
    if (!file) return;

    try {
      const parsed = parseCustomPriceCsv(await file.text());
      const symbol = customCsvSymbol(file.name, selectedAssets);
      const asset: SelectedAsset = {
        symbol,
        code: symbol,
        name: file.name,
        exchange: "Uploaded",
        type: "Custom CSV",
        currency: "USD",
        assetClass: "custom",
        dataProvider: "Custom CSV",
        source: "custom-csv",
        prices: parsed.prices
      };

      invalidateResults();
      setSelectedAssets((current) => [...current, asset]);
      setCsvUploadStatus({
        tone: "success",
        message: `${file.name}: Loaded ${parsed.rowCount} price rows from ${parsed.firstDate} to ${parsed.lastDate}.`
      });
    } catch (csvError) {
      setCsvUploadStatus({
        tone: "error",
        message:
          csvError instanceof CustomCsvParseError || csvError instanceof Error
            ? csvError.message
            : "CSV could not be parsed. Confirm column A is YYYY-MM-DD and column B is a positive USD price."
      });
    }
  }

  function updateStrategy(id: string, patch: Partial<BacktestStrategy>) {
    invalidateResults();
    setStrategies((current) => current.map((strategy) => (strategy.id === id ? { ...strategy, ...patch } : strategy)));
  }

  function addStrategy() {
    invalidateResults();
    setStrategies((current) => {
      const nextIndex = current.length + 1;
      const nextId = nextStrategyId.current;
      nextStrategyId.current += 1;

      return [
        ...current,
        {
          ...current[0],
          id: `custom-strategy-${nextId}`,
          name: `DCA ${nextIndex}`,
          type: "dca",
          frequency: nextIndex % 2 === 0 ? "weekly" : "monthly"
        }
      ];
    });
  }

  function removeStrategy(id: string) {
    invalidateResults();
    setStrategies((current) => (current.length > 1 ? current.filter((strategy) => strategy.id !== id) : current));
  }

  async function runBacktest() {
    setError(null);
    setRunWarning(null);
    if (selectedAssets.length === 0) {
      setRunStatus("error");
      setError("Select at least one asset.");
      return;
    }
    if (strategies.length === 0) {
      setRunStatus("error");
      setError("Configure at least one strategy.");
      return;
    }
    const validationMessage = validateStrategiesForRun(strategies);
    if (validationMessage) {
      setRunStatus("error");
      setError(validationMessage);
      return;
    }

    setRunStatus("loading");
    try {
      const response = await fetch("/api/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: selectedAssets, strategies, normalizeCapital })
      });
      const body = await readApiJson<ApiBacktestResponse>(response, "Backtest");
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Backtest failed."));
      }

      const nextResults = (body.results ?? []) as ApiBacktestResult[];
      const nextErrors = body.errors ?? [];
      const defaultFocusedRun = nextResults.reduce<ApiBacktestResult | null>(
        (best, result) => (!best || result.metrics.finalValue > best.metrics.finalValue ? result : best),
        null
      );

      setResults(nextResults);
      setResultsStale(false);
      setSelectedRunId(defaultFocusedRun?.runId ?? null);
      setGeneratedAt(body.generatedAt ?? null);
      setRunWarning(nextErrors.length > 0 ? partialFailureMessage(nextErrors) : null);
      setRunStatus("success");
    } catch (runError) {
      setRunStatus("error");
      setResults([]);
      setResultsStale(false);
      setGeneratedAt(null);
      setRunWarning(null);
      setError(runError instanceof Error ? runError.message : "Backtest failed.");
    }
  }

  return (
    <main className="app">
      <header className="topbar" aria-label="QuantDCA Overview">
        <div className="brand">
          <LogoMark className="brand-mark" />
          <span className="brand-name">
            Quant<b>DCA</b>
          </span>
          <span className="brand-sep" />
          <h1 className="brand-context">Strategy Comparison Console</h1>
        </div>
        <div className="topbar-meta" aria-label="Data Safeguards">
          <span className="trust-chip">
            <ShieldCheck size={13} aria-hidden="true" />
            Server-Side Keys
          </span>
          <span className="trust-chip">
            <Database size={13} aria-hidden="true" />
            Provider-Labeled Data
          </span>
          <span className="trust-chip">
            <CheckCircle2 size={13} aria-hidden="true" />
            Deterministic Engine
          </span>
        </div>
      </header>

      <section className="workspace">
        <aside className="config" aria-label="Backtest Controls">
          <div className="config-scroll scroll-thin">
            <section className="section" aria-labelledby="assets-heading">
              <div className="section-head">
                <h2 id="assets-heading">
                  <Search size={15} aria-hidden="true" />
                  Assets
                </h2>
                <span className="section-meta">
                  {selectedAssets.length} asset{selectedAssets.length === 1 ? "" : "s"} / {strategies.length} strategies
                </span>
              </div>
              <label className="field">
                <span className="field-label">Asset Search</span>
                <span className="search-wrap">
                  <Search className="s-icon" size={15} aria-hidden="true" />
                  <input
                    aria-label="Asset Search"
                    aria-controls={assetSearchResultsId}
                    aria-describedby={assetSearchStatusId}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="AAPL, MSFT, BTC"
                    autoComplete="off"
                    type="text"
                  />
                </span>
              </label>
              <p className="sr-only" id={assetSearchStatusId} role="status">
                {assetSearchStatus}
              </p>
              <div className="search-results" id={assetSearchResultsId} aria-live="polite">
                {searchStatus === "loading" ? (
                  <p className="search-status">
                    <Loader2 className="inline-spinner" size={14} aria-hidden="true" />
                    Searching…
                  </p>
                ) : null}
                {searchStatus === "error" && searchError ? (
                  <p className="search-status error" role="alert">
                    <AlertCircle size={14} aria-hidden="true" />
                    {searchError}
                  </p>
                ) : null}
                {noSearchResults ? (
                  <p className="search-status">
                    <Info size={14} aria-hidden="true" />
                    No assets found for "{completedSearchQuery}".
                  </p>
                ) : null}
                {searchResults.length > 0 ? (
                  <ul className="asset-result-list" aria-label="Asset search results">
                    {searchResults.map((asset) => (
                      <li key={assetKey(asset)}>
                        <button
                          aria-label={`${asset.symbol} ${asset.name} ${dataProviderLabel(asset)} ${asset.type ?? asset.exchange ?? "Asset"}`}
                          className="asset-result"
                          type="button"
                          onClick={() => addAsset(asset)}
                        >
                          <span className="ar-main">
                            <span className="ar-line">
                              <strong className="ar-sym">{asset.symbol}</strong>
                              <ProviderBadge asset={asset} />
                            </span>
                            <small className="ar-name">{asset.name}</small>
                          </span>
                          <span className="ar-type">{asset.type ?? asset.exchange ?? "Asset"}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <div className="chips" aria-label="Selected Assets">
                {selectedAssets.length === 0 ? <p className="empty-row">No assets selected.</p> : null}
                {selectedAssets.map((asset) => (
                  <span className={`chip ${asset.source === "custom-csv" ? "csv" : ""}`} key={assetKey(asset)} aria-label={`${asset.symbol} ${dataProviderLabel(asset)}`}>
                    <span>{asset.symbol}</span>
                    <span className="chip-provider">{dataProviderLabel(asset)}</span>
                    <button type="button" aria-label={`Remove ${asset.symbol} ${dataProviderLabel(asset)}`} onClick={() => removeAsset(assetKey(asset))}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </section>

            <div className="section-divider" />

            <section className="section" aria-labelledby="csv-heading">
              <div className="section-head">
                <h2 id="csv-heading">
                  <Database size={15} aria-hidden="true" />
                  Custom CSV
                  <HelpTip
                    label="Custom CSV Upload"
                    text="Upload a CSV where row 1 is ignored, column A starts with YYYY-MM-DD dates, and column B contains positive USD prices."
                  />
                </h2>
              </div>
              <label className="file-drop">
                <Upload size={16} aria-hidden="true" />
                <span>
                  <span className="fd-main">Upload price CSV</span>
                  <span className="fd-sub">A2 = YYYY-MM-DD date, B2 = USD price</span>
                </span>
                <input
                  accept=".csv,text/csv"
                  aria-label="Upload Custom CSV"
                  type="file"
                  onChange={(event) => {
                    void uploadCustomCsv(event.currentTarget.files?.[0] ?? null);
                    event.currentTarget.value = "";
                  }}
                />
              </label>
              <p className="field-hint">Row 1 and columns C onward are ignored.</p>
              {csvUploadStatus ? (
                <StatusAlert tone={csvUploadStatus.tone} message={csvUploadStatus.message} role={csvUploadStatus.tone === "error" ? "alert" : "status"} />
              ) : null}
            </section>

            <div className="section-divider" />

            <section className="section" aria-labelledby="strategies-heading">
              <div className="section-head">
                <h2 id="strategies-heading">
                  <CalendarDays size={15} aria-hidden="true" />
                  Strategies
                </h2>
                <button className="icon-btn" type="button" aria-label="Add Strategy" onClick={addStrategy}>
                  <Plus size={16} aria-hidden="true" />
                </button>
              </div>

              <div className="strategy-list">
                {strategies.map((strategy, index) => (
                  <StrategyEditor
                    key={strategy.id}
                    strategy={strategy}
                    index={index}
                    canRemove={strategies.length > 1}
                    errors={strategyErrors.get(strategy.id) ?? {}}
                    onChange={(patch) => updateStrategy(strategy.id, patch)}
                    onRemove={() => removeStrategy(strategy.id)}
                  />
                ))}
              </div>

              <div className="switch-row">
                <span className="sr-label">
                  Equal Capital
                  <HelpTip label="Equal Capital" text="When enabled, each strategy receives the same target capital for apples-to-apples comparison." />
                </span>
                <button
                  className="switch"
                  type="button"
                  role="switch"
                  aria-checked={normalizeCapital}
                  aria-label="Equal Capital"
                  onClick={() => {
                    invalidateResults();
                    setNormalizeCapital((current) => !current);
                  }}
                />
              </div>
            </section>
          </div>

          <div className="run-footer">
            <div className="run-assumptions" aria-label="Run Assumptions">
              <span className="assume">{dateRange.startDate} to {dateRange.endDate}</span>
              <span className="assume">{normalizeCapital ? "Equal Capital" : "As Configured"}</span>
              <span className="assume">{strategies.reduce((sum, strategy) => sum + strategy.transactionFee, 0) > 0 ? "Fees Included" : "No Fees"}</span>
            </div>
            <button className="btn primary block lg run-button" type="button" onClick={runBacktest} disabled={runStatus === "loading"} aria-busy={runStatus === "loading"}>
              {runStatus === "loading" ? <span className="run-spinner" aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {runStatus === "loading" ? "Running…" : "Run Backtests"}
            </button>
            {error ? <StatusAlert className="run-alert" tone="error" message={error} role="alert" /> : null}
            <p className="run-meta-line">
              <CheckCircle2 size={13} aria-hidden="true" />
              Deterministic — identical inputs always produce identical results.
            </p>
          </div>
        </aside>

        <section className="results" aria-label="Backtest Results">
          <div className="results-head">
            <div className="rh-title">
              <span className="kicker">Backtest Results</span>
              <h2 className="page-title">Strategy Comparison</h2>
              <p className="page-sub">
                {results.length > 0
                  ? `${results.length} run${results.length === 1 ? "" : "s"} · ${normalizeCapital ? "equal-capital comparison" : "as-configured comparison"} · ${selectedRun ? `${dataProviderLabel(selectedRun.asset)} ${formatPriceSourceLabel(selectedRun.priceSource).toLowerCase()}` : "price history"}`
                  : "Configure assets and strategies, then run the comparison."}
              </p>
            </div>
            {results.length > 0 ? (
              <div className="results-tools">
                <RunPicker results={results} selectedRunId={selectedRun?.runId ?? ""} onSelect={setSelectedRunId} />
              </div>
            ) : null}
          </div>

          {resultsStale ? (
            <StatusAlert tone="warning" message="Inputs changed since this run. Run Backtests again to refresh the comparison." role="status" />
          ) : null}

          {runWarning ? <StatusAlert tone="warning" message={runWarning} role="alert" /> : null}

          <div className="hero">
            <div className={`winner ${bestRun ? "" : "idle"}`}>
              <span className="kicker">
                Best Outcome
                <HelpTip label="Best Outcome" text="The run with the highest final portfolio value across the current comparison set." />
              </span>
              <strong className="w-name">{bestRun ? `${bestRun.asset.symbol} (${dataProviderLabel(bestRun.asset)}) / ${bestRun.strategyName}` : "Awaiting Run"}</strong>
              <p className="w-desc">
                {bestRun
                  ? `${formatCurrency(bestRun.metrics.finalValue)} final value with ${formatPercent(bestRun.metrics.totalReturn)} total return.`
                  : "Run a comparison to rank strategies by final portfolio value."}
              </p>
              {bestRun && secondBestRun ? (
                <span className="w-delta">
                  <ArrowUpRight size={15} aria-hidden="true" />
                  {formatCurrency(bestAdvantage)} ahead of next best ({formatPercent(bestAdvantagePercent)})
                </span>
              ) : null}
            </div>
            <div className="metrics-grid">
              <MetricCard
                label="Focused Value"
                value={selectedRun ? formatCurrency(selectedRun.metrics.finalValue) : "-"}
                detail={selectedRun ? selectedRun.strategyName : "No Run"}
                icon={<CircleDollarSign size={18} aria-hidden="true" />}
              />
              <MetricCard
                label="Total Return"
                value={selectedRun ? formatPercent(selectedRun.metrics.totalReturn) : "-"}
                detail={selectedRun ? `${formatCurrency(totalInvested)} invested` : "Total Invested"}
                helpText="Final value divided by the strategy target capital, minus one. Idle cash is included in final value."
                accent={selectedRun ? (selectedRun.metrics.totalReturn >= 0 ? "positive" : "negative") : undefined}
                icon={<Activity size={18} aria-hidden="true" />}
              />
              <MetricCard
                label="CAGR"
                value={selectedRun ? formatPercent(selectedRun.metrics.cagr) : "-"}
                detail={selectedRun ? `Vol ${formatPercent(selectedRun.metrics.volatility)}` : "Annualized"}
                helpText="Annualized growth rate between the strategy start date and final available data date."
                icon={<BarChart3 size={18} aria-hidden="true" />}
              />
              <MetricCard
                label="Max Drawdown"
                value={selectedRun ? formatPercent(selectedRun.metrics.maxDrawdown) : "-"}
                detail={bestRun ? `Best ${bestRun.asset.symbol} · ${dataProviderLabel(bestRun.asset)}` : "Risk"}
                helpText="Largest peak-to-trough portfolio decline during the run."
                accent={selectedRun ? "negative" : undefined}
                icon={<Activity size={18} aria-hidden="true" />}
              />
            </div>
          </div>

          <RunMetadata
            selectedRun={selectedRun}
            resultCount={results.length}
            normalizeCapital={normalizeCapital}
            lastDataDate={lastDataDate}
            generatedAt={generatedAt}
          />

          {runStatus === "idle" ? <EmptyState /> : null}

          {runStatus === "loading" ? <StateBlock tone="loading" title="Running strategy comparison" body="Replaying historical prices and computing metrics across every run." /> : null}

          {runStatus === "error" ? <StateBlock tone="error" title="Backtest failed" body={error ?? "Something went wrong running the comparison."} /> : null}

          {runStatus === "success" && results.length === 0 ? (
            <StateBlock tone="warning" title="No usable data" body="The selected symbols returned no usable historical prices for this window." />
          ) : null}

          {results.length > 0 ? (
            <>
              <section className="panel">
                <div className="panel-head">
                  <div>
                    <h2>Portfolio Value</h2>
                    <p className="ph-sub">Total value over time across all compared runs</p>
                  </div>
                </div>
                <div className="panel-body">
                  <LineChart
                    testId="portfolio-chart"
                    results={results}
                    selectedRunId={selectedRun?.runId ?? null}
                    valueKey="portfolioValue"
                    label={(result) => `${result.asset.symbol} ${dataProviderLabel(result.asset)} ${result.strategyName}`}
                  />
                </div>
              </section>

              {selectedRun ? (
                <div className="two-col">
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Invested vs Value</h2>
                        <p className="ph-sub">Capital deployed against portfolio value</p>
                      </div>
                      <span className="asset-pill">{selectedRun.asset.symbol} · {dataProviderLabel(selectedRun.asset)}</span>
                    </div>
                    <div className="panel-body">
                      <DualLineChart result={selectedRun} />
                    </div>
                  </section>
                  <section className="panel timing">
                    <div className="panel-head">
                      <h2>Contribution Timing</h2>
                    </div>
                    <div className="panel-body">
                      <dl>
                        <div>
                          <dt>
                            Best Timing Impact
                            <HelpTip label="Best Timing Impact" text="The strongest final-price gain among the focused run's individual purchases." align="right" />
                          </dt>
                          <dd>{selectedRun.metrics.bestTimingImpact === null ? "-" : formatPercent(selectedRun.metrics.bestTimingImpact)}</dd>
                        </div>
                        <div>
                          <dt>
                            Worst Timing Impact
                            <HelpTip label="Worst Timing Impact" text="The weakest final-price gain or loss among the focused run's individual purchases." align="right" />
                          </dt>
                          <dd>{selectedRun.metrics.worstTimingImpact === null ? "-" : formatPercent(selectedRun.metrics.worstTimingImpact)}</dd>
                        </div>
                        <div>
                          <dt>Purchases</dt>
                          <dd>{selectedRun.metrics.numberOfPurchases}</dd>
                        </div>
                        <div>
                          <dt>Average Cost / Unit</dt>
                          <dd>{formatCurrency(selectedRun.metrics.averagePurchasePrice)}</dd>
                        </div>
                      </dl>
                    </div>
                  </section>
                </div>
              ) : null}

              <ResultsTable results={results} selectedRunId={selectedRun?.runId ?? null} onSelect={setSelectedRunId} />
              {selectedRun ? <TransactionsTable result={selectedRun} /> : null}
              <DataExportPanel
                results={results}
                selectedRun={selectedRun}
                selectedAssets={selectedAssets}
                strategies={strategies}
                normalizeCapital={normalizeCapital}
                generatedAt={generatedAt}
                warnings={runWarning ? [runWarning] : []}
              />
            </>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function StrategyEditor({
  strategy,
  index,
  canRemove,
  errors,
  onChange,
  onRemove
}: {
  strategy: BacktestStrategy;
  index: number;
  canRemove: boolean;
  errors: StrategyFieldErrors;
  onChange: (patch: Partial<BacktestStrategy>) => void;
  onRemove: () => void;
}) {
  const nameId = useId();
  const typeButtonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const typeOptions: StrategyType[] = ["dca", "lump-sum"];

  function selectTypeAt(index: number) {
    const nextType = typeOptions[index];
    onChange({ type: nextType });
    requestAnimationFrame(() => typeButtonRefs.current[index]?.focus());
  }

  function handleTypeKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      selectTypeAt((index + 1) % typeOptions.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      selectTypeAt((index - 1 + typeOptions.length) % typeOptions.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      selectTypeAt(0);
    } else if (event.key === "End") {
      event.preventDefault();
      selectTypeAt(typeOptions.length - 1);
    }
  }

  return (
    <fieldset className="strategy">
      <legend className="strategy-head">
        <span className="sh-label">Strategy {index + 1}</span>
        {canRemove ? (
          <button className="icon-btn danger" type="button" aria-label={`Remove ${strategy.name}`} onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        ) : null}
      </legend>
      <div className="strategy-body">
        <label className={`field ${errors.name ? "invalid" : ""}`}>
          <span className="field-label">Name</span>
          <input
            id={nameId}
            value={strategy.name}
            onChange={(event) => onChange({ name: event.target.value })}
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? `${nameId}-error` : undefined}
          />
          {errors.name ? <FieldError id={`${nameId}-error`} message={errors.name} /> : null}
        </label>
        <div className="field">
          <span className="field-label">
            Strategy Type
            <HelpTip label="Strategy Type" text="DCA invests on the schedule. Lump sum invests the target capital at the strategy start." />
          </span>
          <div className="segmented" role="radiogroup" aria-label={`${strategy.name} type`}>
            {typeOptions.map((type, typeIndex) => (
              <button
                key={type}
                type="button"
                role="radio"
                aria-checked={strategy.type === type}
                className={strategy.type === type ? "selected" : ""}
                ref={(button) => {
                  typeButtonRefs.current[typeIndex] = button;
                }}
                tabIndex={strategy.type === type ? 0 : -1}
                onKeyDown={(event) => handleTypeKeyDown(event, typeIndex)}
                onClick={() => onChange({ type })}
              >
                {type === "dca" ? "DCA" : "Lump Sum"}
              </button>
            ))}
          </div>
        </div>
        <div className="field-grid">
          <NumberField
            label="Initial Investment"
            value={strategy.initialInvestment}
            error={errors.initialInvestment}
            onChange={(value) => onChange({ initialInvestment: value })}
          />
          <NumberField
            label="Recurring Contribution"
            value={strategy.recurringContribution}
            error={errors.recurringContribution}
            onChange={(value) => onChange({ recurringContribution: value })}
          />
          <DateField label="Start Date" value={strategy.startDate} error={errors.startDate} onChange={(value) => onChange({ startDate: value })} />
          <DateField label="End Date" value={strategy.endDate} error={errors.endDate} onChange={(value) => onChange({ endDate: value })} />
          <label className="field">
            <span className="field-label">Frequency</span>
            <select value={strategy.frequency} onChange={(event) => onChange({ frequency: event.target.value as ContributionFrequency })}>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </label>
          <NumberField label="Transaction Fee" value={strategy.transactionFee} error={errors.transactionFee} onChange={(value) => onChange({ transactionFee: value })} />
          <NumberField
            label="Cash Drag %"
            helpText="Annualized rate applied to uninvested cash while waiting for future purchases."
            value={strategy.cashDragPercent}
            error={errors.cashDragPercent}
            onChange={(value) => onChange({ cashDragPercent: value })}
          />
        </div>
      </div>
    </fieldset>
  );
}

function NumberField({
  label,
  helpText,
  value,
  error,
  onChange
}: {
  label: string;
  helpText?: string;
  value: number;
  error?: string;
  onChange: (value: number) => void;
}) {
  const inputId = useId();

  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <span className="field-label">
        <label htmlFor={inputId}>{label}</label>
        {helpText ? <HelpTip label={label} text={helpText} /> : null}
      </span>
      <input
        id={inputId}
        type="number"
        min={label === "Cash Drag %" ? -99 : 0}
        step="0.01"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      {error ? <FieldError id={`${inputId}-error`} message={error} /> : null}
    </div>
  );
}

function DateField({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }) {
  const inputId = useId();

  return (
    <div className={`field ${error ? "invalid" : ""}`}>
      <span className="field-label">
        <label htmlFor={inputId}>{label}</label>
      </span>
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${inputId}-error` : undefined}
      />
      {error ? <FieldError id={`${inputId}-error`} message={error} /> : null}
    </div>
  );
}

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <span className="field-error" id={id} role="alert">
      <AlertCircle size={13} aria-hidden="true" />
      {message}
    </span>
  );
}

function HelpTip({
  label,
  text,
  align = "center"
}: {
  label: string;
  text: string;
  align?: "center" | "left" | "right";
}) {
  const [isOpen, setIsOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className={`help ${align === "right" ? "right" : ""} ${isOpen ? "open" : ""}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-describedby={isOpen ? tooltipId : undefined}
        aria-expanded={isOpen}
        aria-label={`Help: ${label}`}
        title={text}
        onBlur={() => setIsOpen(false)}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setIsOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        <CircleHelp size={13} aria-hidden="true" />
      </button>
      <span
        id={tooltipId}
        className="bubble"
        role="tooltip"
        style={
          isOpen
            ? {
                display: "block",
                opacity: 1,
                transform: align === "center" ? "translate(-50%, 0)" : "translate(0, 0)",
                visibility: "visible"
              }
            : undefined
        }
      >
        {text}
      </span>
    </span>
  );
}

function MetricCard({
  label,
  value,
  detail,
  helpText,
  icon,
  accent
}: {
  label: string;
  value: string;
  detail: string;
  helpText?: string;
  icon: React.ReactNode;
  accent?: "positive" | "negative";
}) {
  return (
    <article className={`metric ${accent === "positive" ? "pos" : accent === "negative" ? "neg" : ""}`}>
      <div>
        <span className="m-label">
          {label}
          {helpText ? <HelpTip label={label} text={helpText} align="right" /> : null}
        </span>
        <strong className="m-value tnum">{value}</strong>
        <small className="m-detail">{detail}</small>
      </div>
      {icon}
    </article>
  );
}

function ProviderBadge({ asset }: { asset: MarketAsset }) {
  return <span className={`provider-badge ${dataProviderClass(asset)}`}>{dataProviderLabel(asset)}</span>;
}

function RunMetadata({
  selectedRun,
  resultCount,
  normalizeCapital,
  lastDataDate,
  generatedAt
}: {
  selectedRun: ApiBacktestResult | null;
  resultCount: number;
  normalizeCapital: boolean;
  lastDataDate: string | null;
  generatedAt: string | null;
}) {
  return (
    <div className="run-metadata" aria-label="Run Metadata">
      <div>
        <strong className="md-value tnum">{resultCount || "-"}</strong>
        <span className="md-label">Compared Runs</span>
      </div>
      <div>
        <strong className="md-value tnum">{selectedRun ? formatPriceSourceLabel(selectedRun.priceSource) : "-"}</strong>
        <span className="md-label">
          Price Basis
          <HelpTip label="Price Basis" text="The historical price field used by the engine. Adjusted close is preferred when available." />
        </span>
      </div>
      <div>
        <strong className="md-value tnum">{selectedRun ? dataProviderLabel(selectedRun.asset) : "-"}</strong>
        <span className="md-label">Data Provider</span>
      </div>
      <div>
        <strong className="md-value tnum">{lastDataDate ?? "-"}</strong>
        <span className="md-label">Last Data Date</span>
      </div>
      <div>
        <strong className="md-value tnum">{selectedRun ? selectedRun.metrics.numberOfPurchases : "-"}</strong>
        <span className="md-label">Purchases</span>
      </div>
      <div>
        <strong className="md-value tnum">{selectedRun ? formatCurrency(selectedRun.metrics.feesPaid) : "-"}</strong>
        <span className="md-label">Fees Paid</span>
      </div>
      <div>
        <strong className="md-value tnum">{normalizeCapital ? "Equalized" : "As Configured"}</strong>
        <span className="md-label">Capital Logic</span>
      </div>
      {generatedAt ? (
        <div>
          <strong className="md-value tnum">{formatRunTimestamp(generatedAt)}</strong>
          <span className="md-label">Run Time</span>
        </div>
      ) : null}
    </div>
  );
}

function DataExportPanel({
  results,
  selectedRun,
  selectedAssets,
  strategies,
  normalizeCapital,
  generatedAt,
  warnings
}: {
  results: ApiBacktestResult[];
  selectedRun: ApiBacktestResult | null;
  selectedAssets: MarketAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  generatedAt: string | null;
  warnings: string[];
}) {
  return (
    <section className="panel" aria-label="Data Exports And Formatting Standards">
      <div className="panel-head">
        <div>
          <h2>Export Data</h2>
          <p className="ph-sub">Comparison, focused series, schedule, or full JSON audit payload</p>
        </div>
      </div>
      <div className="panel-body export-actions" aria-label="Export Actions">
        <button className="btn" type="button" onClick={() => exportComparisonCsv(results)}>
          <Download size={15} aria-hidden="true" />
          Export Comparison CSV
        </button>
        <button className="btn" type="button" onClick={() => selectedRun && exportSeriesCsv(selectedRun)} disabled={!selectedRun}>
          <Download size={15} aria-hidden="true" />
          Export Focused Series CSV
        </button>
        <button className="btn" type="button" onClick={() => selectedRun && exportScheduleCsv(selectedRun)} disabled={!selectedRun}>
          <Download size={15} aria-hidden="true" />
          Export Schedule CSV
        </button>
        <button className="btn" type="button" onClick={() => exportFullJson({ results, selectedRun, selectedAssets, strategies, normalizeCapital, generatedAt, warnings })}>
          <FileJson size={15} aria-hidden="true" />
          Export Full JSON
        </button>
      </div>
    </section>
  );
}

function StatusAlert({
  tone,
  message,
  role,
  className = ""
}: {
  tone: "success" | "warning" | "error" | "info";
  message: string;
  role: "alert" | "status";
  className?: string;
}) {
  const Icon = tone === "success" ? CheckCircle2 : tone === "warning" ? AlertTriangle : tone === "error" ? AlertCircle : Info;

  return (
    <p className={`alert ${tone} ${className}`.trim()} role={role}>
      <Icon size={15} aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

function StateBlock({ tone, title, body }: { tone: "idle" | "loading" | "warning" | "error"; title: string; body: string }) {
  const icon =
    tone === "loading" ? (
      <span className="spinner-lg" aria-hidden="true" />
    ) : tone === "error" ? (
      <AlertCircle size={22} aria-hidden="true" />
    ) : tone === "warning" ? (
      <AlertTriangle size={22} aria-hidden="true" />
    ) : (
      <BarChart3 size={22} aria-hidden="true" />
    );

  return (
    <div className={`state ${tone === "error" ? "error" : ""}`} role={tone === "loading" ? "status" : undefined}>
      <span className="state-icon">{icon}</span>
      <h2>{title}</h2>
      <p>{body}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <StateBlock
      tone="idle"
      title="Ready for Comparison"
      body="Choose at least one asset and run the strategy set to generate ranked outcomes."
    />
  );
}

function RunPicker({
  results,
  selectedRunId,
  onSelect
}: {
  results: ApiBacktestResult[];
  selectedRunId: string;
  onSelect: (runId: string) => void;
}) {
  return (
    <label className="run-picker">
      <span className="field-label">
        Focused Run
        <HelpTip label="Focused Run" text="The run highlighted across charts, metrics, and the transaction schedule." align="right" />
      </span>
      <select value={selectedRunId} onChange={(event) => onSelect(event.target.value)}>
        {results.map((result) => (
          <option value={result.runId} key={result.runId}>
            {result.asset.symbol} · {dataProviderLabel(result.asset)} / {result.strategyName}
          </option>
        ))}
      </select>
    </label>
  );
}

function LineChart({
  results,
  selectedRunId,
  valueKey,
  label,
  testId
}: {
  results: ApiBacktestResult[];
  selectedRunId: string | null;
  valueKey: "portfolioValue" | "investedCapital";
  label: (result: ApiBacktestResult) => string;
  testId?: string;
}) {
  const width = 900;
  const height = 320;
  const padding = { top: 16, right: 24, bottom: 36, left: 72 };
  const allPoints = results.flatMap((result) => result.series.map((point) => ({ date: point.date, value: point[valueKey] })));
  const dates = Array.from(new Set(allPoints.map((point) => point.date))).sort();
  const minValue = 0;
  const maxValue = Math.max(...allPoints.map((point) => point.value), 1);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const colorForIndex = (index: number) => colors[index % colors.length];
  const xFor = (date: string) => padding.left + ((dateIndex.get(date) ?? 0) / Math.max(dates.length - 1, 1)) * plotWidth;
  const yFor = (value: number) => padding.top + (1 - (value - minValue) / (maxValue - minValue || 1)) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => minValue + (maxValue - minValue) * ratio);
  const xTicks = [0, 0.33, 0.66, 1].map((ratio) => dates[Math.round((dates.length - 1) * ratio)]).filter(Boolean);

  return (
    <div className="chart" data-testid={testId}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${valueKey === "portfolioValue" ? "Portfolio value" : "Invested capital"} over time for ${results.length} compared runs`}>
        <title>{valueKey === "portfolioValue" ? "Portfolio Value Over Time" : "Invested Capital Over Time"}</title>
        <desc>
          Compared runs: {results.map(label).join("; ")}. Values range from {formatCompactCurrency(minValue)} to {formatCompactCurrency(maxValue)}.
        </desc>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} className="grid-line" />
            <text x={padding.left - 12} y={yFor(tick) + 4} textAnchor="end">
              {formatCompactCurrency(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={xFor(tick)} y={height - 10} textAnchor="middle">
            {tick.slice(0, 7)}
          </text>
        ))}
        {results.map((result, index) => {
          const path = result.series.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xFor(point.date)} ${yFor(point[valueKey])}`).join(" ");
          const isFocused = result.runId === selectedRunId;
          return (
            <path
              key={result.runId}
              d={path}
              fill="none"
              opacity={selectedRunId && !isFocused ? 0.5 : 1}
              stroke={colorForIndex(index)}
              strokeLinejoin="round"
              strokeWidth={isFocused ? "3.2" : "2.1"}
            />
          );
        })}
      </svg>
      <div className="chart-legend">
        {results.map((result, index) => (
          <span key={result.runId} className={result.runId === selectedRunId ? "selected" : "muted"}>
            <i style={{ background: colorForIndex(index) }} />
            {label(result)}
          </span>
        ))}
      </div>
    </div>
  );
}

function DualLineChart({ result }: { result: ApiBacktestResult }) {
  return <BalanceChart result={result} />;
}

function BalanceChart({ result }: { result: ApiBacktestResult }) {
  const width = 680;
  const height = 280;
  const padding = { top: 16, right: 24, bottom: 34, left: 72 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const maxValue = Math.max(...result.series.flatMap((point) => [point.investedCapital, point.portfolioValue]), 1);
  const xFor = (index: number) => padding.left + (index / Math.max(result.series.length - 1, 1)) * plotWidth;
  const yFor = (value: number) => padding.top + (1 - value / maxValue) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => maxValue * ratio);
  const xTicks = [0, 0.5, 1].map((ratio) => Math.round((result.series.length - 1) * ratio));
  const pathFor = (key: "investedCapital" | "portfolioValue") =>
    result.series.map((point, index) => `${index === 0 ? "M" : "L"} ${xFor(index)} ${yFor(point[key])}`).join(" ");

  return (
    <div className="chart" data-testid="invested-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Invested Capital Versus Current Value">
        <title>Invested Capital Versus Current Value</title>
        <desc>
          {result.asset.symbol} {result.strategyName}: Dashed line shows invested capital and solid line shows portfolio value.
        </desc>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} className="grid-line" />
            <text x={padding.left - 12} y={yFor(tick) + 4} textAnchor="end">
              {formatCompactCurrency(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((index) => (
          <text key={index} x={xFor(index)} y={height - 10} textAnchor="middle">
            {result.series[index]?.date.slice(0, 7)}
          </text>
        ))}
        <path d={pathFor("investedCapital")} fill="none" stroke="#A2ABB8" strokeDasharray="5 5" strokeWidth="2.2" />
        <path d={pathFor("portfolioValue")} fill="none" stroke="#2E63E6" strokeLinejoin="round" strokeWidth="2.6" />
      </svg>
      <div className="chart-legend">
        <span className="muted">
          <i className="dash" style={{ color: "#A2ABB8" }} />
          Invested capital
        </span>
        <span>
          <i style={{ background: "#2E63E6" }} />
          Portfolio value
        </span>
      </div>
    </div>
  );
}

function ResultsTable({
  results,
  selectedRunId,
  onSelect
}: {
  results: ApiBacktestResult[];
  selectedRunId: string | null;
  onSelect: (runId: string) => void;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Results</h2>
        <span className="row-count">{results.length} runs</span>
      </div>
      <div className="table-wrap scroll-thin">
        <table className="data" aria-label="Results Comparison">
          <thead>
            <tr>
              <th scope="col">Asset</th>
              <th scope="col">Strategy</th>
              <th scope="col">Invested</th>
              <th scope="col">Final Value</th>
              <th scope="col">Return</th>
              <th scope="col">CAGR</th>
              <th scope="col">Drawdown</th>
              <th scope="col">Purchases</th>
              <th scope="col">Units</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr
                key={result.runId}
                className={`clickable ${result.runId === selectedRunId ? "focused" : ""}`}
                aria-current={result.runId === selectedRunId ? "true" : undefined}
                aria-selected={result.runId === selectedRunId}
                tabIndex={0}
                onClick={() => onSelect(result.runId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(result.runId);
                  }
                }}
              >
                <th scope="row">
                  <span className="asset-cell" aria-label={`${result.asset.symbol} ${dataProviderLabel(result.asset)}`}>
                    <span>{result.asset.symbol}</span>
                    <ProviderBadge asset={result.asset} />
                  </span>
                </th>
                <td>{result.strategyName}</td>
                <td>{formatCurrency(result.metrics.totalInvested)}</td>
                <td>{formatCurrency(result.metrics.finalValue)}</td>
                <td className={result.metrics.totalReturn >= 0 ? "cell-pos" : "cell-neg"}>{formatPercent(result.metrics.totalReturn)}</td>
                <td>{formatPercent(result.metrics.cagr)}</td>
                <td className="cell-neg">{formatPercent(result.metrics.maxDrawdown)}</td>
                <td>{result.metrics.numberOfPurchases}</td>
                <td>{formatNumber(result.metrics.unitsAccumulated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TransactionsTable({ result }: { result: ApiBacktestResult }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div className="heading-row">
          <h2>Transactions</h2>
          <HelpTip label="Transactions" text="Focused run purchase schedule matched to available historical price dates." align="right" />
        </div>
        <span className="row-count">{result.transactions.length} rows</span>
      </div>
      <div className="table-wrap table-scroll-y scroll-thin">
        <table className="data" aria-label="Purchase Schedule">
          <thead>
            <tr>
              <th scope="col">Due Date</th>
              <th scope="col">Price Date</th>
              <th scope="col">Gross</th>
              <th scope="col">Fee</th>
              <th scope="col">Price</th>
              <th scope="col">Units</th>
            </tr>
          </thead>
          <tbody>
            {result.transactions.map((transaction) => (
              <tr key={transaction.id}>
                <th scope="row">{transaction.dueDate}</th>
                <td>{transaction.date}</td>
                <td>{formatCurrency(transaction.grossAmount)}</td>
                <td>{formatCurrency(transaction.fee)}</td>
                <td>{formatCurrency(transaction.price)}</td>
                <td>{formatNumber(transaction.units)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function exportComparisonCsv(results: ApiBacktestResult[]) {
  exportCsv("quantdca-comparison.csv", [
    [
      "Asset",
      "Asset Name",
      "Data Provider",
      "Strategy",
      "Price Basis",
      "Start Date",
      "Last Data Date",
      "Target Capital",
      "Total Invested",
      "Remaining Cash",
      "Final Value",
      "Total Return",
      "CAGR",
      "Max Drawdown",
      "Volatility",
      "Best Timing Impact",
      "Worst Timing Impact",
      "Purchases",
      "Average Cost / Unit",
      "Units Accumulated",
      "Fees Paid"
    ],
    ...results.map((result) => [
      result.asset.symbol,
      result.asset.name,
      dataProviderLabel(result.asset),
      result.strategyName,
      formatPriceSourceLabel(result.priceSource),
      result.series[0]?.date,
      result.series.at(-1)?.date,
      result.targetCapital,
      result.metrics.totalInvested,
      result.metrics.remainingCash,
      result.metrics.finalValue,
      result.metrics.totalReturn,
      result.metrics.cagr,
      result.metrics.maxDrawdown,
      result.metrics.volatility,
      result.metrics.bestTimingImpact,
      result.metrics.worstTimingImpact,
      result.metrics.numberOfPurchases,
      result.metrics.averagePurchasePrice,
      result.metrics.unitsAccumulated,
      result.metrics.feesPaid
    ])
  ]);
}

function exportSeriesCsv(result: ApiBacktestResult) {
  exportCsv(`${exportRunPrefix(result)}-series.csv`, [
    ["Date", "Asset", "Data Provider", "Strategy", "Price", "Invested Capital", "Market Value", "Cash Value", "Portfolio Value", "Units"],
    ...result.series.map((point) => [
      point.date,
      result.asset.symbol,
      dataProviderLabel(result.asset),
      result.strategyName,
      point.price,
      point.investedCapital,
      point.marketValue,
      point.cashValue,
      point.portfolioValue,
      point.units
    ])
  ]);
}

function exportScheduleCsv(result: ApiBacktestResult) {
  exportCsv(`${exportRunPrefix(result)}-schedule.csv`, [
    ["Transaction ID", "Asset", "Data Provider", "Strategy", "Due Date", "Price Date", "Gross Amount", "Fee", "Net Amount", "Price", "Units"],
    ...result.transactions.map((transaction) => [
      transaction.id,
      result.asset.symbol,
      dataProviderLabel(result.asset),
      result.strategyName,
      transaction.dueDate,
      transaction.date,
      transaction.grossAmount,
      transaction.fee,
      transaction.netAmount,
      transaction.price,
      transaction.units
    ])
  ]);
}

function exportFullJson({
  results,
  selectedRun,
  selectedAssets,
  strategies,
  normalizeCapital,
  generatedAt,
  warnings
}: {
  results: ApiBacktestResult[];
  selectedRun: ApiBacktestResult | null;
  selectedAssets: MarketAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  generatedAt: string | null;
  warnings: string[];
}) {
  downloadFile(
    "quantdca-backtest-export.json",
    JSON.stringify(
      {
        generatedAt,
        focusedRunId: selectedRun?.runId ?? null,
        normalizeCapital,
        warnings,
        selectedAssets,
        strategies,
        results
      },
      null,
      2
    ),
    "application/json;charset=utf-8"
  );
}

function exportCsv(fileName: string, rows: Array<Array<string | number | null | undefined>>) {
  downloadFile(fileName, `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`, "text/csv;charset=utf-8");
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function downloadFile(fileName: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportRunPrefix(result: ApiBacktestResult) {
  return `quantdca-${result.asset.symbol}-${dataProviderLabel(result.asset)}-${result.strategyName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatPriceSourceLabel(priceSource: ApiBacktestResult["priceSource"]) {
  return priceSource === "adjusted-close" ? "Adjusted Close" : "Close";
}

function formatRunTimestamp(isoTimestamp: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short"
  }).format(new Date(isoTimestamp));
}

function assetKey(asset: MarketAsset): string {
  return `${asset.provider?.id ?? asset.dataProvider ?? "asset"}:${asset.symbol}`;
}

function dataProviderLabel(asset: MarketAsset): string {
  return asset.dataProvider ?? asset.provider?.label ?? "Provider";
}

function dataProviderClass(asset: MarketAsset): string {
  const label = dataProviderLabel(asset).toLowerCase();
  if (label === "coin api") return "coinapi";
  if (label === "eodhd") return "eodhd";
  if (label === "custom csv") return "csv";
  return "";
}

function customCsvSymbol(fileName: string, selectedAssets: SelectedAsset[]) {
  const baseName = fileName.replace(/\.csv$/i, "");
  const sanitizedName = baseName.toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  const baseSymbol = `CSV-${sanitizedName || "UPLOAD"}`.slice(0, 28);
  const existingSymbols = new Set(selectedAssets.map((asset) => asset.symbol));

  if (!existingSymbols.has(baseSymbol)) {
    return baseSymbol;
  }

  let suffix = 2;
  while (existingSymbols.has(`${baseSymbol}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseSymbol}-${suffix}`;
}

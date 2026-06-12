import {
  Activity,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleHelp,
  CircleDollarSign,
  Database,
  Download,
  FileJson,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { BacktestStrategy, ContributionFrequency, PricePoint, StrategyType, Transaction } from "./lib/backtest";
import { CustomCsvParseError, parseCustomPriceCsv } from "./lib/customCsv";
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
}

interface SelectedAsset extends MarketAsset {
  source?: "provider" | "custom-csv";
  prices?: PricePoint[];
}

const colors = ["#0E6F66", "#9C6B1B", "#7C3AED", "#157A4A", "#B23A2E", "#5C6661"];

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

function DashboardApp() {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MarketAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<SelectedAsset[]>([]);
  const [strategies, setStrategies] = useState<BacktestStrategy[]>(defaultStrategies);
  const [normalizeCapital, setNormalizeCapital] = useState(true);
  const [searchStatus, setSearchStatus] = useState<"idle" | "loading" | "error">("idle");
  const [runStatus, setRunStatus] = useState<"idle" | "loading" | "error" | "success">("idle");
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ApiBacktestResult[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [csvUploadStatus, setCsvUploadStatus] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setSearchResults([]);
      setSearchStatus("idle");
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearchStatus("loading");
      try {
        const response = await fetch(`/api/assets/search?q=${encodeURIComponent(query)}`, {
          signal: controller.signal
        });
        const body = await readApiJson<{ assets?: MarketAsset[]; error?: ApiError }>(response, "Asset search");
        if (!response.ok) {
          throw new Error(apiErrorMessage(body, "Asset search failed."));
        }
        setSearchResults(body.assets ?? []);
        setSearchStatus("idle");
      } catch (searchError) {
        if (!controller.signal.aborted) {
          setSearchStatus("error");
          setSearchResults([]);
          setError(searchError instanceof Error ? searchError.message : "Asset search failed.");
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

  const lastDataDate = selectedRun?.series.at(-1)?.date ?? null;
  const bestAdvantage = bestRun && secondBestRun ? bestRun.metrics.finalValue - secondBestRun.metrics.finalValue : 0;
  const bestAdvantagePercent =
    bestRun && secondBestRun && secondBestRun.metrics.finalValue > 0
      ? bestAdvantage / secondBestRun.metrics.finalValue
      : 0;
  const totalInvested = useMemo(() => selectedRun?.metrics.totalInvested ?? 0, [selectedRun]);

  function addAsset(asset: MarketAsset) {
    setError(null);
    setCsvUploadStatus(null);
    setSelectedAssets((current) => (current.some((selected) => selected.symbol === asset.symbol) ? current : [...current, { ...asset, source: "provider" }]));
    setQuery("");
    setSearchResults([]);
  }

  function removeAsset(symbol: string) {
    setSelectedAssets((current) => current.filter((asset) => asset.symbol !== symbol));
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
        source: "custom-csv",
        prices: parsed.prices
      };

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
    setStrategies((current) => current.map((strategy) => (strategy.id === id ? { ...strategy, ...patch } : strategy)));
  }

  function addStrategy() {
    const nextIndex = strategies.length + 1;
    setStrategies((current) => [
      ...current,
      {
        ...current[0],
        id: `strategy-${Date.now()}`,
        name: `DCA ${nextIndex}`,
        type: "dca",
        frequency: nextIndex % 2 === 0 ? "weekly" : "monthly"
      }
    ]);
  }

  function removeStrategy(id: string) {
    setStrategies((current) => (current.length > 1 ? current.filter((strategy) => strategy.id !== id) : current));
  }

  async function runBacktest() {
    setError(null);
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

    setRunStatus("loading");
    try {
      const response = await fetch("/api/backtests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assets: selectedAssets, strategies, normalizeCapital })
      });
      const body = await readApiJson<{ results?: ApiBacktestResult[]; generatedAt?: string; error?: ApiError }>(
        response,
        "Backtest"
      );
      if (!response.ok) {
        throw new Error(apiErrorMessage(body, "Backtest failed."));
      }

      const nextResults = (body.results ?? []) as ApiBacktestResult[];
      const defaultFocusedRun = nextResults.reduce<ApiBacktestResult | null>(
        (best, result) => (!best || result.metrics.finalValue > best.metrics.finalValue ? result : best),
        null
      );

      setResults(nextResults);
      setSelectedRunId(defaultFocusedRun?.runId ?? null);
      setGeneratedAt(body.generatedAt ?? null);
      setRunStatus("success");
    } catch (runError) {
      setRunStatus("error");
      setResults([]);
      setGeneratedAt(null);
      setError(runError instanceof Error ? runError.message : "Backtest failed.");
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar" aria-label="QuantDCA Overview">
        <div className="brand-lockup">
          <LogoMark className="brand-mark" />
          <div>
            <p className="eyebrow brand-wordmark">Quant<span>DCA</span></p>
            <h1>Strategy Comparison Console</h1>
          </div>
        </div>
        <div className="topbar-meta" aria-label="Data Safeguards">
          <span>
            <ShieldCheck size={14} aria-hidden="true" />
            Server-Side Key
          </span>
          <span>
            <Database size={14} aria-hidden="true" />
            Adjusted Close
          </span>
          <span>
            <CheckCircle2 size={14} aria-hidden="true" />
            Deterministic Engine
          </span>
        </div>
      </header>

      <section className="workspace">
        <aside className="control-surface" aria-label="Backtest Controls">
          <div className="panel-kicker">
            <span>Setup</span>
            <small>{selectedAssets.length} Asset{selectedAssets.length === 1 ? "" : "s"} / {strategies.length} Strategies</small>
          </div>
          <div className="section-heading">
            <Search size={18} aria-hidden="true" />
            <h2>Assets</h2>
          </div>
          <label className="field">
            <span className="label-row">Asset Search</span>
            <input
              aria-label="Asset Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="AAPL, MSFT, BTC"
              autoComplete="off"
            />
          </label>
          <div className="search-results" aria-live="polite">
            {searchStatus === "loading" ? <p className="muted-row">Searching...</p> : null}
            {searchStatus === "error" ? <p className="muted-row error-text">Search failed.</p> : null}
            {searchResults.map((asset) => (
              <button className="asset-result" key={asset.symbol} type="button" onClick={() => addAsset(asset)}>
                <span>
                  <strong>{asset.symbol}</strong>
                  <small>{asset.name}</small>
                </span>
                <span>{asset.type ?? asset.exchange ?? "Asset"}</span>
              </button>
            ))}
          </div>

          <div className="selected-assets" aria-label="Selected Assets">
            {selectedAssets.length === 0 ? <p className="muted-row">No assets selected.</p> : null}
            {selectedAssets.map((asset) => (
              <span className="asset-chip" key={asset.symbol}>
                {asset.symbol}
                <button type="button" aria-label={`Remove ${asset.symbol}`} onClick={() => removeAsset(asset.symbol)}>
                  <X size={13} aria-hidden="true" />
                </button>
              </span>
            ))}
          </div>

          <div className="csv-upload">
            <div className="section-heading compact-heading">
              <Database size={16} aria-hidden="true" />
              <h2>Custom CSV</h2>
              <HelpTip
                label="Custom CSV Upload"
                text="Upload a CSV where row 1 is ignored, column A starts with YYYY-MM-DD dates, and column B contains positive USD prices."
              />
            </div>
            <label className="file-field">
              <span className="label-row">Upload Custom CSV</span>
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
            <p className="csv-format-note">
              Required: A2 = YYYY-MM-DD date, B2 = USD price. Row 1 and columns C onward are ignored.
            </p>
            {csvUploadStatus ? (
              <p className={`csv-feedback ${csvUploadStatus.tone}`} role={csvUploadStatus.tone === "error" ? "alert" : "status"}>
                {csvUploadStatus.message}
              </p>
            ) : null}
          </div>

          <div className="setup-summary" aria-label="Run Assumptions">
            <span>{dateRange.startDate} to {dateRange.endDate}</span>
            <span>{normalizeCapital ? "Equal Capital" : "As Configured"}</span>
            <span>{strategies.reduce((sum, strategy) => sum + strategy.transactionFee, 0) > 0 ? "Fees Included" : "No Fees"}</span>
          </div>

          <div className="section-heading with-action">
            <div>
              <CalendarDays size={18} aria-hidden="true" />
              <h2>Strategies</h2>
            </div>
            <button className="icon-button" type="button" aria-label="Add Strategy" onClick={addStrategy}>
              <Plus size={17} aria-hidden="true" />
            </button>
          </div>

          <div className="switch-row">
            <input
              id="normalize-capital"
              type="checkbox"
              checked={normalizeCapital}
              onChange={(event) => setNormalizeCapital(event.target.checked)}
            />
            <span className="label-row">
              <label htmlFor="normalize-capital">Equal Capital</label>
              <HelpTip label="Equal Capital" text="When enabled, each strategy receives the same target capital for apples-to-apples comparison." />
            </span>
          </div>

          <div className="run-action">
            <button className="run-button" type="button" onClick={runBacktest} disabled={runStatus === "loading"}>
              <Play size={17} aria-hidden="true" />
              {runStatus === "loading" ? "Running..." : "Run Backtests"}
            </button>
          </div>
          {error ? <p className="status-error" role="alert">{error}</p> : null}

          <div className="strategy-list">
            {strategies.map((strategy, index) => (
              <StrategyEditor
                key={strategy.id}
                strategy={strategy}
                index={index}
                canRemove={strategies.length > 1}
                onChange={(patch) => updateStrategy(strategy.id, patch)}
                onRemove={() => removeStrategy(strategy.id)}
              />
            ))}
          </div>
        </aside>

        <section className="results-surface" aria-label="Backtest Results">
          <div className="outcome-hero">
            <div className="winner-panel">
              <span className="panel-kicker-label inline-help">
                Best Outcome
                <HelpTip label="Best Outcome" text="The run with the highest final portfolio value across the current comparison set." />
              </span>
              <strong>{bestRun ? `${bestRun.asset.symbol} / ${bestRun.strategyName}` : "Awaiting Run"}</strong>
              <p>
                {bestRun
                  ? `${formatCurrency(bestRun.metrics.finalValue)} final value with ${formatPercent(bestRun.metrics.totalReturn)} total return.`
                  : "Run a comparison to rank strategies by final portfolio value."}
              </p>
              {bestRun && secondBestRun ? (
                <span className="winner-delta">
                  <ArrowUpRight size={15} aria-hidden="true" />
                  {formatCurrency(bestAdvantage)} ahead of next best ({formatPercent(bestAdvantagePercent)})
                </span>
              ) : null}
            </div>
            <div className="summary-grid">
              <MetricCard
                label="Focused Value"
                value={selectedRun ? formatCurrency(selectedRun.metrics.finalValue) : "-"}
                detail={selectedRun ? selectedRun.strategyName : "No Run"}
                icon={<CircleDollarSign size={18} aria-hidden="true" />}
              />
              <MetricCard
                label="Total Return"
                value={selectedRun ? formatPercent(selectedRun.metrics.totalReturn) : "-"}
                detail={selectedRun ? formatCurrency(totalInvested) : "Total Invested"}
                helpText="Final value divided by total invested capital, minus one."
                accent={selectedRun && selectedRun.metrics.totalReturn >= 0 ? "positive" : "negative"}
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
                detail={bestRun ? `Best ${bestRun.asset.symbol}` : "Risk"}
                helpText="Largest peak-to-trough portfolio decline during the run."
                accent="negative"
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

          {results.length > 0 ? (
            <DataExportPanel
              results={results}
              selectedRun={selectedRun}
              selectedAssets={selectedAssets}
              strategies={strategies}
              normalizeCapital={normalizeCapital}
              generatedAt={generatedAt}
            />
          ) : null}

          {runStatus === "idle" ? (
            <EmptyState />
          ) : null}

          {runStatus === "loading" ? (
            <div className="loading-state" role="status">
              <span />
              Running strategy comparison
            </div>
          ) : null}

          {runStatus === "success" && results.length === 0 ? (
            <div className="empty-state">
              <h2>No Data</h2>
              <p>The selected symbols returned no usable historical prices.</p>
            </div>
          ) : null}

          {results.length > 0 ? (
            <>
              <div className="chart-section">
                <div className="section-title-row">
                  <div>
                    <span className="panel-kicker-label">Comparison</span>
                    <h2>Portfolio Value</h2>
                  </div>
                  <RunPicker results={results} selectedRunId={selectedRun?.runId ?? ""} onSelect={setSelectedRunId} />
                </div>
                <LineChart
                  testId="portfolio-chart"
                  results={results}
                  valueKey="portfolioValue"
                  label={(result) => `${result.asset.symbol} ${result.strategyName}`}
                />
              </div>

              {selectedRun ? (
                <div className="chart-section two-column">
                  <div>
                    <div className="section-title-row">
                      <div>
                        <span className="panel-kicker-label">Capital Path</span>
                        <h2>Invested vs Value</h2>
                      </div>
                      <span className="asset-pill">{selectedRun.asset.symbol}</span>
                    </div>
                    <DualLineChart result={selectedRun} />
                  </div>
                  <div className="timing-panel">
                    <h2>Contribution Timing</h2>
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
                        <dt>Average Price</dt>
                        <dd>{formatCurrency(selectedRun.metrics.averagePurchasePrice)}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              ) : null}

              <ResultsTable results={results} />
              {selectedRun ? <TransactionsTable result={selectedRun} /> : null}
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
  onChange,
  onRemove
}: {
  strategy: BacktestStrategy;
  index: number;
  canRemove: boolean;
  onChange: (patch: Partial<BacktestStrategy>) => void;
  onRemove: () => void;
}) {
  return (
    <fieldset className="strategy-editor">
      <legend>
        <span className="legend-label">Strategy {index + 1}</span>
        {canRemove ? (
          <button type="button" aria-label={`Remove ${strategy.name}`} onClick={onRemove}>
            <Trash2 size={15} aria-hidden="true" />
          </button>
        ) : null}
      </legend>
      <label className="field compact">
        <span className="label-row">Name</span>
        <input value={strategy.name} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <div className="label-row segmented-label">
        Strategy Type
        <HelpTip label="Strategy Type" text="DCA invests on the schedule. Lump sum invests the target capital at the strategy start." />
      </div>
      <div className="segmented" role="group" aria-label={`${strategy.name} type`}>
        {(["dca", "lump-sum"] as StrategyType[]).map((type) => (
          <button
            key={type}
            type="button"
            className={strategy.type === type ? "selected" : ""}
            onClick={() => onChange({ type })}
          >
            {type === "dca" ? "DCA" : "Lump Sum"}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <NumberField label="Initial Investment" value={strategy.initialInvestment} onChange={(value) => onChange({ initialInvestment: value })} />
        <NumberField label="Recurring Contribution" value={strategy.recurringContribution} onChange={(value) => onChange({ recurringContribution: value })} />
        <DateField label="Start Date" value={strategy.startDate} onChange={(value) => onChange({ startDate: value })} />
        <DateField label="End Date" value={strategy.endDate} onChange={(value) => onChange({ endDate: value })} />
        <label className="field compact">
          <span className="label-row">Frequency</span>
          <select value={strategy.frequency} onChange={(event) => onChange({ frequency: event.target.value as ContributionFrequency })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </label>
        <NumberField label="Transaction Fee" value={strategy.transactionFee} onChange={(value) => onChange({ transactionFee: value })} />
        <NumberField label="Cash Drag %" helpText="Annualized rate applied to uninvested cash while waiting for future purchases." value={strategy.cashDragPercent} onChange={(value) => onChange({ cashDragPercent: value })} />
      </div>
    </fieldset>
  );
}

function NumberField({ label, helpText, value, onChange }: { label: string; helpText?: string; value: number; onChange: (value: number) => void }) {
  const inputId = useId();

  return (
    <div className="field compact">
      <span className="label-row">
        <label htmlFor={inputId}>{label}</label>
        {helpText ? <HelpTip label={label} text={helpText} /> : null}
      </span>
      <input id={inputId} type="number" min={label === "Cash Drag %" ? -99 : 0} step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </div>
  );
}

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const inputId = useId();

  return (
    <div className="field compact">
      <span className="label-row"><label htmlFor={inputId}>{label}</label></span>
      <input id={inputId} type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
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

  return (
    <span
      className={`help-tip ${align === "center" ? "" : `align-${align}`} ${isOpen ? "open" : ""}`}
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label={`Help: ${label}`}
        title={text}
        onBlur={() => setIsOpen(false)}
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
        onFocus={() => setIsOpen(true)}
      >
        <CircleHelp size={13} aria-hidden="true" />
      </button>
      <span
        className="help-bubble"
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
    <article className={`metric-card ${accent ?? ""}`}>
      <div>
        <span className="metric-card-label">
          {label}
          {helpText ? <HelpTip label={label} text={helpText} align="right" /> : null}
        </span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
      {icon}
    </article>
  );
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
      <span>
        <strong>{resultCount || "-"}</strong>
        <span className="metadata-label">Compared Runs</span>
      </span>
      <span>
        <strong>{selectedRun ? formatPriceSourceLabel(selectedRun.priceSource) : "-"}</strong>
        <span className="metadata-label">
          Price Basis
          <HelpTip label="Price Basis" text="The historical price field used by the engine. Adjusted close is preferred when available." />
        </span>
      </span>
      <span>
        <strong>{lastDataDate ?? "-"}</strong>
        <span className="metadata-label">Last Data Date</span>
      </span>
      <span>
        <strong>{selectedRun ? selectedRun.metrics.numberOfPurchases : "-"}</strong>
        <span className="metadata-label">Purchases</span>
      </span>
      <span>
        <strong>{selectedRun ? formatCurrency(selectedRun.metrics.feesPaid) : "-"}</strong>
        <span className="metadata-label">Fees Paid</span>
      </span>
      <span>
        <strong>{normalizeCapital ? "Equalized" : "As Configured"}</strong>
        <span className="metadata-label">Capital Logic</span>
      </span>
      {generatedAt ? (
        <span>
          <strong>{new Date(generatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</strong>
          <span className="metadata-label">Run Time</span>
        </span>
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
  generatedAt
}: {
  results: ApiBacktestResult[];
  selectedRun: ApiBacktestResult | null;
  selectedAssets: MarketAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  generatedAt: string | null;
}) {
  return (
    <section className="data-panel" aria-label="Data Exports And Formatting Standards">
      <div className="data-panel-copy">
        <span className="panel-kicker-label">Data Exports</span>
        <h2>Export Data</h2>
        <p>Download the computed comparison, focused run series, purchase schedule, or full JSON audit payload.</p>
        <p className="format-note">Formatting: Title Case headings, data-first values, straight quotes, and spaced / separators.</p>
      </div>
      <div className="export-actions" aria-label="Export Actions">
        <button type="button" onClick={() => exportComparisonCsv(results)}>
          <Download size={16} aria-hidden="true" />
          Export Comparison CSV
        </button>
        <button type="button" onClick={() => selectedRun && exportSeriesCsv(selectedRun)} disabled={!selectedRun}>
          <Download size={16} aria-hidden="true" />
          Export Focused Series CSV
        </button>
        <button type="button" onClick={() => selectedRun && exportScheduleCsv(selectedRun)} disabled={!selectedRun}>
          <Download size={16} aria-hidden="true" />
          Export Schedule CSV
        </button>
        <button
          type="button"
          onClick={() => exportFullJson({ results, selectedRun, selectedAssets, strategies, normalizeCapital, generatedAt })}
        >
          <FileJson size={16} aria-hidden="true" />
          Export Full JSON
        </button>
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        <BarChart3 size={24} />
      </span>
      <h2>Ready for Comparison</h2>
      <p>Choose at least one asset and run the strategy set to generate ranked outcomes.</p>
    </div>
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
      <span className="label-row">Focused Run</span>
      <select value={selectedRunId} onChange={(event) => onSelect(event.target.value)}>
        {results.map((result) => (
          <option value={result.runId} key={result.runId}>
            {result.asset.symbol} / {result.strategyName}
          </option>
        ))}
      </select>
    </label>
  );
}

function LineChart({
  results,
  valueKey,
  label,
  testId
}: {
  results: ApiBacktestResult[];
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
  const rankedRunIds = [...results].sort((left, right) => right.metrics.finalValue - left.metrics.finalValue).map((result) => result.runId);
  const colorForResult = (result: ApiBacktestResult, fallbackIndex: number) => {
    const rank = rankedRunIds.indexOf(result.runId);
    return colors[(rank >= 0 ? rank : fallbackIndex) % colors.length];
  };
  const xFor = (date: string) => padding.left + (dates.indexOf(date) / Math.max(dates.length - 1, 1)) * plotWidth;
  const yFor = (value: number) => padding.top + (1 - (value - minValue) / (maxValue - minValue || 1)) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => minValue + (maxValue - minValue) * ratio);
  const xTicks = [0, 0.33, 0.66, 1].map((ratio) => dates[Math.round((dates.length - 1) * ratio)]).filter(Boolean);

  return (
    <div className="chart-wrap" data-testid={testId}>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Portfolio Value Over Time">
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
          return <path key={result.runId} d={path} fill="none" stroke={colorForResult(result, index)} strokeWidth="2.3" />;
        })}
      </svg>
      <div className="chart-legend">
        {results.map((result, index) => (
          <span key={result.runId}>
            <i style={{ background: colorForResult(result, index) }} />
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
    <div className="chart-wrap" data-testid="invested-chart">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Invested Capital Versus Current Value">
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
        <path d={pathFor("investedCapital")} fill="none" stroke="#A6A89A" strokeDasharray="5 5" strokeWidth="2.2" />
        <path d={pathFor("portfolioValue")} fill="none" stroke="#0E6F66" strokeWidth="2.4" />
      </svg>
      <div className="chart-legend">
        <span>
          <i style={{ background: "#A6A89A" }} />
          Invested
        </span>
        <span>
          <i style={{ background: "#0E6F66" }} />
          Value
        </span>
      </div>
    </div>
  );
}

function ResultsTable({ results }: { results: ApiBacktestResult[] }) {
  return (
    <div className="table-section">
      <h2>Results</h2>
      <div className="table-scroll">
        <table aria-label="Results Comparison">
          <thead>
            <tr>
              <th>Asset</th>
              <th>Strategy</th>
              <th>Invested</th>
              <th>Final Value</th>
              <th>Return</th>
              <th>CAGR</th>
              <th>Drawdown</th>
              <th>Purchases</th>
              <th>Units</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.runId}>
                <td>{result.asset.symbol}</td>
                <td>{result.strategyName}</td>
                <td>{formatCurrency(result.metrics.totalInvested)}</td>
                <td>{formatCurrency(result.metrics.finalValue)}</td>
                <td className={result.metrics.totalReturn >= 0 ? "positive-text" : "negative-text"}>{formatPercent(result.metrics.totalReturn)}</td>
                <td>{formatPercent(result.metrics.cagr)}</td>
                <td className="negative-text">{formatPercent(result.metrics.maxDrawdown)}</td>
                <td>{result.metrics.numberOfPurchases}</td>
                <td>{formatNumber(result.metrics.unitsAccumulated)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TransactionsTable({ result }: { result: ApiBacktestResult }) {
  return (
    <div className="table-section">
      <div className="heading-row">
        <h2>Transactions</h2>
        <HelpTip label="Transactions" text="Focused run purchase schedule matched to available historical price dates." />
      </div>
      <div className="table-scroll transaction-scroll">
        <table aria-label="Purchase Schedule">
          <thead>
            <tr>
              <th>Due Date</th>
              <th>Price Date</th>
              <th>Gross</th>
              <th>Fee</th>
              <th>Price</th>
              <th>Units</th>
            </tr>
          </thead>
          <tbody>
            {result.transactions.map((transaction) => (
              <tr key={transaction.id}>
                <td>{transaction.dueDate}</td>
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
    </div>
  );
}

function exportComparisonCsv(results: ApiBacktestResult[]) {
  exportCsv("quantdca-comparison.csv", [
    [
      "Asset",
      "Asset Name",
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
      "Average Purchase Price",
      "Units Accumulated",
      "Fees Paid"
    ],
    ...results.map((result) => [
      result.asset.symbol,
      result.asset.name,
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
    ["Date", "Asset", "Strategy", "Price", "Invested Capital", "Market Value", "Cash Value", "Portfolio Value", "Units"],
    ...result.series.map((point) => [
      point.date,
      result.asset.symbol,
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
    ["Transaction ID", "Asset", "Strategy", "Due Date", "Price Date", "Gross Amount", "Fee", "Net Amount", "Price", "Units"],
    ...result.transactions.map((transaction) => [
      transaction.id,
      result.asset.symbol,
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
  generatedAt
}: {
  results: ApiBacktestResult[];
  selectedRun: ApiBacktestResult | null;
  selectedAssets: MarketAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  generatedAt: string | null;
}) {
  downloadFile(
    "quantdca-backtest-export.json",
    JSON.stringify(
      {
        generatedAt,
        focusedRunId: selectedRun?.runId ?? null,
        normalizeCapital,
        selectedAssets,
        strategies,
        formattingStandards: ["Title Case Headings", "Data-First Values", "Straight Quotes", "Spaced / Separators"],
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
  return `quantdca-${result.asset.symbol}-${result.strategyName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function formatPriceSourceLabel(priceSource: ApiBacktestResult["priceSource"]) {
  return priceSource === "adjusted-close" ? "Adjusted Close" : "Close";
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

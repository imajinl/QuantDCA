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
  Copy,
  Database,
  Download,
  FileJson,
  FileText,
  Info,
  Layers,
  Link,
  Loader2,
  Package,
  Play,
  Plus,
  Search,
  ShieldCheck,
  SlidersHorizontal,
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

type ChartMode = "value" | "drawdown" | "contributions" | "log";
type MobileView = "setup" | "results" | "export";
type SortKey = "asset" | "strategy" | "finalValue" | "return" | "cagr" | "drawdown" | "purchases";
type SortDirection = "asc" | "desc";
type ShareStatus = "idle" | "copied" | "saved" | "error";
type DensityMode = "comfortable" | "compact";
type ChartAnnotation = "purchases" | "drawdown" | "breakeven";
type ExperienceMode = "simple" | "advanced";

interface ScenarioSnapshotSummary {
  id: string;
  name: string;
  createdAt: string;
  assetCount: number;
  strategyCount: number;
  normalized: boolean;
  resultSummary?: ScenarioResultSummary;
}

interface ScenarioSnapshotPayload {
  selectedAssets: SelectedAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  resultSummary?: ScenarioResultSummary;
}

interface ScenarioResultSummary {
  runCount: number;
  winnerLabel: string;
  finalValue: number;
  drawdown: number;
  generatedAt: string | null;
}

interface RunInsight {
  bestRun: ApiBacktestResult | null;
  secondBestRun: ApiBacktestResult | null;
  worstDrawdownRun: ApiBacktestResult | null;
  bestAdvantage: number;
  bestAdvantagePercent: number;
  breakEven: { months: number; date: string } | null;
  rolledPurchaseCount: number;
  feeShare: number;
}

interface ExportContext {
  results: ApiBacktestResult[];
  selectedRun: ApiBacktestResult | null;
  selectedAssets: MarketAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  generatedAt: string | null;
  warnings: string[];
}

interface ExportFile {
  name: string;
  content: string;
  type: string;
  rows?: number;
  description: string;
  privacy: "Public analysis data" | "Sanitized asset data";
}

const colors = ["#2E63E6", "#0E9D94", "#C2790B", "#7B5CF0", "#D14D6B", "#5B6675"];
const scenarioIndexKey = "quantdca:scenario-index";
const scenarioStoragePrefix = "quantdca:scenario:";
const densityStorageKey = "quantdca:density";
const experienceModeStorageKey = "quantdca:experience-mode";

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

const strategyPresets: Array<{ label: string; patch: Partial<BacktestStrategy> }> = [
  { label: "Weekly DCA", patch: { name: "Weekly DCA", type: "dca", frequency: "weekly", initialInvestment: 500, recurringContribution: 250 } },
  { label: "Monthly DCA", patch: { name: "Monthly DCA", type: "dca", frequency: "monthly", initialInvestment: 1000, recurringContribution: 500 } },
  { label: "Daily DCA", patch: { name: "Daily DCA", type: "dca", frequency: "daily", initialInvestment: 100, recurringContribution: 50 } },
  { label: "Lump Sum", patch: { name: "Lump Sum", type: "lump-sum", frequency: "monthly", initialInvestment: 1000, recurringContribution: 500 } },
  { label: "Front-loaded", patch: { name: "Front-loaded", type: "dca", frequency: "monthly", initialInvestment: 6000, recurringContribution: 250 } },
  { label: "Low-fee DCA", patch: { name: "Low-fee DCA", type: "dca", frequency: "monthly", transactionFee: 0, recurringContribution: 500 } }
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
    .map((error) => `${error.symbol ?? "Asset"}: ${error.message}`)
    .join(" ");
  const remaining = errors.length > 3 ? ` ${errors.length - 3} more asset${errors.length - 3 === 1 ? "" : "s"} failed.` : "";
  return `Some assets could not be backtested. ${details}${remaining}`;
}

function readScenarioIndex(): ScenarioSnapshotSummary[] {
  try {
    const rawIndex = window.localStorage.getItem(scenarioIndexKey);
    if (!rawIndex) return [];
    const parsed = JSON.parse(rawIndex) as ScenarioSnapshotSummary[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((snapshot) => snapshot && typeof snapshot.id === "string" && typeof snapshot.name === "string")
      .map((snapshot) => ({
        ...snapshot,
        normalized: Boolean(snapshot.normalized),
        resultSummary: normalizeScenarioResultSummary(snapshot.resultSummary)
      }));
  } catch {
    return [];
  }
}

function writeScenarioIndex(snapshots: ScenarioSnapshotSummary[]) {
  window.localStorage.setItem(scenarioIndexKey, JSON.stringify(snapshots.slice(0, 8)));
}

function readScenarioPayload(id: string): ScenarioSnapshotPayload | null {
  try {
    const rawPayload = window.localStorage.getItem(`${scenarioStoragePrefix}${id}`);
    if (!rawPayload) return null;
    const parsed = JSON.parse(rawPayload) as ScenarioSnapshotPayload;
    if (!Array.isArray(parsed.selectedAssets) || !Array.isArray(parsed.strategies)) return null;
    return { ...parsed, resultSummary: normalizeScenarioResultSummary(parsed.resultSummary) };
  } catch {
    return null;
  }
}

function writeScenarioPayload(id: string, payload: ScenarioSnapshotPayload) {
  const serializedPayload = JSON.stringify(payload);
  if (serializedPayload.length > 750_000) {
    throw new Error("Scenario is too large to save locally. Remove large custom CSV uploads before creating a scenario link.");
  }
  window.localStorage.setItem(`${scenarioStoragePrefix}${id}`, serializedPayload);
}

function scenarioUrl(id: string) {
  const url = new URL(window.location.href);
  url.pathname = "/app";
  url.search = "";
  url.hash = `scenario=${encodeURIComponent(id)}`;
  return url.toString();
}

function scenarioIdFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash.startsWith("scenario=")) return null;
  return decodeURIComponent(hash.slice("scenario=".length));
}

function normalizeScenarioResultSummary(summary: ScenarioResultSummary | undefined): ScenarioResultSummary | undefined {
  if (!summary || typeof summary.winnerLabel !== "string") return undefined;
  return {
    runCount: Number.isFinite(summary.runCount) ? summary.runCount : 0,
    winnerLabel: summary.winnerLabel,
    finalValue: Number.isFinite(summary.finalValue) ? summary.finalValue : 0,
    drawdown: Number.isFinite(summary.drawdown) ? summary.drawdown : 0,
    generatedAt: typeof summary.generatedAt === "string" ? summary.generatedAt : null
  };
}

function readDensityPreference(): DensityMode {
  try {
    return window.localStorage.getItem(densityStorageKey) === "compact" ? "compact" : "comfortable";
  } catch {
    return "comfortable";
  }
}

function readExperienceModePreference(): ExperienceMode {
  try {
    return window.localStorage.getItem(experienceModeStorageKey) === "advanced" ? "advanced" : "simple";
  } catch {
    return "simple";
  }
}

function DashboardApp() {
  const assetSearchStatusId = useId();
  const assetSearchResultsId = useId();
  const searchInputRef = useRef<HTMLInputElement | null>(null);
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
  const [chartMode, setChartMode] = useState<ChartMode>("value");
  const [hiddenRunIds, setHiddenRunIds] = useState<Set<string>>(() => new Set());
  const [mobileView, setMobileView] = useState<MobileView>("setup");
  const [methodologyOpen, setMethodologyOpen] = useState(false);
  const [scenarioSnapshots, setScenarioSnapshots] = useState<ScenarioSnapshotSummary[]>([]);
  const [shareStatus, setShareStatus] = useState<ShareStatus>("idle");
  const [density, setDensity] = useState<DensityMode>(() => readDensityPreference());
  const [experienceMode, setExperienceMode] = useState<ExperienceMode>(() => readExperienceModePreference());
  const [chartAnnotations, setChartAnnotations] = useState<Set<ChartAnnotation>>(() => new Set(["drawdown", "breakeven"]));
  const [inspectedRunId, setInspectedRunId] = useState<string | null>(null);
  const nextStrategyId = useRef(1);
  const isAdvancedMode = experienceMode === "advanced";

  useEffect(() => {
    setScenarioSnapshots(readScenarioIndex());
    const scenarioId = scenarioIdFromHash();
    if (!scenarioId) return;

    const payload = readScenarioPayload(scenarioId);
    if (!payload) {
      setShareStatus("error");
      return;
    }

    setSelectedAssets(payload.selectedAssets);
    setStrategies(payload.strategies);
    setNormalizeCapital(payload.normalizeCapital);
    setShareStatus("saved");
  }, []);

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
  const inspectedRun = useMemo(
    () => results.find((result) => result.runId === inspectedRunId) ?? null,
    [inspectedRunId, results]
  );

  const runInsight = useMemo(() => getRunInsight(results), [results]);
  const bestRun = runInsight.bestRun;
  const secondBestRun = runInsight.secondBestRun;
  const visibleChartResults = useMemo(() => {
    const nextVisibleResults = results.filter((result) => !hiddenRunIds.has(result.runId));
    return nextVisibleResults.length > 0 ? nextVisibleResults : results;
  }, [hiddenRunIds, results]);

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
  const setupQuality = useMemo(
    () => getSetupQuality(selectedAssets, strategies, strategyErrors, normalizeCapital),
    [normalizeCapital, selectedAssets, strategies, strategyErrors]
  );
  const currentScenarioSummary = useMemo(
    () => scenarioResultSummary(results, generatedAt),
    [generatedAt, results]
  );

  const lastDataDate = selectedRun?.series.at(-1)?.date ?? null;
  const bestAdvantage = runInsight.bestAdvantage;
  const bestAdvantagePercent = runInsight.bestAdvantagePercent;
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
  const activeChartMode: ChartMode = isAdvancedMode ? chartMode : "value";
  const activeChartAnnotations = useMemo(() => (isAdvancedMode ? chartAnnotations : new Set<ChartAnnotation>()), [chartAnnotations, isAdvancedMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem(densityStorageKey, density);
    } catch {
      // Ignore storage failures; density is still applied for the current session.
    }
  }, [density]);

  useEffect(() => {
    try {
      window.localStorage.setItem(experienceModeStorageKey, experienceMode);
    } catch {
      // Ignore storage failures; the mode still applies for this session.
    }
  }, [experienceMode]);

  useEffect(() => {
    if (experienceMode === "simple") {
      setChartMode("value");
      setHiddenRunIds(new Set());
      setInspectedRunId(null);
    }
  }, [experienceMode]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;
      const isEditing =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable);
      if (isEditing || event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "/") {
        event.preventDefault();
        setMobileView("setup");
        searchInputRef.current?.focus();
      } else if (event.key.toLowerCase() === "r" && runStatus !== "loading") {
        event.preventDefault();
        void runBacktest();
      } else if (["1", "2", "3", "4"].includes(event.key)) {
        event.preventDefault();
        setChartMode((["value", "drawdown", "contributions", "log"] as const)[Number(event.key) - 1]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

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

  function saveScenarioSnapshot(copyLink = false) {
    setShareStatus("idle");
    try {
      const id = window.crypto?.randomUUID?.() ?? `${Date.now()}`;
      const createdAt = new Date().toISOString();
      const name = `Scenario ${scenarioSnapshots.length + 1}`;
      const payload: ScenarioSnapshotPayload = { selectedAssets, strategies, normalizeCapital, resultSummary: currentScenarioSummary };
      writeScenarioPayload(id, payload);
      const nextSnapshot: ScenarioSnapshotSummary = {
        id,
        name,
        createdAt,
        assetCount: selectedAssets.length,
        strategyCount: strategies.length,
        normalized: normalizeCapital,
        resultSummary: currentScenarioSummary
      };
      const nextSnapshots = [nextSnapshot, ...scenarioSnapshots].slice(0, 8);
      writeScenarioIndex(nextSnapshots);
      setScenarioSnapshots(nextSnapshots);

      if (copyLink) {
        const link = scenarioUrl(id);
        void navigator.clipboard.writeText(link).then(
          () => setShareStatus("copied"),
          () => setShareStatus("error")
        );
      } else {
        setShareStatus("saved");
      }
    } catch {
      setShareStatus("error");
    }
  }

  function restoreScenario(id: string) {
    const payload = readScenarioPayload(id);
    if (!payload) {
      setShareStatus("error");
      return;
    }
    invalidateResults();
    setSelectedAssets(payload.selectedAssets);
    setStrategies(payload.strategies);
    setNormalizeCapital(payload.normalizeCapital);
    setMobileView("setup");
    setShareStatus("saved");
  }

  function toggleRunVisibility(runId: string) {
    setHiddenRunIds((current) => {
      const next = new Set(current);
      if (next.has(runId)) {
        next.delete(runId);
      } else {
        next.add(runId);
      }
      return next;
    });
  }

  function showAllRuns() {
    setHiddenRunIds(new Set());
  }

  function toggleChartAnnotation(annotation: ChartAnnotation) {
    setChartAnnotations((current) => {
      const next = new Set(current);
      if (next.has(annotation)) {
        next.delete(annotation);
      } else {
        next.add(annotation);
      }
      return next;
    });
  }

  function applyStrategyPreset(presetLabel: string) {
    const preset = strategyPresets.find((candidate) => candidate.label === presetLabel);
    if (!preset) return;
    invalidateResults();
    setStrategies((current) => {
      const nextId = nextStrategyId.current;
      nextStrategyId.current += 1;
      return [
        ...current,
        {
          ...current[0],
          ...preset.patch,
          id: `preset-strategy-${nextId}`
        }
      ];
    });
  }

  function selectRunForInspection(runId: string) {
    setSelectedRunId(runId);
    setInspectedRunId(runId);
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
      setHiddenRunIds(new Set());
      setGeneratedAt(body.generatedAt ?? null);
      setRunWarning(nextErrors.length > 0 ? partialFailureMessage(nextErrors) : null);
      setMobileView("results");
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
    <main className={`app mobile-view-${mobileView} density-${density} mode-${experienceMode}`}>
      <a className="skip-link" href="#results-heading">
        Skip to results
      </a>
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
            Routed Market Data
          </span>
          <span className="trust-chip">
            <CheckCircle2 size={13} aria-hidden="true" />
            Deterministic Engine
          </span>
          <ExperienceModeToggle mode={experienceMode} onChange={setExperienceMode} />
          {isAdvancedMode ? (
            <>
              <button className="trust-chip trust-action" type="button" onClick={() => saveScenarioSnapshot(true)} aria-label="Copy Scenario Link">
                <Link size={13} aria-hidden="true" />
                {shareStatus === "copied" ? "Link Copied" : "Copy Scenario Link"}
              </button>
              <button className="trust-chip trust-action" type="button" onClick={() => setMethodologyOpen(true)} aria-label="Open Methodology">
                <SlidersHorizontal size={13} aria-hidden="true" />
                Methodology
              </button>
              <button
                className="trust-chip trust-action"
                type="button"
                onClick={() => setDensity((current) => (current === "compact" ? "comfortable" : "compact"))}
                aria-label="Toggle Display Density"
              >
                <Layers size={13} aria-hidden="true" />
                {density === "compact" ? "Comfortable" : "Compact"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <nav className="mobile-task-tabs" aria-label="Mobile workspace views">
        {(["setup", "results", "export"] as const).map((view) => (
          <button
            key={view}
            type="button"
            className={mobileView === view ? "active" : ""}
            aria-current={mobileView === view ? "page" : undefined}
            onClick={() => setMobileView(view)}
          >
            {view === "setup" ? "Setup" : view === "results" ? "Results" : "Export"}
          </button>
        ))}
        <ExperienceModeToggle mode={experienceMode} onChange={setExperienceMode} compact />
        {isAdvancedMode ? (
          <>
            <button className="utility" type="button" onClick={() => setMethodologyOpen(true)} aria-label="Open Methodology">
              <SlidersHorizontal size={13} aria-hidden="true" />
              Method
            </button>
            <button
              className="utility"
              type="button"
              onClick={() => setDensity((current) => (current === "compact" ? "comfortable" : "compact"))}
              aria-label="Toggle Display Density"
            >
              <Layers size={13} aria-hidden="true" />
              {density === "compact" ? "Comfort" : "Dense"}
            </button>
          </>
        ) : null}
      </nav>

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
                    ref={searchInputRef}
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
                  <span className={`chip ${asset.source === "custom-csv" ? "csv" : ""}`} key={assetKey(asset)} aria-label={asset.symbol}>
                    <span>{asset.symbol}</span>
                    <button type="button" aria-label={`Remove ${asset.symbol}`} onClick={() => removeAsset(assetKey(asset))}>
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
              </div>
            </section>

            {isAdvancedMode ? (
              <>
                <SetupQualityMeter quality={setupQuality} />

                <ScenarioWorkspace
                  snapshots={scenarioSnapshots}
                  currentAssetCount={selectedAssets.length}
                  currentStrategyCount={strategies.length}
                  currentNormalized={normalizeCapital}
                  currentResultSummary={currentScenarioSummary}
                  shareStatus={shareStatus}
                  onSave={() => saveScenarioSnapshot(false)}
                  onCopyLink={() => saveScenarioSnapshot(true)}
                  onRestore={restoreScenario}
                />

                <div className="section-divider" />
              </>
            ) : null}

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

              {isAdvancedMode ? <StrategyPresetBar strategyCount={strategies.length} onApply={applyStrategyPreset} /> : null}

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
              <h2 className="page-title" id="results-heading">Strategy Comparison</h2>
              <p className="page-sub">
                {results.length > 0
                  ? `${results.length} run${results.length === 1 ? "" : "s"} · ${normalizeCapital ? "equal-capital comparison" : "as-configured comparison"} · ${selectedRun ? formatPriceSourceLabel(selectedRun.priceSource).toLowerCase() : "price history"}`
                  : "Configure assets and strategies, then run the comparison."}
              </p>
            </div>
            {results.length > 0 ? (
              <div className="results-tools">
                <RunPicker results={results} selectedRunId={selectedRun?.runId ?? ""} onSelect={setSelectedRunId} />
              </div>
            ) : null}
          </div>

          {results.length > 0 && bestRun ? <MobileWinnerBar bestRun={bestRun} selectedRun={selectedRun} onSetView={setMobileView} /> : null}

          {resultsStale ? (
            <StatusAlert tone="warning" message="Inputs changed since this run. Run Backtests again to refresh the comparison." role="status" />
          ) : null}

          {runWarning ? <StatusAlert tone="warning" message={runWarning} role="alert" /> : null}

          {results.length > 0 ? <DecisionInsights insight={runInsight} selectedRun={selectedRun} /> : null}

          <div className="hero">
            <div className={`winner ${bestRun ? "" : "idle"}`}>
              <span className="kicker">
                Best Outcome
                <HelpTip label="Best Outcome" text="The run with the highest final portfolio value across the current comparison set." />
              </span>
              <strong className="w-name">{bestRun ? `${bestRun.asset.symbol} / ${bestRun.strategyName}` : "Awaiting Run"}</strong>
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
                detail={bestRun ? `Best ${bestRun.asset.symbol}` : "Risk"}
                helpText="Largest peak-to-trough portfolio decline during the run."
                accent={selectedRun ? "negative" : undefined}
                icon={<Activity size={18} aria-hidden="true" />}
              />
            </div>
          </div>

          {isAdvancedMode ? (
            <RunMetadata
              selectedRun={selectedRun}
              resultCount={results.length}
              normalizeCapital={normalizeCapital}
              lastDataDate={lastDataDate}
              generatedAt={generatedAt}
            />
          ) : null}

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
                    <h2>{activeChartMode === "drawdown" ? "Drawdown" : activeChartMode === "contributions" ? "Contributions" : activeChartMode === "log" ? "Log Value" : "Portfolio Value"}</h2>
                    <p className="ph-sub">
                      {isAdvancedMode
                        ? "Hover, isolate runs, and switch between value, drawdown, contribution, and log views"
                        : "Core portfolio value comparison for the selected assets and strategies"}
                    </p>
                  </div>
                  {isAdvancedMode ? (
                    <div className="mode-tabs" role="tablist" aria-label="Chart Mode">
                      {(["value", "drawdown", "contributions", "log"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          role="tab"
                          aria-selected={chartMode === mode}
                          className={chartMode === mode ? "selected" : ""}
                          onClick={() => setChartMode(mode)}
                        >
                          {mode === "value" ? "Value" : mode === "drawdown" ? "Drawdown" : mode === "contributions" ? "Contributions" : "Log"}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {isAdvancedMode ? <ChartAnnotationControls annotations={chartAnnotations} onToggle={toggleChartAnnotation} /> : null}
                <div className="panel-body">
                  <LineChart
                    testId="portfolio-chart"
                    results={visibleChartResults}
                    allResults={results}
                    hiddenRunIds={hiddenRunIds}
                    selectedRunId={selectedRun?.runId ?? null}
                    mode={activeChartMode}
                    annotations={activeChartAnnotations}
                    insight={runInsight}
                    selectedRun={selectedRun}
                    label={(result) => `${result.asset.symbol} ${result.strategyName}`}
                    onToggleRun={toggleRunVisibility}
                    onShowAll={showAllRuns}
                  />
                </div>
              </section>

              {isAdvancedMode && selectedRun ? (
                <div className="two-col">
                  <section className="panel">
                    <div className="panel-head">
                      <div>
                        <h2>Invested vs Value</h2>
                        <p className="ph-sub">Capital deployed against portfolio value</p>
                      </div>
                      <span className="asset-pill">{selectedRun.asset.symbol}</span>
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

              {isAdvancedMode ? <AssumptionHealth insight={runInsight} results={results} /> : null}
              {isAdvancedMode ? <SensitivityPanel results={results} insight={runInsight} /> : null}
              <ResultsTable results={results} selectedRunId={selectedRun?.runId ?? null} onSelect={isAdvancedMode ? selectRunForInspection : setSelectedRunId} />
              {selectedRun ? <TransactionsTable result={selectedRun} /> : null}
              <DataExportPanel
                results={results}
                selectedRun={selectedRun}
                selectedAssets={selectedAssets}
                strategies={strategies}
                normalizeCapital={normalizeCapital}
                generatedAt={generatedAt}
                warnings={runWarning ? [runWarning] : []}
                isAdvancedMode={isAdvancedMode}
              />
            </>
          ) : null}
        </section>
      </section>
      {isAdvancedMode ? <MethodologyDrawer isOpen={methodologyOpen} onClose={() => setMethodologyOpen(false)} /> : null}
      {isAdvancedMode ? <RunComparisonDrawer run={inspectedRun} bestRun={bestRun} onClose={() => setInspectedRunId(null)} /> : null}
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

function ExperienceModeToggle({
  mode,
  onChange,
  compact = false
}: {
  mode: ExperienceMode;
  onChange: (mode: ExperienceMode) => void;
  compact?: boolean;
}) {
  return (
    <div className={`experience-toggle ${compact ? "compact" : ""}`} role="group" aria-label="Dashboard Mode">
      {(["simple", "advanced"] as const).map((option) => (
        <button
          key={option}
          type="button"
          className={mode === option ? "selected" : ""}
          aria-label={option === "simple" ? "Simple Mode" : "Advanced Mode"}
          aria-pressed={mode === option}
          onClick={() => onChange(option)}
        >
          {compact ? (option === "simple" ? "Simple" : "Adv") : option === "simple" ? "Simple" : "Advanced"}
        </button>
      ))}
    </div>
  );
}

function SetupQualityMeter({ quality }: { quality: ReturnType<typeof getSetupQuality> }) {
  return (
    <section className="setup-quality" aria-label="Setup Quality">
      <div className="quality-head">
        <span>
          <CheckCircle2 size={14} aria-hidden="true" />
          Setup Quality
        </span>
        <strong>{quality.score}/{quality.items.length}</strong>
      </div>
      <div className="quality-bar" aria-hidden="true">
        <i style={{ width: `${quality.percent}%` }} />
      </div>
      <ul className="quality-list">
        {quality.items.map((item) => (
          <li className={item.done ? "done" : ""} key={item.label}>
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function StrategyPresetBar({ strategyCount, onApply }: { strategyCount: number; onApply: (label: string) => void }) {
  const atLimit = strategyCount >= 6;
  return (
    <div className="preset-bar" aria-label="Strategy Templates">
      {strategyPresets.map((preset) => (
        <button type="button" key={preset.label} onClick={() => onApply(preset.label)} disabled={atLimit}>
          <Plus size={12} aria-hidden="true" />
          {preset.label}
        </button>
      ))}
    </div>
  );
}

function ScenarioWorkspace({
  snapshots,
  currentAssetCount,
  currentStrategyCount,
  currentNormalized,
  currentResultSummary,
  shareStatus,
  onSave,
  onCopyLink,
  onRestore
}: {
  snapshots: ScenarioSnapshotSummary[];
  currentAssetCount: number;
  currentStrategyCount: number;
  currentNormalized: boolean;
  currentResultSummary?: ScenarioResultSummary;
  shareStatus: ShareStatus;
  onSave: () => void;
  onCopyLink: () => void;
  onRestore: (id: string) => void;
}) {
  const comparisonSnapshot = snapshots[0];
  const scenarioDelta = comparisonSnapshot ? scenarioComparisonText(comparisonSnapshot, currentAssetCount, currentStrategyCount, currentNormalized, currentResultSummary) : null;

  return (
    <section className="scenario-workspace" aria-label="Scenario Workspace">
      <div className="scenario-head">
        <span>
          <Layers size={14} aria-hidden="true" />
          Scenario Workspace
        </span>
        <span className="scenario-count">{snapshots.length} saved</span>
      </div>
      <div className="scenario-actions">
        <button className="btn compact" type="button" onClick={onSave}>
          <Download size={13} aria-hidden="true" />
          Save
        </button>
        <button className="btn compact" type="button" onClick={onCopyLink}>
          <Link size={13} aria-hidden="true" />
          Copy Link
        </button>
      </div>
      {shareStatus !== "idle" ? (
        <p className={`scenario-status ${shareStatus === "error" ? "error" : ""}`}>
          {shareStatus === "copied"
            ? "Scenario link copied. It restores from this browser."
            : shareStatus === "saved"
              ? "Scenario saved locally."
              : "Scenario could not be saved or copied."}
        </p>
      ) : null}
      {snapshots.length > 0 ? (
        <div className="scenario-list">
          {snapshots.slice(0, 3).map((snapshot) => (
            <button className="scenario-item" type="button" key={snapshot.id} onClick={() => onRestore(snapshot.id)}>
              <span>
                <strong>{snapshot.name}</strong>
                <small>{formatRunTimestamp(snapshot.createdAt)}</small>
              </span>
              <em>
                {snapshot.assetCount} asset{snapshot.assetCount === 1 ? "" : "s"} / {snapshot.strategyCount} strategies
              </em>
              {snapshot.resultSummary ? <small>{snapshot.resultSummary.winnerLabel} · {formatCurrency(snapshot.resultSummary.finalValue)}</small> : null}
            </button>
          ))}
        </div>
      ) : (
        <p className="field-hint">Save the current setup to restore it later or copy a browser-local scenario link.</p>
      )}
      {scenarioDelta ? (
        <div className="scenario-compare" aria-label="Scenario Comparison">
          <strong>Scenario comparison</strong>
          <span>{scenarioDelta}</span>
        </div>
      ) : null}
    </section>
  );
}

function DecisionInsights({ insight, selectedRun }: { insight: RunInsight; selectedRun: ApiBacktestResult | null }) {
  const bestRun = insight.bestRun;
  const winnerLabel = bestRun ? `${bestRun.asset.symbol} / ${bestRun.strategyName}` : "Awaiting run";
  const exposureNote =
    bestRun?.strategyName.toLowerCase().includes("lump")
      ? "Advantage came from earlier capital exposure."
      : "Advantage came from scheduled buying discipline.";

  return (
    <section className="decision-insights" aria-label="Decision Insights">
      <article className="insight-card primary">
        <span className="kicker">Plain-English Readout</span>
        <strong>{bestRun ? `${winnerLabel} wins` : "Run a comparison"}</strong>
        <p>
          {bestRun && insight.secondBestRun
            ? `${formatCurrency(insight.bestAdvantage)} ahead of the next best run. ${exposureNote}`
            : "Select assets, run the configured strategies, and QuantDCA will summarize the decision signal here."}
        </p>
      </article>
      <InsightStat label="Final Value" value={bestRun ? formatCurrency(bestRun.metrics.finalValue) : "-"} detail={bestRun?.strategyName ?? "Winner"} />
      <InsightStat
        label="Gap"
        value={insight.secondBestRun ? formatPercent(insight.bestAdvantagePercent) : "-"}
        detail="vs next best"
        tone={insight.bestAdvantagePercent >= 0 ? "positive" : "negative"}
      />
      <InsightStat
        label="Worst Drawdown"
        value={insight.worstDrawdownRun ? formatPercent(insight.worstDrawdownRun.metrics.maxDrawdown) : "-"}
        detail={insight.worstDrawdownRun ? `${insight.worstDrawdownRun.asset.symbol} / ${insight.worstDrawdownRun.strategyName}` : "Risk"}
        tone="negative"
      />
      <InsightStat
        label="Break-even"
        value={insight.breakEven ? `${insight.breakEven.months} mo` : "No cross"}
        detail={insight.breakEven ? insight.breakEven.date : selectedRun ? "Leader stayed ahead" : "Timing"}
      />
    </section>
  );
}

function MobileWinnerBar({
  bestRun,
  selectedRun,
  onSetView
}: {
  bestRun: ApiBacktestResult;
  selectedRun: ApiBacktestResult | null;
  onSetView: (view: MobileView) => void;
}) {
  return (
    <div className="mobile-winner-bar" aria-label="Mobile Winner Summary">
      <span>
        <strong>{bestRun.asset.symbol} / {bestRun.strategyName}</strong>
        <small>{formatCurrency(bestRun.metrics.finalValue)} best value</small>
      </span>
      <span>
        <strong>{selectedRun ? formatPercent(selectedRun.metrics.maxDrawdown) : "-"}</strong>
        <small>focused drawdown</small>
      </span>
      <button type="button" aria-label="Open Export Package" onClick={() => onSetView("export")}>
        Export
      </button>
    </div>
  );
}

function ChartAnnotationControls({
  annotations,
  onToggle
}: {
  annotations: Set<ChartAnnotation>;
  onToggle: (annotation: ChartAnnotation) => void;
}) {
  const controls: Array<{ id: ChartAnnotation; label: string; title: string; icon: React.ReactNode }> = [
    {
      id: "purchases",
      label: "Purchases",
      title: "Show purchase-date markers on the focused run.",
      icon: <CalendarDays size={14} aria-hidden="true" />
    },
    {
      id: "drawdown",
      label: "Max drawdown",
      title: "Show the focused run's maximum-drawdown guide line.",
      icon: <Activity size={14} aria-hidden="true" />
    },
    {
      id: "breakeven",
      label: "Break-even",
      title: "Show the break-even guide line between the leader and next-best run.",
      icon: <ArrowUpRight size={14} aria-hidden="true" />
    }
  ];

  return (
    <div className="annotation-bar" aria-label="Chart Annotations">
      {controls.map((control) => (
        <button
          key={control.id}
          type="button"
          aria-label={`Toggle ${control.label} Annotations`}
          aria-pressed={annotations.has(control.id)}
          className={annotations.has(control.id) ? "selected" : ""}
          title={control.title}
          onClick={() => onToggle(control.id)}
        >
          {control.icon}
        </button>
      ))}
    </div>
  );
}

function InsightStat({
  label,
  value,
  detail,
  tone
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "positive" | "negative";
}) {
  return (
    <article className={`insight-card ${tone === "positive" ? "pos" : tone === "negative" ? "neg" : ""}`}>
      <span className="kicker">{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}

function AssumptionHealth({ insight, results }: { insight: RunInsight; results: ApiBacktestResult[] }) {
  const lastDates = Array.from(new Set(results.map((result) => result.series.at(-1)?.date).filter(Boolean))).sort();
  const coverageText =
    lastDates.length === 1
      ? `All compared runs have prices through ${lastDates[0]}.`
      : `Compared runs end across ${lastDates.length} different data dates.`;

  return (
    <section className="panel assumption-health" aria-label="Assumption Health">
      <div className="panel-head">
        <div>
          <h2>Assumption Health</h2>
          <p className="ph-sub">Checks that affect interpretation before you act on the winner</p>
        </div>
        <span className="row-count">3 checks</span>
      </div>
      <div className="assumption-grid">
        <AssumptionItem title="Coverage" body={coverageText} tone={lastDates.length <= 1 ? "ok" : "warn"} />
        <AssumptionItem
          title="Non-trading days"
          body={
            insight.rolledPurchaseCount > 0
              ? `${insight.rolledPurchaseCount} scheduled purchase${insight.rolledPurchaseCount === 1 ? "" : "s"} rolled to the next available price date.`
              : "No scheduled purchases needed date rolling."
          }
          tone={insight.rolledPurchaseCount > 0 ? "warn" : "ok"}
        />
        <AssumptionItem
          title="Fee drag"
          body={`Fees equal ${formatPercent(insight.feeShare)} of deployed capital across compared runs.`}
          tone={insight.feeShare > 0.01 ? "warn" : "ok"}
        />
      </div>
    </section>
  );
}

function SensitivityPanel({ results, insight }: { results: ApiBacktestResult[]; insight: RunInsight }) {
  const [contributionScale, setContributionScale] = useState(100);
  const [extraFee, setExtraFee] = useState(0);
  const [cashDragDelta, setCashDragDelta] = useState(0);
  const [startBuffer, setStartBuffer] = useState(0);
  const stressRows = useMemo(
    () => sensitivityRows(results, { contributionScale, extraFee, cashDragDelta, startBuffer }),
    [cashDragDelta, contributionScale, extraFee, results, startBuffer]
  );
  const stressedWinner = stressRows[0] ?? null;
  const currentWinnerLabel = insight.bestRun ? `${insight.bestRun.asset.symbol} / ${insight.bestRun.strategyName}` : "-";
  const durable = stressedWinner ? stressedWinner.label === currentWinnerLabel : false;

  return (
    <section className="panel sensitivity-panel" aria-label="Sensitivity Lens">
      <div className="panel-head">
        <div>
          <h2>Sensitivity Lens</h2>
          <p className="ph-sub">Stress preview based on the current result path; rerun to confirm exact outcomes</p>
        </div>
        <span className={`row-count ${durable ? "cell-pos" : "cell-neg"}`}>{durable ? "Winner holds" : "Winner changes"}</span>
      </div>
      <div className="sensitivity-grid">
        <SliderControl label="Contribution Scale" value={contributionScale} min={75} max={125} suffix="%" onChange={setContributionScale} />
        <SliderControl label="Extra Fee / Buy" value={extraFee} min={0} max={10} suffix="$" onChange={setExtraFee} />
        <SliderControl label="Cash Drag Delta" value={cashDragDelta} min={-3} max={3} suffix="%" onChange={setCashDragDelta} />
        <SliderControl label="Start Buffer" value={startBuffer} min={0} max={90} suffix="d" onChange={setStartBuffer} />
      </div>
      <div className="sensitivity-results" aria-label="Sensitivity Ranking">
        {stressRows.slice(0, 3).map((row) => (
          <div key={row.runId}>
            <span>{row.label}</span>
            <strong>{formatCurrency(row.stressedValue)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  suffix,
  onChange
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="slider-control">
      <span>
        {label}
        <strong>{suffix === "$" ? `${suffix}${value}` : `${value}${suffix}`}</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.currentTarget.value))} />
    </label>
  );
}

function AssumptionItem({ title, body, tone }: { title: string; body: string; tone: "ok" | "warn" }) {
  return (
    <article className={`assumption-item ${tone}`}>
      <CheckCircle2 size={15} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{body}</span>
      </div>
    </article>
  );
}

function MethodologyDrawer({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  if (!isOpen) return null;

  return (
    <div className="drawer-layer" role="presentation">
      <button className="drawer-scrim" type="button" aria-label="Dismiss Methodology" onClick={onClose} />
      <aside className="methodology-drawer" role="dialog" aria-modal="true" aria-labelledby="methodology-title">
        <div className="drawer-head">
          <div>
            <span className="kicker">Methodology</span>
            <h2 id="methodology-title">Visible assumptions</h2>
          </div>
          <button className="icon-btn" type="button" aria-label="Close Methodology" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-body">
          <section>
            <h3>Price basis</h3>
            <p>Adjusted close is preferred for stock history when every active row supports it. Crypto and custom CSV runs use close prices.</p>
          </section>
          <section>
            <h3>Capital normalization</h3>
            <p>Equal-capital mode gives every strategy the same comparison budget while preserving each DCA schedule's timing shape.</p>
          </section>
          <section>
            <h3>Date matching</h3>
            <p>Scheduled buys that fall on missing price dates roll forward to the next available historical price date.</p>
          </section>
          <section>
            <h3>Routing and privacy</h3>
            <p>Market-data keys stay server-side. Provider names are shown only while choosing assets from search results; selected assets carry internal routing metadata.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

function RunComparisonDrawer({
  run,
  bestRun,
  onClose
}: {
  run: ApiBacktestResult | null;
  bestRun: ApiBacktestResult | null;
  onClose: () => void;
}) {
  if (!run) return null;

  const gap = bestRun ? run.metrics.finalValue - bestRun.metrics.finalValue : 0;
  const isWinner = bestRun?.runId === run.runId;

  return (
    <div className="drawer-layer run-drawer-layer" role="presentation">
      <button className="drawer-scrim" type="button" aria-label="Dismiss Run Comparison" onClick={onClose} />
      <aside className="methodology-drawer run-comparison-drawer" role="dialog" aria-modal="true" aria-labelledby="run-comparison-title">
        <div className="drawer-head">
          <div>
            <span className="kicker">Run Comparison</span>
            <h2 id="run-comparison-title">{run.asset.symbol} / {run.strategyName}</h2>
          </div>
          <button className="icon-btn" type="button" aria-label="Close Run Comparison" onClick={onClose}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
        <div className="drawer-body">
          <section className="run-compare-verdict">
            <h3>{isWinner ? "Current winner" : "Compared with winner"}</h3>
            <p>
              {isWinner
                ? `${formatCurrency(run.metrics.finalValue)} finished first in the current ranking.`
                : `${formatCurrency(Math.abs(gap))} ${gap >= 0 ? "ahead of" : "behind"} ${bestRun ? `${bestRun.asset.symbol} / ${bestRun.strategyName}` : "the winner"}.`}
            </p>
          </section>
          <div className="drawer-metric-grid">
            <InsightStat label="Final Value" value={formatCurrency(run.metrics.finalValue)} detail="Focused run" />
            <InsightStat label="CAGR" value={formatPercent(run.metrics.cagr)} detail="Annualized" />
            <InsightStat label="Drawdown" value={formatPercent(run.metrics.maxDrawdown)} detail="Max decline" tone="negative" />
            <InsightStat label="Fees" value={formatCurrency(run.metrics.feesPaid)} detail={`${run.metrics.numberOfPurchases} buys`} />
          </div>
          <section>
            <h3>Timing Notes</h3>
            <p>
              Best purchase timing impact was {run.metrics.bestTimingImpact === null ? "not available" : formatPercent(run.metrics.bestTimingImpact)};
              worst timing impact was {run.metrics.worstTimingImpact === null ? "not available" : formatPercent(run.metrics.worstTimingImpact)}.
            </p>
          </section>
        </div>
      </aside>
    </div>
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
  warnings,
  isAdvancedMode
}: {
  results: ApiBacktestResult[];
  selectedRun: ApiBacktestResult | null;
  selectedAssets: MarketAsset[];
  strategies: BacktestStrategy[];
  normalizeCapital: boolean;
  generatedAt: string | null;
  warnings: string[];
  isAdvancedMode: boolean;
}) {
  const [includeComparison, setIncludeComparison] = useState(true);
  const [includeSeries, setIncludeSeries] = useState(true);
  const [includeSchedule, setIncludeSchedule] = useState(true);
  const [includeJson, setIncludeJson] = useState(true);
  const [includeMemo, setIncludeMemo] = useState(false);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">("idle");
  const exportContext = { results, selectedRun, selectedAssets, strategies, normalizeCapital, generatedAt, warnings };
  const files = buildExportFiles(exportContext, { includeComparison, includeSeries, includeSchedule, includeJson, includeMemo: isAdvancedMode && includeMemo });
  const auditJson = auditJsonContent(exportContext);
  const memoPreview = investorMemoContent(exportContext).split("\n").slice(0, 9).join("\n");

  function copyPayload() {
    void navigator.clipboard.writeText(auditJson).then(
      () => setCopyStatus("copied"),
      () => setCopyStatus("error")
    );
  }

  return (
    <section className="panel export-panel" aria-label="Data Exports And Formatting Standards">
      <div className="panel-head">
        <div>
          <h2>Export Data Package</h2>
          <p className="ph-sub">{isAdvancedMode ? "Choose what leaves the app and preview file contents before download" : "Download the core comparison files for the current run"}</p>
        </div>
        <div className="export-head-actions">
          {isAdvancedMode ? (
            <button className="btn" type="button" onClick={copyPayload}>
              <Copy size={15} aria-hidden="true" />
              {copyStatus === "copied" ? "Payload Copied" : copyStatus === "error" ? "Copy Failed" : "Copy API Payload"}
            </button>
          ) : null}
          <button className="btn primary" type="button" onClick={() => exportZipPackage(files)} disabled={files.length === 0}>
            <Package size={15} aria-hidden="true" />
            Download ZIP
          </button>
        </div>
      </div>
      <div className="panel-body">
        <div className="export-builder">
          <ExportTile
            title="Comparison CSV"
            description="One row per run, suitable for spreadsheets."
            checked={includeComparison}
            onChange={setIncludeComparison}
            onExport={() => exportComparisonCsv(results)}
          />
          <ExportTile
            title="Focused Series"
            description="Daily value path for the selected run."
            checked={includeSeries}
            disabled={!selectedRun}
            onChange={setIncludeSeries}
            onExport={() => selectedRun && exportSeriesCsv(selectedRun)}
          />
          <ExportTile
            title="Schedule CSV"
            description="Matched purchase dates and units."
            checked={includeSchedule}
            disabled={!selectedRun}
            onChange={setIncludeSchedule}
            onExport={() => selectedRun && exportScheduleCsv(selectedRun)}
          />
          <ExportTile
            title="Audit JSON"
            description="Reproducible public payload with sanitized asset metadata."
            checked={includeJson}
            onChange={setIncludeJson}
            onExport={() => exportFullJson(exportContext)}
          />
          {isAdvancedMode ? (
            <ExportTile
              title="Investor Memo"
              description="Markdown summary of winner, gap, risk, and assumptions."
              checked={includeMemo}
              onChange={setIncludeMemo}
              onExport={() => exportInvestorMemo(exportContext)}
            />
          ) : null}
        </div>
        <div className="export-preview table-wrap scroll-thin">
          <table className="data compact" aria-label="Export Package Preview">
            <thead>
              <tr>
                <th scope="col">File</th>
                <th scope="col">Rows</th>
                <th scope="col">Includes</th>
                {isAdvancedMode ? <th scope="col">Size</th> : null}
                {isAdvancedMode ? <th scope="col">Privacy</th> : null}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {files.map((file) => (
                <tr key={file.name}>
                  <th scope="row">{file.name}</th>
                  <td>{file.rows ?? "-"}</td>
                  <td>{file.description}</td>
                  {isAdvancedMode ? <td>{formatBytes(file.content.length)}</td> : null}
                  {isAdvancedMode ? <td>{file.privacy}</td> : null}
                  <td className="cell-pos">Ready</td>
                </tr>
              ))}
              {files.length === 0 ? (
                <tr>
                  <th scope="row">No files selected</th>
                  <td>-</td>
                  <td>Select at least one export tile.</td>
                  {isAdvancedMode ? <td>-</td> : null}
                  {isAdvancedMode ? <td>-</td> : null}
                  <td>Idle</td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {isAdvancedMode ? (
          <div className="export-safety">
            <strong>Export privacy check</strong>
            <span>Downloaded files omit provider credentials and internal routing metadata. Custom CSV prices are included only when the uploaded asset is part of the run.</span>
          </div>
        ) : null}
        {isAdvancedMode && includeMemo ? (
          <pre className="memo-preview" aria-label="Investor Memo Preview">{memoPreview}</pre>
        ) : null}
      </div>
    </section>
  );
}

function ExportTile({
  title,
  description,
  checked,
  disabled = false,
  onChange,
  onExport
}: {
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
  onExport: () => void;
}) {
  const exportLabel =
    title === "Comparison CSV"
      ? "Export Comparison CSV"
      : title === "Focused Series"
        ? "Export Focused Series CSV"
        : title === "Schedule CSV"
          ? "Export Schedule CSV"
          : title === "Audit JSON"
            ? "Export Full JSON"
            : `Export ${title}`;

  return (
    <article className={`export-tile ${disabled ? "disabled" : ""}`}>
      <label>
        <input type="checkbox" checked={checked && !disabled} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
        <span>
          <strong>{title}</strong>
          <small>{description}</small>
        </span>
      </label>
      <button className="btn compact" type="button" aria-label={exportLabel} onClick={onExport} disabled={disabled}>
        {title.includes("JSON") ? <FileJson size={13} aria-hidden="true" /> : title.includes("Memo") ? <FileText size={13} aria-hidden="true" /> : <Download size={13} aria-hidden="true" />}
        Export
      </button>
    </article>
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
    <div className="state idle" role="status">
      <span className="state-icon">
        <BarChart3 size={22} aria-hidden="true" />
      </span>
      <h2>Ready for Comparison</h2>
      <p>Choose at least one asset and run the strategy set to generate ranked outcomes.</p>
      <div className="example-chips" aria-label="Example searches">
        <span>AAPL</span>
        <span>BTC</span>
        <span>Custom CSV</span>
      </div>
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
      <span className="field-label">
        Focused Run
        <HelpTip label="Focused Run" text="The run highlighted across charts, metrics, and the transaction schedule." align="right" />
      </span>
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
  allResults,
  hiddenRunIds,
  selectedRunId,
  mode,
  annotations,
  insight,
  selectedRun,
  label,
  testId,
  onToggleRun,
  onShowAll
}: {
  results: ApiBacktestResult[];
  allResults: ApiBacktestResult[];
  hiddenRunIds: Set<string>;
  selectedRunId: string | null;
  mode: ChartMode;
  annotations: Set<ChartAnnotation>;
  insight: RunInsight;
  selectedRun: ApiBacktestResult | null;
  label: (result: ApiBacktestResult) => string;
  testId?: string;
  onToggleRun: (runId: string) => void;
  onShowAll: () => void;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const width = 900;
  const height = 320;
  const padding = { top: 16, right: 24, bottom: 36, left: 72 };
  const seriesByRun = new Map(results.map((result) => [result.runId, chartSeriesForResult(result, mode)]));
  const allPoints = Array.from(seriesByRun.values()).flat();
  const dates = Array.from(new Set(allPoints.map((point) => point.date))).sort();
  const rawMinValue = mode === "drawdown" ? Math.min(...allPoints.map((point) => point.value), 0) : 0;
  const rawMaxValue = mode === "drawdown" ? 0 : Math.max(...allPoints.map((point) => point.value), 1);
  const transformValue = (value: number) => (mode === "log" ? Math.log10(Math.max(value, 1)) : value);
  const minValue = transformValue(rawMinValue);
  const maxValue = transformValue(rawMaxValue);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const dateIndex = new Map(dates.map((date, index) => [date, index]));
  const colorForRun = (runId: string) => colors[Math.max(allResults.findIndex((result) => result.runId === runId), 0) % colors.length];
  const xFor = (date: string) => padding.left + ((dateIndex.get(date) ?? 0) / Math.max(dates.length - 1, 1)) * plotWidth;
  const yFor = (value: number) => padding.top + (1 - (transformValue(value) - minValue) / (maxValue - minValue || 1)) * plotHeight;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const transformedTick = minValue + (maxValue - minValue) * ratio;
    return mode === "log" ? Math.pow(10, transformedTick) : transformedTick;
  });
  const xTicks = [0, 0.33, 0.66, 1].map((ratio) => dates[Math.round((dates.length - 1) * ratio)]).filter(Boolean);
  const annotationItems = chartAnnotationItems(selectedRun, insight, annotations, mode);
  const hoverDate = hoverIndex === null ? null : dates[hoverIndex] ?? null;
  const hoverLeft = hoverDate ? xFor(hoverDate) : null;
  const chartTitle =
    mode === "drawdown"
      ? "Drawdown Over Time"
      : mode === "contributions"
        ? "Invested Capital Over Time"
        : mode === "log"
          ? "Portfolio Value Over Time (Log Scale)"
          : "Portfolio Value Over Time";

  return (
    <div className="chart" data-testid={testId}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${chartTitle} for ${results.length} compared runs`}
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const x = Math.min(Math.max(event.clientX - rect.left, (padding.left / width) * rect.width), ((width - padding.right) / width) * rect.width);
          const ratio = (x / rect.width - padding.left / width) / (plotWidth / width);
          setHoverIndex(Math.round(ratio * Math.max(dates.length - 1, 0)));
        }}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <title>{chartTitle}</title>
        <desc>
          Compared runs: {results.map(label).join("; ")}. Values range from {formatChartValue(rawMinValue, mode)} to {formatChartValue(rawMaxValue, mode)}.
        </desc>
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={padding.left} x2={width - padding.right} y1={yFor(tick)} y2={yFor(tick)} className="grid-line" />
            <text x={padding.left - 12} y={yFor(tick) + 4} textAnchor="end">
              {formatChartValue(tick, mode)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text key={tick} x={xFor(tick)} y={height - 10} textAnchor="middle">
            {tick.slice(0, 7)}
          </text>
        ))}
        {annotationItems.map((annotation) => {
          if (!dateIndex.has(annotation.date)) return null;
          const x = xFor(annotation.date);
          const y = yFor(annotation.value);
          return (
            <g className={`chart-annotation ${annotation.kind}`} key={`${annotation.kind}-${annotation.date}-${annotation.label}`}>
              <title>{annotation.label}</title>
              <line x1={x} x2={x} y1={padding.top} y2={height - padding.bottom} />
              {annotation.kind === "purchase" ? <circle cx={x} cy={y} r="3.4" /> : null}
            </g>
          );
        })}
        {hoverDate && hoverLeft ? <line className="hover-guide" x1={hoverLeft} x2={hoverLeft} y1={padding.top} y2={height - padding.bottom} /> : null}
        {results.map((result) => {
          const chartSeries = seriesByRun.get(result.runId) ?? [];
          const path = chartSeries.map((point, pointIndex) => `${pointIndex === 0 ? "M" : "L"} ${xFor(point.date)} ${yFor(point.value)}`).join(" ");
          const isFocused = result.runId === selectedRunId;
          return (
            <path
              key={result.runId}
              d={path}
              fill="none"
              opacity={selectedRunId && !isFocused ? 0.5 : 1}
              stroke={colorForRun(result.runId)}
              strokeLinejoin="round"
              strokeWidth={isFocused ? "3.2" : "2.1"}
            />
          );
        })}
      </svg>
      {hoverDate ? (
        <div className="chart-tooltip" style={{ left: `${((hoverLeft ?? padding.left) / width) * 100}%` }}>
          <strong>{hoverDate}</strong>
          {results.slice(0, 4).map((result) => {
            const point = (seriesByRun.get(result.runId) ?? []).find((candidate) => candidate.date === hoverDate);
            return (
              <span key={result.runId}>
                <i style={{ background: colorForRun(result.runId) }} />
                {label(result)}
                <b>{point ? formatChartValue(point.value, mode) : "-"}</b>
              </span>
            );
          })}
        </div>
      ) : null}
      <div className="chart-legend" aria-label="Chart run visibility">
        {allResults.map((result) => {
          const isHidden = hiddenRunIds.has(result.runId);
          return (
          <button
            type="button"
            key={result.runId}
            className={`${result.runId === selectedRunId ? "selected" : ""} ${isHidden ? "hidden" : ""}`.trim()}
            aria-pressed={!isHidden}
            onClick={() => onToggleRun(result.runId)}
          >
            <i style={{ background: colorForRun(result.runId) }} />
            {label(result)}
          </button>
        );
        })}
        {hiddenRunIds.size > 0 ? (
          <button className="legend-reset" type="button" onClick={onShowAll}>
            Show all
          </button>
        ) : null}
      </div>
      <p className="sr-only">
        Chart summary: {chartTitle}. {selectedRun ? `${selectedRun.asset.symbol} / ${selectedRun.strategyName} is focused. ` : ""}
        {annotationItems.length} annotation{annotationItems.length === 1 ? "" : "s"} active.
      </p>
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
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: SortDirection }>({ key: "finalValue", direction: "desc" });
  const maxFinalValue = Math.max(...results.map((result) => result.metrics.finalValue), 1);
  const sortedResults = useMemo(() => {
    return [...results].sort((left, right) => {
      const leftValue = sortValue(left, sortConfig.key);
      const rightValue = sortValue(right, sortConfig.key);
      const comparison = typeof leftValue === "string" ? leftValue.localeCompare(String(rightValue)) : leftValue - Number(rightValue);
      return sortConfig.direction === "asc" ? comparison : -comparison;
    });
  }, [results, sortConfig]);

  function updateSort(key: SortKey) {
    setSortConfig((current) => ({
      key,
      direction: current.key === key && current.direction === "desc" ? "asc" : "desc"
    }));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h2>Run Ranking</h2>
          <p className="ph-sub">Sortable comparison with relative final-value scale</p>
        </div>
        <span className="row-count">{results.length} runs</span>
      </div>
      <div className="table-wrap scroll-thin">
        <table className="data" aria-label="Results Comparison">
          <thead>
            <tr>
              <th scope="col"><SortButton label="Asset" sortKey="asset" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col"><SortButton label="Strategy" sortKey="strategy" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col">Invested</th>
              <th scope="col"><SortButton label="Final Value" sortKey="finalValue" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col"><SortButton label="Return" sortKey="return" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col"><SortButton label="CAGR" sortKey="cagr" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col"><SortButton label="Drawdown" sortKey="drawdown" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col"><SortButton label="Purchases" sortKey="purchases" sortConfig={sortConfig} onSort={updateSort} /></th>
              <th scope="col">Units</th>
              <th scope="col">Relative</th>
            </tr>
          </thead>
          <tbody>
            {sortedResults.map((result) => (
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
                  <span className="asset-cell">{result.asset.symbol}</span>
                </th>
                <td>{result.strategyName}</td>
                <td>{formatCurrency(result.metrics.totalInvested)}</td>
                <td>{formatCurrency(result.metrics.finalValue)}</td>
                <td className={result.metrics.totalReturn >= 0 ? "cell-pos" : "cell-neg"}>{formatPercent(result.metrics.totalReturn)}</td>
                <td>{formatPercent(result.metrics.cagr)}</td>
                <td className="cell-neg">{formatPercent(result.metrics.maxDrawdown)}</td>
                <td>{result.metrics.numberOfPurchases}</td>
                <td>{formatNumber(result.metrics.unitsAccumulated)}</td>
                <td>
                  <span className="relative-bar" aria-label={`${formatPercent(result.metrics.finalValue / maxFinalValue)} of top final value`}>
                    <i style={{ width: `${Math.max(4, (result.metrics.finalValue / maxFinalValue) * 100)}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SortButton({
  label,
  sortKey,
  sortConfig,
  onSort
}: {
  label: string;
  sortKey: SortKey;
  sortConfig: { key: SortKey; direction: SortDirection };
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortConfig.key === sortKey;
  return (
    <button className={`sort-btn ${isActive ? "active" : ""}`} type="button" onClick={() => onSort(sortKey)}>
      {label}
      <span aria-hidden="true">{isActive ? (sortConfig.direction === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

function sortValue(result: ApiBacktestResult, key: SortKey): string | number {
  if (key === "asset") return result.asset.symbol;
  if (key === "strategy") return result.strategyName;
  if (key === "finalValue") return result.metrics.finalValue;
  if (key === "return") return result.metrics.totalReturn;
  if (key === "cagr") return result.metrics.cagr;
  if (key === "drawdown") return result.metrics.maxDrawdown;
  return result.metrics.numberOfPurchases;
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
  exportCsv("quantdca-comparison.csv", comparisonCsvRows(results));
}

function comparisonCsvRows(results: ApiBacktestResult[]) {
  return [
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
      "Average Cost / Unit",
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
  ];
}

function exportSeriesCsv(result: ApiBacktestResult) {
  exportCsv(`${exportRunPrefix(result)}-series.csv`, seriesCsvRows(result));
}

function seriesCsvRows(result: ApiBacktestResult) {
  return [
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
  ];
}

function exportScheduleCsv(result: ApiBacktestResult) {
  exportCsv(`${exportRunPrefix(result)}-schedule.csv`, scheduleCsvRows(result));
}

function scheduleCsvRows(result: ApiBacktestResult) {
  return [
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
  ];
}

function exportFullJson(context: ExportContext) {
  downloadFile("quantdca-backtest-export.json", auditJsonContent(context), "application/json;charset=utf-8");
}

function auditJsonContent({
  results,
  selectedRun,
  selectedAssets,
  strategies,
  normalizeCapital,
  generatedAt,
  warnings
}: ExportContext) {
  const runIdMap = new Map(results.map((result, index) => [result.runId, exportRunId(result, index)]));
  const exportResults = results.map((result, index) => ({
    ...result,
    runId: exportRunId(result, index),
    asset: exportAsset(result.asset)
  }));
  const exportSelectedAssets = selectedAssets.map(exportAsset);

  return JSON.stringify(
    {
      generatedAt,
      focusedRunId: selectedRun ? (runIdMap.get(selectedRun.runId) ?? null) : null,
      normalizeCapital,
      warnings,
      selectedAssets: exportSelectedAssets,
      strategies,
      results: exportResults
    },
    null,
    2
  );
}

function buildExportFiles(
  context: ExportContext,
  options: {
    includeComparison: boolean;
    includeSeries: boolean;
    includeSchedule: boolean;
    includeJson: boolean;
    includeMemo: boolean;
  }
): ExportFile[] {
  const files: ExportFile[] = [];
  if (options.includeComparison) {
    files.push({
      name: "comparison.csv",
      content: csvContent(comparisonCsvRows(context.results)),
      type: "text/csv;charset=utf-8",
      rows: context.results.length,
      description: "Runs, metrics, and assumptions",
      privacy: "Public analysis data"
    });
  }
  if (options.includeSeries && context.selectedRun) {
    files.push({
      name: `${exportRunPrefix(context.selectedRun)}-series.csv`,
      content: csvContent(seriesCsvRows(context.selectedRun)),
      type: "text/csv;charset=utf-8",
      rows: context.selectedRun.series.length,
      description: "Focused daily value series",
      privacy: "Public analysis data"
    });
  }
  if (options.includeSchedule && context.selectedRun) {
    files.push({
      name: `${exportRunPrefix(context.selectedRun)}-schedule.csv`,
      content: csvContent(scheduleCsvRows(context.selectedRun)),
      type: "text/csv;charset=utf-8",
      rows: context.selectedRun.transactions.length,
      description: "Matched purchase schedule",
      privacy: "Public analysis data"
    });
  }
  if (options.includeJson) {
    files.push({
      name: "audit.json",
      content: auditJsonContent(context),
      type: "application/json;charset=utf-8",
      rows: context.results.length,
      description: "Sanitized reproducible payload",
      privacy: "Sanitized asset data"
    });
  }
  if (options.includeMemo) {
    files.push({
      name: "memo.md",
      content: investorMemoContent(context),
      type: "text/markdown;charset=utf-8",
      description: "Plain-English strategy memo",
      privacy: "Public analysis data"
    });
  }
  return files;
}

function exportInvestorMemo(context: ExportContext) {
  downloadFile("quantdca-investor-memo.md", investorMemoContent(context), "text/markdown;charset=utf-8");
}

function investorMemoContent(context: ExportContext) {
  const insight = getRunInsight(context.results);
  const bestRun = insight.bestRun;
  const lines = [
    "# QuantDCA Strategy Memo",
    "",
    `Generated: ${context.generatedAt ?? new Date().toISOString()}`,
    `Capital logic: ${context.normalizeCapital ? "Equalized" : "As configured"}`,
    "",
    "## Decision Readout",
    bestRun
      ? `${bestRun.asset.symbol} / ${bestRun.strategyName} finished with ${formatCurrency(bestRun.metrics.finalValue)} and ${formatPercent(bestRun.metrics.totalReturn)} total return.`
      : "No winning run was available.",
    insight.secondBestRun
      ? `The winner was ${formatCurrency(insight.bestAdvantage)} ahead of the next best run (${formatPercent(insight.bestAdvantagePercent)}).`
      : "",
    "",
    "## Risk Notes",
    insight.worstDrawdownRun
      ? `Worst drawdown: ${insight.worstDrawdownRun.asset.symbol} / ${insight.worstDrawdownRun.strategyName} at ${formatPercent(insight.worstDrawdownRun.metrics.maxDrawdown)}.`
      : "No drawdown data available.",
    `Rolled purchase dates: ${insight.rolledPurchaseCount}.`,
    `Fee drag: ${formatPercent(insight.feeShare)} of deployed capital.`,
    "",
    "## Warnings",
    ...(context.warnings.length > 0 ? context.warnings.map((warning) => `- ${warning}`) : ["- None."])
  ];
  return `${lines.filter((line) => line !== "").join("\n")}\n`;
}

function exportZipPackage(files: ExportFile[]) {
  const blob = createZipBlob(files);
  downloadFile("quantdca-data-package.zip", blob, "application/zip");
}

function exportCsv(fileName: string, rows: Array<Array<string | number | null | undefined>>) {
  downloadFile(fileName, csvContent(rows), "text/csv;charset=utf-8");
}

function csvContent(rows: Array<Array<string | number | null | undefined>>) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, "\"\"")}"` : text;
}

function downloadFile(fileName: string, content: string | Blob, type: string) {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function createZipBlob(files: ExportFile[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.name);
    const contentBytes = encoder.encode(file.content);
    const crc = crc32(contentBytes);
    const localHeader = zipHeader(0x04034b50, [
      20, 0, 0, 0, 0, crc, contentBytes.length, contentBytes.length, nameBytes.length, 0
    ]);
    localParts.push(localHeader, nameBytes, contentBytes);

    const centralHeader = zipHeader(0x02014b50, [
      20, 20, 0, 0, 0, 0, crc, contentBytes.length, contentBytes.length, nameBytes.length, 0, 0, 0, 0, 0, offset
    ]);
    centralParts.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + contentBytes.length;
  });

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const endRecord = zipHeader(0x06054b50, [0, 0, files.length, files.length, centralSize, offset, 0]);
  return new Blob([...localParts, ...centralParts, endRecord].map(bytesToBlobPart), { type: "application/zip" });
}

function bytesToBlobPart(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function zipHeader(signature: number, values: number[]) {
  const fieldSizes =
    signature === 0x02014b50
      ? [2, 2, 2, 2, 2, 2, 4, 4, 4, 2, 2, 2, 2, 2, 4, 4]
      : signature === 0x06054b50
        ? [2, 2, 2, 2, 4, 4, 2]
        : [2, 2, 2, 2, 2, 4, 4, 4, 2, 2];
  const length = 4 + fieldSizes.reduce((sum, size) => sum + size, 0);
  const bytes = new Uint8Array(length);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, signature, true);
  let cursor = 4;
  values.forEach((value, index) => {
    const size = fieldSizes[index];
    if (size === 2) {
      view.setUint16(cursor, value, true);
    } else {
      view.setUint32(cursor, value, true);
    }
    cursor += size;
  });
  return bytes;
}

function crc32(bytes: Uint8Array) {
  let crc = -1;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let crc = index;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  return crc >>> 0;
});

function exportRunPrefix(result: ApiBacktestResult) {
  return `quantdca-${result.asset.symbol}-${result.strategyName}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

function exportRunId(result: ApiBacktestResult, index: number) {
  return `${result.asset.symbol}:${result.strategyId}:${index + 1}`;
}

function exportAsset(asset: MarketAsset) {
  const publicAsset: Partial<MarketAsset> & { source?: string } = { ...asset };
  delete publicAsset.dataProvider;
  delete publicAsset.provider;
  delete publicAsset.source;
  return publicAsset;
}

function getSetupQuality(
  selectedAssets: SelectedAsset[],
  strategies: BacktestStrategy[],
  strategyErrors: Map<string, StrategyFieldErrors>,
  normalizeCapital: boolean
) {
  const hasValidStrategies = Array.from(strategyErrors.values()).every((errors) => Object.keys(errors).length === 0);
  const hasDateRange = strategies.every((strategy) => isIsoDate(strategy.startDate) && isIsoDate(strategy.endDate) && strategy.startDate <= strategy.endDate);
  const hasCapital = strategies.every((strategy) => strategy.initialInvestment + strategy.recurringContribution > 0);
  const hasRiskAssumptions = strategies.some((strategy) => strategy.transactionFee > 0 || strategy.cashDragPercent !== 0);
  const items = [
    { label: "Asset selected", done: selectedAssets.length > 0 },
    { label: "Strategies valid", done: strategies.length > 0 && hasValidStrategies },
    { label: "Dates aligned", done: hasDateRange },
    { label: "Capital configured", done: hasCapital },
    { label: "Comparison normalized", done: normalizeCapital },
    { label: "Fees / cash drag considered", done: hasRiskAssumptions }
  ];
  const score = items.filter((item) => item.done).length;
  return { items, score, percent: Math.round((score / items.length) * 100) };
}

function scenarioResultSummary(results: ApiBacktestResult[], generatedAt: string | null): ScenarioResultSummary | undefined {
  const insight = getRunInsight(results);
  if (!insight.bestRun) return undefined;
  return {
    runCount: results.length,
    winnerLabel: `${insight.bestRun.asset.symbol} / ${insight.bestRun.strategyName}`,
    finalValue: insight.bestRun.metrics.finalValue,
    drawdown: insight.bestRun.metrics.maxDrawdown,
    generatedAt
  };
}

function scenarioComparisonText(
  snapshot: ScenarioSnapshotSummary,
  currentAssetCount: number,
  currentStrategyCount: number,
  currentNormalized: boolean,
  currentResultSummary?: ScenarioResultSummary
) {
  const inputParts = [
    `${currentAssetCount - snapshot.assetCount >= 0 ? "+" : ""}${currentAssetCount - snapshot.assetCount} assets`,
    `${currentStrategyCount - snapshot.strategyCount >= 0 ? "+" : ""}${currentStrategyCount - snapshot.strategyCount} strategies`,
    currentNormalized === snapshot.normalized ? "same capital logic" : "capital logic changed"
  ];
  if (snapshot.resultSummary && currentResultSummary) {
    const valueGap = currentResultSummary.finalValue - snapshot.resultSummary.finalValue;
    return `${inputParts.join(" / ")}. Winner ${currentResultSummary.winnerLabel}; ${formatCurrency(Math.abs(valueGap))} ${valueGap >= 0 ? "above" : "below"} saved scenario.`;
  }
  return `${inputParts.join(" / ")} compared with latest saved setup.`;
}

function sensitivityRows(
  results: ApiBacktestResult[],
  settings: { contributionScale: number; extraFee: number; cashDragDelta: number; startBuffer: number }
) {
  return results
    .map((result) => {
      const contributionFactor = settings.contributionScale / 100;
      const extraFees = settings.extraFee * result.metrics.numberOfPurchases;
      const cashEffect = result.metrics.remainingCash * (settings.cashDragDelta / 100);
      const startWindowPenalty = result.metrics.finalValue * Math.abs(result.metrics.volatility) * (settings.startBuffer / 365) * 0.35;
      return {
        runId: result.runId,
        label: `${result.asset.symbol} / ${result.strategyName}`,
        stressedValue: Math.max(0, result.metrics.finalValue * contributionFactor - extraFees + cashEffect - startWindowPenalty)
      };
    })
    .sort((left, right) => right.stressedValue - left.stressedValue);
}

function chartAnnotationItems(
  selectedRun: ApiBacktestResult | null,
  insight: RunInsight,
  annotations: Set<ChartAnnotation>,
  mode: ChartMode
): Array<{ kind: "purchase" | "drawdown" | "breakeven"; date: string; value: number; label: string }> {
  if (!selectedRun) return [];
  const chartSeries = chartSeriesForResult(selectedRun, mode);
  const valueByDate = new Map(chartSeries.map((point) => [point.date, point.value]));
  const items: Array<{ kind: "purchase" | "drawdown" | "breakeven"; date: string; value: number; label: string }> = [];

  if (annotations.has("purchases")) {
    const step = Math.max(1, Math.ceil(selectedRun.transactions.length / 14));
    selectedRun.transactions.forEach((transaction, index) => {
      if (index % step !== 0) return;
      const value = valueByDate.get(transaction.date);
      if (value !== undefined) {
        items.push({ kind: "purchase", date: transaction.date, value, label: "Buy" });
      }
    });
  }

  if (annotations.has("drawdown")) {
    const drawdown = maxDrawdownPoint(selectedRun, mode);
    if (drawdown) {
      items.push({ kind: "drawdown", date: drawdown.date, value: drawdown.value, label: "Max drawdown" });
    }
  }

  if (annotations.has("breakeven") && insight.breakEven) {
    const value = nearestSeriesValue(chartSeries, insight.breakEven.date);
    if (value !== null) {
      items.push({ kind: "breakeven", date: insight.breakEven.date, value, label: "Break-even" });
    }
  }

  return items;
}

function maxDrawdownPoint(result: ApiBacktestResult, mode: ChartMode): { date: string; value: number } | null {
  let peak = 0;
  let worstPoint: { date: string; value: number } | null = null;
  let worstDrawdown = 0;
  const chartValues = new Map(chartSeriesForResult(result, mode).map((point) => [point.date, point.value]));

  result.series.forEach((point) => {
    peak = Math.max(peak, point.portfolioValue);
    const drawdown = peak > 0 ? point.portfolioValue / peak - 1 : 0;
    if (drawdown < worstDrawdown) {
      worstDrawdown = drawdown;
      worstPoint = { date: point.date, value: chartValues.get(point.date) ?? point.portfolioValue };
    }
  });

  return worstPoint;
}

function nearestSeriesValue(series: Array<{ date: string; value: number }>, date: string): number | null {
  const exact = series.find((point) => point.date === date);
  if (exact) return exact.value;
  const next = series.find((point) => point.date > date);
  return next?.value ?? series.at(-1)?.value ?? null;
}

function formatBytes(byteCount: number) {
  if (byteCount < 1024) return `${byteCount} B`;
  return `${(byteCount / 1024).toFixed(byteCount < 10_240 ? 1 : 0)} KB`;
}

function getRunInsight(results: ApiBacktestResult[]): RunInsight {
  if (results.length === 0) {
    return {
      bestRun: null,
      secondBestRun: null,
      worstDrawdownRun: null,
      bestAdvantage: 0,
      bestAdvantagePercent: 0,
      breakEven: null,
      rolledPurchaseCount: 0,
      feeShare: 0
    };
  }

  const sortedByFinalValue = [...results].sort((left, right) => right.metrics.finalValue - left.metrics.finalValue);
  const bestRun = sortedByFinalValue[0];
  const secondBestRun = sortedByFinalValue[1] ?? null;
  const worstDrawdownRun = results.reduce((worst, result) => (result.metrics.maxDrawdown < worst.metrics.maxDrawdown ? result : worst), results[0]);
  const bestAdvantage = secondBestRun ? bestRun.metrics.finalValue - secondBestRun.metrics.finalValue : 0;
  const bestAdvantagePercent = secondBestRun && secondBestRun.metrics.finalValue > 0 ? bestAdvantage / secondBestRun.metrics.finalValue : 0;
  const rolledPurchaseCount = results.reduce(
    (count, result) => count + result.transactions.filter((transaction) => transaction.dueDate !== transaction.date).length,
    0
  );
  const totalFees = results.reduce((sum, result) => sum + result.metrics.feesPaid, 0);
  const totalInvested = results.reduce((sum, result) => sum + result.metrics.totalInvested, 0);

  return {
    bestRun,
    secondBestRun,
    worstDrawdownRun,
    bestAdvantage,
    bestAdvantagePercent,
    breakEven: secondBestRun ? findBreakEven(bestRun, secondBestRun) : null,
    rolledPurchaseCount,
    feeShare: totalInvested > 0 ? totalFees / totalInvested : 0
  };
}

function findBreakEven(bestRun: ApiBacktestResult, comparisonRun: ApiBacktestResult): { months: number; date: string } | null {
  const comparisonByDate = new Map(comparisonRun.series.map((point) => [point.date, point.portfolioValue]));
  const firstDate = bestRun.series[0]?.date;
  let previousGap: number | null = null;

  for (const point of bestRun.series) {
    const comparisonValue = comparisonByDate.get(point.date);
    if (comparisonValue === undefined) continue;

    const gap = point.portfolioValue - comparisonValue;
    if ((previousGap !== null && previousGap <= 0 && gap > 0) || (previousGap === null && gap > 0)) {
      return { months: firstDate ? monthDistance(firstDate, point.date) : 0, date: point.date };
    }
    previousGap = gap;
  }

  return null;
}

function monthDistance(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  return Math.max(0, (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth());
}

function chartSeriesForResult(result: ApiBacktestResult, mode: ChartMode): Array<{ date: string; value: number }> {
  let runningPeak = 0;
  return result.series.map((point) => {
    if (mode === "drawdown") {
      runningPeak = Math.max(runningPeak, point.portfolioValue);
      return {
        date: point.date,
        value: runningPeak > 0 ? point.portfolioValue / runningPeak - 1 : 0
      };
    }

    if (mode === "contributions") {
      return { date: point.date, value: point.investedCapital };
    }

    return { date: point.date, value: point.portfolioValue };
  });
}

function formatChartValue(value: number, mode: ChartMode) {
  return mode === "drawdown" ? formatPercent(value) : formatCompactCurrency(value);
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

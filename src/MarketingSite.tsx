import {
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Layers,
  LockKeyhole,
  Menu,
  Play,
  Scale,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Upload,
  X
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

interface MarketingSiteProps {
  path: string;
}

const navItems = [
  { href: "#how-it-works", label: "How It Works" },
  { href: "#methodology", label: "Methodology" }
];

const trustSignals = [
  { icon: <ShieldCheck size={13} />, label: "Server-side provider keys" },
  { icon: <Database size={13} />, label: "Server-routed market data" },
  { icon: <CheckCircle2 size={13} />, label: "Deterministic engine" }
];

export function MarketingSite({ path: _path }: MarketingSiteProps) {
  return (
    <div className="marketing-shell">
      <MarketingNav />
      <LandingPage />
      <MarketingFooter />
    </div>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="#2E63E6" />
      <polyline
        points="7,23 7,19 13,19 13,14 19,14 19,9 25,9"
        fill="none"
        stroke="#FFFFFF"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <circle cx="25" cy="9" r="1.9" fill="#FFFFFF" />
    </svg>
  );
}

function MarketingNav() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    if (!drawerOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [drawerOpen]);

  return (
    <>
      <header className="marketing-nav-shell">
        <nav className="marketing-nav" aria-label="Primary">
          <a className="marketing-logo" href="/" aria-label="QuantDCA home">
            <LogoMark className="marketing-logo-mark" />
            <span className="marketing-brand-name">
              Quant<b>DCA</b>
            </span>
          </a>
          <div className="marketing-nav-links">
            {navItems.map((item) => (
              <a href={item.href} key={item.href}>
                {item.label}
              </a>
            ))}
          </div>
          <div className="marketing-nav-right">
            <a className="btn primary" href="/app">
              <Play size={15} aria-hidden="true" />
              Run Backtests
            </a>
            <button
              aria-controls="marketing-drawer"
              aria-expanded={drawerOpen}
              aria-label="Open menu"
              className="marketing-menu-button"
              onClick={() => setDrawerOpen(true)}
              type="button"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          </div>
        </nav>
      </header>

      <div aria-hidden={!drawerOpen} className="marketing-drawer" data-open={drawerOpen} id="marketing-drawer">
        <button
          aria-label="Close menu"
          className="marketing-drawer-scrim"
          onClick={() => setDrawerOpen(false)}
          tabIndex={drawerOpen ? 0 : -1}
          type="button"
        />
        <div aria-label="Menu" aria-modal="true" className="marketing-drawer-panel" role="dialog">
          <div className="marketing-drawer-head">
            <span className="marketing-logo">
              <LogoMark className="marketing-logo-mark" />
              <span className="marketing-brand-name">
                Quant<b>DCA</b>
              </span>
            </span>
            <button
              aria-label="Close menu"
              className="marketing-menu-button"
              onClick={() => setDrawerOpen(false)}
              type="button"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
          <nav aria-label="Mobile" className="marketing-drawer-links">
            {navItems.map((item) => (
              <a href={item.href} key={item.href} onClick={() => setDrawerOpen(false)}>
                {item.label}
              </a>
            ))}
          </nav>
          <a className="btn primary lg" href="/app" onClick={() => setDrawerOpen(false)}>
            <Play size={16} aria-hidden="true" />
            Run Backtests
          </a>
        </div>
      </div>
    </>
  );
}

function LandingPage() {
  return (
    <main id="main">
      <section className="marketing-hero">
        <div className="wrap marketing-hero-grid">
          <div className="marketing-hero-copy">
            <span className="marketing-kicker">Free strategy backtesting</span>
            <h1>
              DCA or lump sum? <span>Run the receipts.</span>
            </h1>
            <p className="marketing-hero-lead">
              Replay real market history for stocks, crypto, or custom CSV uploads, compare DCA against lump sum in Simple mode,
              then switch to Advanced when the conclusion needs stress-testing.
            </p>
            <div className="marketing-hero-actions">
              <a className="btn primary lg" href="/app">
                <Play size={16} aria-hidden="true" />
                Run Backtests
              </a>
              <a className="btn lg" href="#how-it-works">
                How It Works
              </a>
            </div>
            <p className="marketing-hero-note">
              <CheckCircle2 size={14} aria-hidden="true" />
              <b>Free</b> — no account needed to run a comparison.
            </p>
            <div aria-label="Trust signals" className="marketing-trust-chips">
              {trustSignals.map((signal) => (
                <span className="tchip" key={signal.label}>
                  {signal.icon}
                  {signal.label}
                </span>
              ))}
            </div>
          </div>
          <DashboardFramePreview />
        </div>
      </section>

      <section className="wrap stat-wrap" aria-label="QuantDCA product facts">
        <div className="stat-row">
          <StatItem label="Provider routes" value="Stocks / Crypto" />
          <StatItem label="Also supports" value="Custom CSV" />
          <StatItem label="Core comparison" value="DCA / Lump Sum" />
          <StatItem label="Export package" value="CSV / JSON / ZIP" />
        </div>
      </section>

      <section className="marketing-section compact">
        <div className="wrap">
          <div className="public-section-head center">
            <span className="marketing-kicker plain">The question, settled</span>
            <h2>Most DCA advice is a slogan. QuantDCA turns it into a backtest.</h2>
            <p>
              Compare the same money across different contribution schedules, see which side history favored,
              and keep the evidence instead of the argument.
            </p>
          </div>
        </div>
      </section>

      <section className="marketing-section alt" id="how-it-works">
        <div className="wrap">
          <div className="public-section-head">
            <span className="marketing-kicker">How it works</span>
            <h2>Four steps from question to conviction</h2>
          </div>
          <div className="marketing-grid g4">
            <HomeStep
              icon={<Search size={18} />}
              step="Step 01"
              text="Search provider-backed stocks or crypto, or upload a custom CSV. Provider labels appear only while choosing from search results."
              title="Pick the market"
            />
            <HomeStep
              icon={<SlidersHorizontal size={18} />}
              step="Step 02"
              text="Start with the core setup, then switch to Advanced for setup checks, templates, fees, and cash-drag review."
              title="Set the strategy"
            />
            <HomeStep
              icon={<BarChart3 size={18} />}
              step="Step 03"
              text="Read the winner in Simple mode, then inspect stress previews, guide-line annotations, and assumption checks in Advanced."
              title="Check the evidence"
            />
            <HomeStep
              icon={<CheckCircle2 size={18} />}
              step="Step 04"
              text="Save the scenario locally, share a restorable link in your browser, then export the receipts."
              title="Act with context"
            />
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="wrap marketing-split">
          <div>
            <span className="marketing-kicker">Asset-flexible engine</span>
            <h2>A fair fight across stocks, crypto, or your own prices</h2>
            <p>
              The mock uses a broad-market stock example to make the comparison concrete. The same engine works for provider-routed
              stock and crypto assets, or your own validated price history.
            </p>
            <ul className="split-list">
              <li>
                <Scale size={18} aria-hidden="true" />
                <span>
                  <b>Equal-capital mode.</b> Every strategy receives the same target budget across its own schedule.
                </span>
              </li>
              <li>
                <Clock size={18} aria-hidden="true" />
                <span>
                  <b>Cash drag modeled.</b> Idle earmarked cash grows or decays at a rate you set — no free lunch for waiting.
                </span>
              </li>
              <li>
                <Layers size={18} aria-hidden="true" />
                <span>
                  <b>Fees & non-trading days.</b> Transaction fees apply; purchases roll to the next available price date.
                </span>
              </li>
            </ul>
          </div>
          <ComparisonMock />
        </div>
      </section>

      <section className="marketing-section alt" id="methodology">
        <div className="wrap">
          <div className="public-section-head">
            <span className="marketing-kicker">Methodology</span>
            <h2>Simple rules, visible assumptions</h2>
          </div>
          <div className="marketing-grid g3">
            <ValueCard icon={<Database size={18} />} title="Routed market data" text="Stocks and crypto route server-side to the right market data source without cluttering the comparison view." />
            <ValueCard icon={<Scale size={18} />} title="Equal capital" text="Comparisons normalize capital by default so DCA and lump sum are judged on the same money." />
            <ValueCard icon={<ShieldCheck size={18} />} title="Keys stay server-side" text="Market-data provider keys never reach the browser — search and prices are proxied through the server." />
            <ValueCard icon={<Upload size={18} />} title="Custom CSV" text="Bring your own price series with strict date and positive USD price validation." />
            <ValueCard icon={<Download size={18} />} title="Simple first" text="The default dashboard keeps core setup, results, transactions, and exports visible without advanced panels." />
            <ValueCard icon={<CheckCircle2 size={18} />} title="Advanced depth" text="Templates, scenarios, chart modes, guide-line annotations, sensitivity checks, and run drawers stay one toggle away." />
          </div>
        </div>
      </section>

      <section className="marketing-section">
        <div className="wrap">
          <div className="cta-band">
            <span className="marketing-kicker plain">Free, no account</span>
            <h2>Stop debating the strategy. Backtest it.</h2>
            <p>Open the dashboard, run DCA against lump sum, and keep the evidence.</p>
            <div className="cta-actions">
              <a className="btn primary lg" href="/app">
                <Play size={16} aria-hidden="true" />
                Run Backtests
              </a>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function DashboardFramePreview() {
  return (
    <aside className="browser-frame" aria-label="QuantDCA dashboard preview">
      <div className="browser-frame-bar" aria-hidden="true">
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-dot" />
        <span className="browser-url">quantdca.xyz</span>
      </div>
      <div className="dashboard-preview" aria-hidden="true">
        <div className="preview-topbar">
          <span>QuantDCA</span>
          <i>Run Backtests</i>
        </div>
        <div className="preview-grid">
          <div className="preview-controls">
            <span className="preview-label">Asset</span>
            <span className="preview-input">AAPL</span>
            <span className="preview-label">Strategies</span>
            <span className="preview-chip">Monthly DCA</span>
            <span className="preview-chip">Lump Sum</span>
            <span className="preview-label">Equal capital</span>
            <span className="preview-switch" />
          </div>
          <div className="preview-results">
            <div className="preview-verdict">
              <small>Best outcome</small>
              <strong>AAPL · Lump Sum</strong>
              <span>$48,255 final value · +96.9%</span>
            </div>
            <ComparisonChart />
            <div className="preview-metrics">
              <MockMetric label="CAGR" value="18.5%" />
              <MockMetric label="Drawdown" value="-0.8%" tone="negative" />
              <MockMetric label="Buys" value="1 / 48" />
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function ComparisonMock() {
  return (
    <aside className="product-mock" aria-label="DCA versus lump sum preview">
      <div className="product-mock-head">
        <span>AAPL value</span>
        <strong>DCA vs Lump Sum</strong>
      </div>
      <div className="product-mock-body">
        <ComparisonChart />
        <div className="mock-legend">
          <span>
            <i className="series-one" />
            AAPL · DCA
          </span>
          <span>
            <i className="series-three" />
            AAPL · Lump Sum
          </span>
        </div>
        <div className="mock-metrics">
          <MockMetric label="DCA value" value="$34,395" />
          <MockMetric label="Lump sum" value="$48,255" tone="positive" />
          <MockMetric label="Gap" value="$13,860" />
        </div>
      </div>
    </aside>
  );
}

function ComparisonChart() {
  return (
    <div className="mock-chart">
      <svg viewBox="0 0 440 180" preserveAspectRatio="none" role="img" aria-label="DCA versus lump sum comparison">
        <line className="chart-grid-line" x1="0" y1="45" x2="440" y2="45" />
        <line className="chart-grid-line" x1="0" y1="90" x2="440" y2="90" />
        <line className="chart-grid-line" x1="0" y1="135" x2="440" y2="135" />
        <polyline
          points="0,154 48,148 96,138 144,140 192,124 240,114 288,102 336,88 384,72 440,56"
          className="chart-line primary"
        />
        <polyline
          points="0,150 48,142 96,128 144,132 192,108 240,95 288,76 336,58 384,40 440,24"
          className="chart-line secondary"
        />
        <polyline
          points="0,164 48,158 96,152 144,145 192,138 240,131 288,124 336,117 384,110 440,102"
          className="chart-line invested"
        />
      </svg>
    </div>
  );
}

function HomeStep({ icon, step, title, text }: { icon?: ReactNode; step: string; title: string; text: string }) {
  return (
    <article className="step-card">
      {icon ? <span aria-hidden="true" className="card-icon">{icon}</span> : null}
      <small>{step}</small>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function ValueCard({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="value-card">
      <span aria-hidden="true" className="card-icon">{icon}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function MockMetric({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  return (
    <span className={`mock-metric ${tone ?? ""}`}>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function MarketingFooter() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="marketing-footer">
      <div className="wrap">
        <div className="marketing-footer-minimal">
          <div className="marketing-footer-brand">
            <a className="marketing-logo" href="/" aria-label="QuantDCA home">
              <LogoMark className="marketing-logo-mark" />
              <span className="marketing-brand-name">
                Quant<b>DCA</b>
              </span>
            </a>
            <p>Free backtesting for DCA, lump sum, and contribution schedules. Real data, deterministic math, inspectable results.</p>
          </div>
          <div className="marketing-footer-actions">
            <a href="#how-it-works">How It Works</a>
            <a href="#methodology">Methodology</a>
            <a href="/app">Run Backtests</a>
          </div>
        </div>
        <div className="marketing-footer-base">
          <span>© {currentYear} QuantDCA · For research and education. Not investment advice.</span>
          <span>
            <LockKeyhole size={14} aria-hidden="true" />
            Past performance is not indicative of future results.
          </span>
        </div>
      </div>
    </footer>
  );
}

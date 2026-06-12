import {
  ArrowRight,
  CheckCircle2,
  Database,
  Download,
  FileDown,
  Gauge,
  LineChart,
  LockKeyhole,
  Scale,
  ShieldCheck
} from "lucide-react";
import type { ReactNode } from "react";

type MarketingPath = "/" | "/product" | "/methodology" | "/about" | "/brand";

interface MarketingSiteProps {
  path: string;
}

const navItems = [
  { href: "/product", label: "Product" },
  { href: "/methodology", label: "Methodology" },
  { href: "/about", label: "About" }
];

const trustSignals = ["Server-Side Keys", "Adjusted-Close Pricing", "Deterministic Engine", "CSV & JSON Exports"];

export function MarketingSite({ path }: MarketingSiteProps) {
  const normalizedPath = normalizeMarketingPath(path);

  return (
    <div className="marketing-shell">
      <MarketingNav activePath={normalizedPath} />
      {normalizedPath === "/" ? <LandingPage /> : null}
      {normalizedPath === "/product" ? <ProductPage /> : null}
      {normalizedPath === "/methodology" ? <MethodologyPage /> : null}
      {normalizedPath === "/about" ? <AboutPage /> : null}
      {normalizedPath === "/brand" ? <BrandPage /> : null}
      <MarketingFooter />
    </div>
  );
}

export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="#15201C" />
      <polyline
        points="6,25 6,20 12,20 12,15 18,15 18,10 24,10 24,6"
        fill="none"
        stroke="#F4F2EB"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <circle cx="24" cy="6" r="2" fill="#0E6F66" />
    </svg>
  );
}

function MarketingNav({ activePath }: { activePath: MarketingPath }) {
  return (
    <header className="marketing-nav" aria-label="QuantDCA Website">
      <a className="marketing-logo" href="/" aria-label="QuantDCA Home">
        <LogoMark className="marketing-logo-mark" />
        <span>
          Quant<span>DCA</span>
        </span>
      </a>
      <nav aria-label="Primary Navigation">
        {navItems.map((item) => (
          <a className={activePath === item.href ? "active" : ""} href={item.href} key={item.href}>
            {item.label}
          </a>
        ))}
      </nav>
      <a className="marketing-nav-cta" href="/app">
        Run Backtests
      </a>
    </header>
  );
}

function LandingPage() {
  return (
    <main>
      <section className="marketing-hero">
        <div className="marketing-hero-copy">
          <p className="marketing-kicker">Backtesting, Settled</p>
          <h1>
            Would DCA Have Beaten Lump Sum? <em>Find Out Exactly.</em>
          </h1>
          <p>
            QuantDCA replays real market history to compare dollar-cost-averaging strategies, lump sums,
            and assets side by side. Equal capital, fees, cash drag, and every number exportable. Free.
          </p>
          <div className="marketing-actions">
            <a className="marketing-button primary" href="/app">
              Run Backtests
              <ArrowRight size={17} aria-hidden="true" />
            </a>
            <span>
              <b>Free</b> / no account needed
            </span>
          </div>
          <div className="marketing-proof-grid" aria-label="Product Proof Points">
            <MetricProof value="40+ Yrs" label="Daily History" />
            <MetricProof value="100%" label="Deterministic" />
            <MetricProof value="CSV / JSON" label="Every Result" />
          </div>
        </div>
        <ProductMock />
      </section>

      <TrustStrip />

      <section className="marketing-section split">
        <div>
          <p className="marketing-kicker">The Argument, Settled</p>
          <h2>Investing Advice Is Full Of Confident Claims. QuantDCA Replaces Them With A Chart.</h2>
        </div>
        <div className="principle-list">
          <Principle icon={<Database size={18} />} title="Use Real Price History" text="Search market assets or upload a strict two-column CSV for custom analysis." />
          <Principle icon={<Scale size={18} />} title="Normalize Capital" text="Compare strategies under equal target capital instead of accidental sizing advantages." />
          <Principle icon={<Download size={18} />} title="Export The Evidence" text="Download comparison metrics, focused series, purchase schedules, and JSON audit payloads." />
        </div>
      </section>

      <section className="marketing-section process">
        <p className="marketing-kicker">How It Works</p>
        <h2>Three Steps From Question To Verdict.</h2>
        <div className="process-grid">
          <ProcessStep step="01" title="Select Assets" text="Search provider data or upload a custom CSV with date and USD price columns." />
          <ProcessStep step="02" title="Configure Strategies" text="Set initial capital, recurring contributions, dates, fees, cash drag, and frequency." />
          <ProcessStep step="03" title="Compare Outcomes" text="Rank final value, total return, CAGR, drawdown, purchases, fees, and schedule-level detail." />
        </div>
      </section>

      <section className="marketing-section free-band">
        <p className="marketing-kicker">No Paywall</p>
        <h2>
          Every Feature. <em>$0.</em>
        </h2>
        <p>No account, no trial gate, no upsell. QuantDCA is built to answer the question and hand you the data.</p>
        <a className="marketing-button primary" href="/app">
          Run Backtests
          <ArrowRight size={17} aria-hidden="true" />
        </a>
      </section>
    </main>
  );
}

function ProductPage() {
  return (
    <main>
      <PageHero
        eyebrow="Product"
        title="Run, Compare, And Prove A Backtest."
        copy="The product surface is designed around one job: compare strategies with transparent assumptions and exportable evidence."
      />
      <section className="marketing-section feature-grid">
        <Feature title="Asset Inputs" icon={<Database size={20} />} text="Use market search with server-side EODHD access, or upload custom CSV prices with strict date and USD price validation." />
        <Feature title="Strategy Builder" icon={<Gauge size={20} />} text="Model DCA, lump sum, contribution frequency, date windows, fees, cash drag, and equal-capital comparison." />
        <Feature title="Comparison Core" icon={<LineChart size={20} />} text="Put final value, return, CAGR, drawdown, contribution timing, and purchase counts in one scannable view." />
        <Feature title="Data Exports" icon={<FileDown size={20} />} text="Export comparison CSV, focused run series, transaction schedule, or full JSON audit payload." />
      </section>
      <section className="marketing-section product-band">
        <div>
          <p className="marketing-kicker">Comparison Console</p>
          <h2>Built Around The Comparison, Not The Controls.</h2>
          <p>
            The dashboard keeps setup compact and makes the winner, advantage, risk, assumptions, and data lineage visible as soon as the run completes.
          </p>
        </div>
        <ProductMock compact />
      </section>
      <FinalCta copy="See it on your own portfolio. Always free." />
    </main>
  );
}

function MethodologyPage() {
  return (
    <main>
      <PageHero
        eyebrow="Methodology & Data"
        title="How The Engine Works, So You Can Trust The Number."
        copy="QuantDCA favors boring, inspectable rules over black-box output. The backtest engine remains independent from the UI."
      />
      <section className="marketing-section methodology-grid">
        <MethodCard title="Data Sources" text="Provider assets use adjusted close when available. Custom CSV uploads require row 1 titles, column A dates starting YYYY-MM-DD, and column B positive USD prices." />
        <MethodCard title="Deterministic Engine" text="There is no random sampling. The same prices, strategy settings, and assumptions produce the same result." />
        <MethodCard title="Equal Capital" text="When enabled, each strategy receives the same target capital so the comparison is apples to apples." />
        <MethodCard title="Frictions" text="Transaction fees and cash drag are explicit inputs. They are shown in the output instead of hidden in prose." />
        <MethodCard title="Metrics" text="Final value, total invested, remaining cash, return, CAGR, drawdown, volatility, timing impact, purchases, units, and fees are calculated from the run." />
        <MethodCard title="Limits" text="Backtests are historical experiments, not forecasts. Data quality, asset survivorship, tax treatment, slippage, and future conditions remain outside the model." />
      </section>
    </main>
  );
}

function AboutPage() {
  return (
    <main>
      <PageHero
        eyebrow="Our Stance"
        title="Opinions Are Cheap. Evidence Is The Product."
        copy="QuantDCA exists for the moment when an investing slogan sounds right, but the answer depends on the asset, schedule, dates, fees, and risk path."
      />
      <section className="marketing-section split">
        <div>
          <h2>The Default Answer Is: Let Us Check.</h2>
          <p>
            Type the assets you actually care about, set the schedule you would actually follow, and compare the result under visible assumptions.
          </p>
        </div>
        <div className="principle-list">
          <Principle icon={<ShieldCheck size={18} />} title="Show Your Work" text="Numbers should be traceable, exportable, and easy to challenge." />
          <Principle icon={<Scale size={18} />} title="Fair By Construction" text="Equal capital keeps strategy comparison from being quietly biased by sizing." />
          <Principle icon={<CheckCircle2 size={18} />} title="Honest About Limits" text="Historical evidence informs decisions, but it does not predict the future." />
        </div>
      </section>
    </main>
  );
}

function BrandPage() {
  return (
    <main>
      <PageHero
        eyebrow="Brand System"
        title="The Ledger System."
        copy="A warm editorial identity for financial analysis: paper surfaces, near-black green ink, one teal signal, and the averaging staircase mark."
      />
      <section className="marketing-section brand-board">
        <div className="brand-swatch dark">
          <LogoMark className="brand-large-mark" />
          <strong>Quant<span>DCA</span></strong>
        </div>
        <div className="brand-token-grid">
          <BrandToken name="Paper" value="#F4F2EB" />
          <BrandToken name="Surface" value="#FFFFFF" />
          <BrandToken name="Ink" value="#15201C" />
          <BrandToken name="Teal" value="#0E6F66" />
          <BrandToken name="Brass" value="#9C6B1B" />
          <BrandToken name="Graphite" value="#A6A89A" />
        </div>
      </section>
      <section className="marketing-section voice-board">
        <h2>Voice Principles</h2>
        <div className="process-grid">
          <ProcessStep step="01" title="Data First" text="Lead with values, assumptions, date ranges, and exportable evidence." />
          <ProcessStep step="02" title="Precise, Not Loud" text="Prefer terse technical language over motivational investment copy." />
          <ProcessStep step="03" title="Free, Clearly" text="No pricing page, no trial language, no account requirement." />
        </div>
      </section>
    </main>
  );
}

function PageHero({ eyebrow, title, copy }: { eyebrow: string; title: string; copy: string }) {
  return (
    <section className="marketing-page-hero">
      <p className="marketing-kicker">{eyebrow}</p>
      <h1>{title}</h1>
      <p>{copy}</p>
    </section>
  );
}

function ProductMock({ compact = false }: { compact?: boolean }) {
  return (
    <aside className={`product-mock ${compact ? "compact" : ""}`} aria-label="QuantDCA Product Preview">
      <div className="mock-toolbar">
        <div>
          <span>Comparison Console</span>
          <strong>Monthly DCA vs Lump Sum</strong>
        </div>
        <span className="mock-status">Equal Capital</span>
      </div>
      <div className="mock-verdict">
        <span>Best Outcome / 2018-2024</span>
        <strong>VTI / Monthly DCA</strong>
        <p>$41,820 final value / +67.3% total return</p>
      </div>
      <div className="mock-chart" aria-hidden="true">
        <svg viewBox="0 0 520 190">
          <line x1="20" x2="500" y1="130" y2="130" className="mock-grid" />
          <line x1="20" x2="500" y1="84" y2="84" className="mock-grid" />
          <polyline points="30,152 90,141 150,118 210,126 270,86 330,96 390,58 470,36" className="mock-line primary" />
          <polyline points="30,162 90,150 150,135 210,118 270,99 330,78 390,66 470,52" className="mock-line secondary" />
          <polyline points="30,164 90,153 150,142 210,131 270,120 330,109 390,98 470,87" className="mock-line invested" />
          <circle cx="390" cy="58" r="4" className="mock-dot" />
        </svg>
      </div>
      <div className="mock-metrics">
        <MockMetric label="CAGR" value="18.4%" />
        <MockMetric label="Max DD" value="-24.1%" />
        <MockMetric label="Buys" value="84" />
      </div>
    </aside>
  );
}

function TrustStrip() {
  return (
    <section className="trust-strip" aria-label="Trust Signals">
      {trustSignals.map((signal) => (
        <span key={signal}>
          <CheckCircle2 size={16} aria-hidden="true" />
          {signal}
        </span>
      ))}
    </section>
  );
}

function MetricProof({ value, label }: { value: string; label: string }) {
  return (
    <span>
      <strong>{value}</strong>
      {label}
    </span>
  );
}

function Principle({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="principle">
      <span aria-hidden="true">{icon}</span>
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </article>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <article className="feature-card">
      <span aria-hidden="true">{icon}</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function ProcessStep({ step, title, text }: { step: string; title: string; text: string }) {
  return (
    <article className="process-step">
      <span>{step}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function MethodCard({ title, text }: { title: string; text: string }) {
  return (
    <article className="method-card">
      <h2>{title}</h2>
      <p>{text}</p>
    </article>
  );
}

function BrandToken({ name, value }: { name: string; value: string }) {
  return (
    <span className="brand-token">
      <i style={{ background: value }} aria-hidden="true" />
      <strong>{name}</strong>
      <code>{value}</code>
    </span>
  );
}

function MockMetric({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
    </span>
  );
}

function FinalCta({ copy }: { copy: string }) {
  return (
    <section className="marketing-section final-cta">
      <h2>{copy}</h2>
      <a className="marketing-button primary" href="/app">
        Run Backtests
        <ArrowRight size={17} aria-hidden="true" />
      </a>
    </section>
  );
}

function MarketingFooter() {
  return (
    <footer className="marketing-footer">
      <a className="marketing-logo" href="/" aria-label="QuantDCA Home">
        <LogoMark className="marketing-logo-mark" />
        <span>
          Quant<span>DCA</span>
        </span>
      </a>
      <div>
        <a href="/brand">Brand</a>
        <a href="/methodology">Methodology</a>
        <a href="/app">Run Backtests</a>
      </div>
      <span>
        <LockKeyhole size={14} aria-hidden="true" />
        Free / no account needed
      </span>
    </footer>
  );
}

function normalizeMarketingPath(path: string): MarketingPath {
  const cleanPath = path === "" ? "/" : path.replace(/\/+$/, "") || "/";
  return ["/", "/product", "/methodology", "/about", "/brand"].includes(cleanPath)
    ? (cleanPath as MarketingPath)
    : "/";
}

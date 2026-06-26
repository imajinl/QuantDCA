# QuantDCA

QuantDCA is a free financial analytics product for comparing dollar-cost-averaging strategies against lump sum and other contribution schedules. The public website is intentionally minimal; the working dashboard lives at `/app` as a clean Inter-based analytics UI.

The product promise is simple: Replay real market history for any supported asset or custom CSV, compare strategies on equal capital, start with a clean core workflow, then open advanced analysis when the decision needs deeper proof.

## Product Surface

The Vite app serves a compact public site and the backtesting dashboard:

- `/`: Public landing page — "DCA or lump sum? Run the receipts."
- `/app`: Functional backtesting dashboard.

Legacy public marketing paths such as `/product`, `/methodology`, `/about`, and `/brand` are no longer separate pages. The landing page now carries the workflow, methodology, asset-flexible DCA-vs-lump-sum comparison, and trust signals directly.

The dashboard preserves the full v1 workflow:

- Provider-routed asset search through a server-side API route: EODHD for stocks and CoinAPI for crypto.
- Historical daily prices with provider-specific price basis: EODHD uses adjusted close when every active row supports it, while CoinAPI crypto uses USD daily exchange-rate close.
- Custom CSV uploads with strict parsing feedback.
- Multi-asset and multi-strategy comparison.
- DCA, lump sum, and frequency variants.
- Equalized-capital comparison by default, with an explicit as-configured toggle.
- Transaction fees, cash drag on idle earmarked capital, and non-trading-day rollover to the next available price date.
- Simple mode by default: Asset setup, strategy editing, core decision readout, portfolio-value chart, run ranking, transactions, and core CSV / JSON / ZIP exports.
- Advanced mode for power users: Setup quality scoring, one-click strategy templates, compact / comfortable display density, scenario snapshots, methodology drawer, assumption-health checks, sensitivity stress previews, focused run inspection, chart modes, and chart annotation guide lines.
- Comparison charts, metrics, transaction schedules, keyboard shortcuts, mobile result navigation, and sanitized exports that avoid provider-label leakage outside the asset search dropdown.
- Deterministic mocked data for automated browser tests. Normal app runs do not silently fake market data.

## Brand System

QuantDCA uses one visual system across the public site and the `/app` dashboard: A clean Inter financial-analytics UI with canvas `#F7F8FA`, surface `#FFFFFF`, text `#11161D`, border `#E6E9EE`, accent `#2E63E6`, hover `#1F4FCC`, gain `#0E8A52`, and loss `#C8372F`.

Charts use `#2E63E6`, `#0E9D94`, `#C2790B`, `#7B5CF0`, `#D14D6B`, and `#5B6675`; the invested-capital reference line is dashed `#A2ABB8`. Figures, labels, axes, controls, and tables use Inter with tabular numerals.

The logo is the blue averaging staircase mark: Periodic equal buys stepping upward in white on the accent-blue field. The favicon is served from `public/assets/favicon.svg`.

There is no pricing page, account requirement, upgrade copy, trial copy, or upsell language. The product is completely free for the time being.

## Setup

Use Node 22.13 or newer, up to the current Node 24 line. CI uses Node 22, while the local v1 audit also verified Node 24.2.0. The repo includes `.nvmrc` and `.node-version` to select Node 22 by default, with `package.json` engine metadata enforcing the supported range.

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set the server-only provider keys:

```bash
EODHD_API_KEY=your_key_here
COINAPI_API_KEY=your_key_here
```

The frontend never receives provider keys. Do not create `VITE_` market-data key variables. Asset search and historical prices are requested through the local backend under `/api`.

Optional local and deployment overrides are documented in `.env.example`: `QDCA_API_PORT`, `QDCA_WEB_PORT`, `QDCA_MAX_REQUEST_BYTES`, `HOST`, `PORT`, `QDCA_USE_MOCK_DATA`, and `QDCA_RUN_LIVE_TESTS`. Server ports must be valid TCP ports from `1` through `65535`; request byte limits must be positive integers.

## Commands

```bash
npm run dev
npm start
npm run test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
npm run verify
npm run audit:prod
npm run hooks:install
```

`npm run dev` starts the API service on `127.0.0.1:8787` and the Vite app on `127.0.0.1:5173` by default. If the default API port is busy and `QDCA_API_PORT` is not explicitly set, the dev runner uses the next open localhost port and proxies Vite to it.

`npm start` runs the built production server from `dist-server/server/index.js`. Use it after `npm run build`. By default it binds to `127.0.0.1`; set `HOST=0.0.0.0` only in deployment environments that require public interface binding.

`npm run test:e2e` starts an isolated mock-data app on `127.0.0.1:5174` with its API on `127.0.0.1:8788` by default. Set `QDCA_WEB_PORT` / `QDCA_API_PORT` to run the browser tests on alternate ports. Playwright does not reuse an existing dev server, so browser tests remain deterministic and do not consume EODHD or CoinAPI quota.

`npm run verify` runs typecheck, lint, unit tests, production build, and deterministic e2e tests.

`npm run audit:prod` runs a production dependency audit. It requires npm registry network access.

Live provider smoke tests run only when `QDCA_RUN_LIVE_TESTS=1` and the corresponding provider key is present. `EODHD_API_KEY` enables the EODHD stock smoke test, and `COINAPI_API_KEY` enables the CoinAPI crypto smoke test.

`npm audit --omit=dev` is the underlying production dependency audit used by `npm run audit:prod`.

## Deployment

Deploy QuantDCA as the Node production server, not as a static-only Vite site. The server owns both the `/api` routes and the built frontend.

For Railway-style hosts, use:

```bash
npm run build
npm start
```

The production server listens on `PORT` when the platform provides it, then falls back to `QDCA_API_PORT`, then `8787` for local production previews. Keep `EODHD_API_KEY` and `COINAPI_API_KEY` configured server-side only.

Set these Railway variables:

```bash
HOST=0.0.0.0
EODHD_API_KEY=your_key_here
COINAPI_API_KEY=your_key_here
NODE_ENV=production
```

Do not set `PORT`; Railway provides it. Local production previews remain localhost-only unless you explicitly set `HOST`.

## Pre-Push Hooks

Install the active pre-push hook in each clone and each new Git worktree:

```bash
npm run hooks:install
```

The installer resolves the active hooks directory with:

```bash
git rev-parse --git-path hooks
```

Then it symlinks that worktree's active `pre-push` hook to the checked-in script at `scripts/git-hooks/pre-push`.

After that, `git push` runs the fast local gates:

- `npm run typecheck`
- `npm run lint`
- `npm run test`

To include heavier local safeguards before pushing, run:

```bash
PRE_PUSH_FULL=1 git push
```

`PRE_PUSH_FULL=1` adds:

- `npm run build`
- `npm run test:e2e`

You can also opt into individual heavier checks:

```bash
PRE_PUSH_BUILD=1 git push
PRE_PUSH_E2E=1 git push
PRE_PUSH_AUDIT=1 git push
```

For a lint-only / typecheck-only emergency path, run:

```bash
PRE_PUSH_SKIP_TESTS=1 git push
```

To bypass the hook intentionally:

```bash
SKIP_PRE_PUSH=1 git push
```

If a worktree already has a custom `pre-push` hook and you want QuantDCA to replace it:

```bash
npm run hooks:install -- --force
```

Use bypasses sparingly; CI still runs the full quality and e2e checks.

## GitHub Actions

The workflow lives at `.github/workflows/ci.yml` and runs on pull requests plus pushes to `main`.

It creates two required-quality surfaces:

- `Quality`: `npm ci`, typecheck, lint, unit tests, build, and production dependency audit.
- `E2E`: `npm ci`, Chromium install, deterministic Playwright browser tests, and Playwright artifact upload on failure.

Next steps for GitHub:

1. Push this repository to GitHub with `.github/workflows/ci.yml` committed.
2. Open the repository's Actions tab and confirm the first `CI` run starts.
3. In branch protection for `main`, require the `Quality` and `E2E` checks before merge.
4. Do not add `EODHD_API_KEY` or `COINAPI_API_KEY` as CI secrets unless you intentionally want live provider smoke tests to consume quota. Without those secrets, CI stays deterministic and uses mocked e2e data.

## Architecture

- `src/MarketingSite.tsx`: Minimal public landing page and shared brand mark.
- `src/Marketing.css`: Public Inter clean website visual system.
- `src/App.tsx`: Route switch plus functional dashboard UI at `/app`.
- `src/App.css`: Inter financial-dashboard visual system.
- `src/lib/backtest.ts`: Pure backtest engine and metrics.
- `src/lib/customCsv.ts`: Strict custom CSV parser.
- `src/server/providers/eodhd.ts`: EODHD provider with response normalization, validation, caching, and explicit error mapping.
- `src/server/providers/coinapi.ts`: CoinAPI provider for crypto metadata search and USD exchange-rate history using server-only credentials.
- `src/server/providers/routed.ts`: Provider router that sends stock assets to EODHD, crypto assets to CoinAPI, and lets custom CSV bypass external providers.
- `src/server/api.ts`: Request handlers for asset search and backtest execution.
- `src/server/static.ts`: Production static-file path and content-type helpers.
- `tests/e2e/dashboard.spec.ts`: Browser coverage for marketing navigation, search, configuration, comparison, chart modes, annotations, scenario snapshots, exports, CSV upload, errors, density, and mobile usability.

## Data Notes

Cash drag is modeled as annualized growth / decay on idle earmarked capital before each available price date, including gaps between the requested strategy start date and the first available market price. If cash drag reduces idle cash below a planned purchase, the executed buy is capped at available cash.

Equalized-capital mode uses the largest planned strategy contribution amount as the comparison budget, then scales each DCA strategy's scheduled contributions proportionally so its initial / recurring timing shape is preserved. Total return and CAGR use target capital as the denominator because final portfolio value includes both invested market value and remaining cash. Total invested remains the gross amount actually deployed into purchases, including fees. Average cost / unit is fee-inclusive.

Provider backtests accept up to 6 assets and 6 strategies per request. Provider-backed search results include a compact `dataProvider` label in the asset dropdown, while internal provider routing metadata keeps selected stocks on EODHD, selected crypto on CoinAPI, and same-ticker assets from different providers distinguishable without repeating provider labels throughout the dashboard or downloaded exports. The dashboard's Methodology drawer summarizes price basis, capital normalization, date rolling, and routing privacy in the app without exposing backend keys. Custom CSV uploads are limited to 20,000 price rows and API request bodies are capped at 2 MB by default through `QDCA_MAX_REQUEST_BYTES`.

Simple / Advanced mode and display density are saved in the browser's local storage. Scenario snapshots are also saved locally. Copied scenario links restore the setup in the same browser profile and do not upload custom CSV data or saved strategies to a remote account. Exported JSON intentionally omits provider credentials and internal routing metadata; exported assets contain public asset fields only.

Advanced mode's Sensitivity Lens is a deterministic stress preview derived from the current result paths. It adjusts final-value rankings for contribution scale, added per-buy fees, idle-cash drag, and start-window uncertainty so users can see whether the current winner appears robust before running a more exact follow-up scenario.

Custom CSV uploads require row 1 titles, column A valid `YYYY-MM-DD` calendar dates, and column B positive USD prices. Extra columns are ignored.

QuantDCA is for research and education, not investment advice. Past performance is not indicative of future results.

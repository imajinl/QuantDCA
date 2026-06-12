# QuantDCA

QuantDCA is a free, Ledger-styled financial analytics product for comparing dollar-cost-averaging strategies against lump sum and other contribution schedules. The public website introduces the product, methodology, and brand system; the working dashboard lives at `/app`.

The product promise is simple: Replay real market history, compare strategies on equal capital, model fees and cash drag, and export every result.

## Product Surface

The Vite app serves both the public site and the backtesting dashboard:

- `/`: Ledger landing page — "Would DCA Have Beaten Lump Sum? Find Out Exactly."
- `/product`: Product overview and workflow.
- `/methodology`: Data, engine, metrics, and limits.
- `/about`: Evidence-first manifesto.
- `/brand`: Ledger brand system and visual tokens.
- `/app`: Functional backtesting dashboard.

The dashboard preserves the full v1 workflow:

- EODHD-backed asset search through a server-side API route.
- Historical daily prices using adjusted close when available.
- Custom CSV uploads with strict parsing feedback.
- Multi-asset and multi-strategy comparison.
- DCA, lump sum, and frequency variants.
- Equalized-capital comparison by default, with an explicit as-configured toggle.
- Transaction fees, cash drag on idle earmarked capital, and non-trading-day rollover to the next available price date.
- Comparison charts, metrics, transaction schedules, and CSV / JSON exports.
- Deterministic mocked data for automated browser tests. Normal app runs do not silently fake market data.

## Brand System

QuantDCA uses the Ledger identity:

- Warm paper canvas: `#F4F2EB`
- Near-black green ink: `#15201C`
- One teal signal: `#0E6F66`
- Brass only for the second chart series: `#9C6B1B`
- Graphite dashed invested-capital line: `#A6A89A`
- Source Serif 4 for headlines and large metrics.
- Archivo for body text and controls.
- Spline Sans Mono for labels, tickers, parameters, and tabular figures.

The logo is the averaging staircase mark: periodic equal buys stepping upward, with a teal dot at the crossing. The favicon is served from `public/assets/favicon.svg`.

There is no pricing page, account requirement, upgrade copy, trial copy, or upsell language. The product is completely free for the time being.

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env
```

Set the server-only EODHD key:

```bash
EODHD_API_KEY=your_key_here
```

The frontend never receives the API key. Asset search and historical prices are requested through the local backend under `/api`.

## Commands

```bash
npm run dev
npm run test
npm run typecheck
npm run lint
npm run test:e2e
npm run build
npm run verify
npm run audit:prod
npm run hooks:install
```

`npm run dev` starts the API service on `127.0.0.1:8787` and the Vite app on `127.0.0.1:5173`.

`npm run test:e2e` starts the same app with `QDCA_USE_MOCK_DATA=true`, so Playwright remains deterministic and does not consume EODHD quota.

`npm run verify` runs typecheck, lint, unit tests, production build, and deterministic e2e tests.

`npm run audit:prod` runs a production dependency audit. It requires npm registry network access.

An optional live provider smoke test runs only when `EODHD_API_KEY` is present.

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
4. Do not add `EODHD_API_KEY` as a CI secret unless you intentionally want the live provider smoke test to consume quota. Without the secret, CI stays deterministic and uses mocked e2e data.

## Architecture

- `src/MarketingSite.tsx`: Public Ledger website pages and shared brand mark.
- `src/Marketing.css`: Ledger website visual system.
- `src/App.tsx`: Route switch plus functional dashboard UI at `/app`.
- `src/App.css`: Ledger-styled dashboard visual system.
- `src/lib/backtest.ts`: Pure backtest engine and metrics.
- `src/lib/customCsv.ts`: Strict custom CSV parser.
- `src/server/providers/eodhd.ts`: EODHD provider with response normalization, validation, caching, and explicit error mapping.
- `src/server/api.ts`: Request handlers for asset search and backtest execution.
- `tests/e2e/dashboard.spec.ts`: Browser coverage for marketing navigation, search, configuration, comparison, charts, exports, CSV upload, errors, and mobile usability.

## Data Notes

Cash drag is modeled as annualized growth / decay on idle earmarked capital before each available price date. Equalized-capital mode uses the largest planned strategy contribution amount as the comparison budget, then allocates that capital across each strategy's schedule.

Custom CSV uploads require row 1 titles, column A dates beginning with `YYYY-MM-DD`, and column B positive USD prices. Extra columns are ignored.

QuantDCA is for research and education, not investment advice. Past performance is not indicative of future results.

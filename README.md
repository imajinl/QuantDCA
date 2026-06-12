# QuantDCA

QuantDCA is a minimalist TypeScript dashboard for backtesting dollar-cost averaging strategies with EODHD market data. The first screen is the product: asset search, strategy configuration, backtest execution, charts, comparison tables, and transaction schedules.

## Scope

The v1 supports:

- EODHD-backed asset search through a server-side API route.
- Historical daily price retrieval using adjusted close when available.
- Multi-asset and multi-strategy comparison.
- Standard DCA, lump sum, and DCA variants by frequency and contribution amount.
- Equalized capital comparison by default, with an explicit UI toggle for as-configured comparisons.
- Transaction fees, cash drag on idle earmarked capital, non-trading-day rollover to the next available price date, and pure calculation logic independent from UI / API code.
- Deterministic mocked data for automated browser tests. Normal app runs do not silently fake market data.

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
```

`npm run dev` starts the API service on `127.0.0.1:8787` and the Vite app on `127.0.0.1:5173`.

`npm run test:e2e` starts the same app with `QDCA_USE_MOCK_DATA=true`, so Playwright remains deterministic and does not consume EODHD quota.

`npm run verify` runs typecheck, lint, unit tests, production build, and deterministic e2e tests.

`npm run audit:prod` runs a production dependency audit. It requires npm registry network access.

An optional live provider smoke test runs only when `EODHD_API_KEY` is present.

## Pre-Push Hooks

Install the repository hook path once per clone:

```bash
npm run hooks:install
```

After that, `git push` runs:

- `npm run typecheck`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run test:e2e`

For a faster local iteration push, run:

```bash
PRE_PUSH_QUICK=1 git push
```

For an additional local production dependency audit before pushing, run:

```bash
PRE_PUSH_AUDIT=1 git push
```

To bypass the hook intentionally:

```bash
SKIP_PRE_PUSH=1 git push
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

- `src/lib/backtest.ts`: Pure backtest engine and metrics.
- `src/server/providers/eodhd.ts`: EODHD provider with response normalization, validation, caching, and explicit error mapping.
- `src/server/api.ts`: Request handlers for asset search and backtest execution.
- `src/App.tsx`: Dashboard UI.
- `tests/e2e/dashboard.spec.ts`: Browser coverage for search, configuration, comparison, charts, errors, and mobile usability.

## Notes

Cash drag is modeled as annualized growth / decay on idle earmarked capital before each available price date. Equalized-capital mode uses the largest planned strategy contribution amount as the comparison budget, then allocates that capital across each strategy's schedule.

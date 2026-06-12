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
```

`npm run dev` starts the API service on `127.0.0.1:8787` and the Vite app on `127.0.0.1:5173`.

`npm run test:e2e` starts the same app with `QDCA_USE_MOCK_DATA=true`, so Playwright remains deterministic and does not consume EODHD quota.

An optional live provider smoke test runs only when `EODHD_API_KEY` is present.

## Architecture

- `src/lib/backtest.ts`: Pure backtest engine and metrics.
- `src/server/providers/eodhd.ts`: EODHD provider with response normalization, validation, caching, and explicit error mapping.
- `src/server/api.ts`: Request handlers for asset search and backtest execution.
- `src/App.tsx`: Dashboard UI.
- `tests/e2e/dashboard.spec.ts`: Browser coverage for search, configuration, comparison, charts, errors, and mobile usability.

## Notes

Cash drag is modeled as annualized growth / decay on idle earmarked capital before each available price date. Equalized-capital mode uses the largest planned strategy contribution amount as the comparison budget, then allocates that capital across each strategy's schedule.

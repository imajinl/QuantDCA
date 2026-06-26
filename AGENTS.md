# Project Lessons

- Use info / question-mark buttons judiciously. Keep them for non-obvious assumptions, methodology, data-source boundaries, and finance terms that affect interpretation; do not attach them to every heading, obvious form label, table column, or button.
- For QuantDCA, the product surface should feel like a clean financial dashboard. Favor visible trust signals, precise labels, and compact explanatory copy over dense tooltip decoration.
- Whenever a new Git worktree is created for this project, run `npm run hooks:install` inside that worktree so its active `pre-push` hook symlinks to the checked-in hook script.
- Keep the primary product CTA consistent as "Run Backtests"; do not add a public changelog route or nav item unless explicitly requested.
- Frontend API calls must guard against HTML / non-JSON responses and show a specific backend-routing message instead of raw parser errors like `Unexpected token '<'`.
- When using `font-synthesis: none`, loaded web-font weight ranges must cover every declared CSS `font-weight`; prefer Google Fonts variable range syntax when dashboard typography uses nonstandard weights.
- Server listen hosts must default to localhost for local safety. Public binding such as `HOST=0.0.0.0` should be an explicit deployment setting, not the fallback default.
- Marketing copy should describe QuantDCA as asset-flexible: Provider search plus custom CSV. Treat S&P 500 as, at most, an example — never as the product scope.
- Provider identity should be visible only in the asset-search dropdown unless explicitly requested elsewhere; keep routing metadata internal and avoid repeating EODHD / CoinAPI labels across chips, results, errors, charts, and exports.
- Keep chart annotations visually quiet. Guide lines and markers can stay in the plot, but labels such as max drawdown or break-even should live in legends, hover titles, or accessible control names rather than as text printed inside the chart.
- Default dashboard experience should favor Simple mode for core setup, results, transactions, and exports; keep scenario tools, sensitivity, chart modes, density, templates, and methodology in Advanced mode unless explicitly requested otherwise.

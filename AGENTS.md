# Project Lessons

- Use info / question-mark buttons judiciously. Keep them for non-obvious assumptions, methodology, data-source boundaries, and finance terms that affect interpretation; do not attach them to every heading, obvious form label, table column, or button.
- For QuantDCA, the product surface should feel like a clean financial dashboard. Favor visible trust signals, precise labels, and compact explanatory copy over dense tooltip decoration.
- Whenever a new Git worktree is created for this project, run `npm run hooks:install` inside that worktree so its active `pre-push` hook symlinks to the checked-in hook script.
- Keep the primary product CTA consistent as "Run Backtests"; do not add a public changelog route or nav item unless explicitly requested.

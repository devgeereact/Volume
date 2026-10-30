# Audit record

One audit file for this project. Every audit, check or review adds a dated section at the top; nothing is rewritten. Open work lives in `.agent/CURRENT-TASK.md`.

## 30 October 2026: automatic deploy and docs tidy

- Scope: the new `deploy.yml` (runs `npm run deploy` after "Check Volume" passes on `main`) and the docs layout.
- Evidence: Check Volume run 41116467668 passed (Linux, macOS, Node 24 + MariaDB host job); Deploy run 41118270156 released `8fc47e4` as `releases/20261030T194912Z` (health 200, sign-in enforced, migrations up to date). `KNOWN-ISSUES.md` moved to `docs/`; docs check passes.
- Result: PASS.

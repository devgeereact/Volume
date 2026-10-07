# Integrations

| Service | Current purpose | Boundary and prerequisite |
| --- | --- | --- |
| OpenRouter | Text, model registry, optional research/images | Server only; key is never returned to the web app; live generation needs separate budget/scope. |
| SQLite | Default local persistence | Native better-sqlite3 restored per OS; no system DB daemon needed. |
| MySQL | Optional cPanel target | Existing configuration, TLS and migrations; external acceptance deferred by owner. |
| Chromium/Playwright | PDF/cover rendering and browser tests | Install the pinned browser using the project setup command. Linux system libraries may need administrator provisioning. |
| Local fonts | Interface and book output | Existing assets/fonts and Fontsource dependencies with licences preserved. |

No Redis service or remote queue is required. Jobs and SSE are hosted in the existing API process. No new email, payment, analytics or notification provider is added by this migration.

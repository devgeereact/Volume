# Integrations

| Service | Current purpose | Boundary and prerequisite |
| --- | --- | --- |
| OpenRouter | Text, model registry, optional research/images | Server only; key is never returned to the web app; live generation needs separate budget/scope. |
| Clerk | Hosted sign-in (D-039) | `@clerk/react` in the web app (publishable key only), `@clerk/backend` on the server (secret key, optional JWT key). Application "Volume", created and configured by the lead. Not used with `AUTH_MODE=local`. |
| MariaDB (cPanel, localhost) | Production database (D-038) | mysql2 over localhost or a socket; runtime and migration users; TLS off on localhost. Backups by cPanel. |
| SQLite | Development persistence | better-sqlite3, a development dependency loaded only when `DB_CLIENT=sqlite`. Not installed on the host. |
| Passenger (CloudLinux Node.js selector) | Runs the app on the host, Node 24.21 | Startup file `app.cjs`; may stop an idle app, so a cron keep-alive hits `/api/health`. |
| Cloudflare | Proxy, TLS (Full strict) in front of the host | Visitor IP from `CF-Connecting-IP`; the docroot `.htaccess` refuses requests without `CF-RAY`. |
| Chromium/Playwright | PDF/cover rendering and browser tests | Host: chromium-headless-shell 1243 in `PLAYWRIGHT_BROWSERS_PATH`, two extra libraries in `CHROMIUM_LD_LIBRARY_PATH`. Locally: the project setup command. |
| Local fonts | Interface and book output | Existing assets/fonts and Fontsource dependencies with licences preserved. |

No Redis service or remote queue is required. Jobs and SSE are hosted in the server process. No Netlify, Supabase, email, payment, analytics or notification provider is used.

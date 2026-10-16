# Deployment

Volume runs on the owner's cPanel account as one CloudLinux Passenger Node.js app at https://volume.gakinz.com (D-037, D-038, D-039). Development stays local (see [development](DEVELOPMENT.md)). Deploys are done by hand by the lead agent with the owner's approval; nothing in this repository deploys by itself.

## Shape

| Piece | Where |
| --- | --- |
| Release folders | `~/apps/volume/releases/<utc>/` (one per deploy, built on the Mac) |
| Live release | `~/apps/volume/current` (symlink to one release) |
| Settings | `~/apps/volume/shared/.env` (mode 600), names in [.env.example](../../.env.example) |
| Backups folder | `~/apps/volume/shared/data` (`DATA_DIR`; SQLite backups only, MySQL uses cPanel backups) |
| Chromium | `~/apps/volume/shared/browsers` (`PLAYWRIGHT_BROWSERS_PATH`, chromium-headless-shell 1243) |
| Extra Chromium libraries | `~/apps/volume/shared/chromium-libs` (`CHROMIUM_LD_LIBRARY_PATH`: `libatspi.so.0`, `libatk-bridge-2.0.so.0`) |
| Docroot | `~/volume.gakinz.com/` holds only `.htaccess` (Cloudflare origin lock, then the selector's Passenger block) |
| Database | MariaDB on localhost: one database, a runtime user and a migration user |

Fastify answers everything: the built web app (files and the SPA fallback), `/api/v1/*` behind Clerk, and the public `GET /api/health`.

## Passenger settings (cPanel, Setup Node.js App)

| Setting | Value |
| --- | --- |
| Node.js version | 24.21.0 |
| Application mode | Production |
| Application root | `apps/volume/current` |
| Application URL | `volume.gakinz.com` (domain root) |
| Application startup file | `app.cjs` |
| Environment variables | `NODE_ENV=production`, `VOLUME_ENV_FILE=/home/devgeereact/apps/volume/shared/.env` (every other setting lives in that file) |

`app.cjs` loads that file before the server starts (Playwright reads `PLAYWRIGHT_BROWSERS_PATH` at import), and path settings may start with `~/`. Values set in the selector win over the file. `CLERK_PUBLISHABLE_KEY` on the server must be the same key the web build used; the server decodes its Frontend API host (`clerk.volume.gakinz.com`) for the Content Security Policy.

Do not press "Run NPM Install" in the selector: each release installs its own `node_modules` with `npm ci`. Restart with `touch ~/apps/volume/current/tmp/restart.txt` (or `cloudlinux-selector restart --json --interpreter nodejs --app-root apps/volume/current`).

## Build on the Mac

```sh
git pull --ff-only
VITE_CLERK_PUBLISHABLE_KEY=<pk_live_...> npm run build:release -- --require-clerk
```

The output is `build/release/`: `app.cjs`, `server/` (one esbuild bundle plus `migrate.mjs`), `web/`, `config/`, `prompts/`, `assets/`, `tmp/restart.txt`, `RELEASE.json` and a `package.json` with a lockfile pruned from the repository's own (no better-sqlite3, no dev tools). The publishable key is public; no secret enters the bundle.

## Deploy steps (lead agent, approved per deploy)

1. Rsync `build/release/` to `~/apps/volume/releases/<utc>/`.
2. On the host, inside that folder, with Node 24 (`source ~/nodevenv/apps/volume/current/24/bin/activate` or the alt-nodejs24 binary): `npm ci --omit=dev --no-audit --no-fund`.
3. Link shared config: `ln -s ../../shared/.env .env` (optional when `VOLUME_ENV_FILE` is set).
4. Back up the database (cPanel Backup or `mariadb-dump --defaults-file=<private temp file>`), then migrate as the migration user: `node server/migrate.mjs status`, then `node server/migrate.mjs`. The app refuses to start while migrations are pending.
5. Flip the link: `ln -sfn releases/<utc> ~/apps/volume/current`, then `touch ~/apps/volume/current/tmp/restart.txt`.
6. Run the post-deploy checks below. Rollback: point `current` back at the previous release and touch `tmp/restart.txt`. Migrations are additive, so the previous release still runs on the newer schema.

## One-off host steps

- Create the database and two users in cPanel MySQL Databases: runtime user with SELECT, INSERT, UPDATE, DELETE; migration user with those plus CREATE, ALTER, INDEX, DROP, REFERENCES. Passwords are generated on the server and typed into `shared/.env` only.
- Install chromium-headless-shell 1243 into `~/apps/volume/shared/browsers` and the two libraries into `~/apps/volume/shared/chromium-libs`.
- Docroot `.htaccess`: start with the Cloudflare origin-lock block exactly as given in [deploy/htaccess.volume](../../deploy/htaccess.volume); the Node.js selector adds its own Passenger block after it.
- Keep-alive cron (cPanel Cron Jobs), so Passenger does not stop the app while AI jobs run in the background:

  ```
  */4 * * * * curl -fsS -o /dev/null https://volume.gakinz.com/api/health
  ```

- First run only, to bring the owner's local library across (on the Mac, before the hosted app has started once, through an SSH tunnel such as `ssh -N -L 3307:localhost:3306 devgeereact@premium17.web-hosting.com`):

  ```sh
  MYSQL_HOST=127.0.0.1 MYSQL_PORT=3307 MYSQL_DATABASE=<db> MYSQL_USER=<runtime user> \
  MYSQL_MIGRATE_USER=<migration user> MYSQL_MIGRATE_PASSWORD=<typed at the prompt or exported> \
  npm run db:copy-to-mysql -w apps/server -- --from data/volume.sqlite
  ```

  It opens the SQLite file read-only, migrates MySQL, refuses a non-empty target (unless `--replace`), copies every table and compares row counts. It prints table names and counts only. Owner approval needed; not run by any agent.

## Post-deploy checks

| URL | Expected |
| --- | --- |
| `https://volume.gakinz.com/api/health` | 200, body exactly `{"status":"ok"}` |
| `https://volume.gakinz.com/api/v1/books` (no sign-in) | 401, `{"error":{"code":"unauthorized",...}}` |
| `https://volume.gakinz.com/` | 200 HTML, `Content-Security-Policy` and `Strict-Transport-Security` headers, Clerk sign-in shown |
| Same, signed in as the owner | Library loads with the owner's books; Settings shows MySQL |
| Same, signed in as anyone else | "This account is not allowed" (API answers 403) |
| Origin IP directly, without Cloudflare | 403 from the origin lock |
| Export a short book to PDF | PDF downloads (proves Chromium and the libraries) |

## What the server enforces in production

`NODE_ENV=production` requires `APP_ORIGIN`, `AUTH_MODE=clerk` (local is refused), `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and an allowlist (`OWNER_EMAILS` or `CLERK_ALLOWED_USER_IDS`). It answers only the `ALLOWED_HOSTS` (default: the `APP_ORIGIN` host), refuses writes from other origins, trusts the proxy and takes the visitor IP from `CF-Connecting-IP`, rate limits per IP (reads, writes and the health check separately) and never returns stack traces.

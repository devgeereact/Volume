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

Do not press "Run NPM Install" in the selector: each release installs its own `node_modules` with `npm ci`. The web server is LiteSpeed: its `lsnode` process resolves `current` to a release folder when it starts and does not restart on `tmp/restart.txt` after the link moves (seen 18 October 2026). `cloudlinux-selector restart` also fails, because it looks for a Node environment named after the release folder. To restart, stop the `lsnode` process (`ps -ef | grep lsnode`, then `kill <pid>`); LiteSpeed starts a new one on the next request. The docroot `.htaccess` points `PassengerNodejs` at `~/nodevenv/apps/volume/releases/20261016T224127Z/24/bin/node`, so keep that folder. That path is CloudLinux's `node_wrapper`, which loads the selector's environment from its own folder, so the line stays as the selector wrote it; `npm run deploy` refuses to run when the binary it names is missing.

## Build on the Mac

```sh
git pull --ff-only
VITE_CLERK_PUBLISHABLE_KEY=<pk_live_...> npm run build:release -- --require-clerk
```

The output is `build/release/`: `app.cjs`, `server/` (one esbuild bundle plus `migrate.mjs`), `web/`, `config/`, `prompts/`, `assets/`, `tmp/restart.txt`, `RELEASE.json` and a `package.json` with a lockfile pruned from the repository's own (no better-sqlite3, no dev tools). The publishable key is public; no secret enters the bundle.

## Deploy (one command, from the Mac)

`npm run deploy` (`scripts/deploy.mjs`, host facts in `deploy/production.json`) runs every step below and checks the result. Run it on `main`, clean and pushed, after CI on that commit has passed.

| Command | Does |
| --- | --- |
| `npm run deploy -- --dry-run` | Reads the host and runs the preflight; changes nothing. |
| `npm run deploy` | Builds, uploads to `releases/<utc>`, installs with Node 24, links the shared settings file, checks migrations, switches `current`, restarts and runs the live checks. A failed check switches back to the previous release by itself. |
| `npm run deploy -- --migrate` | Same, and applies pending migrations. Without it the script stops before going live when any are pending. Take the cPanel database backup first. |
| `npm run deploy -- --rollback` | Switches `current` to the release before it and restarts. |
| `--no-ci-check` | Skips the CI check (use only when GitHub Actions cannot run). |

It never deletes a release and never reads or copies the settings file (the link is a symlink). The steps it runs, for doing them by hand:

1. Rsync `build/release/` to `~/apps/volume/releases/<utc>/`.
2. On the host, inside that folder, with Node 24 (`export PATH=/opt/alt/alt-nodejs24/root/usr/bin:$PATH`; there is no `~/nodevenv/apps/volume/current`): `npm ci --omit=dev --no-audit --no-fund`.
3. Link shared config into the release: a symlink named after the settings file pointing at `../../shared/` (the app also finds it through `VOLUME_ENV_FILE`).
4. Back up the database (cPanel Backup or `mariadb-dump --defaults-file=<private temp file> --single-transaction --no-tablespaces`, run with `set -o pipefail` so a failed dump stops the step; the migration user has no `LOCK TABLES` grant), then migrate as the migration user: `node server/migrate.mjs status` (exit 2 means pending), then `node server/migrate.mjs`. The app refuses to start while migrations are pending.
5. Flip the link: `ln -sfn releases/<utc> ~/apps/volume/current`, then stop the running `lsnode` process (see Passenger settings above). Confirm the page loads the new `/assets/index-*.js` from `build/release/web/index.html`.
6. Run the post-deploy checks below. Rollback: point `current` back at the previous release and stop the `lsnode` process. Migrations are additive, so the previous release still runs on the newer schema.

Migration order: `0006_picture_books`, `0008_volume_mode` and `0009_invitations` ship together in one release (`0007` is reserved and not shipped). Production has none of them yet, so step 4 applies them in order. Kysely refuses a migration older than one already applied, and unordered migrations stay off on purpose: a development database that applied `0008` or `0009` before `0006` existed will not take `0006`. Recreate that local database (or restore one taken before `0008`); never edit the migration table by hand. `apps/server/test/migrations.test.ts` checks that a fresh SQLite database applies `0001` to `0009` in order and that every migration compiles for MySQL.

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

## Moving a book from the Mac to the hosted app

Once the hosted app holds books, never copy the database again (`db:copy-to-mysql --replace` wipes the host). Move one book at a time by project zip (D-051):

1. On the Mac, open the book and choose Export project. Volume saves `<title>.volume-project.zip` (a manifest with checksums, the book's rows and its files; never the legal name, location, jobs, AI call records or spend).
2. On https://volume.gakinz.com, signed in as the owner or an editor, choose Import project in Settings or the Library, pick the pen name the book should belong to, and choose the zip.
3. The hosted app checks the zip and makes a new book with new ids under that pen name, marked "Moved from another Volume on <date>". Nothing that is already there changes. Build export files (PDF, EPUB, pack) again on the host.

The zip must be under `MAX_UPLOAD_BYTES` (50 MB unless set), and the expanded files under 160 MB. Imports are limited to 5 per minute per visitor. API: `POST /api/v1/books/import-project`, multipart/form-data with `profileId` and `file`.

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

### Accounts setting (D-047)

| Setting | Values | Default | Effect |
| --- | --- | --- | --- |
| `ACCOUNTS_MODE` | `owner-only`, `invite` | `owner-only` | `owner-only`: only the allowlist (`OWNER_EMAILS`, `CLERK_ALLOWED_USER_IDS`, the owner's own accounts) signs in, as today. `invite`: the owner can also invite an email address as editor or viewer of their workspace, or as a separate self-publisher with a new workspace. An invited account is matched on a verified Clerk email, so `CLERK_SECRET_KEY` must be set. Set back to `owner-only` to shut every invited account out on its next request. |
| `budget.guest_workspaces_monthly_cap_usd` (in-app setting, not an env name) | 0 to 100000 (US dollars) | `0` | Monthly AI spend allowed to each workspace other than the instance owner's, on the instance owner's OpenRouter key. `0` refuses their AI and image runs (`guest_ai_disabled`). Only the instance owner sets it, in Settings (`PATCH /api/v1/settings`). |

Migration `0009_invitations` adds the `invitations` table. It needs the owner's approval and a backup like any production migration, and must ship together with `0006` to `0008` (Kysely refuses migrations applied out of order).

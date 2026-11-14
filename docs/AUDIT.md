# Audit record

One audit file for this project. Every audit, check or review adds a dated section at the top; nothing is rewritten. Open work lives in `.agent/CURRENT-TASK.md`.

## 14 November 2026: house-standard rollout, stages 0 to 3 (Ubuntu)

Branch `chore/house-standard` from `main` `9850698`. Nothing pushed, merged or deployed.

| Check | Result | Evidence |
|---|---|---|
| Tree and sync | PASS | `main` equals `origin/main`, clean, no stashes, no extra worktrees, one local branch |
| Backup | PASS | `~/Backups/projects/Volume/Volume-20261113-2352.bundle`, `git bundle verify` ok; `.local-state/backups` linked |
| CI on `main` head | PASS | "Check Volume" run 43518906300 green (node24-host, ubuntu, macos); Deploy run 43521018610 green, same commit |
| Remote branches | LISTED | `docs/record-release-20261109`, `feat/v0-base-and-covers`, `fix/claims-honest-results`, `fix/e2e-title-set-race`: all merged, left for the owner |
| Tailwind v4 | PASS | 4.3.3 through the Vite plugin; no config or PostCSS file; `.flex` present in the built CSS. Latest is 4.3.5, not bumped (needs a green gate) |
| Stale docs | FIXED | `--no-ci-check` wording, "draft" plan label |
| `npm run verify`, stage by stage on this branch | PARTIAL | doctor, docs:check (99 documents), typecheck, lint, format:check PASS; unit tests 594 passed, 3 skipped; web tests 284 passed; build:release PASS; e2e 20 passed (4.9 min). `test:tooling` 12 of 13 pass |
| `test:tooling` "standalone dev starts from another cwd" | FAIL under load, twice on `main` and once more later | the API was not up within 16 s while the load average was 25 to 38 on 8 cores (other Claude sessions). Green in CI on the same commit. Not re-proved: re-run on a quiet machine or on the Mac |

## 8 November 2026 (late night): sign-in 404, and the go-live deploy rolled back by its own live check

Two production findings, both found by the owner or by the deploy, both fixed test first.

| Finding | Cause | Evidence | Status |
|---|---|---|---|
| Clicking Sign in on the landing page showed "Page not found" at `/sign-in` (reload worked) | `apps/web/src/site/PublicSite.tsx` chose its screen in a lazy route that read `window.location.pathname`; React Router changes the address only after a navigation completes (`history.push` inside `completeNavigation`), so a click at `/` was judged `/`. Introduced 25 October (`d950900`). | 4 of 5 new tests failed with the symptom, then passed; web tests 44 files / 272 tests; a real browser on a production-style local build showed the sign-in screen after the click; live public GETs of `/sign-in` were always 200 | Fixed in PR #92 (`a803d17`), live as release `20261108T230459Z`, owner confirmed |
| The release with the go-live security fixes failed its deploy and rolled back | `scripts/deploy.mjs` required "noindex" on `/`, but D-068 makes `/` indexable. The check ran only at deploy time, so CI could not see it. | Deploy run 42535571560: "Live checks failed: page has no noindex meta", then "rolled back to 20261108T230459Z"; the site stayed healthy | Fix `11c2f59` on `fix/deploy-live-check-robots` (not pushed): sign-in must be noindex, landing page must carry a robots meta. PR #91 (`015d266`) is on `main` but not live. |

**Second deploy (9 November 2026).** PR #93 (`4b00fd2`) corrected the live check; CI green; Deploy run 42538480840 succeeded and the go-live security release is live as `20261109T000812Z`. Public GETs after the deploy: `/` and `/how-it-works` `index, follow`; `/sign-in` and `/library` `noindex, nofollow`; sitemap lists only the two public pages; `/api/v1/books` 401 signed out; `X-Powered-By` absent; `X-Turbo-Charged-By` still sent until the owner adds the `.htaccess` lines. The live `robots.txt` is Cloudflare's managed block (`User-agent: *`, `Allow: /`, AI-crawler blocks) followed by Volume's allow-list and the sitemap line, so private pages rely on their `noindex` meta tag and header, not on `robots.txt`. NOT TESTED: `CLOUDFLARE_ONLY`, the PDF export on the host, a signed-in session, Search Console.

**Third deploy (9 November 2026).** PR #94 (`3e18b1f`): the claim and house-style fixes. CI green on both runs; Deploy run 42543707096 succeeded as release `20261109T010629Z`. Public GETs after the deploy: `/` `index, follow`, `/sign-in` `noindex, nofollow`, `/api/health` 200, `/api/v1/books` 401 signed out. NOT TESTED: the fixes in a signed-in session on the live site.

The red CI job on Ubuntu and node24-host in `packages/export/test/cover-layers.test.ts` ("Unable to capture screenshot") failed 4 times and passed on each re-run: a flaky headless browser, not a layout fault. It once stopped a deploy (the Deploy workflow skipped).

Live site checks I ran (public GETs only): `/`, `/sign-in`, `/library`, `/how-it-works` and `/api/health` answered 200; `/sign-up`, `/sso-callback`, `/login` and `/signin` answered 404 (unrelated to the click bug, noted only).

## 8 November 2026: Phase 1 verification of `golive/2026-11`

Read-only checks of the go-live branch before any merge. Work branch `phase-1/evidence` (from `golive/2026-11` at `8be0057`); `main` is at `b86c9e3`. Nothing was pushed, merged, deployed or changed on the host, Clerk, Cloudflare or any database. The only database used was a throwaway local MariaDB 11.4.13, started and removed during the check.

| Check | Command | Result |
|---|---|---|
| Whole chain | `npm run verify` | PASS, exit 0, 4 min 43 s |
| Environment | `npm run doctor` (Node 26.10.0, native modules, pinned Chromium) | PASS |
| Docs links | `npm run docs:check` | PASS, 98 documents; 10 links into `../reports/volume` skipped on purpose |
| Typecheck, lint, format | inside `verify` | PASS |
| Unit tests with coverage thresholds | core 19 files / 210 tests; ai 23 / 268; export 27 / 251 (1 skipped); server 60 files / 584 tests (1 file and 3 tests skipped) | PASS |
| Web unit tests | `npm run test -w apps/web` | PASS, 43 files / 267 tests |
| Web build | `vite build` inside `verify` | PASS |
| End to end | `tests/e2e/run.mjs` | PASS, 20 of 20 in 2.3 min |
| MariaDB 11.4.13 | `mysql` and `migrations` test files with `MYSQL_TEST_URL` on a throwaway instance | PASS, 2 files / 11 tests, the MySQL test ran (not skipped) |
| CI on the branch, first push (`4aee76b`) | "Check Volume" | FAIL: `checks (ubuntu-latest)` and `checks (macos-latest)` passed, `node24-host` failed at "Release folder installs without dev dependencies and boots on MariaDB" (run 42457594379) |
| CI after the fix (`862a5a1`, includes `2c500a1`) | "Check Volume" | PASS: `checks (ubuntu-latest)`, `checks (macos-latest)` and `node24-host` all succeeded (run 42461054566); the Deploy workflow did not run for the branch |
| Live site, Clerk sign-in, PDF export on the host | | NOT TESTED (after the deploy, with the owner) |

**Finding 1, found by CI and caused by this branch.** `npm run build:release` stopped with "docx is not installed. Run npm run setup first." On `main` the lockfile hoists `docx` 9.8.1 to `node_modules/docx`; on this branch the same version sits at `packages/export/node_modules/docx`, and `scripts/build-release.mjs` looked only in the root. `main`'s `node24-host` job passed at `138aaf0`, so this is new. Local `verify` could not see it because it never runs `build:release`. Fixed in `2c500a1` with a test written first (four cases; the two nested-layout cases failed with CI's own message, then passed): `scripts/installed-version.mjs` checks the workspace's own `node_modules` first, then the root. `npm run build:release` now exits 0 locally and pins `docx` 9.8.1. `test:tooling` now runs every `tests/integration/*.test.mjs` so CI runs the new test. Without this fix "Check Volume" would fail on `main`, so the automatic deploy would never have started.

**Finding 2.** `npm run verify` does not run the 43 web unit-test files, because `apps/web` has a `test` script but no `test:coverage` script. They were run separately above. Suggested for a later phase: include them, and `build:release`, in `verify` so this class of failure shows locally. Not changed here.

**Flaky run, not a code failure.** One `npm run verify` on `680d710` (started 08:12) failed 8 of 20 e2e tests with element waits timing out, after 41 minutes. The Mac entered Maintenance Sleep at 08:53 during it and its load average was about 13 (other applications). Unit and tooling stages passed. The same commit passed on the next run (09:10 to 09:14, exit 0, 20 of 20 e2e in 2.4 min), as did `4aee76b`, `862a5a1` and CI on clean runners. The e2e suite is timing-sensitive: run it with the Mac awake and quiet.

**Notes.** The first MariaDB attempt failed because macOS limits unix socket paths to about 103 characters; the socket now sits in the short OS temp directory. The branch adds no migration, so no database backup or `--migrate` is needed to deploy it. Merging to `main` starts the automatic deploy (`deploy.yml`), so the owner's go on the merge is the deploy approval.

## 1 November 2026 (evening): open findings fixed and the go-live checklist

Branch `golive/2026-11`, after the audit below. Every finding the code alone can close is fixed with a test written first (red, then green). Nothing was pushed, deployed or changed on the host, Clerk, OpenRouter, Cloudflare or GitHub.

**Fixed**

| # | Fix | Test |
|---|---|---|
| M1 | A hosted build (an `https` `APP_ORIGIN`, or MySQL) uses Clerk unless `AUTH_MODE=local` is set on purpose, whatever `NODE_ENV` says; missing Clerk keys stop the start instead of opening the stub (`apps/server/src/config/env.ts`). Local MySQL drills now need `AUTH_MODE=local` written out (SETUP.md). | `hosting.test.ts` "fail closed on a hosted build" |
| M2 | Models are the owner's: an editor's new book or pen name drops `models`; an editor's change to them is refused (403), the same value sent back passes; a non-owner's project import drops book models (`routes/common.ts` `guardModels`, `routes/books.ts`, `routes/profiles.ts`, `repos/transfer.ts`). D-069. | `review-fixes.test.ts` "model choice is the owner's"; `move-book.test.ts` |
| M3, L7 | At most 8 open event streams per user (429 beyond); replay waits for the socket to drain; a socket that does not drain in 30 s is closed; every stream ends after an hour and the browser reconnects through sign-in with Last-Event-ID (`apps/server/src/sse/stream.ts`, `routes/jobs.ts`). | `sse.test.ts` "SSE limits" |
| M4 | A workspace may have 12 jobs that people started waiting or running, 3 of them builds (print, cover, picture book), plus up to 200 section reruns; more answers 429. Child jobs (a book's sections, a batch's books) never count (`jobs/queue.ts`). D-069. | `queue.test.ts` "active jobs per workspace" |
| L1 | `/projects/import` has the same one-at-a-time guard and 5-per-minute limit as `/books/import-project`. | `move-book.test.ts` |
| L2 | Imports ignore `exports` rows, clear `createdBy`, and a non-owner's import resets claim verdicts to open. | `move-book.test.ts` |
| L3 | Every decoded picture goes through `openImage` (`packages/export/src/image.ts`) with a 100 MP limit (sharp's default is 268 MP). | `image-limits.test.ts` (a 4 KB PNG claiming 400 MP is refused) |
| L4 | Text inside a prompt data fence cannot open or close one (`<data` written as `&lt;data`). | `prompts.test.ts` |
| L5 | A job error from a database driver, the file system or the network is stored and streamed as a plain message; the detail goes to the server log only. Errors Volume raises keep their messages. | `queue.test.ts` "unexpected job errors" |
| L9 | Research sources are kept only with an `http(s)` link; an import with any other link is refused. | `source-links.test.ts`, `move-book.test.ts` |
| Info | An absolute-form request line (`GET http://host/api/...`) is read as its path, so both sign-in checks agree. | `hosting.test.ts` |
| Headers | The app removes `X-Powered-By` and `Server` from every answer (it sends neither today). `deploy/htaccess.volume` now unsets `X-Powered-By` and LiteSpeed's `X-Turbo-Charged-By`. | `hosting.test.ts` "never names the server software" |

**Independent review of these fixes** (volume-reviewer agent, read-only) found two bugs and one regression risk in them, all fixed with tests before the commit: the job limit stopped "Fix everything" on books of 13 or more sections (section reruns now have their own room of 200 and do not count against the 12); an editor's import could still bring models on a copied pen name (cleared now); the plain-message rule hid messages people act on, such as "The EPUB cover must be a JPEG" (now only errors carrying a driver or system `code`, `errno`, `sql` or `syscall` are replaced). Also taken: a socket that never drains is destroyed rather than ended; the fence escape also catches `< /data` with spaces; the one-off SQLite-to-MySQL copy runs with local sign-in unless set. Left as is: an editor whose open form holds models the owner has since changed gets a 403 on save and must reload (safe, rare).

**Still open, with the reason**

- M5 and L8 (rate-limit IP and origin lock): the fix is the host step `CLOUDFLARE_ONLY` `report` then `on` (DEPLOYMENT.md). A code change was not made: whether LiteSpeed passes the Cloudflare hop in `X-Forwarded-For` is a host fact, and if it does not, keying on it would put every visitor in one rate-limit bucket and could answer 429 on the live site.
- L6 (failed image calls record no spend): whether OpenRouter charges a failed image call is not known; recording a guess would misstate spend. Reservations are per process, and the host runs one.
- Live headers (read-only check of `https://volume.gakinz.com/`, 1 November 2026): `server: cloudflare`, no `X-Powered-By`, and `x-turbo-charged-by: LiteSpeed`. The `.htaccess` lines take effect only when the owner copies them into the docroot `.htaccess` on the host; LiteSpeed may still add the header, in which case a Cloudflare response header rule (remove `X-Turbo-Charged-By`) is the sure fix. Neither is done.

**Checklist evidence**

- Secrets in git: `gitleaks git --redact`, 314 commits, no leaks. No tracked secrets files, keys, certificates or databases.
- Keys: OpenRouter, Anthropic and Clerk secret keys are read only by the server; the web bundle reads only the Clerk publishable key and `VITE_HASH_ROUTER`; tests check API answers carry no `sk-or-` key.
- Environment: every setting is checked by zod at start (`config/env.ts`); production needs `APP_ORIGIN` and full Clerk settings. The settings file itself was not read (house rule).
- Admin routes and access: settings, models, members, budgets and bios need owner; backups, the key test and the guest cap need the instance owner; writes need editor (audit below). Sign-in: Clerk on every `/api` route, now fail closed.
- Forms: every body, query and parameter goes through a zod schema; uploads have size limits, magic-byte checks and a strict multipart reader.
- XSS: no `dangerouslySetInnerHTML` or `innerHTML` in the web app; page CSP `script-src 'self'` with hashes; export HTML escaped and network-blocked; research links `http(s)` only.
- CORS: off; no `Access-Control-Allow-Origin` is ever sent; Origin checked on every write.
- Security headers: CSP, HSTS, `nosniff`, `X-Frame-Options: DENY`, `frame-ancestors 'none'`, Referrer-Policy, Permissions-Policy, COOP, `X-Robots-Tag` on private pages.
- Rate limiting: per IP for reads, writes and health; per route for imports and workspace export; now also streams per user and jobs per workspace.
- Debug: no debug routes; log level `info`; source maps off in both builds; error answers carry no stack or SQL.
- Database: Kysely binds every value (raw SQL only constant statements and a bound backup path); the runtime user has SELECT, INSERT, UPDATE and DELETE only, migrations use their own user; TLS verified for remote MySQL.
- Passwords: none stored. Clerk holds sign-in; `users.password_hash` is always null.
- Exposed files: static serving only from the web build with dotfiles refused; nothing else in the docroot; `.local-test/` and `.local-state/` added to `.gitignore`.
- Dependencies: within-range updates applied (Anthropic and OpenAI SDKs, Kysely, mysql2, dotenv, pdfjs, TipTap, Vitest, types) plus patch bumps of pinned `@fastify/static` 10.1.8, React 19.3.1 and `@vitejs/plugin-react` 6.1.2. Held: `docx` at 9.8.1 (9.15 adds a default table style to every DOCX, which changes the approved golden files; review in Word first), Playwright 1.63.0 (it carries the pinned Chromium the PDF goldens depend on), Clerk 3.24.0 and 6.17.8 (sign-in SDK: needs a live sign-in check), Prettier (would reformat the repo), and other pinned minors. `npm audit`: 14 moderate, all the `glob`/`minimatch` chain assessed as not reachable (section below); fixes only in new majors.
- Unused packages: none. Every declared package is imported, or found by folder scan (the fontsource fonts), or is a type or test tool.
- Semgrep (`p/typescript`, `p/nodejs`, `p/secrets`, `p/security-audit`, metrics off): 50 results, all read and false positives. 49 in `packages/export/src/covers.ts` (values in the cover HTML are escaped text, numbers, `HEX`-checked colours or library font names, and the page is network-blocked); 1 ReDoS in `apps/web/src/features/editor/textTools.ts` (the query passes `escapeRe` first). Not marked inline: the lines are inside template literals, where a comment would print into the cover. Semgrep could not parse 1,350 spots (newer TypeScript syntax), so its coverage is partial. Neither Semgrep nor gitleaks runs in this project's CI, unlike the house standard.

## 1 November 2026: go-live security audit and public page indexing

Branch `golive/2026-11`. Scoped source audit (security-audit skill at guidance depth, not the full six-phase run): five read-only hunters, one per area, then each High candidate checked again in the code and reproduced in a local test before the fix. No live host, Clerk, OpenRouter or Cloudflare call was made. Severity follows the skill: high means an explicit control fully defeated with real consequences.

**Fixed (High)**

| # | Finding | Who can reach it | Fix and evidence |
|---|---|---|---|
| S1 | **HTML and script injection into the export Chromium.** An image line in a section, `![x](data:x"><iframe src=http://127.0.0.1:…>…)`, passed `imageSrc` untouched (`packages/export/src/print-html.ts`) and went unescaped into `<img src="…">`. The print PDF, cover, picture-book and preview pages ran in a Chromium context with JavaScript on, no request blocking and no sandbox, so the markup could load internal addresses on the host, draw them into the PDF the caller downloads, and run script. | The owner, invited editors, guest workspace owners; also manuscript and project zip imports, and AI output steered by a research page. | `imageSrc` keeps only `data:image/(png, jpeg, webp or gif);base64,…` and the attribute is escaped. Every export page now opens in `newIsolatedContext` (`packages/export/src/browser.ts`): all requests aborted, service workers blocked; export pages are built from `data:` URLs only. Test `packages/export/test/export-isolation.test.ts`: a local HTTP server receives 0 requests from images, frames, stylesheets and `fetch`, the hostile line leaves no `<iframe>`, a real `data:` image still draws. Red before the fix (the iframe reached the print HTML), green after; export suite 250 tests pass with goldens unchanged. |
| S2 | **A negative model price defeats the guest monthly cap.** `mapModel` turned a listed price of `-1` into minus one million dollars per million tokens, so a call's reservation was negative and `spent + pending + estimate > cap` never tripped. A guest workspace owner can set their own workspace's models (`PUT /settings/models`) to a router listed at `-1`. | Guest workspaces (`ACCOUNTS_MODE=invite` only). | Negative prices are unknown (`null`) in `packages/ai/src/provider/models.ts`; `reserveBudget` (`apps/server/src/jobs/runner.ts`) never reserves less than 0. Tests: `packages/ai/test/negative-prices.test.ts`; `apps/server/test/review-fixes.test.ts` "keeps the cap when a model is listed with a negative price" (red: the run succeeded past the cap; green: `paused_budget`). Not verified live: that OpenRouter's model list gives `openrouter/auto` the price `-1` (no network call made). |

**Open: Medium (recommendation for the owner)**

| # | Finding | Recommendation |
|---|---|---|
| M1 | **Sign-in can fall back to the stub (everyone is owner) if the host's `NODE_ENV` is set to anything but `production`.** `loadConfig` only refuses `AUTH_MODE=local` in production, and `app.cjs` sets `NODE_ENV` only when it is unset; the stub then answers every `/api` request as the owner. The deploy health check (401 on `/api/v1/books`) catches it at deploy time, not after a later change in cPanel. Needs a host fact: whether the host's private settings set `AUTH_MODE=clerk` (not read). | Small code change: refuse to start without an explicit `AUTH_MODE=local` when `APP_ORIGIN` is set, `DB_CLIENT=mysql` or a web build is served. Also set `AUTH_MODE=clerk` in the host's settings. |
| M2 | **Editors can choose models per book or pen name.** `settings.models` on `PATCH /books/:id` and `models` on profiles need only editor; AUTH-MODEL gives models and spending to the owner. With no cap in the owner's workspace (D-057) an editor can run books on any model on the owner's key; a project zip can carry book models too. | Require owner when the body changes `settings.models` or `models`; drop `models` from imported book settings. |
| M3 | **No limit on open event streams.** Any member (viewers too) can hold unlimited SSE streams; replay from an old id sends up to 90 days of events without waiting for the socket to drain. | Cap streams per user (about 5, then 429) and wait for `drain` during replay. |
| M4 | **One workspace can hold up every other workspace's jobs.** The export lane runs one job at a time across all workspaces and `POST /books/:id/export` has no per-workspace limit, so a guest can queue many exports ahead of the owner's. | Refuse a new job when the workspace already has N active jobs of that lane, or claim jobs round-robin by workspace. |
| M5 | **Rate limit and logged IP can be forged while `CLOUDFLARE_ONLY` is off** (known issue, origin lock). Writes still need a Clerk session, so a stranger cannot spend AI money this way. | Do the host steps in DEPLOYMENT.md (`report`, read the log, `on`). In code, trust `CF-Connecting-IP` only when `viaCloudflare(req)`. |

**Open: Low and informational**

- L1 `/projects/import` (older route) has no one-at-a-time guard or import rate limit, unlike `/books/import-project`; up to about 210 MB per upload in memory. Route it through the same guard.
- L2 Project zip import keeps `exports` rows, claim and check statuses and `sectionVersions.createdBy` from the zip (same workspace only). Refuse `exports`, reset statuses, clear `createdBy`.
- L3 `sharp()` runs with its default 268 MP decode limit in covers, picture books and DOCX. Pass `limitInputPixels` (for example 50 MP).
- L4 Prompt data fences (`<data label=…>`) can be closed by text containing `</data>`. Impact is prose only: models have no tools and every output is schema-checked. Escape `</data` or use a per-call nonce.
- L5 Unknown job errors are stored and streamed word for word, so DB or provider messages (up to 300 characters of a provider body) reach viewers. Store a generic message, log the detail.
- L6 A failed paid image call records no spend, and reservations live in one process; both can let spend pass a guest cap by a few calls.
- L7 An open event stream ignores a Clerk sign-out until membership is removed (re-checked every 60 s). Cap stream life at about an hour.
- L8 With `CLOUDFLARE_ONLY=on`, the `X-Forwarded-For` walk skips private hops; whether LiteSpeed appends to a client header is a host fact. Authenticated Origin Pulls would close it.
- L9 Research source URLs are not checked for `http(s)` when stored; React and the CSP block `javascript:` links today.
- Info: an absolute-form request line (`GET http://host/api/v1/books`) skips the first sign-in hook and is refused by the second (401), which is the only lock on that form. Viewers can call the three estimate and preview POST routes (reads, no spend).

**Checked and safe:** workspace isolation (every repo query scoped by `ctx.workspaceId`; body IDs checked against the workspace; zip import reissues IDs and forces the caller's workspace); roles (writes need editor; settings, members and budgets need owner; backups and the key test need the instance owner; invitations claimed once against verified emails); path tricks (`%61pi`, case, `%2f`, `;`, `//`); Clerk (`authorizedParties` set, users not invited get 403); SSE (keyed and replayed by workspace, per-book streams check the book, removed members dropped); job kinds hard-coded, runner context from the job row; research redirect lookups (exact host match on `vertexaisearch.cloud.google.com`, `redirect: 'manual'`, target never fetched, default off); no model-supplied URL is ever fetched (images are base64 only); no `eval`; no `dangerouslySetInnerHTML` in the web app; zip reader (no `..`, absolute or duplicate names, size and count limits, nothing written to disk); downloads (`attachment`, `sandbox` CSP, `nosniff`, cleaned file names); EPUB and DOCX escape text and decode images to bytes; error answers carry no stack or SQL; keys never reach the client, logs or job events.

**Not tested:** anything on the live host (which `AUTH_MODE` and `ACCOUNTS_MODE` it runs, LiteSpeed's `X-Forwarded-For` handling, which local services Chromium could have reached before S1), OpenRouter's live model list, behaviour with several Passenger processes.

**Public pages (claude-seo, source only).** Before: titles, descriptions, head tags, Organization, WebSite and WebApplication (a SoftwareApplication type) JSON-LD and a no-script copy were already built, but D-053 kept every page `noindex`, robots.txt said `Disallow: /` and there was no sitemap. The owner chose to index `/` and `/how-it-works` (D-068, 1 November 2026). After: both pages `index, follow` with a canonical; `/sitemap.xml` lists exactly those two; robots.txt allows only them, `/assets/`, the favicons, the logo (`/icon-512.png`) and the share image, and disallows the rest; the logo and share image no longer carry `X-Robots-Tag: noindex`; How it works' structured data now defines the Organization and WebSite it points at; `/welcome` stays a 301 to `/`; app pages, sign-in, 404s and the API stay `noindex`. The static `apps/web/public/robots.txt` now names the live sitemap, not a test address. No ratings, prices or offers in the schema (there are none to state). Tests: `apps/server/test/seo.test.ts`, `apps/web/src/site/seo.test.ts`. Not tested: Google's Rich Results Test and Search Console (live site only, after a deploy).

## 1 November 2026: dependency alerts, sign-in page

- **Dependabot alerts 1 and 2 (moderate).** `glob` 13.0.6 (AbortSignal bypass, fixed in 14.0.2) and `minimatch` 10.2.6 (pattern DoS, fixed in 11.0.1). Neither is reachable:
  - `glob` comes in only through `@fastify/static`, which calls it only when `wildcard` is false. Volume registers it with `wildcard: true` (`apps/server/src/http/hosting.ts`), so glob never runs on the host.
  - `minimatch` comes in through ESLint, typescript-eslint and glob; it runs only in local linting on the project's own patterns.
  - The fixes are new majors (27 and 28 October 2026). `@fastify/static` still declares `glob ^13`, and `npm audit fix --force` would downgrade ESLint and Fastify by several majors. Not applied. Alerts dismissed on GitHub with this reason; revisit when `@fastify/static` and ESLint move to the patched majors.
- **Sign-in page (live).** Clerk works: an unknown address gets "Couldn't find your account"; the owner's address reaches the email code step (factors: Google, email code). The page's CSP allows Clerk's scripts and frames. Clerk production has the password method on and required while the owner's account has no password, so the form shows a Password box that cannot be used; the email code path still works through "Continue". Recommended Clerk change, owner's call: turn the password method off.
- **Sign-in heading fixed.** "studio." was invisible (accent token equals the panel colour since D-066) and the heading and line wrapped early at laptop widths. Now one line at 1024 to 1920, contrast 13.7:1 light and 13.1:1 dark, axe clean. The 3D book's gilt (landing and sign-in) used the same token and vanished on the navy cloth; it is now a fixed content colour.

## 1 November 2026: clean-up

- Dead code: `BlueprintInspector.tsx` (257 lines, only its `Totals` type was used; moved into `BlueprintPage.tsx`), nine exports used nowhere (`RESOURCES_PLACEHOLDER`, `RESOURCES_NEED_SOURCES`, `CatalogueResponse`, `paperbackRulesVersion`, `TikTokBody`, `InstagramBody`, `EmailBody`, `useBreakpoint`, `GuardrailPattern`) and the unused `@fontsource-variable/schibsted-grotesk` package. Method: import graph over every workspace, then a whole-repo search per export; `tsc --noUnusedLocals` clean in every workspace. 520 exports used only in their own file were left (not dead).
- Git: 37 merged remote branches and 2 local ones deleted (each checked to have no commits outside main); two agent worktrees removed. `docs/release-20261030` kept: it holds commits not in main (owner's call).
- Docs: 39 Markdown files corrected against the code (roles and sign-in, D-057 spending, hosting, PWA facts, test counts and ports, folder maps, known issues); plan statuses updated. Prompt version files are kept by design.

## 31 October 2026: design gap audit (product-design method)

- Scope: production build on demo data, 25 routes at 375, 834, 1280, 1920 and 2560 px, axe-core 4.10 (WCAG 2.0, 2.1, 2.2 A and AA tags) plus DOM measurements (row heights, column ends, orphan last rows, repeated text, navy buttons per page).
- Before: all 125 captures failed axe (toast region `aria-prohibited-attr` on every page; also an unlabelled profile photo input, an unfocusable wizard scroll area at 390, 16 px citation targets). Layout: 2 or 3 navy primaries per step page, step bar clipped at 1280, Overview columns 1033/997/855 px, Blueprint inspector 1,957 px beside a 716 px outline, stretched Research cards, chosen title shown three times, lone last cards on several grids. Saved: `../reports/volume/gap-fixes/before-audit.json`.
- After (PR #87, #88): 200 captures at six widths plus dark mode, 0 axe violations, 0 sideways scroll, 0 orphan rows. Gate: typecheck, lint, format, web 267, e2e 20.
- Not tested: screen readers, real devices, signed-in pages on real data.

## 30 October 2026: automatic deploy and docs tidy

- Scope: the new `deploy.yml` (runs `npm run deploy` after "Check Volume" passes on `main`) and the docs layout.
- Evidence: Check Volume run 41116467668 passed (Linux, macOS, Node 24 + MariaDB host job); Deploy run 41118270156 released `8fc47e4` as `releases/20261030T194912Z` (health 200, sign-in enforced, migrations up to date). `KNOWN-ISSUES.md` moved to `docs/`; docs check passes.
- Result: PASS.

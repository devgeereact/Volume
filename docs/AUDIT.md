# Audit record

One audit file for this project. Every audit, check or review adds a dated section at the top; nothing is rewritten. Open work lives in `.agent/CURRENT-TASK.md`.

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

# Decisions

One entry per decision, newest at the bottom. Each has a date, context, the decision and its consequences. Changing a decision means a new entry that supersedes the old one, never an edit of history. The source for D-001 to D-012 is the approved plan, `docs/08-change-management/plans/legacy-approved-plan.md`.

Status: **Accepted** (owner approved), **Proposed** (in the specs, waiting for the owner), **Superseded**.

## D-001 Local first on the owner's Mac

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** The owner works alone on his Mac today. Hosting adds cost, accounts and security work before the core is proven.
- **Decision:** Volume runs locally from `~/Projects/volume` (outside Google Drive). The server binds to 127.0.0.1. Data lives in `data/` (SQLite and files), backed up nightly.
- **Consequences:** No hosting, no logins in v1. The only outside call is OpenRouter. Sync between machines is not supported.

## D-002 Multi-user ready from day one

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** The owner wants other self-publishers to have accounts later.
- **Decision:** Every row has `workspace_id`, IDs are ULIDs, an auth stub attaches workspace and user to every request, and services take that context.
- **Consequences:** Slightly more code now; real logins in phase 8 replace the stub without touching routes or services.

## D-003 OpenRouter as the single AI provider, model chosen per stage

- **Date:** 4 October 2026. **Status:** Accepted. Supersedes the earlier plan for separate Claude and Gemini keys.
- **Context:** The drafts assumed several AI accounts. One key is simpler to secure and budget.
- **Decision:** One key, `OPENROUTER_API_KEY`, server side only. Text through chat completions with the OpenAI SDK pointed at OpenRouter; research with web search and `url_citation` sources; images through OpenRouter's images endpoint; model list and prices from `GET /api/v1/models`. The owner picks the model for each stage per workspace, profile and book. Defaults: a top Claude model for the blueprint, a mid Claude model for writing and editing, a small fast model for checks, a Gemini model with web search for research, a Gemini image model for covers.
- **Consequences:** One place to watch spend. Depends on OpenRouter's API; endpoints and slugs re-verified before phases 2 and 4. Fallbacks are offered, never silent.

## D-004 Fully automatic writing with guardrails

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** The owner wants the AI to write the whole book in the first person from the profile. The drafts also asked for things that break KDP rules or mislead readers.
- **Decision:** Writing is fully automatic, chapter by chapter, with: no invented ISBNs, statistics, studies, quotes, testimonials, reviews, awards or sources; a claims-to-verify report; About the author verbatim from the profile; KDP's AI disclosure set automatically; a real-person flag with an optional "stories are illustrative" line; every AI change versioned.
- **Consequences:** More checker work and some books will need the owner's attention before export. "Readers never suspect AI" from the drafts is dropped.

## D-005 Volume mode later

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** BOOK.md describes batch production across many pen names. KDP limits new titles to 2 per format each week (FACTS 5.7).
- **Decision:** Build the single-book core first. Volume mode comes in phase 8 with quality gates and a scheduler that refuses a third new title per format per week.
- **Consequences:** v1 is one book at a time. The data model already supports many books and pen names.

## D-006 SQLite with Drizzle

- **Date:** 4 October 2026. **Status:** Superseded by D-015 and D-019 (5 October 2026).
- **Context:** Local app, one user, needs migrations and type safety, and must survive restarts.
- **Decision:** SQLite in WAL mode with Drizzle ORM and migrations. The job queue lives in the same database.
- **Consequences:** No database server. The Node 26 driver (a native package or `node:sqlite`) is decided in phase 1. Moving to Postgres later is possible through Drizzle if accounts are hosted.

## D-007 Paged.js in Playwright for print PDF

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** The P02 demo built its PDF with Chromium print and stamping in Python. Volume needs mirrored margins, running heads, page numbers and a contents list with page numbers in TypeScript.
- **Decision:** Paged.js paginates HTML inside Playwright Chromium; pdf-lib sets metadata. A fallback engine ported from `build_pdf.py` is kept ready.
- **Consequences:** CSS-based layout shared with the web preview. Speed on long books must be measured in phase 1.

## D-008 Prompts as versioned files

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** The method lived in long chat prompts that drifted between copies.
- **Decision:** Prompts are files at `prompts/<stage>/<name>.v<N>.md` with front matter, adapted from P02 BOK-01 to BOK-25 and the owner's drafts. Never strings in code. Changing a prompt means a new version file. Every run records prompt id, version and hash.
- **Consequences:** Past results can be explained and compared. The index lives in `docs/book-production/PROMPTS.md`.

## D-009 The full book structure for every book

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** The drafts each listed parts of a book; none was complete.
- **Decision:** Every book ships with front matter, body, back matter, a publishing package and a marketing package, as listed in `docs/01-product/PRODUCT-SPEC.md`. Sections can be switched off or reordered; templates set the defaults.
- **Consequences:** Exports, preflight and the pack all walk one ordered list of sections.

## D-010 Never generate ISBNs

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** A draft asked the AI to "generate a realistic ISBN". A fake ISBN is invalid and misleading.
- **Decision:** ISBN is a field the owner fills from KDP (free, KDP only, FACTS 4.1) or Nielsen (FACTS 4.4), or leaves empty. The app validates the checksum and never creates one. The copyright line shows an ISBN only when entered.
- **Consequences:** eBooks can go without an ISBN (FACTS 4.2).

## D-011 Design direction pending

- **Date:** 4 October 2026. **Status:** Proposed.
- **Context:** A new visual identity needs the owner's eye. The drafts suggest deep navy, rich gold and warm cream.
- **Decision:** Three direction boards in `design/directions/` (one from the drafts' palette, two alternatives). The owner picks one; the choice is recorded here as a new entry and expanded in `docs/03-design/DESIGN-SYSTEM.md`.
- **Consequences:** The prototype waits for the pick. Foundations (layout, accessibility, motion, states, copy) are already fixed.

## D-012 KDP numbers from config only

- **Date:** 4 October 2026. **Status:** Accepted.
- **Context:** KDP rules change (for example the paperback royalty tiers and the weekly title limit, FACTS 3.1 and 5.7).
- **Decision:** All KDP numbers live in `config/kdp-rules/` with fact ID, source URL and date read, built from FACTS. A reminder appears after 90 days.
- **Consequences:** Code and prompts never hold KDP numbers. Unverified rules are marked as such.

## D-013 Spec-level choices made while writing the docs

- **Date:** 4 October 2026. **Status:** Proposed (owner to confirm at the phase 0 review).
- **Context:** Writing buildable specs needed some choices the plan did not make.
- **Decision:**
  - AI costs and budgets are in US dollars (OpenRouter's currency); KDP prices and royalties are in pounds.
  - Chapters are written in order, one at a time, because each needs the summaries and ledger of the ones before.
  - Checking research links on the open web is off by default, since it would be a network call other than OpenRouter.
  - TXT export wraps paragraphs at 80 characters and indents subheadings in the contents by 3 spaces.
  - Print page numbers start at 1 on the introduction; chapters open on right-hand pages by default.
- **Consequences:** Each can be changed by a new entry before phase 1 code depends on it.

## D-014 Fused visual direction "Volume"

- **Date:** 4 October 2026. **Status:** Accepted by the owner on 7 October 2026. Supersedes D-011.
- **Context:** The owner asked to combine the three boards in `design/directions/` into one clean, fresh look, drawing on Awwwards, uiverse, 21st.dev, dafont and the getdesign.md Lovable entry for technique (notes in `design/research/inspiration.md`).
- **Decision:** One direction with two themes from the same tokens. Light: warm grey paper, white galley sheets, a navy spine with a gilt edge (A), blue pencil for selection and focus and proof red only for claims and errors (B). Dark: the Night Desk on deep indigo with the live "Writing now" panel (C). Gilt is the single accent in both themes. Fonts, all SIL OFL 1.1: Literata (book), Schibsted Grotesk (interface), JetBrains Mono (model IDs and keys only). Icons: Lucide (ISC). Five signature motions: page turn, ink fill, cover lift, ink in, blue pencil. Board: `design/final/volume-direction.html`. Spec: `docs/03-design/DESIGN-SYSTEM.md`, Visual direction. Tokens: `packages/ui/tokens.json`, with `tokens.css` and `theme.css` generated by `design/final/src/build.mjs`.
- **Consequences:** The prototype can start from these tokens. All 90 contrast checks pass (text at least 4.5:1 in both themes). Adding `lucide-react` and the Fontsource font packages still needs the owner's OK. Nothing from 21st.dev or uiverse is copied; patterns are rewritten.

## D-015 Owner's cPanel MySQL holds all work; Kysely with two dialects

- Date: 4 October 2026. Status: Accepted (owner chose "Database on cPanel, app on Mac"). Remote MySQL from the Mac superseded by D-038 on 16 October 2026; Kysely, the two dialects and BLOB storage stay.
- Context: the owner wants all work saved in his cPanel database and pulled when needed. Shared hosting usually cannot run the Chromium engine that print PDFs need, so the app stays on the Mac.
- Decision: the server uses Kysely (MIT) as a single query builder with two dialects: SQLite (better-sqlite3 or node:sqlite) for local development and tests, MySQL (mysql2) for production on cPanel through Remote MySQL with the Mac's IP allow-listed and TLS when the host offers it. Files (covers, images, exports, uploads) are stored in the database as chunked BLOBs (1 MB chunks) with a sha256, so the whole library lives on cPanel. Migrations are written once in Kysely and run on both dialects. Supersedes the "SQLite with Drizzle" part of the stack (D-005 area).
- Consequences: no file storage on the Mac other than a cache; backups come from the cPanel database; one setting `DB_CLIENT=sqlite|mysql` switches. Owner must enable Remote MySQL and add host, port, database, user and password to `.env`.

## D-016 Navigation: one book stepper with Back and Next, a Published shelf, no duplicate controls

- Date: 4 October 2026. Status: Accepted (owner feedback).
- Decision: left navigation holds Library, Published, Profiles, New book, Archive, Settings. Inside a book there is one step bar (Research, Titles, Blueprint, Writing, Editor, Cover, Export, Marketing) that highlights the page you are on, plus Back and Next buttons at the foot of every step. One global search (top bar, Cmd K); page filters are filters, not second search boxes. One New book button per screen. Breadcrumbs reduced to Library and the book title.

## D-017 Book type catalogue, interior themes and cover styles

- Date: 4 October 2026. Status: Accepted (owner feedback).
- Decision: config/book-types.json lists about 30 book types in four categories (Fiction, Children's, Non-fiction, Workbooks and journals), each with its structure template, word ranges, genre rules, default interior theme and cover style. config/interior-themes.json defines about 12 interior themes (typefaces, sizes, leading, margins, chapter openers, ornaments) kept within KDP readability guidance (body text 10 to 12 pt for adults, larger for children, embedded fonts, safe margins). Every book gets its own theme and cover style so no two look alike. OFL display fonts are installed for covers and themes at the owner's request; licences recorded in assets/fonts/README.md (one row per family, with package and licence check).

## D-018 Five starter profiles

- Date: 4 October 2026. Status: Accepted.
- Decision: config/profiles/ holds five profiles: Gideon Akinlotan (AI and digital side hustles, tech how-to, business and personal growth, faith and life), Harni Muharami (NHS nursing, healthcare leadership and wellbeing), and three pen names for Romance, Children's, and Thriller and mystery. Facts about real people come only from the owner's drafts and are marked "owner to confirm" where drafts disagree.

## D-019 Server data details: better-sqlite3, model precedence, stage and status

- Date: 5 October 2026. Status: Accepted (built in apps/server, round 2).
- Context: D-015 left the local SQLite driver open (better-sqlite3 or node:sqlite) and docs/03 described a separate model_choices table.
- Decision: the local driver is better-sqlite3 13.0.3. It installs from a prebuilt binary on Node 26.8.1 in about 3 seconds and Kysely's built-in SqliteDialect supports it. Model choices are stored as JSON with this precedence: book (projects.settings.models), then profile (author_profiles.models), then workspace overrides (settings key models.overrides), then config/models.defaults.json. A book has two separate fields: stage (idea to marketing) and status (active, published, archived). MySQL TLS takes `verify` (default) or `off` only; a self-signed host uses MYSQL_SSL_CA.
- Consequences: no model_choices table. Published books are a status, so the Published shelf is a filter, and a published book can still be edited and republished. The MySQL test runs only when MYSQL_TEST_URL is set.

## D-020 Research sources resolved from Google grounding redirects

- Date: 5 October 2026. Status: Proposed (owner to confirm; AGENTS.md rule 5 asks before network calls other than OpenRouter).
- Context: the first live run showed Gemini web search returns citation links on vertexaisearch.cloud.google.com that redirect to the real page. They are unreadable and expire, so the owner cannot check sources.
- Decision: packages/ai sends one request per such link to that one allow-listed host, with redirects off and a 5 second timeout, reads only the Location header and never opens the target page. The final URL and domain are stored with the source; a failed lookup keeps the original link and marks the source unresolved. A setting RESOLVE_SOURCE_REDIRECTS (default on) switches it off.
- Consequences: sources become real, clickable addresses (live run: 7 of 7 resolved). Google sees one extra request per source, carrying no key or book text. Research is internal notes, so the banned-phrase rewrite does not run on it (saves a second Gemini Pro call).

## D-021 Server details settled while filling the screen gaps

- Date: 5 October 2026. Status: Accepted (lead, reversible).
- Decision: an export whose final preflight blocks (for example under 24 pages) fails the pack with a plain reason, but the single files stay downloadable. Books and profiles are deleted only when archived, with no running job (books) or no books (profiles), and only with the exact title or name typed to confirm; AI spend rows stay so monthly totals remain right. Seeded pen-name bios count as confirmed; only "owner to confirm" profiles show as to confirm. "Job running" on the Library counts queued and waiting jobs too. The activity feed leaves out per-section child jobs. Trims 5.25 x 8 and 7 x 10 are offered (unverified in the rules file); 8 x 10 stays in the API list though the rules file does not list it, so preflight warns. Backups: SQLite gets a nightly copy kept for 14 days under DATA_DIR/backups; MySQL relies on cPanel backups.
- Consequences: no silent pack with a failing file; deletes cannot happen by one click.

## D-022 The web app uses the KDP maths in @volume/core

- Date: 5 October 2026. Status: Accepted (r4-consolidate, reversible).
- Context: Export in API mode had no royalty lines. The web app has its own copy of the KDP sums for demo mode (features/export/kdpRules.ts); packages/core holds the tested ones.
- Decision: API-mode Export imports @volume/core (pure TypeScript with zod, through the workspace link) and works out printing cost, minimum list price and royalties from the book's list prices and the latest print PDF's page count, with config/kdp-rules as the only source of numbers. apps/web/tsconfig.json sets allowImportingTsExtensions to true (noEmit) so tsc can follow core's `.ts` import paths. The royalties panel loads as its own chunk (about 96 kB, 28 kB gzipped), so the main bundle does not grow.
- Consequences: one set of royalty sums for the server and the browser in API mode; the demo calculator keeps its own copy until it moves to core too. apps/web/package.json does not list @volume/core yet (adding it changes the lock file; owner to approve).

## D-023 ESLint and Prettier, with TypeScript 6 for ESLint only

- Date: 5 October 2026. Status: Accepted (owner approved ESLint and Prettier; lead approved the TypeScript 6 alias).
- Context: K-P05. The repo had no linter or formatter. typescript-eslint 8.71 (latest) supports TypeScript below 6.1 only and refuses to load TypeScript 7, which ships no compiler API. Microsoft's TypeScript 7.0 announcement ("Running side-by-side with TypeScript 6.0") and the typescript-eslint repo both use the compatibility package `@typescript/typescript6` aliased as `typescript` for tooling.
- Decision: root dev dependencies, exact versions: eslint 10.12.0, @eslint/js 10.0.1, typescript-eslint 8.71.0, eslint-plugin-react-hooks 7.1.1, eslint-config-prettier 10.1.8, globals 17.13.0, prettier 3.9.9, and `"typescript": "npm:@typescript/typescript6@6.0.2"`. The alias is for ESLint only: every workspace that runs tsc declares `"typescript": "7.0.2"`, so npm nests TypeScript 7 there and `npm run typecheck`, builds and tests still use tsc 7. ESLint (`eslint.config.js`, flat config): `@eslint/js` recommended plus typescript-eslint `recommendedTypeChecked` through `projectService` (each workspace's tsconfig; `tests/e2e/tsconfig.json` added for the end-to-end suite), the React hooks `recommended-latest` rules for apps/web, Node globals for the server, packages, scripts and tests, eslint-config-prettier last. eslint-plugin-react-refresh was tried and left out: the app keeps hooks and providers in the same files. Prettier (`.prettierrc.json`): print width 160, double quotes, with single quotes in packages/, apps/server/ and scripts/, which matches the code as written (the smallest reformat of the widths tried). `.prettierignore` leaves out generated output, config/ (owner-edited data), prompts/, Markdown, test fixtures, design/ and the generated token files.
- Consequences: `npm run lint`, `npm run format` and `npm run format:check` at the root. To remove the alias once typescript-eslint supports TypeScript 7 (issue 10940): delete the root `typescript` alias, run `npm install`, and check `npm run lint`. Tracked as K-16.

## D-024 Project imports commit atomically

- Date: 6 October 2026. Status: Accepted (owner requested the import rollback fix).
- Context: a failed project import committed its profile, book and files before child rows were written, leaving a partial book.
- Decision: use one Kysely transaction for the imported profile, project, asset metadata, file chunks and child rows. Bind BlobStore to that transaction while retaining its configured chunk size.
- Consequences: any write failure rolls back the entire import; successful imports and existing profile matching keep their behaviour. SQLite regression tests cover new and existing profiles, a later file failure and successful imports. Live MySQL verification remains outstanding.

## D-025, 6 October 2026: AI budgets checked before internal calls

Status: implemented locally under the owner's request to fix the review findings.

The runner reserves estimated allowance for overlapping jobs in the same workspace. The AI service calls back before each provider attempt, including repairs and style rewrites; the server adapter includes earlier task spend. Completed calls are recorded even if a later budget check pauses the stage. Reservations use estimates and provider-reported costs, so this is not a guarantee against incorrect third-party billing. Mock regression tests cover internal retries, task accumulation and concurrent monthly allowance.

## D-026, 6 October 2026: finish the specified local v1 flows

Status: implemented locally. The approved stack is unchanged.

Use the already specified free TipTap packages for editor blocks. Add atomic Markdown import, real blueprint compare/restore, saved-profile portraits, high-cost writing confirmation and pre-publication price entry. Preserve imported text, prior blueprint versions and the profile bio. Heavy routes load on demand. Project imports validate the actual migrated schema and bound expanded ZIP data. No new authentication, batch production or later roadmap features are included.

## D-027, 6 October 2026: dated KDP supplement and redirect default

Status: implemented locally, publishing acceptance remains partial.

Keep the 3 October rules file unchanged and add 2026-10-06.json with official-source verification for trim/page limits, margins and text-safe distances. Barcode position stays partial until the owner compares the generated template. Redirect resolution defaults off while D-020 is proposed; this does not approve enabling external research lookups. Backup documentation follows actual 14-snapshot retention instead of promising weekly archives or a missing CLI.

## D-028, 6 October 2026: measured coverage gates

Status: owner approved the requested coverage dependency with “go ahead”.

Add @vitest/coverage-v8 5.0.3 as a root development dependency, matching Vitest. Include all src/**/*.ts files in core, AI, export and server. Enforce 90% lines for core and 80% for the others, with server covering its whole source rather than services alone. Generate ignored JSON and HTML reports. CI uses test:coverage as its unit/integration test step. Branch and function coverage remain reported without a new target.

## D-029, 6 October 2026: free-only live validation and deferred MySQL

Status: owner authorised free OpenRouter models for testing, granted access to one book’s generated files and explicitly deferred cPanel testing.

Use the existing authenticated server without reading or exposing its key. Select only catalogue-verified zero-priced models, do not use paid fallbacks, search plugins or image generation, and override models only on the labelled synthetic test book. Production defaults stay unchanged. Free-provider errors and generated-text defects are validation findings, not grounds to claim production-model acceptance. Kindle Previewer installation/use awaits the separate legal-agreement approval.

## D-030, 6 October 2026: documentation history and current evidence

- Status: Applied documentation maintenance under the owner's request. No stack or product behaviour change.
- Decision: keep original approved plans, source drafts and review findings as historical material with clear current pointers. Current operational guides follow implemented scripts and source; current acceptance follows dated validation reports and KNOWN-ISSUES.md.
- Consequence: documentation refresh does not turn proposed owner decisions into approvals or failed/unperformed checks into passes. No external rules were reverified in this documentation-only pass.

## D-031, 6 October 2026: versioned humanizer guidance

- Status: Accepted scope, owner approved the implementation plan.
- Decision: store adapted humanizer 3.0.0 principles in new prompt versions, with no home-directory skill dependency, extra automatic editing call or change to model defaults. Preserve exact task contracts, source evidence, historical versions, owner voice, house style and AI disclosure.
- Consequence: active prompts select the latest versions when a new loader starts; explicit older pins remain valid. Mock tests establish integration/contract behaviour, not live prose quality. Only proven unused source was deleted; tools and history remain.

## D-032, 7 October 2026: portable GEE OS rebuild candidate

- Status: owner approved the rebuild plan with “go ahead”; implemented locally in an isolated checkout, no cutover or publication.
- Decision: adopt the Full Product documentation hierarchy, retain the npm monorepo and book-production engines, compose React providers and the router under src/app, and organise existing screens under src/features. Preserve Tailwind and current design tokens.
- Transfer correction: anchor the private data ignore at /data/ and include the previously ignored public frontend fixtures under src/demo. Never transfer node_modules or private owner data as application source.
- Runtime: keep the actual Node >=26 requirement with project-local Mise 26.10.0, unchanged package lock, clean npm restore, native-module/browser checks and loopback-only startup. CI describes Linux and Mac checks; configuration alone does not prove Mac execution.
- Acceptance: preserve failed PDF reference evidence and existing live/publishing blockers. No replacement reference or relaxed tolerance. Review the candidate and complete acceptance before cutover.


## D-033, 7 October 2026: report PDF differences without changing acceptance

Added a read-only TypeScript all-page diagnostic with the existing fixture, reference images and threshold. Font-setting experiments did not pass all pages, so no speculative production flag was adopted. Compare Mac/Linux environment and font hashes before changing rendering or reference policy. No new dependency or public action.

## D-034, 7 October 2026: unhinted PDF text and per-platform visual references

- Root cause of the Linux PDF difference: headless Linux Chromium hints fonts by default, which rounds glyph advances and changes line wrapping. macOS never hints.
- Decision: launch the export browser with `--font-render-hinting=none` (packages/export/src/browser.ts). Linux PDFs now wrap like the approved macOS output. macOS ignores the flag.
- The remaining difference is text weight from the platform rasteriser (CoreText on macOS, FreeType on Linux), not layout. Visual tests compare against `test/golden/` on macOS and `test/golden/<platform>/` elsewhere. The 1.5 threshold is unchanged and the macOS references are byte-identical.
- Guard: every platform must also stay within 1% layout drift of the macOS references, checked one way because heavier macOS ink cannot be matched pixel for pixel.
- Evidence: ../reports/volume/qa/reports/PDF-PARITY-FIX-2026-10-07.md. macOS rerun NOT TESTED.

## D-035, 7 October 2026: summary budget for reasoning models

- Root cause of the free-run writing failure: the summarise stage had 4,000 output tokens (8,000 on retry) and reasoning models spent most of it thinking. The v3 prompt also let the answer grow with every chapter.
- Decision: summarise `maxTokens` 16,000 (32,000 on the single retry) with `expectedOutputTokens` 1,500 so budget estimates stay as before. Prompt `checks.summarise-and-ledger.v4` caps item counts and length; v3 remains for pinned books.
- Open for the owner: whether the server should save a chapter when its summary still fails, rather than failing the job. Live confirmation needs an authorised free-model run.

## D-036, 9 October 2026: forward an alternative web origin to the API

- Context: an existing SSH tunnel can own the default web port 5180, so the launcher accepts `VOLUME_WEB_PORT` (from D-032). The API only allowed the 5180 origins by default.
- Decision: when the selected web port is not 5180 and `WEB_ORIGINS` is not set, the launcher passes `http://127.0.0.1:<port>,http://localhost:<port>` to the API. An explicit `WEB_ORIGINS` always wins. No running process is stopped.

## D-037, 16 October 2026: production runs on Node 24.21

- Context: the owner hosts Volume on the cPanel account. Its CloudLinux Node.js selector offers Node 24.21.0 at most. D-032 kept a Node 26-only rule.
- Decision: the code supports Node 24.11 and later (`engines` `>=24.11 <27` in the root and server manifests, `scripts/runtime.mjs`). Production runs Node 24.21 under Passenger. Development stays on Node 26 through Mise (`mise.toml`, `.nvmrc`). Code must not use Node 25 or 26-only APIs.
- Evidence: 16 October 2026, Node 24.21.0 (darwin-arm64): doctor, test:tooling, typecheck and every Vitest suite PASS (core 75, AI 161, export 89 + 1 skip, server 210 including MySQL). CI gains a `node24-host` job that repeats this on Linux and boots the release folder.
- Supersedes the Node 26-only runtime line of D-032 for production. Development is unchanged.

## D-038, 16 October 2026: one Passenger app on cPanel with local MySQL

- Context: D-015 kept the app on the Mac and the data in cPanel MySQL through Remote MySQL, because shared hosting seemed unable to run Chromium. The host now runs Playwright's chromium-headless-shell 1243 once two libraries are supplied.
- Decision: Volume runs fully on the host at https://volume.gakinz.com as one CloudLinux Passenger Node.js app at the domain root. Fastify serves the built web app and `/api` from one process (`app.cjs`, `server/index.mjs`). Production uses `DB_CLIENT=mysql` against MariaDB on localhost with two users: a runtime user (SELECT, INSERT, UPDATE, DELETE) for the app and a migration user (`MYSQL_MIGRATE_USER`) for `node server/migrate.mjs`. Production never auto-migrates and refuses to start while migrations are pending. better-sqlite3 is a development dependency, loaded only when `DB_CLIENT=sqlite`, so `npm ci --omit=dev` on the host needs no native SQLite. Files stay as BLOB chunks in MySQL (D-015 unchanged on that point).
- Consequences: Remote MySQL from the Mac is no longer the production path. The local library moves once with `npm run db:copy-to-mysql -w apps/server` (owner runs it). Passenger may stop an idle app; jobs are stored in the database and re-queued after a restart, and a cron keep-alive hits `GET /api/health`. Supersedes D-015 (Remote MySQL from the Mac). Deviation from the GEE OS `cpanel` profile rule "cPanel never runs Node": Volume needs Chromium, a job queue and SSE, which a PHP API cannot provide.

## D-039, 16 October 2026: Clerk sign-in with an owner allowlist

- Decision: the hosted app is gated by Clerk (application "Volume", created by the lead). The web app uses `@clerk/react` with `VITE_CLERK_PUBLISHABLE_KEY` at build time and shows Clerk's sign-in when signed out. The server verifies the Clerk session (Bearer token or Clerk's same-origin `__session` cookie, for SSE, images and downloads) on every `/api` request with `@clerk/backend` `authenticateRequest`, with `authorizedParties` set to `APP_ORIGIN` and networkless checks when `CLERK_JWT_KEY` is set. No session: 401. Signed in but not in `CLERK_ALLOWED_USER_IDS` or `OWNER_EMAILS` (verified addresses): 403. The first allowed sign-in binds the existing owner user (`users.clerk_user_id`, migration 0005); a further allowed account gets its own user with owner rights in the same workspace. `GET /api/health` stays public and answers only `{"status":"ok"}`.
- `AUTH_MODE=local` (the stub) remains the development default and is refused in production. Workspaces, memberships and roles stay as they are, so other self-publishers can be added later with their own workspaces.
- Replaces the "auth stub until phase 8" note in docs/05-security/AUTH-MODEL.md.

## D-040, 16 October 2026: GEE OS 1.4.5 on the cpanel profile

- Decision: the project card moves to GEE OS 1.4.5, profile `cpanel`, with the hosting facts above. Netlify and Supabase are not used. The rebuild plan (D-032) and the Full Product document hierarchy stay. Recorded deviations from the profile: Node runs on the host (D-038) and the backend is the existing Fastify server, not a PHP API.

## D-041, 17 October 2026: owners and order for phases 6 to 8

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** The lead asked for phases 6, 7 and 8 (`docs/01-product/ROADMAP.md`). `packages/core` has no single owner, and every exhaustive `Block` switch sits in `packages/core` and `packages/export` (`style.ts`, `markdown.ts`, `txt.ts`, `epub.ts`, `docx.ts`, `preflight.ts`, `print-html.ts`).
- **Decision:** Follow `docs/08-change-management/plans/PHASES-6-8.md`. In `packages/core`, volume-export owns blocks, parser, template checks, spreads and KDP maths; volume-backend owns the new `schedule.ts`. Migration numbers as built: 0006 picture books (`sections.layout`, `sections.image_asset_id`, table `picture_characters`), 0007 unused, 0008 Volume mode, 0009 invitations. The fiction ledger needs no migration (D-043). Owner gates stay between phases.
- **Options considered:** one core owner for everything (slows backend work on the scheduler); free-for-all in core (breaks typecheck when two agents change `Block`).
- **Consequences:** Export carries more work in waves 1 to 3. Undo by naming different owners in a later entry.

## D-042, 17 October 2026: workbook and fiction block dialect

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** The parser treats only `***` as a scene break (`packages/core/src/markdown.ts:119`) while the writer prompt and template use `* * *` (`prompts/writing/chapter.v5.md:89`, `config/book-templates/fiction.json:46`). Any `::: name` fence becomes one-line callout text (`markdown.ts:188-189`), and `::: lines N` renders only in PDF (`packages/export/src/print-html.ts:103-104`).
- **Decision:** Accept both `***` and `* * *`; write `***`. Add block types `exercise` (`::: exercise <kind> [title]`, nested blocks), `lines` (`::: lines N`, 1 to 30) and `checklist` (`- [ ]` items). PDF and DOCX draw lines and tick boxes. EPUB and TXT print the exercise and replace ruled lines with "Space to write your answer."
- **Options considered:** keep exercises as callouts (loses structure); fake ruled lines in EPUB (look broken on Kindle screens).
- **Consequences:** New goldens for fiction and workbook. Old manuscripts still parse. Undo by removing the block types; manuscripts keep the fences as callouts.

## D-043, 17 October 2026: fiction story bible and ledger kinds

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** `fiction.json:74` lists story bible fields with no schema or storage; `story_ledger.kind` has no character or setting (`docs/02-architecture/DATA-MODEL.md:119`).
- **Decision:** The story bible is a zod-checked `storyBible` object inside the blueprint data. Fiction and workbook books get their own prompt ids instead of new versions of the shared ones, so non-fiction books stay on `blueprint.blueprint` v5 and `writing.chapter` v5: `taskForTemplate` in `packages/ai` sends fiction books to `blueprint.blueprint-fiction` (writes the story bible), `blueprint.regenerate-part-fiction`, `writing.chapter-fiction` and `writing.extend-section-fiction`, and workbooks to `blueprint.blueprint-workbook` and `writing.chapter-workbook`. The story bible goes to prompts once, as `{{storyBible}}`, and is left out of `{{blueprint}}`. The ledger gains kinds `character` and `setting`, enforced by the zod schema with no migration (`story_ledger.kind` is a free string column; the list is `LEDGER_KINDS` in `apps/server/src/ports/ai.ts`), written by `checks.summarise-and-ledger` v5. `checks.consistency` v4 checks chapters against the story bible.
- **Options considered:** a `story_bibles` table (more code, versions already come with blueprints); reuse `person` and `place` (loses the link to the bible); new versions (`chapter.v6`, `blueprint.v6`) with a branch per template (the loader picks the latest version, so every non-fiction book would move to them and read rules meant for other templates).
- **Consequences:** Editing the bible means a new blueprint version, as for any blueprint change. Undo by ignoring the field; the kinds stay valid.

## D-044, 17 October 2026: picture books are print-only spreads on premium colour

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** Phase 7 needs a full-colour interior with bleed (FACTS 3.7, rule `print.bleed`). Config has only black-ink printing costs. KDP's Paperback Printing Cost page (https://kdp.amazon.com/en_US/help/topic/G201834340, read on the official page on 17 October 2026, FACTS 12.1 and 12.2) lists standard colour from 72 to 600 pages and premium colour from 24 to 828 pages. The trim table (GVBQ3CMEQW3W2VL6, FACTS 12.3) limits premium colour to 590 pages on 8.5 x 8.5 and shows colour only on white paper (FACTS 12.4, partial). The cover guide (G201953020, FACTS 12.5) gives the colour spine widths.
- **Decision:** A picture book is front matter, spreads (new section kind `spread` with text, image and layout) and back matter. Phase 7 exports a full-bleed print PDF and the pack, not EPUB or DOCX. Default trim 8.5 x 8.5 and premium colour ink. The colour rules are in `config/kdp-rules/2026-10-17.json` (facts in `docs/reference/reference-kdp-facts-2026-10-17.md`): costs, trim limits and spine widths are confirmed; white-only paper is partial, so anything that uses it shows a check-before-use note.
- **Options considered:** reflowable EPUB of the story (images lose the layout); fixed-layout ebook now (a separate format, more work than the phase allows); standard colour (would not allow a 24-page book if the page holds).
- **Consequences:** No picture-book ebook until a later decision. Undo by adding formats later; the spread model does not block them.

## D-045, 17 October 2026: consistent characters across spread images

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** The template asks for one reused character sheet (`config/book-templates/picture-book.json`, spreads). OpenRouter `POST /api/v1/images` accepts `input_references` and a `seed` "where supported" (https://openrouter.ai/docs/guides/overview/multimodal/image-generation, read 17 October 2026).
- **Decision:** Repeat the character sheet word for word in every scene prompt, make one reference image per main character first, send it as `input_references` on every spread, and pass a fixed `seed` when the model lists it in `supported_parameters`. No text in images. Each image is budget-checked before the call (D-025).
- **Options considered:** text only (drifts between spreads); fine-tuned models (not available through OpenRouter's images endpoint, and costly).
- **Consequences:** One extra image per main character. Re-verify the endpoint and the default image model before phase 7 starts, as for phase 4. Undo by dropping the references; prompts still carry the sheet.

## D-046, 17 October 2026: the title scheduler

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** Rule `titles.creationLimit` (factId 5.7, `config/kdp-rules/2026-10-06.json:740`) allows 2 new titles per book format per week; the reset time and start date are only partly verified (its note).
- **Decision:** Pure `checkTitleSlot` in `packages/core/src/schedule.ts` reads the limit from the rules file and refuses a slot when the same format already has the limit inside any rolling 7-day window in the workspace. One workspace is one KDP account, so all its pen names share the limit. The API answers 409 `title_limit` with the conflicting slots and the next free date.
- **Options considered:** calendar week from Sunday 00:00 UTC (not confirmed on an official page); per pen name (wrong, the limit is per KDP account).
- **Consequences:** Can be stricter than KDP near a reset. Undo by switching the window once the reset rule is confirmed.

## D-047, 17 October 2026: accounts on the single-owner cPanel host

- **Status:** Accepted (owner approved all seven as built, 17 October 2026).
- **Context:** D-039 lets every allowed Clerk account in as an owner of the owner's workspace (`apps/server/src/auth/clerk.ts:165-180`). Roles exist but only viewers are blocked (`apps/server/src/auth/context.ts:30-31`). Clerk roles need Organizations, and custom roles in production need a paid add-on (https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions, read 17 October 2026).
- **Decision:** Clerk stays for sign-in only; roles stay in `memberships`. Add invitations (owner adds an email and a role) and owner-only routes for settings, budgets and members. `ACCOUNTS_MODE=owner-only` is the default; `invite` turns invitations on. A route-by-route isolation test covers every registered route. Per-account OpenRouter keys are deferred: all AI uses the owner's key within workspace budgets.
- **Options considered:** Clerk Organizations and roles (paid in production, ties data rules to Clerk); open sign-up (not safe on a shared host); encrypted per-account keys now (holds other people's secrets on a host with no key service).
- **Consequences:** Other self-publishers cannot use their own OpenRouter credit until a later decision. A new env name goes in `.env.example` and `docs/07-operations/DEPLOYMENT.md`. Undo by leaving `ACCOUNTS_MODE` at `owner-only`.
- **Note, 17 October 2026 (review fixes):** Other workspaces spend the instance owner's key, and their own caps are theirs to set. The instance owner now holds `budget.guest_workspaces_monthly_cap_usd` (stored on the instance workspace, default 0, which refuses their AI and image runs with `guest_ai_disabled`), enforced in the job runner's reservation path for every call. Only the instance owner sees or sets it, and only the instance owner sees backup status. One account has one membership; the instance owner's pending invitation wins at sign-in. Details in `docs/05-security/AUTH-MODEL.md`. Accepted with D-047.

## D-048, 18 October 2026: book stage advances on title choice and when writing completes

- **Status:** Accepted (owner delegated the choice, 18 October 2026).
- **Context:** Stages are `idea, research, titles, blueprint, writing, editor, cover, export, marketing` (`apps/server/src/repos/books.ts:9`) and only move forward. Choosing a title leaves the book at `titles` (`apps/server/src/routes/planning.ts:117`); nothing sets `editor` or `marketing`, and picture books jump from `writing` to `export`. The Library and hub show stale stages.
- **Decision:** Choosing a title advances to `blueprint`. A shared predicate, writing complete (every enabled section that the AI or the owner writes has a current version with real text; owner placeholders and empty bodies do not count), advances to `editor` after each section save, AI or owner. A picture book uses the same predicate once its story is saved. No migration: `projects.stage` is free text and the values exist.
- **Options considered:** leave stages to the owner (stale today); derive the stage on read (breaks the forward-only history).
- **Consequences:** Existing books move forward the next time a section is saved. Undo by removing the two advance calls.

## D-049, 18 October 2026: one marketing gate, writing complete

- **Status:** Accepted (owner delegated the choice, 18 October 2026).
- **Context:** Marketing was gated three ways: the server opened it once any one section had text (`apps/server/src/routes/production.ts:36-42`), the web app once the stage passed `writing` (`apps/web/src/features/marketing/MarketingPage.tsx:60`), and UX-SPEC any time after the blueprint. Counts fell back to 3 while the spec says 5 (AC12.1, AC12.2) and the nonfiction template said 6 Instagram posts.
- **Decision:** Marketing opens when writing is complete (the D-048 predicate). The server computes it and returns `writingComplete` on the book; the web app reads that field and nothing else. Counts come from the book template (`marketing` defaults), 5 TikTok scripts and 5 Instagram posts for every template unless the template says otherwise; the nonfiction template is corrected to 5. The pack carries the matter-stage back-cover blurb (falling back to the blueprint blurb) and the short bio as text files.
- **Options considered:** any section written (scripts quote an unfinished book); after the blueprint (marketing with no text, against "scripts quote the finished chapters" in AI-PIPELINE).
- **Consequences:** Marketing opens later for books still being written. Undo by changing the one predicate.

## D-050, 18 October 2026: retention, data rights and server hardening

- **Status:** Accepted (owner delegated, 18 October 2026).
- **Context:** The 17 October privacy audit ([privacy inventory](../05-security/PRIVACY-INVENTORY.md)) left open: AI output kept after a book is deleted, `job_events` never pruned, the legal name in project zips (against [the data model](../02-architecture/DATA-MODEL.md)), no whole-workspace export and no way to remove an invited account. Its P3 items: full URLs, visitor IPs and `err.message` in logs; image uploads trusted on their declared type; loose `z.record(z.unknown())` bodies; HSTS without subdomains; SSE answers without the security headers.
- **Decision:**
  1. Retention. Deleting a book clears `prompt_runs.output`, `prompt_runs.error` and `prompt_runs.guardrails` (guardrail hits quote matched text; cost, tokens and model stay for spend) and deletes its job events, by book and by job. A daily in-process pass (at start-up, then every 24 hours, started alongside the nightly backup timer) deletes job events older than 90 days in every workspace, in batches of 1,000 by primary key below the ULID of the cutoff time (no full scan, no long lock).
  2. The project zip never carries the profile's `legal_name`, `location` or `is_real_person`. An import without them uses the column defaults.
  3. `GET /api/v1/workspace/export`, workspace owner only, streams a zip: `workspace.json`, `tables/<table>.json` for every table with a `workspace_id`, and `files/<asset id>/<file name>`. It is the owner's own copy of their data, so it includes the private profile fields. Two per minute per client IP and one at a time per workspace (409 `conflict`); both limits are per server process. The caller's workspace only; editors and viewers get 403.
  4. Account deletion. `POST /api/v1/me/leave` with `{ "confirm": "LEAVE" }` lets an invited editor or viewer leave (owners get 409). `DELETE /api/v1/members/:userId` now needs `{ "confirm": "REMOVE" }`. `DELETE /api/v1/workspace` with `{ "confirm": "DELETE" }` lets the owner of a guest (self-publisher) workspace delete it with every row and file (the instance owner's workspace answers 403; a running job answers 409). In all three, an account left with no membership is deleted, and invitations it accepted are marked revoked with the email blanked. Workspace delete removes file bytes one asset at a time before the row transaction and checks for running jobs again inside it. A wrong confirmation answers 409 `invalid_state`, a missing one 400.
  5. Logs carry the method, the path with any query replaced by `?[redacted]`, and a salted 12-character hash of the client IP (salt per process). Errors are logged by name, code and stack frames only, never the message. 500 answers keep the fixed message.
  6. PNG, JPEG, WebP and PDF uploads must start with their type's magic bytes, or nothing is stored (415). Picture kinds (logo, interior image, author photo, cover concept) refuse `application/octet-stream`.
  7. Typed bodies for the cover brief, cover typography and blueprint parts. Typography refuses unknown keys; the brief drops unknown keys, because the web app echoes stored AI output. Blueprint parts and chapters keep unknown keys as bounded JSON, so an edit or a restore never loses what the planner stored.
  8. HSTS is `max-age=31536000; includeSubDomains`. Event streams send the same security headers as other answers.
- **Not changed:** the OpenRouter `data_collection` setting stays as it is (owner decision; it may remove free models).
- **Options considered:** keep prompt-run rows whole (keeps unpublished text after a delete); keep the last event of each job (keeps data past 90 days); a two-step server-issued confirmation token (more state for the same protection as a typed word); refusing unknown brief and blueprint keys (blocks the owner's saves of AI-written data); dropping unknown blueprint keys (loses planner fields such as `promise` on restore); an index on `job_events.created_at` (needs a migration; the ULID id already orders by time).
- **Consequences:** Deleted books cannot be audited from their AI output. The web app must send the new confirmation bodies and can offer leave, remove, workspace delete and export. Undo per item; no migration.

## D-051, 19 October 2026: Moving a book between Volumes by project zip, never by database copy

- **Status:** Accepted (owner asked, 19 October 2026).
- **Context:** The owner's books live in the SQLite library on his Mac; the hosted app at volume.gakinz.com runs on MariaDB and does not have them. `db:copy-to-mysql` refuses a non-empty target unless `--replace`, which wipes the host. The older `POST /api/v1/projects/import` takes a raw zip and may copy the pen name.
- **Decision:**
  1. The project zip (`POST /api/v1/books/:id/export-project`) carries everything needed to rebuild the book: the book row and settings, blueprint versions, sections and every section version, matter, listing, marketing items, claims, cover and wrap metadata, research, titles and every stored file of the book, plus `manifest.json` with a format version, the app version, a size and sha256 per file and the source pen name only. It keeps the D-050 exclusions (no legal name, location or real-person flag) and carries no jobs, job events, prompt runs, spend, export rows or built export files.
  2. `POST /api/v1/books/import-project`, owner or editor, multipart/form-data with `profileId` (a pen name in the caller's workspace) and `file` (the zip). It checks the manifest, checksums, sizes, entry names and file signatures, caps entries (5,000), each expanded file (64 MB) and the expanded total (160 MB), then writes a new book with new ids under the chosen pen name in one transaction (files included, since they live in the database). The book's settings carry an origin note, "Moved from another Volume on <date>." It never overwrites a book. Only the owner keeps the book's own budget (clamped to 0 to 10,000); an editor's import gets the workspace default, so an edited zip cannot raise a spending cap. The book row is checked with the normal book rules and every link with the table it must point at. Five imports per minute per visitor, one at a time per workspace and two at a time per server process (409 `conflict`); the request needs an Origin header or `Sec-Fetch-Site: same-origin`; the server takes at most 5 minutes to receive any request. Nothing from the zip is logged.
  3. Multipart is read by a small in-house reader (`apps/server/src/lib/multipart.ts`) over Fastify's buffered body, so no new package is needed.
- **Options considered:** copy the database again with `--replace` (wipes the host); merge databases row by row (id clashes, other workspaces at risk); `@fastify/multipart` (a new package, not named in the docs).
- **Consequences:** Books move one at a time, and their export files are built again on the target. Old zips without a manifest still import through `POST /api/v1/projects/import`; the new route needs the manifest. Undo by removing the route; the zip stays readable by the older route.

## D-052, 19 October 2026: coalescing autosave and claim-fix rules

- **Status:** Accepted (owner request, 19 October 2026; rules set by the lead after review).
- **Context:** The editor needed autosave without a version for every pause, and the claims-to-verify report needed a way to fix a flagged sentence rather than only verify, soften with the stored wording or remove it. Both write section versions, and the claim fix calls the AI on reader-facing text.
- **Decision:** Autosave saves `owner:autosave` versions (`PUT /books/:id/sections/:sectionId/autosave`). While the current version is the same user's autosave, under 5 minutes old, it is updated in place, but only when the request's `baseRevision` matches that version's `updatedAt`; a mismatch is 409, and a request without `baseRevision` always makes a new version. Any explicit save, restore or AI version closes the window. `section_versions.created_by` (migration 0011) records the user. Claim fixes (`editing.claim-fix` on the editing model) return up to three options; code drops any option that cites a marker the book does not have, carries a link, or adds a number, an amount in words ("one in five", "half of") or a house-style guardrail pattern (according to, studies show, award words, percentages) that the sentence did not have. Applying saves `ai:claim-fix` (an option unchanged) or `owner:claim-fix`. An AI attribution resolves the claim as softened, never verified; only the owner's own rewrite (`own`) citing a valid `[[S<n>]]` marks it verified. Suggest and the section rerun (`/sections/:id/recheck`) each run under a lock and answer 409 while their job is unfinished, so no click pays twice; `GET /sections/:id/recheck` shows the cost first.
- **Options considered:** a new version per autosave (unbounded history); coalescing by version id alone (two tabs wipe each other); trusting the client to say whether the owner edited an option (the AI disclosure would rest on the client); letting an AI attribution verify a claim (the model citing a source is not the owner checking it).
- **Consequences:** The version list stays short during long edits, and `previousVersionId` points to the version before the session. A claim fixed with AI wording sets the book's AI text disclosure. Undo: drop the autosave route and migration 0011 (additive), and the claim-fix routes and job kind.

## D-053, 19 October 2026: public landing, how it works and branded sign-in

- **Status:** Accepted (owner asked for the pages and chose signed-out routing, 19 October 2026).
- **Context:** A signed-out visitor to the hosted app saw only the word Volume above Clerk's stock sign-in form. The owner asked for a landing page with only a hero (from the "Volume Hero" artifact), How it works as its own hero page, and a sign-in page in Volume's look, built with GSAP, Lenis and React Bits.
- **Decision:**
  1. Signed-out visitors on a hosted build get their own small router (`apps/web/src/site/PublicSite.tsx`): the landing hero at `/`, `/how-it-works`, and the branded sign-in at `/sign-in` and at every other path, so a deep link opens where it pointed after sign-in. Signed-in users keep `/` as the Library (superseded by D-054, 20 October 2026). Inside the app (signed in, or a local build) the same pages are at `/welcome` and `/how-it-works`; `/sign-in` sends a signed-in user to `/` and shows a local-build note when there is no Clerk key.
  2. The app router is created when the app first renders behind sign-in (`createAppRouter` in `Application.tsx`), so it starts from the address reached while signed out.
  3. New web dependencies, pinned: `gsap` 3.15.0, `@gsap/react` 2.1.2, `lenis` 1.3.27. They load only with the public pages (a lazy chunk); the app screens keep motion/react. React Bits SplitText, ShinyText and DecryptedText are adapted into `apps/web/src/site/bits/` (MIT, credited in each file), not installed.
  4. The Clerk form is themed through `appearance.variables` set to the `--vol-*` tokens, so light and dark both follow.
  5. Copy stays truthful: the sample book is labelled as sample content, the pages say Volume is a private studio with access by invitation, and `noindex` stays.
- **Options considered:** landing at `/` for everyone with the Library only at `/library` (changes existing behaviour and tests); building with motion/react only (no new packages, but not what the owner asked for).
- **Consequences:** about 34 kB gzip of extra script for signed-out visitors only. Undo by restoring the old signed-out branch in `HostedAuth.tsx` and removing `apps/web/src/site/` and the three routes.

## D-054, 20 October 2026: the landing is the front of the app

- **Status:** Accepted (owner asked, 20 October 2026).
- **Context:** D-053 showed the landing hero at `/` only to signed-out visitors; a signed-in visitor to volume.gakinz.com went straight to the Library. The owner wants the landing to be the front of the app for everyone, and signing in to lead to the Library.
- **Decision:** `/` is the landing hero for every visitor. The Library (the app's home screen) moves to `/library`, which it already answered. Signed in, the landing's nav and button say "Open library" and go to `/library`; signed out, they say "Sign in". Signing in from `/sign-in` or `/` leads to `/library` (Clerk `fallbackRedirectUrl`); signing in from a deep link returns to that link. `/sign-in` while signed in goes to `/library`; `/welcome` now redirects to `/`. Every in-app link to the Library (sidebar, breadcrumbs, Page not found, screen errors, New book, Published) points at `/library`. Sign-out still lands on `/`.
- **Options considered:** send signed-in visitors from `/` straight to `/library` (the landing would never show to the owner); keep D-053 (the owner's complaint).
- **Consequences:** bookmarks of `/` open the landing, one click from the Library. Undo by restoring `{ path: "/", element: <LibraryPage /> }` in the app shell and the old `screens.library.path`.

## D-055, 21 October 2026: clean first drafts, the clean-handbook look and Pages files

- **Status:** Accepted (owner asked, 21 October 2026: "production should be original and the fixes should be minimal").
- **Context:** a new non-fiction book needed about 177 fixes before its pack would build. Most were claims about harmless details (an invented example brand, a glossary definition, a product named in passing), example prompts written with square-bracket placeholders, and summaries missing on short end pages. The owner's own catalogue (Harni Muharami's 16 books, the NHS Boundary Handbook as the model) is plain prose in one sans typeface with one navy accent.
- **Decision:** the claims checker files only statements that could do harm if wrong (claims v5, low-risk harmless items dropped, no model claims on the review request, Also by and How to use pages, glossary only medical and legal). A claim's fixed wording is never filed again. Writing prompts v7 carry clean-draft and humanizer rules and the book type's rules as plain lines; summaries v6 fit short pages; summary and checks steps retry once before a flag. A pen name's writing samples reach the writer. A `clean-handbook` interior theme matches the handbook, with quiet page numbers that can be switched off. A Mac command (`npm run pages`) and an opt-in local pack step add a `.pages` copy of the DOCX.
- **Options considered:** keep the broad checker and auto-fix more afterwards (more spend and more owner review); the handbook's bare pages with no numbers (kept as a theme switch, numbers on by default for print readers); making `.pages` on the host (not possible on Linux, so it runs on the Mac).
- **Consequences:** fewer open claims and flags per book; real medical, legal and financial statements are still filed. The effect on live output is unproven until the next live run. Undo by pinning the previous prompt versions and choosing another interior theme.

## D-056, 22 October 2026: rebuild the whole book from the start

- **Status:** Accepted (owner asked, 22 October 2026: regenerate a book and all its content from the start, the blueprint following a new title, with named versions to go back to).
- **Context:** a new title chosen on Titles only changed the book's title. The blueprint and the written chapters still followed the old one, and the owner could only rewrite section by section. Approving an older blueprint again also put its title back over the new one.
- **Decision:** a `rebuild_book` job (control lane) builds a new blueprint for the title (it keeps the chosen title exactly), approves it with a rebuild sync, then writes every AI-written section again in order, front matter to back matter, and the listing after them. The rebuild sync matches parts and chapters by number, adds new ones, switches off the ones the new plan drops (never deletes) and puts every section back in reading order; the introduction and conclusion take the new plan. The blueprint version and every section version it saves carry one name: "Rebuild N from new title: X", or "Rebuild N: whole book from the start". A title is "new" when it differs from the title the approved blueprint was planned for. The job keeps where every section stood before it started (current version and on/off) in its payload, so "Go back to before this rebuild" restores the title, the approved blueprint and every section, each as a new version named "Back to before rebuild N". Routes: `POST /books/:id/rebuild`, `GET /books/:id/rebuilds`, `POST /books/:id/rebuilds/:jobId/undo`. The panel sits on Blueprint and, once the book has text, on Titles.
- **Options considered:** a new table for rebuilds (a migration on the cPanel host for data the job payload already holds); deleting chapters the new plan drops (loses text the owner may want back); rewriting only changed chapters (the owner asked for the whole book).
- **Consequences:** a rebuild runs the AI on the whole book, so it spends money; the book and monthly budgets still apply and the dialog says so. The cover image, About the author and owner-only pages are not changed; a cover made for the old title must be made again. The listing has no history, so an undo keeps the rebuilt listing. Picture books keep their own Spreads pipeline.


## D-057, 22 October 2026: no book or monthly spending cap

- **Status:** Accepted (owner asked, 22 October 2026: the limit "just makes you waste time"; use what is on OpenRouter and be alerted when a top-up is needed).
- **Context:** the per-book budget and the monthly cap paused jobs mid-book. A rebuild of "How To Hand Over" stopped at 5% for $2.67 and the page still said "Writing the book", so it looked frozen. The pause existed to stop runaway spend, but the real limit is the provider's credit.
- **Decision:** the runner no longer pauses a job for a book budget or the monthly cap, and the picture route no longer refuses at the budget. Spend is still recorded and shown. When the provider reports no credit (OpenRouter HTTP 402), the job pauses as `paused_budget` with error code `credits_exhausted`, the book page shows "AI credits have run out" with a link to top up and a Continue button, and finished work is kept. The guest workspace cap (D-047) stays, because other workspaces spend the owner's key. The writing page now treats a paused parent job as paused and shows the banner from the saved job, so it survives a reload.
- **Options considered:** keep the caps with a bigger default (still stops books mid-way); remove the guest cap too (lets invited workspaces spend the owner's credit without limit).
- **Consequences:** a book can spend more than its budget figure; the budget bars are now guides only. Watch the OpenRouter balance. Undo by restoring the book and monthly checks in `JobRunner.checkBudget` and the route check in `routes/spreads.ts`.

## D-058, 22 October 2026: Anthropic first, OpenRouter as the fallback

- **Status:** Accepted (owner asked, 22 October 2026: "use the anthropic key first and if no funds in it, then use the openrouter"). Changes the stack line "OpenRouter only". The owner approved installing `@anthropic-ai/sdk` and the routing below.
- **Context:** the owner has an Anthropic API key and wants it used before OpenRouter credit.
- **Decision:** `ANTHROPIC_API_KEY` is optional and server side only. When set, `AnthropicFirstProvider` wraps the OpenRouter client. A text call whose model is a Claude slug (`anthropic/` or `~anthropic/`, mapped to the Anthropic id) and that needs no web search goes to the Anthropic Messages API first. A billing error (HTTP 400 or 402 saying the credit balance is too low) moves that call to OpenRouter, skips Anthropic for 10 minutes, and shows "Anthropic credit has run out" until Anthropic answers again. Other Anthropic errors (bad key, outage) are not hidden. Non-Claude models, web search calls, images, the model list and key checks stay on OpenRouter. Structured answers are asked for in the prompt and checked by the existing repair step. `temperature` is never sent.
- **Options considered:** map every stage to Claude (changes behaviour and cost); fall back on any Anthropic error (hides a bad key); native structured output (schema limits could reject our schemas).
- **Consequences:** prices for Anthropic calls are computed from a table in `packages/ai/src/provider/anthropic.ts`; update it when Anthropic's prices change. Not tested against the live Anthropic API yet (no key in this session): unit tests cover routing and fallback only. Undo by leaving `ANTHROPIC_API_KEY` empty.

## D-059, 23 October 2026: a reference-guide book path

- **Status:** Accepted (owner asked, 23 October 2026: a UK nurses' abbreviations handbook with clean tables).
- **Context:** the non-fiction template forbids tables in prose and expects narrative chapters, so an abbreviations handbook could not be written cleanly.
- **Decision:** add the `reference` template (tables and short lists allowed, six chapters of about 1,800 words, Quick Check list, no exercises, no bridge), the `clinical-reference` book type (health, 12,000 to 30,000 words, default 20,000) and the prompt `writing.chapter-reference` v1 (task `writing.chapter-reference`, chosen by `TEMPLATE_TASKS.reference`). The prompt writes Abbreviation | Meaning | Use or note tables, flags ambiguous or do-not-use abbreviations, never gives doses, thresholds or treatment instructions, and always points readers to their employer's approved list and local policy. No code rule rejected tables, so no checker changed.
- **Options considered:** turn tables on in the nonfiction practical variant (changes every existing book); reuse the workbook template (exercises are required there).
- **Consequences:** book types now number 36 and tasks 39. The prompt is untested against a live model; the owner should read the first chapter for abbreviations outside widespread UK use. Undo by removing the three files and the registrations.

## D-060, 25 October 2026: Export is the last step, and a pack stays "exported" until something in it changes

- **Status:** Accepted (owner asked, 25 October 2026: make Export the last item, export the marketing items with the bundle, well detailed and clearly named, and keep the bundle marked exported until any new change).
- **Context:** the step bar ended with Marketing, so the marketing posts were written after the pack. The pack held three combined marketing files, and it went stale only when the manuscript or the marketing changed, not when the title, listing, covers, claims or author details did.
- **Decision:** the step order is Research, Titles, Blueprint, Writing, Editor, Cover, Marketing, Export. The pack's `marketing/` folder holds `00-START-HERE.txt` (what is there and how to use it), then `tiktok/`, `instagram/` and `email/` with one file per post named `<platform>-<number>-<what it is about>.txt` and one `all-...` file per platform. A pack stores a fingerprint (`p1:` plus a hash) of everything it carries: manuscript, title and subtitle, author details, listing, ISBNs, AI disclosure, claims, every marketing post and the covers. GET `/books/:id/exports` marks the pack `stale` with reason `changed` when the current fingerprint differs; older packs keep the manuscript and marketing comparison. The step bar and the Export page show Exported while the newest pack matches, and Changed since export otherwise. Putting a change back makes the pack Exported again.
- **Options considered:** compare update times (job progress and status changes would mark packs stale falsely); a new database column (needs `--migrate` on the host); keep Export before Marketing (marketing could not be in the pack).
- **Consequences:** the fingerprint reuses the existing `manuscriptHash` column for packs, so no migration is needed. The Library cards do not show an Exported chip yet (computing it for every book needs the full export book).

## D-061, 25 October 2026: sample data only for a page that never reached the API; after that, keep the last real data

- **Status:** Accepted (the owner appointed the integrator to decide for this round; rule: never replace real data with invented data). Refines D-016.
- **Context:** D-016 introduced demo mode for a local build with no API. The health check ran every 30 seconds and a failure switched the whole app to sample data, so a server that died mid-session replaced the owner's real books with invented ones and an invented "October spend $4.82 of $40", under only a small Demo badge.
- **Decision:** sample data is used only when the app has never reached the API in this page session. Once the health check has answered once, the source stays the API for the rest of the page session. A later failure keeps the last real data on screen (the TanStack Query cache), shows the banner "Not connected. Showing your last saved view. Reconnecting..." (the hosted build's Not connected badge stays in the top bar), and refuses writes with a plain reason ("Not connected, so this change was not saved"), nothing is queued behind the owner's back. The health check retries with backoff while offline (2 s doubling to 30 s) and any data call that gets no answer starts the offline state at once. When the API answers, every query is refetched and the banner clears. The hosted build is unchanged: it never used sample data.
- **Options considered:** keep the swap and make the Demo badge louder (still shows invented figures as if real); clear the data and show errors (loses the last real view); queue writes for later (a late write the owner has forgotten is worse than a clear refusal).
- **Consequences:** a screen opened for the first time while offline waits on its loader under the banner until the API returns. The write buttons are not individually greyed out: the shared mutation guard stops every write and each screen shows the reason in its existing error line. A page reload with the server still dead starts a new page session, so it shows the sample data under the Demo badge again, as D-016 intended for a build with no server.

## D-062, 27 October 2026: origin lock by Cloudflare's IP ranges, in the server, rolled out off, report, on

- **Status:** Accepted (owner OK, 27 October 2026: "yes and fix everything that fails", on the audit item "make the origin lock real").
- **Context:** the docroot `.htaccess` lets through any request that carries a `CF-RAY` header, which anyone can send. A caller who finds the origin IP could skip Cloudflare and, because `TRUST_PROXY` trusts `CF-Connecting-IP`, spread requests over made-up IPs to get round the per-IP rate limit. Sign-in still guards every `/api` call.
- **Decision:** a new setting, `CLOUDFLARE_ONLY` (`off`, `report` or `on`, default `off`). When set, an `onRequest` hook that runs before the rate limit walks back from the socket through `X-Forwarded-For` to the first hop that is not loopback or private, and checks it against Cloudflare's published ranges (`CLOUDFLARE_RANGES` in `apps/server/src/http/hosting.ts`, from cloudflare.com/ips on 27 October 2026, matched with Node's `net.BlockList`). `report` logs a hashed address and lets the request through; `on` answers 403 `not_via_cloudflare`. Paths under `/.well-known/` pass, as in the `.htaccess`. The `.htaccess` block stays as a first layer.
- **Options considered:** Cloudflare Authenticated Origin Pulls (needs client-certificate checks in LiteSpeed, which shared cPanel hosting does not let us set); an IP allowlist in `.htaccess` (LiteSpeed's support for CIDR rules there is unproven, and a mistake takes the site down for everyone); a secret header added by a Cloudflare Transform Rule (works, but keeps a shared secret in two dashboards).
- **Consequences:** it relies on LiteSpeed appending the Cloudflare peer to `X-Forwarded-For`, which is not yet verified on the host, so it ships `off` and the owner moves to `report`, then `on` (steps in `docs/07-operations/DEPLOYMENT.md`). The ranges are a list in code; when Cloudflare changes them, update the list. Undo by setting `off`.

## D-063, 28 October 2026: cache the system part of direct Anthropic calls

- **Status:** Accepted (owner OK, 28 October 2026: "yes go ahead", after Anthropic reported a low prompt cache hit rate on the org's direct API traffic).
- **Context:** D-058 sends Claude text calls to the Anthropic Messages API first. Those requests carried no `cache_control`, so nothing was ever cached and every call paid full price for its whole prompt. Anthropic caches only an unchanged prompt start that is marked, and only from 512 tokens on current models.
- **Decision:** `AnthropicClient` sends the system part as one text block with `cache_control: { type: "ephemeral" }` (5-minute cache). The user part is not marked, because it differs on every call and a mark there would pay the cache write price (1.25 times input) for text never read back. A test keeps per-chapter variables out of system parts, with the ones present today listed as known exceptions. Fable 5.1 cache reads are priced at $0.25 per million tokens (was $1).
- **Options considered:** top-level automatic caching (lands after the unique user part, so it is a surcharge on single-turn calls); the 1-hour cache (twice the write price; only worth it if calls in a book start more than 5 minutes apart, not yet measured).
- **Consequences:** the per-book material (blueprint, research sources, template, earlier summaries) still sits in the user part after the chapter details, and `chapter.isLast` and `chapter.wordTarget` sit in the system part, so the large shared context is not yet reused. A prompt reorder (new prompt versions) is the next step and needs the owner's OK. Calls that fall back to OpenRouter are unchanged. The server's usage records have no cache column, so hit rates are visible only in the Anthropic Console for now.

## D-064, 28 October 2026: per-book material first in the chapter prompts, with a second cache mark

- **Status:** Accepted (owner OK, 28 October 2026: "Go ahead and do that now", on the prompt reorder plan after D-063).
- **Context:** after D-063 only the system part was cached. The large shared context (blueprint, research sources, template, story bible) sat after the chapter details in the user part, and `chapter.isLast`, `chapter.wordTarget`, `chapter.povCharacter` and `currentWords` sat in system parts, so most of each chapter call was paid in full.
- **Decision:** a prompt's User part may hold a `# Per call` heading. The loader renders both halves into one user message and records where the shared half ends (`cachePrefix` on the message). `AnthropicClient` sends that message as two text blocks with `cache_control: ephemeral` on the first; only the first such message is marked, so a request uses at most two cache marks. OpenRouter sends `role` and `content` only, so it gets the same text as before, as one plain message. New versions: writing.chapter v10, chapter-fiction v2, chapter-workbook v3, chapter-reference v2, extend-section v7, extend-section-fiction v2. Each puts the per-book material above the heading and the earlier summaries, used-already list and chapter details below it, and its System part points to the word target, last chapter flag and viewpoint character instead of holding them. The guard test now also covers `currentWords`, and checks each split prompt's shared half holds no per-chapter value.
- **Options considered:** reordering the introduction and conclusion as well (rejected: each runs once per book, so nothing would be read back); a third mark after the earlier summaries, which only grow (rejected for now: more marks, more write cost, not measured); fixing the packer's source excerpt choice once per book (not done: excerpts are dropped only above 60% of the model's context, which no book has reached, and once dropped they stay dropped as the summaries grow, so it costs one cache miss at most).
- **Consequences:** the model now reads the chapter task at the end of the message, after the long reference material, which is the order Anthropic recommends; quality still needs a live check. `profile.factsUsedIn` stays in the system part and changes once or twice per book, which costs a cache write each time. Live check, 28 October 2026 (owner OK, `packages/ai/scripts/live-cache.ts`, three chapters of a ten-chapter blueprint on claude-sonnet-5-5 through Anthropic): chapter 1 read 0 tokens from the cache (write), chapters 2 and 3 read 8,688 of 9,239 and 9,379 input tokens (94%). Total $0.081. All three chapters kept the subheadings in order, used no dashes, opened differently and passed the guardrails; chapter 1 ran 19% over its 500-word target, chapters 2 and 3 within 10%.

## D-065, 28 October 2026: frost and glass for the app shell (studio redesign, stage 1)

- **Status:** Accepted (owner approved the studio redesign plan, 28 October 2026, and said "go ahead" on the stage 1 screenshots).
- **Context:** the owner chose the Volume Studio prototype as the new look. Its shell (side menu, top bar, job bar, cards) sits on a pale frost sky with soft mountains in light and deep navy in dark, with translucent glass layers. D-014 said cards are flat and gradients are never decoration.
- **Decision:** the app shell uses frost and glass. Values live in `packages/ui/glass.css`, hand written and imported after `tokens.css` and `theme.css`. Glass is only for the side menu, the top bar, the job bar and cards. Every glass layer turns solid without `backdrop-filter` or when the system asks for less transparency. Body text stays at 4.5:1 or more on the darkest backdrop each layer can sit on. Book content keeps the D-014 rules: covers are the only pictures, Literata for the book, gilt for the one next step. Plan: `docs/08-change-management/plans/2026-10-28-studio-redesign.md`.
- **Options considered:** retuning `tokens.json` and the generated files (rejected for now: the frost values need translucency the build script does not check); Manrope as in the prototype (rejected: new font package, Schibsted Grotesk stays).
- **Consequences:** the light hills are fainter than in the prototype to keep hint text at 4.5:1. The warm grey step bar and footer clash a little with the frost until stage 2 replaces them.

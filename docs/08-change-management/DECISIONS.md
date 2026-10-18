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

# apps/server

Volume's local API. Fastify under `/api/v1`, Kysely over SQLite (local and tests) or the owner's cPanel MySQL (production, D-015), a database-backed job queue, live progress over SSE, and files stored in the database as 1 MB chunks. It binds to `127.0.0.1:5181` only.

AI and export work go through two ports (`src/ports/ai.ts`, `src/ports/export.ts`). Each has a real adapter on the workspace packages (`@volume/ai`, `@volume/export` with `@volume/core`) and a mock adapter that returns deterministic content marked `[MOCK]`, so every flow also works with no key and no network call. See AI provider and Export provider below.

## Run it

```bash
npm run dev -w apps/server        # tsx watch, http://127.0.0.1:5181/api/v1/health
npm run build -w apps/server      # tsc to dist/
npm run start -w apps/server      # node dist/index.js
npm run typecheck -w apps/server
npm run test -w apps/server       # vitest, SQLite in memory
npm run migrate -w apps/server    # apply migrations to the configured database
npm run seed -w apps/server       # copy config/profiles/*.json into the database (new ones only)
```

On start the server migrates the database (`AUTO_MIGRATE`), creates the single owner user and workspace if missing, seeds profiles from `config/profiles/` and starts the job runner.

## Environment

Read from the root `.env` with dotenv (quietly, never printed). A blank line such as `MYSQL_HOST=` counts as unset. Names only:

| Name | Default | Meaning |
|---|---|---|
| `DB_CLIENT` | `sqlite` | `sqlite` or `mysql` |
| `SQLITE_PATH` | `data/volume.sqlite` | Relative to the repo root |
| `MYSQL_HOST`, `MYSQL_PORT` (3306), `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD` | | cPanel database |
| `MYSQL_SSL` | `verify` | `verify` (TLS, certificate checked) or `off` |
| `MYSQL_SSL_CA` | | Optional path to a CA certificate (PEM) when the host uses a private CA |
| `MYSQL_CONNECTION_LIMIT` | `5` | Pool size |
| `HOST`, `PORT` | `127.0.0.1`, `5181` | Any other host is refused at start-up |
| `WEB_ORIGINS` | `http://127.0.0.1:5180,http://localhost:5180` | Web app origins allowed on writes |
| `LOG_LEVEL` | `info` | `silent` turns logging off |
| `MAX_JSON_BYTES` | 2 MB | JSON body limit |
| `MAX_UPLOAD_BYTES` | 50 MB | Upload limit |
| `JOBS_ENABLED`, `AUTO_MIGRATE` | `true` | |
| `AI_PROVIDER` | `auto` | `mock`, `openrouter` or `auto`. See AI provider below |
| `OPENROUTER_API_KEY` | | Passed to `@volume/ai` only. Never logged, never returned. A blank value counts as no key |
| `EXPORT_PROVIDER` | `volume` | `volume` (real files from `@volume/export`) or `mock` (placeholders marked MOCK). See Export provider below |
| `RESOLVE_SOURCE_REDIRECTS` | unset (on) | `true` or `false`. Passed to `@volume/ai` (`createAiService`): look up search grounding redirect links in research sources. Blank counts as unset; anything else stops the server at start |
| `DATA_DIR` | `data` | Backups go to `DATA_DIR/backups`. Inside the repo only `data/` (or a folder in it) is allowed |
| `MOCK_STREAM_DELAY_MS` | `0` | Mock AI only: milliseconds between streamed chunks, so live text is visible in demos and UI tests. Blank counts as unset |
| `MOCK_FAIL_NEXT_WRITING` | unset | Mock AI only: the nth writing call (1 is the first) fails once with a model-unavailable error, so tests and demos can show a failed section, a retry and Write the rest. Later calls succeed. Blank counts as unset |
| `VOLUME_ROOT` | found automatically | Repo root override |

## AI provider

Job handlers reach a model only through `AiPort` (`src/ports/ai.ts`). Two adapters implement it:

- `src/adapters/mock-ai.ts`: deterministic `[MOCK]` content, no network.
- `src/adapters/openrouter-ai.ts`: the real one, on top of `@volume/ai` (`packages/ai`). It maps each server stage to one or more prompt tasks (for example `checks` runs `checks.claims` and `checks.consistency`), fills any prompt variable the server cannot supply with "None", maps the answer back to the server's shape and validates it with `AI_OUTPUT_SCHEMAS`. A mismatch fails the job with `invalid_output`. Rate limits, 5xx and timeouts become `AiRetryableError` (with `Retry-After` when given); an unknown or missing model becomes `AiModelUnavailableError`. Sources come only from OpenRouter `url_citation` annotations.

Which one runs is decided once at start-up and logged in one line (the key is never logged):

| `AI_PROVIDER` | Key set | Result |
|---|---|---|
| `mock` | any | Mock |
| `openrouter` | yes | OpenRouter, no key check |
| `openrouter` | no | The server refuses to start |
| `auto` or unset | no | Mock, with a line saying the key is not set |
| `auto` or unset | yes | OpenRouter if OpenRouter's key status accepts the key, otherwise mock with a line saying why |

The model for each call comes from the job runner (book, then profile, then workspace overrides, then `config/models.defaults.json`, D-019) and reaches the adapter as `opts.model`. Prompts load from `prompts/` and config from `config/` at the repo root.

A stage that makes several calls (checks, titles, matter, marketing, covers, weave) and fails part way has already spent money. The adapter attaches that spend to the error it throws (`attachPartialUsage` in `src/ports/ai.ts`); the runner reads it with `partialUsageOf`, writes a `prompt_runs` row with status `failed` and adds the cost to the book. The happy path is unchanged. The failed call's own spend is not known (the package's errors carry no usage).

## Export provider

`EXPORT_PROVIDER` picks the `ExportPort` adapter once at start-up and logs one line. `GET /health` shows `exporter.name`.

- `volume` (the default): `src/adapters/volume-export.ts` on `@volume/export` and `@volume/core`. Blank counts as unset.
- `mock`: `src/adapters/mock-export.ts`, small placeholder files marked MOCK. Tests use it unless they pass an exporter.

How the real adapter works:

- The server's sections become one `BookDoc` in position order. Chapters get `Chapter N` kickers, parts `Part I`. A leading `# heading` in a section's Markdown is dropped (the exporter sets the heading).
- The title page comes from the book (title, subtitle, pen name, edition). The copyright page is filled from the book template's copyright lines (`config/book-templates/<template>.json`): year, pen name, the template's default disclaimer, the illustrative-stories line when the book has it on, edition, ISBNs only when the owner entered them, and the imprint. Text the owner saved in the copyright section wins. Contents is built by the exporter.
- About the author is the profile bio word for word (`buildExportBook`), and preflight checks it against the bio.
- The interior theme is the book's `interiorThemeId` from `config/interior-themes.json`, then the book type's `defaultInteriorTheme`, then the package default. Cover styles follow the same order. KDP numbers come from `config/kdp-rules/` through `loadKdpRules`.
- One Chromium is launched on first use and shared by every PDF and cover build. It is released when the app closes (Fastify `onClose`, so SIGINT and SIGTERM release it too).
- `preflight` runs `runPreflight` with the KDP rules, `config/house-style.json`, the template, the listing from the approved blueprint, claims, the AI disclosure and the bio. A `fail` becomes `block`, which stops the export job before any file is built (docs/09). Sections the owner switched off count as off on purpose. Owner-entered ISBNs go to the package as `isbns`, so the ISBN guardrail lets them stand on the copyright page (any other ISBN still blocks); the listing check validates their checksum.
- `finalPreflight` runs preflight on the built files (interior PDF fonts, the real page count, margins, covers when built). The export job runs it before the pack: while it blocks, no pack is built, the job fails with `errorCode: 'preflight_blocked'` and a plain reason (for example "The upload pack was not built. The interior page count is outside KDP's limits for this trim: 12 pages (allowed 24 to 828). The other files are built and ready to download."), a `pack` export record is saved with `status: 'failed'`, the reason in `error` and the report in `preflight`, and the files built before stay as `done` exports. The job's `result.exports` lists them.
- `buildPack` reuses that report and zips the KDP upload pack. The export job adds the eBook cover and wrap from the cover studio when they exist, and passes the eBook cover JPEG to `buildEpub` as the EPUB cover image.

## Workspace packages

`@volume/ai`, `@volume/core` and `@volume/export` ship TypeScript sources with `.ts` import paths. The server imports them statically and type-checks them: `tsconfig.json` sets `allowImportingTsExtensions` with `rewriteRelativeImportExtensions` (TypeScript 5.7 and later, including 7). The package files are resolved through `node_modules` symlinks, so `tsc` checks them but does not emit them into `dist/`. At run time plain `node dist/index.js` loads them as `.ts` files: their real paths are outside `node_modules`, so Node 26 strips their types. That only works while the packages use erasable syntax (no enums, no parameter properties); `packages/core` and `packages/export` set `erasableSyntaxOnly` for that reason.

## Layout

```
src/
  index.ts            start-up: config, migrate, owner, seed, listen
  app.ts              Fastify instance, Host and Origin guards, auth stub, routes, runner
  config/             env (zod), repo root, read-only catalogues from ROOT/config
  db/                 Kysely per dialect, typed Database interface, migrations, migrate CLI
  repos/              one repository per aggregate; every query filters by workspace_id
  routes/             Fastify plugins under /api/v1, zod-validated
  jobs/               queue (claim, heartbeat, retry, parent and child, resume, cancel, pause), runner, handlers
  sse/                event bus (job_events) and the text/event-stream writer with Last-Event-ID replay
  files/              blob store: assets plus asset_chunks (1 MB, sha256), streamed in and out
  auth/               request context and the stub provider (one owner, one workspace)
  ports/              AiPort and ExportPort, plus the zod schemas the server checks AI output against
  adapters/           OpenRouter AI (@volume/ai), Volume export (@volume/export), mock AI and mock export
  seed/               profile seeding from config/profiles
test/                 vitest suites (SQLite in memory; MySQL only with MYSQL_TEST_URL)
```

## Request flow

1. `onRequest`: the Host header must be `127.0.0.1:5181`, `localhost:5181` or a web origin host (DNS rebinding guard, 421 otherwise). Writes with an `Origin` header must come from an allowed origin (403). The auth stub attaches `ctx = { workspaceId, userId, role }`.
2. Bodies are JSON only (the `text/plain` parser is removed, so cross-site form posts get 415). Uploads take a raw body on `POST /assets` only.
3. Routes validate params, query and body with zod and call repositories with `ctx`.
4. Long work (any AI call, covers, exports) enqueues a job and returns `202 { jobId, job }`. Progress arrives over SSE.
5. Errors always look like `{ "error": { "code", "message", "details"? } }`. Codes: `validation_failed`, `not_found`, `conflict`, `invalid_state`, `not_implemented` (501), `forbidden`, `bad_host`, `bad_origin`, `payload_too_large`, `unsupported_media_type`, `internal_error`.
6. Responses carry `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY` and `Cache-Control: no-store`. No CORS headers are ever sent.

## Endpoints (`/api/v1`)

| Method and path | What it does |
|---|---|
| `GET /health` | Status, database client, AI provider, exporter |
| `GET /settings`, `PATCH /settings` | Key present yes or no (never the value), budgets, month spend, workspace settings. Also `houseStyle` (`{ version, updatedOn, bannedCount, spellingPairs }`), `kdpRules` (`{ version, checkedAt, recheckDueAt, rules }`; due date is the checked date plus `recheckAfterDays`, 90), `openRouterCredit` (`{ limitRemainingUsd, limitUsd, usageUsd, isFreeTier }` from OpenRouter's key status, cached 5 minutes, or null), `backups` (see Backups), `houseStyleVersion`, `kdpRulesVersion` (newest `config/kdp-rules` file), `aiProvider`, `exportProvider` (`volume` or `mock`). PATCH takes `budget.monthly_cap_usd: null` to clear the cap and `book.defaults` (`{ bookTypeId, trim, paper, interiorThemeId, coverStyleId, wordTarget, chapterCount }`, all optional) for new books |
| `POST /settings/openrouter/test` | Checks the key with OpenRouter's key status: `{ ok, creditUsd, message }` (creditUsd is the limit left, null with no limit). Never returns the key |
| `GET /activity?limit` | Library live panel: `{ items: [{ id, kind, at, projectId, jobId, title, detail, live }] }` newest first. Kinds: `book_created`, `stage_changed`, `job_finished`, `job_failed` (top-level jobs only), `export_built` (upload pack), `published`. `live` is true for the last 5 minutes. `limit` 1 to 200, default 30 |
| `GET /archive` | Archived books, profiles and marketing items: `{ items: [{ kind: 'book' or 'profile' or 'marketing', id, title, detail, archivedAt, projectId, restorePath }] }` newest first |
| `GET /backups`, `POST /backups` | List (`{ items: [{ name, bytes, createdAt }], status }`) and make a backup now (201 `{ name, bytes, createdAt }`). MySQL: POST answers 501 `not_implemented` (cPanel backups cover it) |
| `GET /settings/models`, `PUT /settings/models` | Stage defaults from `config/models.defaults.json` merged with workspace overrides |
| `GET /book-types`, `/interior-themes`, `/cover-styles` | Read-only catalogues from `config/` (`available: false` when the file is missing) |
| `GET/POST /profiles`, `GET/PATCH /profiles/:id`, `POST /profiles/:id/archive`, `/restore` | Profiles (voice, publishing and models JSON). `bioStatus`: `confirmed` or `to_confirm`; POST and PATCH take it. Made in the app: `confirmed` unless given. Seeded: from the file's `status.bio` (`owner-to-confirm` is `to_confirm`; `confirmed` and `pen-name` are `confirmed`) |
| `DELETE /profiles/:id` | Owner-confirmed delete. Body `{ confirm: "<exact pen name>" }`. 409 unless archived, the name matches and the profile has no books (archived ones count). Samples and memory go with it. 204 |
| `GET/POST /profiles/:id/samples`, `PATCH/DELETE /profiles/:id/samples/:subId` | Voice samples (PATCH `{ kind?, title?, text? }`) |
| `GET/POST /profiles/:id/memory`, `PATCH/DELETE /profiles/:id/memory/:subId` | Profile memory (DELETE 204) |
| `GET /books?profileId&stage&status&published&q&limit&offset`, `POST /books` | Library list and create. Rows add `wordCount` (current versions of the sections switched on), `sectionCount`, `jobRunning` (a job queued, running or waiting), `coverAssetId` (chosen concept), `formats`, `packVersion`, `listPrices`, `marketplace` (see One book), and `runningJob` (`{ id, kind, status, progress }` of the newest top-level job that is queued, running, waiting, paused or paused for budget, or null). New books take missing fields from the `book.defaults` setting. Trims: `5x8`, `5.25x8`, `5.5x8.5`, `6x9`, `7x10`, `8.5x11`, `8x10`, `8.5x8.5` |
| `GET/PATCH /books/:id`, `POST /books/:id/archive`, `/restore`, `/publish`, `/unpublish`, `/duplicate` | One book, with the list extras. Published info: `publishedAt`, `marketplace` (default `amazon.co.uk`), `listPrices` (`{ ebook, paperback, hardcover }` in pounds, owner-entered), `formats` from the latest export job (`[{ format: 'Paperback' or 'Kindle eBook', kind, listPriceGbp, pages, exportKinds }]`), `packVersion` (upload packs built). PATCH takes `listPrices` (partial; null clears one) and `marketplace` (`amazon.*`; null resets) |
| `POST /books/:id/estimate` | Body `{ stage, sectionIds?, partTarget? }`. `{ stage, model, lowUsd, highUsd, calls, sections }` from the AI port's estimate with the model the settings pick (D-019). Per-section stages (writing, summarise, checks, editing, weave) sum over `sectionIds` or, for writing, every section not done (writing also counts each section's summary and checks); `partTarget` is the blueprint part for `blueprint_part` |
| `POST /books/:id/export-project` | A zip to move the book: `project.json` (the book, its pen name and every row under it) and `assets/<id>` (its files). Jobs, job events and AI call records are left out |
| `POST /projects/import?profileId` | Body: that zip (`Content-Type: application/zip`). Loads it into this workspace with new ids; links to rows that were not moved are cleared. Without `profileId` the matching active pen name in this workspace is used (same id, then same seeded source key, then one profile with the same pen name); only when none matches is a copy made. 201 `{ bookId, profileId, profileCreated, rows, assets, book }`; 400 for a file that is not a Volume project |
| `DELETE /books/:id` | Owner-confirmed delete. Body `{ confirm: "<exact title>" }` (title, else idea, else Untitled). 409 unless archived, the title matches and no job is running. Everything under the book goes (cascade from `projects`, plus its files, jobs and events); AI spend rows stay, unlinked, so the month's spend is right. 204 |
| `GET /books/:id/costs` | Budget, spend and prompt runs |
| `POST /books/:id/research` (job), `GET /books/:id/research`, `GET /research-runs/:id`, `PATCH /research-sources/:id` | Research with url_citation sources; tick "use in book". Sources carry `domain` (no "www."; null for an unresolved redirect), `redirectUrl` (the grounding redirect the URL came from) and `unresolved`. Runs carry `promptRunId`, `model`, `costUsd` and `guardrails` (see below) |
| `PATCH /title-sets/:id/options/:index` | Body `{ favourite }`. Stars or unstars one option; every option carries `favourite` (false by default). Returns `{ titleSet }` |
| `POST /books/:id/title-sets` (job), `GET /books/:id/title-sets`, `POST /title-sets/:id/choose` | Titles. Sets carry `promptRunId`, `model`, `costUsd`, `guardrails`. Body (all optional): `instruction`; `directionKey` (a direction of the latest set, or of `titleSetId`) or `direction` (`{ label, key?, angle?, audience?, promise? }` the owner wrote). With neither, the job suggests directions and writes titles for the first. A chosen direction keeps the earlier set's directions on the new set |
| `POST /books/:id/blueprints` (job), `GET /books/:id/blueprint`, `GET /books/:id/blueprint/versions`, `GET /books/:id/blueprint/versions/:version` | Blueprint and history. Versions carry `promptRunId`, `model`, `costUsd`, `guardrails` (null and 0 for owner edits). Without `chapterCount` the job uses `book.defaults.chapterCount` when set |
| `PATCH /books/:id/blueprint` | Owner edit of parts, saved as a new version (409 on a stale `baseVersion`) |
| `POST /books/:id/blueprint/regenerate` (job) | Regenerate `summary`, `chapters`, `chapter:<n>`, `front`, `back` or `listing` |
| `POST /books/:id/blueprint/approve` | Approve; creates the sections (or updates chapter plans and flags written chapters) |
| `GET /books/:id/sections`, `GET/PATCH /sections/:id` | Section tree with totals; one section with its current version and checks. Each section carries `guardrails` from its latest AI-written version (writing or weave run), or null, and `writtenBy`: `app` (title page, copyright, contents, about the author and the other code-written pages), `owner` (every version is the owner's) or `ai` |
| `POST /sections/:id/versions`, `GET /sections/:id/versions`, `GET /sections/:id/versions/:versionId` | Save (409 on a stale `baseVersionId`), list, read |
| `POST /sections/:id/versions/:versionId/restore`, `GET /sections/:id/diff?from&to` | Restore as a new version; line diff data |
| `POST /books/:id/write` (job), `POST /sections/:id/write` (job), `POST /sections/:id/edit-pass` (job) | Write the book (one child job per section, in order), one section, an editor pass |
| `POST /sections/:id/notes`, `GET /sections/:id/notes`, `GET /books/:id/notes`, `PATCH /notes/:id` | Author notes for "weave in" |
| `POST /notes/:id/reopen` | A woven (or dismissed) note goes back to `open`; `wovenVersionId` stays as history. 409 while it is being woven |
| `POST /sections/:id/notes/weave` (job) | Weave open notes into the text as a new `ai:weave` version. Body `{ noteIds?, mode? }`: `weave` (default, `writing.weave-note`) works each note into the prose; `expand` (`writing.expand-note`) turns each into a new subsection (a `##` subheading and 2 to 4 paragraphs in the profile voice). The version note says "Wove in" or "Expanded" |
| `POST /sections/:id/rewrite-selection` (job) | Body `{ from, to, instruction? }` (offsets in the current Markdown). Runs `writing.rewrite-selection`; the job's `result` is the proposal `{ sectionId, text, from, to, original, reason, baseVersionId }`. Nothing is saved: accept by saving a version |
| `GET /books/:id/find?q&case&word` | Literal search over each section's current text (About the author is skipped). `{ q, caseSensitive, word, total, sections: [{ sectionId, kind, title, number, enabled, versionId, count, matches: [{ start, end, before, match, after }] }] }`; offsets are in the section's Markdown, at most 200 listed per section |
| `POST /books/:id/replace` | Body `{ q, replacement, case?, word?, sectionIds? }`. Saves one new `human` version per changed section (409 if a section changed meanwhile) and returns `{ replacements, sectionsChanged, versions: [{ sectionId, versionId, count }] }` |
| `GET /sections/:id/suggestions`, `POST /suggestions/:id/accept` (`remember` saves to profile memory), `POST /suggestions/:id/reject` | Suggestions |
| `GET /books/:id/claims`, `POST /claims/:id/verify`, `/soften`, `/remove` | Claims to verify; soften and remove edit the text as a new version. Claims carry `suggestedSoftening` (the checks stage's softer wording, or null); `soften` uses it when the body has no `replacement` (400 when there is neither) |
| `GET /books/:id/cover`, `PUT /books/:id/cover/brief`, `POST /books/:id/cover/concepts` (job), `POST /books/:id/cover/choose`, `POST /books/:id/cover/build` (job) | Cover studio. The concepts job keeps the owner's saved brief and only fills its empty fields. The build uses the `typography` saved by choose on top of the cover style: `styleId` and `paletteId` pick the style and palette from `config/cover-styles.json`, `showSubtitle: false` leaves the subtitle off, and `titlePosition` (top, middle, bottom), `titleTopPct`, `titleSize` (small, medium, large or a size), `palette` or `colours` (hex by role), `fonts`, `align`, `titleUppercase` and `authorUppercase` change the style (`applyCoverTypography` in `@volume/export`) |
| `GET /books/:id/preflight`, `POST /books/:id/exports` (job), `GET /books/:id/exports`, `GET /exports/:id/download` | Exports, stale flag by manuscript hash |
| `POST /books/:id/marketing` (job), `GET /books/:id/marketing`, `PATCH /marketing/:id`, `POST /marketing/:id/archive`, `/restore` | Marketing items. Items carry `subjectLines` (launch email: every subject line; `title` is the first) and `imageIdea` (Instagram); TikTok items keep their `hashtags` |
| `POST /marketing/:id/regenerate` (job) | Writes that one item again in place (same id and kind, back to `draft`). Body `{ instruction? }` (kept in the job payload; the marketing prompts have no instruction field yet) |
| `GET /marketing?status&kind&limit` | Marketing items across every book (for example `status=archived`) |
| `GET /jobs/:id`, `GET /books/:id/jobs`, `POST /jobs/:id/cancel`, `/pause`, `/resume` | Jobs. Writing jobs (`write_book`, `write_section`, and the children in `GET /jobs/:id`) carry `etaMs` (from the average run time of finished sibling sections; null when finished or nothing has finished yet) and `model` (the last writing call's model, else the one the settings pick). Other jobs: both null. A failed job may keep a `result` (an export stopped by the final preflight lists the files it built) |
| `GET /books/:id/events`, `GET /events?projectId` | SSE. Send `Last-Event-ID` (or `?lastEventId=`) to replay stored events |
| `POST /assets?kind&filename&projectId&profileId`, `GET /assets/:id`, `GET /assets/:id/download` | Raw upload into chunks; metadata; streamed download (always by id, never by path) |

`guardrails` on research runs, title sets, blueprint versions and sections is `{ passed, needsAttention: [{ rule, severity, message, match, path?, phrase? }], rules: [{ rule, list, count, message, matches }] }` or null. The full report (with `blocking` and `styleRewrite`) is stored on `prompt_runs.guardrails`. The mock AI stores an empty, passing report.

SSE event types: `job.status` (writing children also carry `sectionId`), `job.progress`, `section.started` (`{ bookId, projectId, sectionId, jobId, attempt }` each time a writing child starts or restarts: clear any streamed text for the section), `section.delta` (streamed text, at most every 250 ms, never stored), `section.saved`, `check.result`, `claim.added`, `cost.update`, `budget.paused`, `export.ready`, `note.woven`, `cover.updated`, `book.updated`. A `: ping` comment goes out every 15 s.

## Database

- One schema, written once with the Kysely schema builder (`src/db/migrations/0001_initial.ts`), runs on both SQLite and MySQL. Column types are picked per dialect (`varchar(26)` ids and `mediumtext` and `mediumblob` on MySQL; `text` and `blob` on SQLite). MySQL tables are InnoDB, `utf8mb4`.
- ids are ULIDs (monotonic, so `job_events.id` doubles as the SSE id). Times are BIGINT milliseconds. Booleans are 0 or 1. JSON columns are text, parsed with zod in the repositories. AI money is a double in US dollars.
- Every table except `workspaces` and `users` has `workspace_id`; repositories add it to every query, and the tests prove a second workspace reads nothing of the first.
- Tables: workspaces, users, memberships, settings, author_profiles, profile_samples, profile_memory, projects, research_runs, research_sources, title_sets, blueprints, sections, section_versions, suggestions, author_notes, story_ledger, check_results, claims, assets, asset_chunks, covers, listings, marketing_items, exports, prompt_runs, jobs, job_events.
- `0003_round2` adds `claims.suggested_softening` and `marketing_items.extras` (JSON: `subjectLines`, `imageIdea`).
- `0002_gaps` adds `research_sources.redirect_url` and `unresolved`, `prompt_runs.guardrails`, `projects.list_prices` and `marketplace`, and `author_profiles.bio_status` (filled for existing rows from the seeded status).
- Adding a migration: create `src/db/migrations/0004_<name>.ts` with `up(m)` (and `down(m)`), add it to the list in `src/db/migrations/index.ts`, use `m.t.*` column types.

## Jobs

- Claim is an atomic compare-and-set (`UPDATE jobs SET status='running' ... WHERE id=? AND status='queued'`), safe on both dialects without row locks. Ready means queued, `run_after` reached and any `depends_on_job_id` finished well.
- Lanes: 2 AI jobs, 1 export job, 2 control jobs at once. Chapter jobs in one book are chained with `depends_on_job_id`, so they run in order.
- Heartbeat every 15 s; a running job whose heartbeat is older than 60 s goes back to the queue (crash or restart), keeping its attempt count.
- Retries: up to 3 attempts for retryable errors with 2 s, 10 s, 60 s backoff plus up to 20% jitter (`Retry-After` wins). Model unavailable, invalid AI output and bad input fail straight away.
- Budget: before each AI call the runner compares spend plus the high estimate with the book budget and the monthly cap; over the limit the job becomes `paused_budget` and `budget.paused` is sent. Raise the budget, then resume.
- A child that fails or is cancelled cancels the jobs that depend on it (`errorCode: 'dependency_failed'`, "Not started: an earlier section failed."), so a parent never waits for ever. The parent then ends as `failed` with `errorCode: 'child_failed'` and a plain summary such as "1 of 3 sections failed. 2 sections after it were not started. Retry the failed section, then write the rest." Their sections go back to `empty` (or `done` when they already had text). Writing the book again queues only the sections not done.
- Cancel aborts the running call and marks the job `cancelled`; pause stops between steps; resume re-queues. Children follow their parent.
- Every AI call writes a `prompt_runs` row and adds its cost to the book and the job in one transaction.

## Files in the database

- `assets` holds the metadata and the sha256; `asset_chunks` holds the bytes in 1 MB rows keyed by `(asset_id, chunk_index)`.
- Uploads stream in and are written chunk by chunk; downloads stream chunk by chunk. Memory use stays near one chunk whatever the file size.
- MySQL `max_allowed_packet` must be larger than one chunk plus overhead. Most cPanel hosts allow 16 MB to 64 MB; if a host is set to 1 MB, lower the chunk size in code (`DEFAULT_CHUNK_BYTES`, stored per asset so old files still read) or ask the host to raise it.
- `mediumblob` holds up to 16 MB per chunk and `mediumtext` up to 16 MB per text value.

## Pointing at the cPanel database

1. In cPanel, MySQL Databases: create a database and a user, add the user to the database with all privileges.
2. In cPanel, Remote MySQL: add the Mac's public IP address (search "what is my IP"). If your IP changes, update it here.
3. Ask the host whether MySQL accepts TLS. If it does, keep `MYSQL_SSL=verify` (add `MYSQL_SSL_CA` if they give you a CA file). If it does not, set `MYSQL_SSL=off` and accept that traffic is not encrypted.
4. In the root `.env`: `DB_CLIENT=mysql`, `MYSQL_HOST` (the server host name from cPanel, not `localhost`), `MYSQL_PORT=3306`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`. cPanel prefixes database and user names with the account name, for example `acct_volume`.
5. Run `npm run migrate -w apps/server`, then `npm run seed -w apps/server`, then start the server.
6. To test the MySQL dialect against an empty throwaway database: `MYSQL_TEST_URL=mysql://user:pass@host:3306/volume_test npm run test -w apps/server`.

## Backups

- SQLite: `POST /backups` runs `VACUUM INTO` to `DATA_DIR/backups/volume-<UTC time>.sqlite` (a consistent snapshot while the server runs, file mode 600). While the server runs it also makes one nightly: every 15 minutes it checks whether the local time has passed `backup.time` (default 02:00) and no backup was made today, so a Mac that slept catches up. `backup.enabled: false` switches the nightly one off. The newest 14 are kept; older Volume backups are removed.
- `GET /settings` and `GET /backups` show `{ lastAt, count, locationKind: 'local_folder' or 'cpanel', keep: 14, enabled, supported }`.
- MySQL on cPanel: Volume does not back it up (`POST /backups` answers 501 with a plain message). cPanel's own Backup or phpMyAdmin Export gives a full copy, including file chunks. A nightly `mysqldump --single-transaction --hex-blob` from the Mac is the scripted option (not built yet).
- Because files live in the database, one database backup holds the whole library.

## Security notes

- Listens on 127.0.0.1 only; config refuses any other host.
- The OpenRouter key is never read into the config object, never logged, never returned. Settings report only `present: true|false`.
- The logger redacts authorization, cookie and key-like fields and does not log bodies.
- Downloads are served by id with `Content-Disposition: attachment` (images may be inline), `nosniff` and a sandboxing CSP.
- Uploads accept a short list of types; imports must be `.md`.

## Limits and open points

- The writing job sends the section plan, the book type, the approved blueprint version (not a later draft), the book template's rules, the summaries of earlier sections (the last is the previous chapter), the ledger, ticked sources and the next chapter's title and summary.
- Checks in the writing job use `@volume/core` `checkText` with `config/house-style.json` (em and en dashes, banned phrases, US spellings, UK phrasing, guardrails such as ISBNs). Errors block the section; claims-report guardrails and warnings do not. The model adds claims and consistency notes.
- Blueprint approval adds Acknowledgements where the book template has it on by default (front in nonfiction, back in fiction and poetry).
- `model_choices` from docs/03 is folded into `author_profiles.models`, `projects.settings.models` and the workspace `models.overrides` setting.
- Docs 02 and 03 still say Drizzle; D-015 replaced it with Kysely.

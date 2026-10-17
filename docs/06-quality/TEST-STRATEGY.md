# 11 Testing

Every change is checked with typecheck, lint and the relevant tests before anyone calls it done (`AGENTS.md`, rule 3). Results are reported as PASS, FAIL, PARTIAL, NOT TESTED or BLOCKED with the command and its output.

## Tools and commands

| Layer | Tool | Command |
|---|---|---|
| Types | TypeScript strict | `npm run typecheck` |
| Lint | ESLint, Prettier | `npm run lint` |
| Unit and integration | Vitest | `npm test` (all workspaces) or `npm test -w packages/core` |
| Coverage | Vitest V8, enforced line thresholds | `npm run test:coverage` |
| Golden files | Vitest with fixtures in `tests/golden/` | `npm test -w packages/export` |
| End to end | Playwright with the mock AI provider | `npm run e2e` (added in phase 1) |
| Live AI | Budgeted owner run, separate from automated checks | No root live-test script exists. Agree the budget and set `LIVE_AI=1` before a live run |
| Hooks | Bash test script | `npm run hooks:test` |

Unit tests sit next to the code (`*.test.ts`) or in `tests/unit/`. Fixtures: `tests/golden/` (manuscripts and expected exports), `packages/ai/test/fixtures/` (mock provider answers).

Coverage targets: `packages/core` 90% lines, `packages/ai` and `packages/export` 80%, `apps/server` services 80%. Coverage is a floor, not a goal; every bug fix adds a test that failed before the fix.

The coverage command includes every `src/**/*.ts` file in core, AI, export and server, including files not imported by tests. The server threshold covers all server source, a broader scope than services alone. Each workspace writes ignored HTML and JSON reports under `coverage/`. CI runs this command instead of repeating the same tests without coverage. Branch and function coverage are reported but have no enforced target. The measured results are in [local validation](../../../reports/volume/qa/reports/LOCAL-VALIDATION-2026-10-06.md). Configuration follows the [official Vitest coverage guide](https://vitest.dev/guide/coverage.html).

## Unit tests (minimum set)

**packages/core**
- Parser: every block in the dialect (`docs/book-production/EXPORT-SPEC.md`); P02 Windowsill Herbs manuscript parses into the expected sections; round trip parse then write is byte-identical.
- Section kind mapping from headings, including `{kind=...}` markers.
- KDP maths against the FACTS worked examples: spine (3.9) for 120, 200 and 300 pages on white and cream; wrap size with 0.125 in bleed (3.8); eBook royalty 0.70 x (£2.99 - 2 MB x £0.10) = £1.953 (10.1); paperback printing cost 200 pages = £2.85 (3.3); minimum list price = printing cost / rate (3.4); royalty tier at £7.98 and £7.99 (3.1).
- Checkers: every phrase in the banned list is caught; every entry in the spelling map is fixed with case kept; em dash fixes; guardrail patterns (ISBN-like numbers, percentages, "studies show", attributions, URLs not in sources) caught with no false positive on a clean sample chapter.
- Title check: 199 characters passes, 200 fails (FACTS 5.4).
- Description length counts HTML tags (FACTS 5.3); keyword and category counts.
- ISBN-13 checksum validation (validation only; there is no generator to test).
- Template rendering: `{year}`, `{isbn_line}` present and absent, fixed years rejected.

**packages/ai**
- Context packer: priority order, trimming steps, refusal when blocks 1 to 3 do not fit.
- Model resolution: project over profile over workspace over config.
- Cost estimate and budget gate: a call that would pass the book budget is not sent.
- Retry and fallback with the mock provider's fault scenarios (`rate_limit`, `server_error`, `invalid_json`, `stream_cut`, `model_missing`); no silent model switch.
- Sources: only `url_citation` annotations become sources; URLs in plain text are ignored.
- Prompt loader: highest version chosen, pinned version honoured, missing placeholder fails.

**apps/server**
- Job queue: claim, retry with backoff, dependency order, resume after a simulated crash (stale lock), cancel, pause on budget.
- SSE: events in order, replay from `Last-Event-ID`.
- Repositories refuse queries without `workspace_id`; cross-workspace read returns `not_found`.
- Security: wrong Host rejected, wrong Origin on POST rejected, path traversal on downloads rejected, logger redacts keys.

## Golden files

| Export | Comparison |
|---|---|
| TXT | Exact bytes against `tests/golden/txt/*.txt` (includes the example in `docs/book-production/EXPORT-SPEC.md`) |
| MD | Exact bytes |
| DOCX | Unzipped, XML normalised (sorted attributes, ids and timestamps removed), compared per part |
| PDF | Page count, page size per trim, every font embedded, extracted text per page (pdfjs-dist), plus a pixel comparison of 4 pages (title, contents, a chapter opening, a body page) with a small tolerance |
| EPUB | File list, OPF metadata, nav entries; EPUBCheck when Java is present, otherwise NOT TESTED |
| Covers | eBook JPEG is 1600 x 2560, RGB; wrap PDF page size equals the formula to 0.001 in |

Phase 1 acceptance: the Windowsill Herbs manuscript exports match the Python build's page count, trim, fonts and text.

Updating a golden file needs a reason in the commit message and a look at the visual diff.

## Preflight tests

One fixture book per rule in the preflight table (`docs/book-production/EXPORT-SPEC.md`), each breaking exactly one rule, plus one clean book that passes everything. Each broken fixture must produce exactly the expected block or warning and nothing else.

## End to end (Playwright, mock provider)

Runs against the real server and web app with `AI_PROVIDER=mock` and a temporary data folder.
1. Add a pen name with a real-person flag; check the copyright preview shows the illustrative line and the current year.
2. New book from an idea; research shows sources; tick two.
3. Titles: an over-long option is not selectable; choose one.
4. Blueprint: regenerate one chapter; approve.
5. Writing: run, watch progress over SSE, restart the server mid-run, confirm it resumes and completes.
6. Editor: accept a suggestion, compare and restore a version, find and replace across the book.
7. Claims: resolve all; preflight shows no claim warning.
8. Cover: concepts, choose, build; export pack; unzip and check the file list.
9. Accessibility smoke: keyboard-only path through the wizard; focus visible on every step. An axe-based scan is proposed but needs the owner's OK to install.
Screenshots at 1440 and 390 px wide on every screen; no console errors allowed.

## Latest acceptance evidence

On 6 October, 499 local tests and all measured coverage thresholds passed; five mock browser scenarios passed. See LOCAL-VALIDATION-2026-10-06.md. The browser suite has since grown to seven tests in four specs (`npm run e2e`). Free live testing was separately authorised through the existing server with only verified zero-priced models: titles/blueprint pass, full writing fails, and both Gemma routes fail upstream. This does not validate paid defaults, research or covers. See FREE-AI-VALIDATION-2026-10-06.md. MySQL is deferred by the owner.

## Live AI runs

- Off by default. Need `LIVE_AI=1` and `LIVE_AI_BUDGET_USD` (the run stops before passing it). The owner's OK is needed because they cost money.
- One run per AI phase, recorded in `.agent/HANDOFF.md` with models, cost and results:
  - Phase 2: 3 or more working sources, 10 valid titles, a complete blueprint that passes validation.
  - Phase 3: a 3-chapter book with zero em dashes and banned phrases, chapters within 15% of target, and a successful resume after a restart.
  - Phase 4: 3 cover concepts and a valid wrap.
- Before phase 2 and phase 4: check model slugs and endpoints against openrouter.ai/docs and `GET /api/v1/models`.

## Hosting checks (D-037 to D-039)

- `apps/server/test/hosting.test.ts`: production settings refuse `AUTH_MODE=local`, a missing `APP_ORIGIN` and incomplete Clerk settings; Clerk mode answers 401 without a session, 403 off the allowlist and 200 for the owner (binding `users.clerk_user_id`); writes from another origin get 403; `/api/health` is public and says only `{"status":"ok"}`; other hosts get 421; pages carry the CSP and HSTS; the SPA fallback never hides a missing asset or API path; 500 answers never carry the error; rate limits per `CF-Connecting-IP`.
- `apps/server/test/mysql.test.ts` runs when `MYSQL_TEST_URL` is set (CI job `node24-host` sets it against MariaDB 11.4).
- The `node24-host` CI job runs doctor, tooling, typecheck and every Vitest suite on Node 24.21, then builds the release folder, installs it with `npm ci --omit=dev` (no better-sqlite3), migrates as the migration user and boots it on a runtime-only user, checking `/api/health`, a 401 and the web page.

## Hook tests

`npm run hooks:test` runs `.claude/hooks/test-hooks.sh`, which feeds sample tool calls to each hook and checks:
- reading or writing `.env` or anything in `data/` is blocked with a message;
- an em dash or banned phrase in a prompt or doc produces a warning, not a block;
- `docs/source-drafts/` is skipped by the house-style check;
- the session-end reminder fires;
- a broken hook fails open with a visible message.

## What counts as done

A change is done when typecheck, lint and the relevant tests pass, golden files are unchanged or deliberately updated, and the report names any test that could not run (for example EPUBCheck without Java) as NOT TESTED.

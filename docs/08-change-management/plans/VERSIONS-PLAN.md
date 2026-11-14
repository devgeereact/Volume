# Volume: versions plan

Status: APPROVED by the owner on 13 November 2026 ("Approved", covering the plan, retiring GSD, the core value sentence, the root-folder proposals and the paid docs graph run). Each file deletion and the paid run still get a one-line check before they happen. Ambiguous items (`qa/`, `local-live.json`) wait for a specific ruling.
Replaces: the GSD roadmap (`.planning/`, retired and deleted on 13 November 2026; its open items now live in [KNOWN-ISSUES](../../KNOWN-ISSUES.md)). The product history stays in [../../01-product/ROADMAP.md](../../01-product/ROADMAP.md).

## Why this exists

Volume is built but not proven. No book has yet gone from idea to a pack that KDP accepts. Work keeps spreading into side tasks (covers, claims, docs) because nothing says when a piece of work is finished. This plan fixes that with versions. Each version has a frozen finish line of at most 10 testable items, owned by the `/finish-app` rule. Anything else goes on the parking list and waits for a later version.

**Core value (ASSUMPTION, from the book rules in AGENTS.md; owner to confirm):** a book goes from an idea to a KDP-ready pack without human typing, in the author's own voice, with no invented facts, statistics, quotes or ISBNs.

## How we work from now on

1. **Superpowers is the method.** Brainstorm, write the plan, build with tests first, verify, review, finish the branch. GSD is retired.
2. **One task file.** `.agent/CURRENT-TASK.md` holds the current state. `.agent/HANDOFF.md` holds dated history. No other task files.
3. **One docs tree.** Everything written lives under `docs/`. Superpowers specs and plans go in `docs/08-change-management/plans/`, not in a new `docs/superpowers/` folder.
4. **One gate.** `npm run verify` is the check before any report of "done". V0 makes it complete (see below).
5. **Map before search.** Agents read `graphify-out/GRAPH_REPORT.md` and run `graphify query "<question>"` before searching files. Rebuild with `graphify update` after a merge.
6. **Approvals do not change.** No push, deploy, host change, Clerk or Cloudflare change, production database change, file deletion or spend without the owner's "approved:".

## Models for agents

Sonnet is the default for every agent in `.claude/agents/`. The caller raises or lowers the model for a single job with the `model` setting when it starts the agent.

| Job | Model |
|---|---|
| Building, tests, docs, ordinary fixes, reviews of small changes | Sonnet (default) |
| Cross-folder design, migrations, security review, cover and spine maths, the review before a release, a bug that survived two fix attempts | Opus |
| Searching, listing, link fixes, mechanical edits with an exact instruction | Haiku |

Rule: start on Sonnet. Move up only when a job is hard or high risk, and say why in the handoff.

## Versions

### V0: Clean base (do first, no product change)

Goal: a clean folder tree and one simple dev system, so later work cannot drift.

Finish line:
1. DONE 13 November 2026. `.planning/` is gone and its useful content is merged into the files that already own it: requirements into `docs/01-product/`, open questions and the fix backlog into `docs/KNOWN-ISSUES.md`, the old codebase map replaced by the graph. The GSD archive folder stays until the merge is checked, then goes (owner approves the delete).
2. `npm run verify` runs typecheck, lint, format check, every workspace's unit tests (the web app is missing today), `docs:check` and the builds. One command, one result.
3. The root folder lists only what a reader needs. Rulings made on 13 November 2026: `test-results/` and `build/` stay where they are (both are Git-ignored, and `deploy.mjs`, CI, the build script and six agent and skill files name them, so moving them costs more than it gains); `qa/` is gone (its four outputs from 7 October now sit in `docs/06-quality/evidence/`); `design/` (archived design references) is named as archive in AGENTS.md. Owner ruled the rest on 13 November 2026: `local-live.json` (a dev proxy file with a publishable Clerk key only), `CODEX.md` and `GEMINI.md` (one-line pointers to AGENTS.md) stay; `.nvmrc` is deleted and `mise.toml` is the one Node source (CI pins the same version).
4. AGENTS.md carries the model table, the graph rule and the superpowers method in one short place, and the agent files match it.
5. DONE 13 November 2026. The graph covers code, docs and prompts: 9,267 nodes, 29,038 edges, 287 communities (code 8,241 nodes by the free structural pass; 147 documents by nine Sonnet agents: all docs, agent and skill files, READMEs and the latest version of each of the 41 prompts). Left out on purpose: 57 images, `design/`, test fixtures and older prompt versions.
6. `docs/README.md` and `.agent/CURRENT-TASK.md` match the new layout, with no stale link (`npm run docs:check` passes).

### V1: Live and proven (the promise works)

Goal: the live site is current, shows only real data, and has produced one real book to a pack KDP accepts.

Finish line:
1. The go-live work is on `main` and live. The owner host steps are done: header lines in the docroot `.htaccess`, `CLOUDFLARE_ONLY` from report to on, Search Console sitemap.
2. The three cover branches are merged (screenshot retry, spine contrast, spine fit) and the cover screenshot test no longer flakes in CI.
3. Cover layout is right in the pack: front content centred, title and author positions consistent between eBook and wrap, barcode box and back-cover author block share a baseline. The preview and the build use one set of layout maths.
4. A signed-in user never sees demo content or prototype wording on the hosted site (demo book ids, fake job in the command palette, "this Mac" wording, hard-coded workspace label, demo model prices).
5. Docs match the code: route, table and prompt counts, with a check that fails when they drift.
6. One real book runs idea to pack on the live site, with time and cost per stage recorded.
7. A qualified reader closes the book's claims to verify.
8. KDP or Kindle Previewer accepts the pack, and the owner confirms.
9. The run is written as a checklist in `docs/06-quality/` that a second book can follow without reading the code.

Owner gates: approve the push of each branch; pick the book and a cost budget; confirm acceptance.

#### V1 status on 14 November 2026 (1 of 9 ticked)

Who does each open item: Owner (needs the owner), Claude (can be built and proved locally), External (needs someone outside).

| # | Item | Who | Status | Evidence |
|---|---|---|---|---|
| 1 | Go-live on `main` and live; host steps done | Owner | PARTIAL | Go-live code is live (release `20261109T010629Z`, merged PRs #96 to #100, Deploy green on `4c3521e`). The host steps (`.htaccess` header lines, `CLOUDFLARE_ONLY` report then on, Search Console sitemap) are not recorded as done. |
| 2 | Cover branches merged; screenshot test does not flake | Claude | PARTIAL | The three branches are merged (PR #96). The flake is not gone: `cover-typography.test.ts` failed once on 14 November with "Unable to capture screenshot" in `node24-host` and passed on re-run. |
| 3 | Cover layout right; preview and build share one set of layout maths | Claude | OPEN | Layout maths still sits in `packages/export/src/covers.ts` and separately in `apps/web/src/features/cover/` (`DemoWrap.tsx`, `WrapPreview.tsx`, `layers.ts`). Needs Opus (cover maths). |
| 4 | No demo content or prototype wording for a signed-in user | Claude | OPEN | Demo data and wording remain in `apps/web/src` (`demo/`, `features/spreads/demoStore.ts`, `features/volume-mode/demoVolume.ts`, `features/research/sim.ts` and others). Each needs a check that it is unreachable when signed in. |
| 5 | Docs match code, with a check that fails on drift | Claude | DONE | `npm run docs:drift` (`scripts/check-drift.mjs`, in `verify` and CI) compares API routes, prompts and database tables with their docs. First run found 37 undocumented routes and a wrong prompt count (the page said 39, the folder has 41); both fixed. Test: `tests/integration/docs-drift.test.mjs` (6 pass). |
| 6 | One real book, idea to pack, live, with time and cost per stage | Owner | BLOCKED | Owner picks the book and a cost budget (`LIVE_AI=1`). |
| 7 | A qualified reader closes the claims to verify | External | BLOCKED | Needs a qualified reader. |
| 8 | KDP or Kindle Previewer accepts the pack | Owner | BLOCKED | Needs item 6, then the owner's confirmation. |
| 9 | The run is a checklist in `docs/06-quality/` | Claude | OPEN | Written after item 6, from the real run. |

Order for Claude's remaining items, by value: 4 (visible to users), 2 (CI flake), 3 (largest, Opus). Item 9 waits for item 6.

### V2: Trust (fewer surprises, less to maintain)

Goal: what the real run showed to be weak is fixed, and unused code is gone.

Finish line (the owner can cut it to 10 at the V1 gate):
1. One decision per uncalled route, unused export, the `noop` job kind and `users.password_hash`, each written in `DECISIONS.md`. The `password_hash` drop needs a backup, a throwaway MariaDB test and approval.
2. The import cycle between `ApiMarketing` and `MarketingPage` is gone, the two `useScreenState` hooks are one, and unused-export and import-cycle checks run in CI.
3. The known editing faults are fixed test first: "Fix everything" ordering, a save marking a section done while blocking placeholders remain, and a lost acknowledgement when a message changes.
4. Quality checks from the backlog: prose metrics, per-genre banned-phrase lists, a style report card.
5. Mock-fixture coverage matches the prompt list (11 of 41 today).

Parked until the V1 run says they matter: the one issues ledger (needs a migration) and the voice fingerprint.

### V3: Faster daily work

Goal: the app says what needs the author, what a step costs, and runs a book to its pack through real gates.

Finish line:
1. A real "Needs you" list (claims, failed preflight, paused jobs, out-of-credit stops).
2. Cost and time estimates come from the server, never fixed text.
3. A single book runs to its pack and stops only at gates, proven by a mock-provider end-to-end test.
4. Claims review uses batch actions with a clear count left.
5. Job finished or paused notices, only if the owner wants them.
6. Time to pack is measured against the V1 baseline and reported, better or not.

### V4: Open to other self-publishers (conditional)

Only if the owner says yes at the V1 gate. Per-account keys or a written decision to keep the owner's key with caps, OpenRouter `data_collection`, privacy contact and retention, and guest limit tests. No payments unless the owner adds them.

### Parking list (not scheduled)

Series management, business dashboard, genre engines, world building, hardcover wraps, other platforms (IngramSpark, Draft2Digital, Kobo, Apple, Google), the one issues ledger, voice fingerprint. A parked item moves only when a version's finish line is met and the owner says so.

## Review points

Every version follows the same loop, with a review where the risk is:

1. Brainstorm and agree the finish line (owner).
2. Task plan for the version (superpowers writing-plans).
3. Build each task test first, one concern per branch.
4. `npm run verify`, then the 20 end-to-end tests when UI or server behaviour changed.
5. Code review by a separate agent (Opus for security, migrations, covers and release reviews).
6. Owner reads the evidence and says "approved:" before any push or deploy.
7. After deploy, one scripted live smoke check, then `.agent/CURRENT-TASK.md`, `HANDOFF.md`, `CHANGELOG.md` and the audit file are updated in the same change.

## Decisions for the owner

1. Approve V0 to V4 as the plan, including retiring GSD.
2. Confirm the core value sentence.
3. Rule on the root-folder proposals in V0 item 3.
4. Approve the paid extraction run for docs and prompts (V0 item 5).
5. At the V1 gate: keep V2 as listed or cut it, and decide V4.

## Stack note

The global house kit names pnpm, Biome and a PHP API. Volume deliberately uses npm, ESLint and Prettier, and a Fastify server (D-023, D-038). That stays. Changing it needs a decision entry and is not part of any version here.

# Plan: phases 6 to 8 (fiction and workbooks, picture books, Volume mode and accounts)

Status: **Approved**, 17 October 2026. Drafted by the architect agent; the owner accepted D-041 to D-047 as built on 17 October 2026.

Source of the deliverables and acceptance lines: `docs/01-product/ROADMAP.md` (phases 6, 7 and 8). Each phase still ends with its owner review gate, and no phase starts on top of an unreviewed one. Phases 6 and 7 can be built in parallel because they touch different files, but the owner reviews phase 6 before phase 7 is accepted.

The stack does not change. No new npm package is needed for any package below. TipTap custom nodes use `@tiptap/core` `Node.create`, which is free; AES-GCM (only if per-account keys are ever built) is `node:crypto`.

## 1. Gap analysis

EXISTS: built and wired. PARTIAL: some parts exist, named gaps below. MISSING: nothing usable yet.

### Phase 6: fiction and workbook templates

| Deliverable | State | Evidence | Gap |
|---|---|---|---|
| Fiction template config | EXISTS | `config/book-templates/fiction.json:40-51` (subheadings 0, scene breaks, takeaways off), `:74` story bible fields | Story bible has no schema or storage; it is only a field list. |
| Workbook template config | EXISTS | `config/book-templates/workbook.json:73-92` (exercise types, 2 to 4 per chapter, 6 lines default) | Block syntax for exercises is not written down anywhere the writer and parser share. |
| Template loading on the server | EXISTS | `apps/server/src/config/book-structure.ts:86-90` (any template id), `:133-186` (structure), `:192-213` (rules sent to prompts as `{{template}}`) | None for loading. |
| Scene breaks | PARTIAL, bug | Parser accepts only `***` (`packages/core/src/markdown.ts:119`); the fiction writer prompt asks for `* * *` (`prompts/writing/chapter.v5.md:42`, `:89`) and the template marker is `* * *` (`fiction.json:46`) | A fiction chapter's `* * *` becomes a plain paragraph, so PDF and DOCX lose the scene-break style. |
| `::: exercise` block | PARTIAL | Any fence becomes a `callout` with all body lines joined into one string (`markdown.ts:188-189`, `model.ts:84-90`) | Multi-paragraph exercises, questions and checklists collapse into one line. No exercise type. |
| `::: lines N` block | PARTIAL | PDF draws ruled lines (`packages/export/src/print-html.ts:103-104`, CSS `:350`) | DOCX, EPUB and TXT drop it because the callout text is empty (`docx.ts:446-447`, `epub.ts:134-135`, `txt.ts:64-65`). |
| Fill-in pages | MISSING | No block, no renderer | Needs a block and rendering in every format. |
| Character and setting notes in the ledger | PARTIAL | `story_ledger.kind` has `person` and `place` (`docs/02-architecture/DATA-MODEL.md:119`); the ledger prompt already logs characters (`prompts/checks/summarise-and-ledger.v4.md:49`) | No character or setting kind, no link to the story bible, no continuity check against it. |
| Template-specific checks | MISSING | Subheading and takeaway rules are only asked of the model (`prompts/checks/consistency.v3.md`); no code check reads `chapterRules` | Need code checks: fiction has no subheadings and no takeaways; workbook has 2 to 4 exercises per chapter. |
| Template-specific prompts | PARTIAL | One `writing.chapter.v5` covers fiction in two lines (`chapter.v5.md:42`, `:89`) but is written for first-person non-fiction (`:52`, `:121`) | Fiction needs its own voice rules (close third, invented scenes allowed); workbook needs the exercise dialect. |
| Preflight for the new templates | PARTIAL | Required-section check is template driven (`packages/export/src/preflight.ts:217-229`) | No template-rule item. |
| Golden files for new blocks | MISSING | `packages/export/test/golden/` holds only Windowsill Herbs and mini-book | Need fiction and workbook goldens. |
| New-book wizard | PARTIAL | Fields exist for story and exercises (`apps/web/src/features/new-book/wizardData.ts:44-53`) but writing is gated (`:65-69`, returns "phase 6") | Remove the gate when the server is ready; story bible view in the blueprint. |
| Mock fixtures | PARTIAL | Mock builds a valid answer from the schema when no fixture exists (`packages/ai/src/provider/mock.ts:1-11`); fixtures live in `packages/ai/test/fixtures/` (2 files) | No fiction or workbook fixtures. |

### Phase 7: picture books

| Deliverable | State | Evidence | Gap |
|---|---|---|---|
| Picture-book template with Bedtime Story rules | EXISTS | `config/book-templates/picture-book.json:23` (story rules), `:90` (spreads, camera angles, character sheet), `:126` (interior bleed) | `:137` states "minimum is 24 pages (fact 3.6)" in the template, a KDP number outside `config/kdp-rules/` (rule 7). |
| Story and scene prompts | EXISTS | `prompts/children/picture-book-story.v2.md`, `scene-prompts.v2.md`; task table `packages/ai/src/stages/tasks.ts:242-257`; schema `packages/ai/src/stages/outputs.ts:336`, `:346` | Not reachable from the server: the server AI port has no children stage (`apps/server/src/ports/ai.ts:10-23`). |
| Picture-book job | MISSING | Job kinds `apps/server/src/jobs/queue.ts:16-29` have no picture-book kind | Story, scene prompts and one image per spread. |
| Spreads in the book model | MISSING | Section kinds in `DATA-MODEL.md:101` have no spread | Need a spread section with text, image and layout. |
| Interior bleed maths | EXISTS | `packages/core/src/kdp.ts:140-147` `interiorBleedSizeIn` reads `print.bleed` | Not used by the PDF export. |
| Bleed rule (FACTS 3.7) | EXISTS | `config/kdp-rules/2026-10-06.json:386` `print.bleed`, factId 3.7, confirmed, adds 0.125 in width and 0.25 in height | None. |
| Safe area | PARTIAL | `paperback.interiorMargins` gives `outsideMinWithBleedIn` (factId 11.2) | Inside margin by page count is there too; no function returns a safe-area box for a bleed page. |
| Full-colour interior pricing | MISSING | Only `paperback.printingCost.uk.blackInk` (factId 3.3); `paperback.trimAndPages` note says other inks are outside the calculator | Colour ink page ranges and costs are not in config. KDP's "Paperback Printing Cost" page (https://kdp.amazon.com/en_US/help/topic/G201834340, read 17 October 2026 through a summary) lists standard colour at 72 to 600 pages and premium colour from 24 pages. If that holds, a 24-page book must be premium colour. Must be re-read and added to a new dated rules file before use. |
| 8.5 x 8.5 trim | EXISTS | `apps/server/src/repos/books.ts:13`, `packages/core/src/theme.ts:6`, rule `paperback.trimSizes.list` | `DATA-MODEL.md:71` still lists four trims (docs conflict). |
| Full-bleed PDF | MISSING | `print-html.ts:244-246` sets `@page` to trim size with text margins; `pdf.ts:212-215` checks page size equals trim | Needs a picture-book layout with bleed page size. |
| Consistent character look | PARTIAL | Template asks for one reused character sheet (`picture-book.json:90` block); `scene-prompts` outputs `characterSheets` | No reference image. OpenRouter `POST /api/v1/images` accepts `input_references` and `seed` "where supported" (https://openrouter.ai/docs/guides/overview/multimodal/image-generation, read 17 October 2026). |
| Images disclosure | EXISTS | `apps/server/src/jobs/handlers/production.ts:129` sets images to `ai_generated` for covers; preflight item `kdp.ai-disclosure` (`preflight.ts:361`) | Spread images must set it too. |
| Wizard | PARTIAL | `usesNewWord` (`wizardData.ts:60-62`), gate returns "phase 7" (`:68`) | Remove gate; spreads board screen missing. |

### Phase 8: Volume mode and accounts

| Deliverable | State | Evidence | Gap |
|---|---|---|---|
| Batch planning across pen names | MISSING | No batch code or table (search of `apps/` and `packages/`) | Tables, routes, job, screen. |
| Scheduler (2 per format per week) | PARTIAL | Rule `titles.creationLimit` at `config/kdp-rules/2026-10-06.json:740`, factId 5.7, confirmed, `{maxNewTitlesPerFormat: 2, period: "week"}`; reset time and start date are partial (its note) | No getter in `kdp.ts`, no slot table, no check. |
| Quality gates for batch books | PARTIAL | Preflight blocks on open regulatory claims (`DATA-MODEL.md`, claims) and `claims.open` (`preflight.ts:300`) | No rule that a batch book cannot be packed or scheduled while preflight blocks. |
| Real logins and sessions | EXISTS | Clerk on server (`apps/server/src/auth/clerk.ts:79-115`) and web (`apps/web/src/auth/HostedAuth.tsx`), D-039 | Logout is Clerk's `UserButton`; no server-side test of sign-out beyond 401. |
| Owner allowlist | EXISTS | `clerk.ts:117-134` (`CLERK_ALLOWED_USER_IDS`, `OWNER_EMAILS`) | Every allowed account becomes an **owner in the owner's workspace** (`clerk.ts:165-180`). That is fine for the owner alone, wrong for other publishers. |
| Roles | PARTIAL | roles owner, editor and viewer (`apps/server/src/auth/context.ts:6`); only `assertCanWrite` blocks viewers (`:30-31`, used once in `routes/common.ts:14`) | No owner-only actions (settings, members, budgets, keys). No members screen. |
| Workspace isolation | PARTIAL | Every repo query filters `workspaceId` (148 uses in `apps/server/src/repos`); one API test (`apps/server/test/api.test.ts:121-139`), plus SSE and blob tests | No route-by-route isolation matrix. |
| Per-account OpenRouter keys | MISSING | One `OPENROUTER_API_KEY` from env (`apps/server/src/config/env.ts:85-90`), redacted in logs (`apps/server/src/app.ts:67-68`) | Recommend deferring (D-047). |

## 2. Ownership of `packages/core` in these phases

`packages/core` has no single owner, so each change is named here (D-041):

- **Blocks, parser, serialiser and template checks** (`model.ts`, `markdown.ts`, new `template-rules.ts`, new `spread.ts`): **volume-export**. Reason: every exhaustive `Block` switch is in `packages/core` and `packages/export` (`style.ts`, `markdown.ts`, `txt.ts`, `epub.ts`, `docx.ts`, `preflight.ts`, `print-html.ts`), so a new block type must land with its renderers in one change or typecheck breaks.
- **KDP maths** (`kdp.ts`: colour cost, safe area, title limit getter): **volume-export**, together with any new dated file in `config/kdp-rules/`.
- **Scheduler** (new `schedule.ts`): **volume-backend**. Pure functions only; it reads the limit through the `kdp.ts` getter.

No one else edits `packages/core` in these phases.

## 3. Work packages

Each package has one owner. "Needs" lists what must be merged first. Tests use the mock provider only; no package makes a live AI call. The one live run per template in the phase 6 acceptance is a separate owner-authorised step (`LIVE_AI=1` and a budget), not part of any package.

### Phase 6

**P6-1 Core blocks and template checks (volume-export).** Needs: nothing.
- Files: `packages/core/src/model.ts`, `markdown.ts`, `style.ts` (word counts for new blocks), new `packages/core/src/template-rules.ts`, `packages/core/test/markdown.test.ts`, new `packages/core/test/template-rules.test.ts`.
- Parser accepts `* * *` and `***` as a scene break; serialiser writes `***` (round trip stays stable).
- New block types (zod schemas too): `ExerciseBlock { type: 'exercise'; kind: 'reflection' | 'checklist' | 'fill-in' | 'tracker' | 'scenario'; title?: string; blocks: Block[] }` from `::: exercise <kind> [title]` with nested paragraphs, lists and `::: lines N`; `LinesBlock { type: 'lines'; count: number }` from `::: lines N` (1 to 30); `ChecklistBlock { type: 'checklist'; items: string[] }` from `- [ ] item` lines inside an exercise.
- `checkTemplateRules(section: Section, rules: TemplateRules): TemplateFinding[]` with `TemplateFinding { code: 'fiction.subheading' | 'fiction.takeaways' | 'workbook.exercise-count' | 'workbook.lines-range' | 'template.unknown-block'; severity: 'warn' | 'block'; message: string }`. `TemplateRules` is the zod-parsed subset of `chapterRules` it needs.
- Exported from `packages/core/src/index.ts`.

**P6-2 Export rendering, preflight, goldens and templates (volume-export).** Needs: P6-1 (same owner, can be one branch).
- Files: `packages/export/src/print-html.ts`, `docx.ts`, `epub.ts`, `txt.ts`, `preflight.ts`, `packages/export/test/golden/` (new `fiction-mini.*`, `workbook-mini.*` for TXT, MD and DOCX XML; PDF page images on macOS and `linux/`), `config/book-templates/fiction.json` and `workbook.json` (version bump, block syntax note, ledger kinds note).
- Rendering per D-042: PDF and DOCX draw ruled lines and tick boxes; EPUB and TXT print exercises and replace `lines` with one line "Space to write your answer." (no fake ruled lines on a reflowable screen).
- Preflight item `structure.template-rules` built from `checkTemplateRules` for every enabled chapter.
- Tests: `txt-md.test.ts`, `docx.test.ts`, `epub.test.ts`, `pdf.test.ts` extended; golden comparison exact for TXT and MD.

**P6-3 Prompts and AI stages (volume-ai-prompts).** Needs: P6-1 merged (so the block syntax is fixed).
- Files: `prompts/writing/chapter.v6.md` (fiction branch: close third or first person per book, scenes and dialogue allowed, no subheadings, `* * *`; workbook branch: the exact `::: exercise` dialect and 2 to 4 exercises), `prompts/blueprint/blueprint.v6.md` (story bible for fiction, exercise plan per chapter for workbooks), `prompts/checks/summarise-and-ledger.v5.md` (character and setting entries), `prompts/checks/consistency.v4.md` (continuity against the story bible), `packages/ai/src/stages/inputs.ts` and `outputs.ts` (`StoryBible` schema, `chapter.exercises` input, ledger kinds), `config/models.defaults.json` prompt lists, `docs/book-production/PROMPTS.md` rows, fixtures `packages/ai/test/fixtures/blueprint.blueprint.fiction.json` and similar.
- Interface: `StoryBible { logline; themes[]; characters: { name; role; want; need; flaw; voiceNotes; appearance }[]; settings: { name; description }[]; timeline[]; worldRules[]; povPlan; ending }`, carried in the blueprint data under `storyBible` (D-043).
- Tests: `packages/ai/test/prompts.test.ts` and `stages.test.ts` (schema parse, mock answers, guardrails do not flag invented scenes in fiction).

**P6-4 Server wiring (volume-backend).** Needs: P6-1, P6-3 interfaces (types can be stubbed while P6-3 is in review).
- Files: ledger kinds `character`, `setting` (as built: no CHECK exists, so zod only and no migration), `apps/server/src/ports/ai.ts` (blueprint `storyBible`), `apps/server/src/adapters/mock-ai.ts` and `openrouter-ai.ts`, `apps/server/src/jobs/handlers/writing.ts` and `jobs/book-checks.ts` (run `checkTemplateRules` in the checker gate; `block` findings set `needs_attention`), `apps/server/src/routes/planning.ts` (story bible in blueprint GET and PATCH).
- No new route: the story bible travels in the existing blueprint payload.
- Tests: new `apps/server/test/phase6.test.ts`: a fiction book and a workbook from idea to pack with the mock, preflight has no block, ledger holds a character and a setting, template checks fire on a seeded bad chapter. `migrations.test.ts` and `mysql.test.ts` for 0006.

**P6-5 Web (volume-frontend).** Needs: P6-4 routes merged for the live screens; can build against types first.
- Files: `apps/web/src/features/new-book/wizardData.ts` (remove the phase 6 gate), `apps/web/src/features/blueprint/` (story bible panel), `apps/web/src/features/editor/` (TipTap nodes for exercise, lines, checklist; scene break), `apps/web/src/features/library/LedgerView.tsx` (characters and settings).
- Tests: component tests for the nodes (Markdown in, Markdown out unchanged).

**P6-6 Browser tests (qa).** Needs: P6-4 and P6-5.
- Files: `tests/e2e/` one spec per template (create, mock write, export pack, preflight green).

### Phase 7

**P7-1 KDP colour rules (volume-export).** Needs: nothing. Do first.
- Read the official KDP pages again (printing cost, paper and ink types, trim and page limits for colour). Add `config/kdp-rules/2026-10-NN.json` (never edit a released file), with `paperback.printingCost.uk.standardColour`, `paperback.printingCost.uk.premiumColour` and colour page ranges by trim, each with source, date and status; add the facts to a dated facts file under `docs/reference/`. Anything not seen on an official page is `unverified`.
- Fix `config/book-templates/picture-book.json:137` to cite rule ids instead of the number.

**P7-2 Core spread model and bleed maths (volume-export).** Needs: P7-1 for colour cost only.
- Files: new `packages/core/src/spread.ts`, `kdp.ts`, tests.
- Interfaces: `Spread { n: number; text: string; imageKey: string | null; layout: 'text-left' | 'text-right' | 'text-top' | 'text-bottom'; sceneSummary: string }`; `PictureBookDoc { meta; front: Section[]; spreads: Spread[]; back: Section[] }`; `bleedPageSizeIn(rules, trim)` (wraps `interiorBleedSizeIn`); `safeAreaIn(rules, trim, pageCount): { topIn; bottomIn; insideIn; outsideIn }` from `paperback.interiorMargins`; `colourPrintingCost(rules, { ink, trim, pages })` returning `KdpResult` with status warnings.

**P7-3 Picture-book export (volume-export).** Needs: P7-2.
- Files: new `packages/export/src/picture-book.ts` (HTML for Paged.js: `@page` at bleed size, each spread as two facing pages with one 2:1 image split across the gutter, text box inside the safe area), `pdf.ts` (page size check against bleed size when the template has `interiorBleed`), `preflight.ts` (items `interior.bleed`, `picture.spread-images`, `picture.safe-area`, `picture.page-count` from rules, `kdp.ai-disclosure` covering images), `pack.ts`.
- EPUB and DOCX for picture books are out of scope (D-044); the pack says so.
- Tests: a 24-page fixture with deterministic placeholder PNGs; PDF page box equals trim plus bleed; every spread page has an image; text boxes inside the safe area (measured from the Paged.js DOM); golden page images for two spreads.

**P7-4 Prompts and stages (volume-ai-prompts).** Needs: nothing (prompts exist); coordinate names with P7-5.
- Files: `prompts/children/scene-prompts.v3.md` (adds `layout` and the empty area for text per spread, 2:1 framing, one character sheet repeated word for word), `prompts/children/character-reference.v1.md` (one neutral full-body reference image prompt per main character), `packages/ai/src/stages/tasks.ts`, `outputs.ts`, fixtures `packages/ai/test/fixtures/children.picture-book-story.json` and `children.scene-prompts.json` (a 10-spread gentle story that passes the safety check, plus a fixture whose `safetyCheck.passed` is false).
- Image calls keep using the `cover_image` model through `POST /api/v1/images`; the client gains optional `inputReferences` and `seed` (D-045). `packages/ai/src/provider/openrouter.ts` change, mock returns deterministic PNGs.

**P7-5 Server pipeline (volume-backend).** Needs: P7-2 types, P7-4 stage names.
- Files: `apps/server/src/ports/ai.ts` (stages `picture_story`, `scene_prompts`), adapters, `apps/server/src/jobs/queue.ts` (kinds `picture_book`, `picture_story`, `scene_prompts`, `spread_image`), new `apps/server/src/jobs/handlers/picture-book.ts`, `apps/server/src/db/migrations/0006_picture_books.ts` (as built: columns `sections.layout` and `sections.image_asset_id`, table `picture_characters`), `apps/server/src/repos/manuscript.ts`, new `apps/server/src/routes/spreads.ts`, `adapters/volume-export.ts`.
- Routes: `POST /api/v1/books/:id/picture-book` (start), `GET /api/v1/books/:id/spreads`, `PATCH /api/v1/spreads/:sectionId` (text, layout), `POST /api/v1/spreads/:sectionId/image` (one new image, budget checked before the call, D-025), `GET /api/v1/books/:id/characters` (sheets and reference images).
- Rules: a failed safety check stops the job at `needs_attention`; every spread image sets `ai_disclosure.images = ai_generated`; trim defaults to 8.5 x 8.5 and ink to premium colour (D-044).
- Tests: `apps/server/test/picture-book.test.ts` (mock run to pack, 24 pages, bleed size from the rules file, disclosure set, regenerate one spread, budget stop).

**P7-6 Web (volume-frontend).** Needs: P7-5 routes.
- Files: `wizardData.ts` (remove the phase 7 gate), new `apps/web/src/features/spreads/` (board of spreads with image, text, layout, regenerate), character sheet panel, export screen showing bleed size and ink.
- Tests: component tests; `tests/e2e/picture-book.spec.ts` by qa.

### Phase 8

**P8-1 Scheduler maths (volume-backend, in `packages/core`).** Needs: a getter `titleCreationLimit(rules)` in `kdp.ts`, added by volume-export in a one-function change, or by volume-backend with the export owner's review.
- Files: new `packages/core/src/schedule.ts` and test.
- Interfaces: `TitleSlot { projectId; format: 'ebook' | 'paperback' | 'hardcover'; plannedAt: number }`; `checkTitleSlot(existing: TitleSlot[], proposed: TitleSlot, limit: { maxNewTitlesPerFormat: number; periodDays: number }): { ok: boolean; conflicts: TitleSlot[]; nextFreeAt: number }`. Rolling 7-day window per format per workspace (D-046). No number in code: the 2 and the week come from the rule.

**P8-2 Batches, schedule and quality gates (volume-backend).** Needs: P8-1.
- Files: `apps/server/src/db/migrations/0008_volume_mode.ts` (`batches`, `batch_items`, `title_slots`), repos, `apps/server/src/routes/batches.ts`, `routes/schedule.ts`, job kind `batch_run` (parent; each child is an existing book pipeline).
- Routes: `GET/POST /api/v1/batches`, `GET/PATCH /api/v1/batches/:id`, `POST /api/v1/batches/:id/start`, `GET /api/v1/schedule?from&to`, `POST /api/v1/schedule/slots` (409 `title_limit` with the conflicting slots and the next free date), `DELETE /api/v1/schedule/slots/:id`.
- Gates: a batch book cannot be packed or scheduled while preflight has a `block` item or a claim is open; batch runs respect the book and monthly budgets.
- Tests: `apps/server/test/volume-mode.test.ts`: 5 books across 3 pen names, mock run, the third paperback slot in 7 days is refused, a book with an open claim cannot be scheduled.

**P8-3 Accounts, roles and isolation (volume-backend).** Needs: nothing; can run beside P8-2 (different files) but shares the migration sequence, so P8-2 takes 0008 and this takes 0009.
- Files: `apps/server/src/auth/context.ts` (`assertRole(ctx, min)`), `auth/clerk.ts` (allowed accounts other than the owner bind through an invitation, not as owner), `apps/server/src/db/migrations/0009_invitations.ts` (`invitations`: email, workspace_id, role, status), `apps/server/src/routes/members.ts`, `config/env.ts` (`ACCOUNTS_MODE` = `owner-only` default or `invite`), `.env.example` (names only), `docs/05-security/AUTH-MODEL.md`.
- Routes: `GET /api/v1/members`, `POST /api/v1/invitations`, `DELETE /api/v1/members/:userId`, `PATCH /api/v1/members/:userId` (role). Owner only.
- Role rules: owner does everything; editor writes books but not settings, budgets, members or profile bios; viewer reads only.
- Tests: new `apps/server/test/isolation.test.ts` builds two workspaces and calls every registered route (list taken from Fastify's route table, so a new route cannot skip the test) as the other workspace: 404 or empty list, never data. `roles.test.ts`: each role against each owner-only and write route. Sign-in tests use a fake `ClerkVerifier`: no session 401, not allowed 403, invited account lands in its own workspace with its role, a removed member gets 403 on the next request (cache cleared).

**P8-4 Web (volume-frontend).** Needs: P8-2 and P8-3 routes.
- Files: new `apps/web/src/features/volume-mode/` (batch planner by pen name, week calendar of slots, refusal message with the next free date), Settings members panel, role-aware controls (viewers see no write buttons).
- Tests: component tests; qa adds `tests/e2e/volume-mode.spec.ts` against the stub auth.

**P8-5 Prompts.** None needed. Batch runs reuse existing stages.

## 4. Order of work

| Wave | Runs in parallel | Merge gate |
|---|---|---|
| 1 | P6-1 (export), P7-1 (export, after P6-1 on the same branch is fine), P7-4 (ai-prompts), P8-3 (backend) | typecheck, lint, core and export tests |
| 2 | P6-2 (export), P6-3 (ai-prompts), P8-1 (backend in core) | goldens reviewed |
| 3 | P6-4 (backend), P7-2 (export), P6-5 (frontend, against types) | server phase 6 test green |
| 4 | P6-6 (qa); **owner gate phase 6** | owner reviews one book of each template |
| 5 | P7-3 (export), P7-5 (backend), P8-2 (backend) | picture-book and volume-mode server tests |
| 6 | P7-6 and P8-4 (frontend), qa e2e; **owner gate phase 7** then **phase 8** | owner reads the picture book and checks a proof; owner decides on accounts |

Migration numbers as built: 0006 picture books (`sections.layout`, `sections.image_asset_id`, table `picture_characters`), 0007 unused, 0008 volume mode, 0009 invitations. The ledger kinds `character` and `setting` are enforced by zod and need no migration. Only volume-backend writes migrations. Every migration runs on SQLite and MySQL in tests; production migration needs the owner's approval and a backup first (`docs/07-operations/DEPLOYMENT.md`).

## 5. Verification for every package

`mise exec -- npm run typecheck`, `npm run lint`, `npm run format:check`, and the workspace tests (`npm run test -w <workspace>`). Export packages also run `npm run compare:pdf -w @volume/export` on macOS. Phase gates also run `npm run e2e` and `npm run docs:check`. Report PASS, FAIL, PARTIAL, NOT TESTED or BLOCKED per command.

## 6. Recommended safe scope for phase 8 on a single-owner cPanel host

1. **Identity stays with Clerk; roles stay in Volume.** Clerk roles belong to Clerk Organizations, and custom roles in production need Clerk's paid B2B add-on (https://clerk.com/docs/guides/organizations/control-access/roles-and-permissions, read 17 October 2026). Volume already has `memberships.role`, so keep that and do not turn on Organizations.
2. **Invite only, off by default.** `ACCOUNTS_MODE=owner-only` keeps today's behaviour. `invite` lets the owner add an email with a role. An invited editor or viewer joins the owner's workspace; a separate self-publisher gets a new workspace. Nobody can sign up on their own.
3. **Workspace isolation is proven by tests, not by trust.** The route matrix test fails if any route returns another workspace's data. Blob downloads and SSE already have their own tests.
4. **Per-account OpenRouter keys are deferred.** All AI runs on the owner's key with per-workspace budgets. Storing other people's keys on a shared host with no key management service means holding secrets the owner is liable for. If the owner later offers accounts commercially, add encrypted keys (AES-256-GCM with `node:crypto`, a master key in the host's shared settings file, never returned to the browser, never logged) under a new decision.
5. **One process.** Batch runs share the in-process queue. Batches run one book at a time so a large batch cannot starve the owner's own work or hit Passenger's memory limit.

## 7. Open questions, each with a recommended default

| # | Question | Recommended default |
|---|---|---|
| 1 | EPUB and TXT rendering of `::: lines` and fill-in pages | One line "Space to write your answer." instead of ruled lines (D-042). |
| 2 | Where the fiction story bible lives | Inside the blueprint data as `storyBible`; no new table (D-043). |
| 3 | Fiction point of view | Close third, past tense, per `fiction.json:9`, changeable per book. |
| 4 | Does "24-page picture book" count front and back matter? | Yes: 24 pages in total, so 10 spreads (20 pages) plus 4 pages of matter. `picture-book.json` default of 12 spreads stays for normal books. |
| 5 | Ink for picture books | Premium colour, because KDP's printing cost page lists standard colour from 72 pages only (to be confirmed in P7-1). |
| 6 | Picture-book ebook | Not in phase 7. Print PDF only; a fixed-layout ebook is a later item (D-044). |
| 7 | Character consistency method | Character sheet text repeated word for word, one reference image per main character sent as `input_references`, and `seed` where the model supports it (D-045). |
| 8 | What counts as "a week" for the title limit | Rolling 7 days per format per workspace, because KDP's reset time is only partly verified; rolling is never looser than a calendar week (D-046). |
| 9 | One KDP account per workspace? | Yes. All pen names in a workspace share one KDP account and one weekly limit. |
| 10 | Should other self-publishers get accounts? | Build it switched off (`ACCOUNTS_MODE=owner-only`); the owner decides at the phase 8 gate (D-047). |
| 11 | Per-account OpenRouter keys | Deferred (D-047). |
| 12 | Live AI run per template (phase 6 acceptance) | One free-model run per template after the owner authorises `LIVE_AI=1` with budget zero, same as D-029. |

## 8. Conflicts found between files (for the owner)

1. Scene break: `packages/core/src/markdown.ts:119` accepts only `***`; `prompts/writing/chapter.v5.md:89` and `config/book-templates/fiction.json:46` use `* * *`. Fixed by P6-1 (parser accepts both).
2. Trims: `docs/02-architecture/DATA-MODEL.md:71` lists four trims; code has eight (`apps/server/src/repos/books.ts:13`).
3. Template key: `DATA-MODEL.md:46` says `picture_book`; the template id is `picture-book`.
4. Job kinds: `DATA-MODEL.md:150` does not match `apps/server/src/jobs/queue.ts:16-29`.
5. AI fixtures: `AGENTS.md`, `docs/book-production/PROMPTS.md:80`, `docs/06-quality/TEST-STRATEGY.md:18` and `docs/02-architecture/AI-PIPELINE.md:190` name `tests/fixtures/ai/`, which does not exist; fixtures are in `packages/ai/test/fixtures/`.
6. `config/kdp-rules/README.md` and the `factsFile` in `2026-10-06.json` point at `docs/07-KDP-RULES.md` and `docs/reference-kdp-facts-2026-10-06.md`; the files are now `docs/book-production/KDP-RULES.md` and `docs/reference/`. Fix the README now and the `factsFile` in the next dated rules file (P7-1).
7. `config/book-templates/picture-book.json:137` carries a KDP number (24 pages) outside `config/kdp-rules/`.
8. `docs/01-product/PRODUCT-SPEC.md:65` says the wizard offers only non-fiction in v1; update when the gates come off.

Recommended owners for the doc fixes: 2 to 4 volume-backend (DATA-MODEL is backend facing), 5 qa with ai-prompts, 6 and 7 volume-export, 8 volume-frontend with the owner's wording.

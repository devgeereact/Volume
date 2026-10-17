# Changelog

User-visible changes, newest first. Dates in British format.

## 17 October 2026

Roadmap phases 6 to 8, built to decisions D-041 to D-047 (accepted by the owner on 17 October 2026).

### Added
- Fiction books: wizard with point of view and tense, story bible, character and setting ledger, scene breaks, chapters without subheadings or takeaways. Non-fiction prompts are unchanged.
- Workbooks: exercises, ruled writing lines, fill-in pages and checklists in the editor and every export format. Template checks run in the checker and preflight.
- Picture books: story, character sheet with reference pictures, one picture per spread with a shared seed and references, a spreads board, and a print-only full-colour PDF with bleed (24 pages: 10 spreads plus 4 pages of matter).
- Volume mode: batches across pen names with live progress, a release calendar that refuses a third new title per format in any rolling 7 days (limit from the KDP rules file), and a quality gate before publish or pack.
- Accounts: owner, editor and viewer roles, invitations on a verified email, members screen. Off by default (`ACCOUNTS_MODE=owner-only`). Other workspaces may spend your OpenRouter key only up to a monthly cap you set, starting at 0.
- KDP rules file 2026-10-17 with colour printing costs, page limits, colour spine and bleed.

### Fixed
- `* * *` scene breaks, untitled chapters, fiction contents, wizard chapter count, batch failure cancelling waiting books, long Select menus, and acknowledgement names on the Writing screen.

## 16 October 2026

### Added
- Hosted Volume for the owner: one Passenger app on the cPanel host serves the web app and the API, with MySQL on the host and Clerk sign-in (D-037 to D-039).
- Sign-in screen and account menu when the web app is built with a Clerk publishable key. Accounts not on the owner allowlist see "This account is not allowed".
- Public `GET /api/health` for uptime checks; it says only whether the app is up.
- `npm run build:release` makes the release folder for the host; `npm run db:copy-to-mysql -w apps/server` copies a local library into MySQL once.
- Separate migration command for a migration database user (`npm run migrate`, `migrate:status`).

### Changed
- Node 24.11 or later is enough to run Volume (the host runs 24.21); development stays on Node 26.
- Hosted security: allowed hosts and origin from settings, visitor IP from Cloudflare, rate limits, security headers and a Content Security Policy.
- PDF export can use an extra library folder for Chromium (`CHROMIUM_LD_LIBRARY_PATH`).

## 9 October 2026

### Fixed
- The local launcher forwards a non-default `VOLUME_WEB_PORT` loopback origin to the API as `WEB_ORIGINS`, unless `WEB_ORIGINS` is already set, so an alternative web port is accepted by the API.
- WebStorm `.idea/` project settings are ignored.

## 7 October 2026

### Added
- GEE OS Full Product document hierarchy, preserved document history and explicit release gates.
- Project-local Mise configuration, clean setup, runtime doctor and guarded standalone development launcher.
- Linux/macOS CI matrix and launcher integration checks.

### Fixed
- Print PDFs made on Linux now wrap lines like those made on macOS (font hinting turned off in the export browser).
- Book writing no longer stops when a reasoning model runs out of room while summarising a chapter: more room, a shorter summary prompt (v4) and a tested retry.
- Documentation link checks pass on a fresh clone where the separate reports folder is absent.
- Offline new-profile entry no longer repeats failed health requests when feature consumers mount.
- Design generation handles spaces in project paths; screenshot checks are isolated from working APIs.
- Public frontend fixtures are included in fresh checkouts under src/demo. The private-data ignore now applies only to root /data/.
- React application composition now lives under src/app, with existing screen implementations organised under src/features. Product workflows and Tailwind styling are preserved.

Rebuild candidate remains isolated. Mac execution and the existing Linux PDF reference discrepancy remain open.

## 6 October 2026

### Added
- New versions of all 32 prompt IDs apply humanizer wording guidance while preserving author facts, source evidence, output contracts and older pins.
- Documentation audit report with current build, validation and remaining acceptance pointers.
- `npm run test:coverage` measures all core, AI, export and server source and enforces the documented line coverage targets in CI.

### Fixed
- Writing prompts use optional scenes and chapter connections; the voice editor no longer encourages fabricated personal anecdotes. Removed the unused null BookHeader component.
- Project guides now describe the built app, current workspace commands, dated KDP rules, import protections and free-model validation results. Historical plans and original findings are clearly labelled.
- Project imports now commit the profile, book, file metadata, file chunks and child rows together. A failed import leaves existing books and files unchanged and removes every row created by that import.

## 5 October 2026

### Added
- `npm run lint` (ESLint, type-aware, whole repo), `npm run format` and `npm run format:check` (Prettier). The code was reformatted once and every lint error fixed (D-023).
- Export (with the server running) shows royalties and printing cost from the book's list prices and the real page count of the latest print PDF, using the KDP maths in `packages/core`.
- `MOCK_FAIL_NEXT_WRITING=<n>` on the server: the mock AI fails the nth writing call once, to show a failed section, Retry and Write the rest in tests and demos.
- `npm run e2e`: one Playwright run from the New book wizard to the marketing pack on a test server with the mock AI.
- Five profiles in `config/profiles/`: Gideon Akinlotan, Harni Muharami, Elena Marsh (romance), Tobi Rhymes (children's) and J. R. Kade (thriller and mystery), each with defaults for book type, length, trim, interior theme, cover style and models.
- Catalogues: 35 book types in four categories (`config/book-types.json`), 18 interior themes, 17 cover styles, and cookbook, journal and poetry templates. 16 OFL book fonts, listed in `assets/fonts/README.md`.
- Prototype navigation per D-016: Library, Published, Profiles, New book, Archive, Settings; one step bar inside a book; Back and Next on every step; a Published shelf at `/published`; one search (Cmd K) with page filters; friendly model names. 13 demo books, each with its own look.
- `packages/ai`: OpenRouter client, versioned prompt loader, model registry, nine stages plus weave-in notes and JSON repair, mock provider. 92 tests.
- `apps/server`: Fastify API under `/api/v1`, Kysely with SQLite (local) and MySQL (cPanel), files stored in the database, job queue, live progress stream, 24 tests. Runs on 127.0.0.1:5181 only.
- Decision D-019 (database driver, model choice order, book stage and status).

- `packages/core` and `packages/export`: manuscript parser, house style checks, KDP maths, and exports to Word, print PDF, EPUB, TXT, Markdown, eBook cover, paperback wrap, preflight and the KDP upload pack. All 18 interior themes print in their own embedded fonts.

### Fixed
- After live run 3 ("Small Offer, Real Customers"):
  - Resources no longer fails the job when no source is ticked: it saves a placeholder and the preflight says "Resources needs sources: tick sources in Research". Resolved research sources are ticked by default, and Resources lists every ticked source.
  - The preflight catches template junk ("- x: x", TBD, lorem ipsum, "[NEEDS ...]", "{placeholder}", empty list items) and blocks the KDP pack when there is no eBook cover or paperback wrap. The single files still export.
  - Checks see the real profile facts (bio included) and judge each section against its own plan; continuity checks flag references to scenes that were never written.
  - The glossary drops duplicates and terms the book never uses, in alphabetical order.
  - Tech how-to and travel books write "(checked Month Year)" after every price; undated prices are flagged, and How to Use and the listing promise dated prices only when the check passes.
  - Invented first-person experience is forbidden and listed as a personal claim (a preflight warning each); a named firm given a regulatory status blocks the pack until verified.
  - Marketing describes only what the written chapters teach. Claims skip lines of a labelled composite story. The author's background is stated once in the body. Sections with too many "Here's the" openers get one style rewrite. Research sources get readable titles. The blueprint high estimate has a margin.
  - The web app shows "OpenRouter has no credit left" and cut-off answers in plain words, and the Export screen explains when the pack needs a cover.
- Writing no longer invents facts about the author: every reader-facing prompt gets the profile facts (bio, credentials, links, names for thanks, illustrative-line choice) with a rule never to go beyond them, and the checks list personal claims the profile does not support. Acknowledgements thank only the names in the book's `acknowledgements` setting; without names the section holds a placeholder and the preflight blocks the pack until it is filled or switched off.
- The checks now get the profile, the section's plan, earlier summaries and the used-already ledger.
- Guardrail lists show blocking hits as well as banned phrases, and every saved version (owner edits, replace, restore, accepted suggestions) stores the report for its own text, so a fixed problem no longer stays on the list.
- Word targets: the blueprint gets the book's target and is rescaled when it plans more than 10% over or under; a section written under 85% of its target gets one automatic extend pass, and one over 115% is flagged.
- New books get their book type's own sections (a tech how-to keeps how to use, glossary and resources) and the blueprint and writer get its genre rules.
- Repeated definitions, warnings and sentences across chapters become editor suggestions (book-level repetition check), the used-already list reaches every later writing call, and the "stories are illustrative" note sits once on the copyright page.
- Cover concepts: the book setting `coverConcepts` (1 to 4, default 3) sets how many concepts and paid images are made.
- A KDP pack built before the marketing shows as stale once marketing is generated or edited.
- The writing estimate's high end comes from each section's word target instead of the full output allowance.
- Editor: Weave in no longer says the note failed when it was woven (the job's result now arrives with its finished status).
- Back and Next footer no longer overflows on phones.
- Command menu keeps keys typed straight after Cmd K.
- Long model ids and key-value lists no longer overflow on narrow screens.

## 4 October 2026

### Added
- Volume workspace created at `~/Projects/volume` from the approved plan (`docs/08-change-management/plans/legacy-approved-plan.md`).
- Rules for every AI assistant (`AGENTS.md`, with `CLAUDE.md` and `GEMINI.md` pointing to it) and the `.agent/` project card, current task and handoff log.
- The owner's original drafts saved in `docs/source-drafts/` as source material.
- KDP facts reference (`docs/reference/reference-kdp-facts-2026-10-03.md`) and OFL fonts in `assets/fonts/`.
- Specification docs: vision, product requirements, architecture, data model, AI pipeline, export spec, design guide foundations, screens and flows, security and privacy, testing, roadmap and glossary.
- `README.md`, `docs/08-change-management/DECISIONS.md` (D-001 to D-013) and `KNOWN-ISSUES.md`.
- Phase 0 build: specs in docs/, config and 27 prompts, Claude agents, skills and hooks, three design direction boards in design/directions/. Waiting for the owner's design choice.
- Fused design direction "Volume" accepted (D-014): tokens in packages/ui, full design guide.
- Clickable prototype of every screen in prototype/ (light and dark, mock data), with screenshot and smoke scripts. Phase 0 ready for owner review.

### Local review corrections, 6 October 2026

- Check AI budgets before internal attempts and reserve allowance across concurrent jobs.
- Import Markdown into an editable book, compare and restore real blueprint versions, upload saved-profile portraits and include them in exports.
- Use TipTap for manuscript blocks; confirm higher-cost writing and enter prices before publication.
- Validate project manifests and file references, bound ZIP expansion and preserve portraits across project transfers.
- Add dated KDP trim/page/margin/cover checks, correct cream-paper limits and large-trim cost selection, and retain barcode placement warnings.
- Load heavy screens on demand, prepare mock-only GitHub checks and reconcile backup and project status documents.
- Add regression/browser checks, verify EPUBCheck and record the synthetic long-book benchmark. Live AI, MySQL and manual publishing acceptance remain outstanding.

## 7 October 2026: Linux runtime restoration (Codex)

Installed project-local Mise Node 26.10.0 and added mise.toml to fulfil the existing Node >=26 requirement. Global Node remains 24.21.0. Clean workspace npm install from unchanged lockfile PASS; typecheck, lint, web/server builds and local HTTP/API SQLite health PASS. API/web stay loopback only because owner-only auth and explicit host/origin guards are part of the existing design. Core 75, AI 155 and server 189 tests PASS; export 86 PASS, one optional skip and one FAIL: PDF contents reference image mean difference 2.94352280521262 exceeds 1.5. The reference was not replaced and tolerance was not weakened. The Linux/reference images were inspected: layout is closely aligned but text rendering differs; exact cause remains unresolved. Mock browser integration results are recorded in the supplied migration report. MySQL and live AI generation NOT TESTED. No env files or private data files inspected, no commit or deployment. Earlier sandbox/network blockers are superseded.

Next: review the PDF reference discrepancy separately; use ../start-projects.mjs for normal local startup. Existing publishing/live AI acceptance items above remain open.

PASS: all five mock end-to-end scenarios completed on Linux (2.2 minutes). Export visual reference mismatch remains FAIL as recorded above.


## 7 October 2026: complete PDF reference diagnostics
Added the export workspace compare:pdf command to report every reference-page mismatch and public font/environment hashes without changing render settings or golden files. Linux visual acceptance remains FAIL. Added a shared Mac/Linux transfer and validation guide under Rebrand/MAC-LINUX.md. Evidence: ../reports/volume/qa/reports/PDF-INVESTIGATION-2026-10-07.md.

## 7 October 2026, Codex fix follow-up

PDF test reports all mismatches and refuses missing references; restart startup budget matches main server and targeted recovery PASS. PDF visual acceptance remains FAIL. See ../reports/volume/qa/reports/FOLLOW-UP-2026-10-07.md.


## 7 October 2026: running-header correction

Corrected suppressed small capitals in PDF running headers and added a rendered-PDF regression. Full visual parity remains FAIL; reference images and tolerance remain unchanged. Ornament rendering is intact, correcting the initial diagnostic suspicion. See ../reports/volume/qa/reports/PDF-SMALLCAPS-2026-10-07.md. Release remains PARTIAL/NO-GO; actual Mac execution is NOT TESTED.

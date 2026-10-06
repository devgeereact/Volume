# Changelog

User-visible changes, newest first. Dates in British format.

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
- Volume workspace created at `~/Projects/volume` from the approved plan (`docs/PLAN.md`).
- Rules for every AI assistant (`AGENTS.md`, with `CLAUDE.md` and `GEMINI.md` pointing to it) and the `.agent/` project card, current task and handoff log.
- The owner's original drafts saved in `docs/source-drafts/` as source material.
- KDP facts reference (`docs/reference-kdp-facts-2026-10-03.md`) and OFL fonts in `assets/fonts/`.
- Specification docs: vision, product requirements, architecture, data model, AI pipeline, export spec, design guide foundations, screens and flows, security and privacy, testing, roadmap and glossary.
- `README.md`, `DECISIONS.md` (D-001 to D-013) and `KNOWN-ISSUES.md`.
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

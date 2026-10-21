# Changelog

User-visible changes, newest first. Dates in British format.

## 21 October 2026

#### Added
- Clean-handbook page design, modelled on the NHS Boundary Handbook: one sans typeface, block paragraphs, "CHAPTER N" in navy over the chapter title on its own page, each section on a new page, no running heads and quiet page numbers you can switch off.
- Pages files for final retouching. On a Mac, `npm run pages -- <pack.zip>` adds a `.pages` copy of the manuscript to the pack; the pack README tells you how when it is missing.
- A converter that turns Pages books (exported as Word) into files Volume can import, chapters and sections intact.
- Import manuscripts takes several files at once and can mark them published as they come in, so a pen name's backlist lands on the Published shelf and in Also by in one step.

#### Changed
- First drafts come out cleaner. Example prompts are filled in rather than left with [brackets], examples use "you" or a plain description instead of invented brand names, there is no "guarantee" wording and no unsourced statistics, and the writing avoids the usual AI tells. The writer now also sees the book type's own rules.
- The claims checker files only statements that could do harm if wrong. It also leaves the book's own disclaimers, spelled-out acronyms, narration about its own illustrative people, "we" lines about the author's field and common feelings told in everyday words alone (claims v6). Healthcare books now ask for 24-hour times, characters named by role and the exact words to say, with no lists or boxes inside chapters. Illustrations, the author's own advice, glossary terms and products named in passing are left alone, and a sentence you have already fixed is never filed again.
- Claims now come in two tiers. Statements that could do harm if wrong, named firms, personal claims and older claims show under "Needs your check"; lower-risk statements are listed "For the record" and stay in the claims report, which gains a "needs check" column. Preflight warns only about the claims that need your check, and "Fix the whole book" rewrites only those, so the rest of your prose is left as you wrote it.
- A pen name's writing samples now shape the writer's voice.
- Summaries suit short pages such as the glossary and the review request, and a summary or check that fails is tried once more before it is flagged.
- Each book now stays in its own pen name's world. The writer gets a short summary of the pen name's field from the bio and credentials, and takes its examples from that field and the book's topic. An AI or web design book no longer reaches for the NHS, GPs or hospitals as everyday examples; it uses a bank, the council or an online shop instead. A book that is not a health book shows a warning on any section that still mentions health settings, so you can check them.

#### Fixed
- Volume mode no longer holds a batch book back for claims listed for the record; only claims that need your check count, as in preflight.
- A banned word quoted on its own as a word to avoid (for example "award-winning" in a list of words not to use) is now a warning to look at, not a block. The same word used as a claim in normal prose still blocks.
- `npm run pages` now works when Pages is closed (it starts Pages in the background and waits for the Word import), including on Macs where the app is named Pages Creator Studio.
- Printed and e-book files set curly quotes and apostrophes, as the owner's books are; the manuscript text keeps whatever you typed.
- Built covers now match the Cover studio preview. Over concept art the build used a black overlay and white type; it now uses the same wash of the palette's background and the palette's own text colours as the preview, and no band over the art. Build covers again to get the matching colours.
- Preflight counted softened (and author-experience) claims as still open, so a book whose claims were all settled kept warning about dozens. Only open claims count now, and the claims report lists each claim's real status.
- Claims you already verified, softened or removed no longer come back as new open claims when the checks run again after an edit. A sentence already open in the section is not filed twice either.
- The pack no longer blocks on example placeholders the reader is meant to type, such as "Plan a trip from [your town]" inside quotes, or "placeholders such as [your account number]". A bracket placeholder left in plain prose is still caught.
- "Rather than a guarantee" and "instead of a guarantee" no longer count as a promise; "we guarantee" still does.
- Fix the whole book also removes empty list items (a lone "-"), and "Fix everything" queues the missing summaries and checks for every section that lacks them.
- A step stopped at the book's budget no longer spins for ever. The Cover studio, the Editor and Fix the whole book now say "Stopped at this book's budget", show the budget, what is spent and what the step needs, and offer "Raise budget and continue" (owner). The Cover studio also picks up a concept or build job that was already running before a reload.
- Cover concepts, AI edits, note weaving, rewrites and claim fixes no longer wait behind another book that is being written. They have a slot of their own and start straight away.

#### Added
- Claims page: "Fix the whole book". One click fixes house style (em dashes, US spellings) in every section, then every open claim: softer wording where it is on file, otherwise the AI rewrites the sentence so it claims only what is safe, never with a source you have not got. Claims whose sentence is already gone are closed. Progress shows as it works, Stop is always there, and every change is a new version you can undo. "Only house style (free)" and "Only the claims" are there too. The Editor's Next line links to it.

#### Fixed
- The model-unavailable fix now works when the withdrawn model was chosen on the book or its pen name (for example a book moved from another Volume with free test models). "Use the Settings model and try again" removes that model from the book, the pen name and Settings, so each step uses the model Settings, Models shows, and runs the step again.
- When the model chosen for a step has been withdrawn (for example "Function ... Not found"), the Cover studio, the Editor and the Claims fix now say which step failed and offer "Use <next model> and try again", which switches that step's model in Settings and runs it again.

## 20 October 2026

#### Changed
- Editor side panel is simpler: three tabs, To fix (claims and house style together), AI edits and Notes, instead of four tabs plus a three-way pass switch. Each kind of AI edit (Line edit, Structure, Voice) now says what it does.
- A "Next" line at the top of the Editor panel says what to do in this section (check a claim, fix a style problem, review AI edits) with a button that goes there, and turns green when the section is clear.
- Red underlined claims in the text can be clicked: the panel opens on that claim. One click, "It is right, mark checked", clears it; Add a source, Soften and Remove sentence are still there.
- AI runs in the Editor now show messages: one when a line, structure or voice edit, a note weave or a section draft starts, one when it finishes or fails (with a Show button), and an "AI working" line in the panel while it runs.
- Cover studio shows the whole process at the top: Brief, Make concepts, Pick one, Build covers. Each step says what it does, done steps are ticked, and the button for the step you are on sits right there (it was only at the foot of the page). "Use my own cover instead" jumps to the upload panel.
- Cover concepts can be downloaded one by one. Making new concepts replaces the old set, and the page now says so.
- Cover concept and cover build runs show a message when they start and when they finish or fail.
- Real covers show across the app: the Library, the small cover in each book's top bar, Profiles and the Published shelf show the built or uploaded eBook cover, or the chosen concept until it is built, instead of a draft or an empty frame.
- Published books: a Change cover link on the Published shelf, and the Cover studio explains how to change the cover of a published book (build, rebuild the pack on Export, upload to KDP).
- Editor text is spell-checked as British English, so British spellings are no longer underlined by the browser.
- volume.gakinz.com opens on the landing page for everyone. Signing in takes you to the Library, which now lives at /library; when you are already signed in, the landing's button says Open library.

#### Fixed
- The sign-in page shows "Sign in to Volume" once, not twice.

## 19 October 2026

Moving a book between Volumes (D-051); claims, autosave and reruns (D-052).

#### Added
- Import project: bring one book from another Volume (for example from the Mac to the hosted app) under a pen name you choose. The import always makes a new book, marked "Moved from another Volume on <date>", and changes nothing that is already there.
- Project zips now carry a manifest with a checksum for every file; an import refuses a zip that was changed or damaged.
- Library: an Import project button next to Import manuscript (owners and editors). It asks for the zip and a pen name, preselects the profile you are filtering by, and explains each refusal in plain words.
- Export screen: Move this book, with Download project (to move this book). Owners and editors only.
- Export screen: a moved book shows its origin note, for example "Moved from another Volume on 19 October 2026."
- A landing page for signed-out visitors: one hero with the sample book, its cover opening on the way in, and a manuscript sheet with a claim flagged for checking.
- How it works, its own page: a sample book runs through the seven stages and ends with the upload pack.
- A sign-in page in Volume's look, with the brand panel on the left and the sign-in form in the app's colours, light and dark.
- Web app manifest, app icons (including an Apple touch icon) and a browser bar colour for light and dark themes.
- Fix a claim to verify from the report: three suggested rewrites (soften, generalise, cite a research source, reframe or remove) that add no new facts, figures or sources. Pick one, edit it or write your own.
- The editor saves your work as you type. A long editing session stays one version, and Versions shows the version from before you started.
- Missing summaries and checks show what a rerun would cost, and a second click while one is running does not start another.

#### Changed
- Project zips no longer carry built export files or spend. Build the PDF, EPUB and pack again after a move.
- The Use this title button holds while the choice saves, so a title cannot be chosen twice.
- Smooth scrolling respects the system's reduced motion setting.
- A screen error now stays inside the app, with a link back to the Library.
- The export checks offer "Run it again" for a section whose summary or checks are missing, and say you can upload your own cover when the pack has none.

## 18 October 2026

Own covers and export checks (live acceptance fixes).

#### Added
- Use my own cover: on the Cover screen, upload a front cover image for the eBook (JPEG or TIFF) and a full paperback wrap PDF instead of paying for AI concepts. The upload pack uses them as they are, a cover build keeps them, and the export preflight checks them against KDP's rules (size from the real page count, resolution, fonts, spine text).
- The preflight now checks the listing title, subtitle and description and the back-cover blurb for dashes, banned phrases and US spellings (these block), the blurb's word range (a warning), and the marketing posts and email (a warning).

#### Fixed
- A symbol the book fonts do not have, such as an arrow or a tick, no longer blocks the upload pack. Print files show "to", "->", "[x]" and similar instead, maths symbols use an embedded fallback font, and emoji are left out. The export notes list each swap.

Production hub (D-048, D-049).

#### Added
- Mark as published with a date (today or earlier) and Archive, on the Export screen and on Library cards. Archive offers Undo.
- The upload pack now carries the back-cover blurb and the short bio as text files in `listing/`.

#### Changed
- Choosing a title moves the book to Blueprint, and finishing every chapter moves it to Editor.
- Marketing opens once writing is complete, the same rule on every screen. Items already made stay visible.
- Marketing makes 5 TikTok scripts and 5 Instagram captions by default, set per book type.
- The KDP AI disclosure check now looks at what the AI actually wrote or drew, not only the setting.
- Back-cover blurbs are 120 to 200 words everywhere.

The hosted app at volume.gakinz.com now runs the latest version: fiction, workbooks, picture books, Volume mode and invitations, plus the 17 October sign-in fix.

Data rights and retention (D-050).

#### Added
- Settings, Your account: the owner can download all the workspace's data as one zip. It includes private profile details, so keep it safe.
- Editors and viewers can leave a workspace from Settings, Your account, after typing LEAVE.
- The owner of a separate self-publisher workspace can delete it, with every book and file, after typing DELETE. It waits while a job runs. The main workspace of a Volume cannot be deleted.

#### Changed
- Removing a member now asks the owner to type REMOVE. A removed or departing person whose account belongs to no other workspace has the account deleted too.
- Deleting a book also deletes its AI output and its job history.
- Job history is kept for 90 days, then deleted.
- A book's project zip no longer carries the pen name's legal name or location.

## 17 October 2026

Security and privacy audit, shipped on its own first.

#### Fixed
- Security: a percent-encoded address such as `/%61pi/v1/health` reached the API without sign-in on the hosted app. Sign-in is now checked on the decoded path and again for every `/api/v1` route.
- The hosted app no longer switches to sample books when the server or the connection drops. It keeps real data, shows a "Not connected" badge and the screens show their own errors.
- Error messages no longer tell you to start a local server; they say to check your connection.

#### Changed
- Search engines are told to stay away: `noindex` meta tag, `X-Robots-Tag` header and a `robots.txt` that disallows everything.
- Each screen names itself in the browser tab, for example "Writing · My Book · Volume".
- The developer style guide (`/components`) is local only; the hosted app answers it with Page not found.
- The page description no longer says "clickable prototype". The sign-in screen has a proper heading.

#### Added
- Privacy inventory (`docs/05-security/PRIVACY-INVENTORY.md`) and a draft privacy notice for owner and legal review. Not published.

Roadmap phases 6 to 8 follow.

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

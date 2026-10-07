# Historical task record

Superseded by the GEE OS rebuild task on 7 October 2026. Earlier permissions are historical records, not authority for new external actions.

# Current task

**Phase:** local v1 correction pass, publishing acceptance outstanding.
**Mode:** build.
**Status:** local fixes implemented and verified on 6 October 2026. Release status PARTIAL. Owner authorised free-only OpenRouter validation and reading one book’s generated files; cPanel testing is deferred. Free text validation attempts have concluded with partial acceptance. Documentation consistency pass completed; see qa/reports/DOCUMENTATION-AUDIT-2026-10-06.md. Corrections and documentation are included in the owner-authorised local commit; owner authorised pushing the corrections and prompt revisions.

## Completed in this pass

- Atomic project imports, manifest/row/reference checks and bounded ZIP expansion; author portrait round trips.
- Budget checks before internal AI attempts and adapter tasks, shared allowance reservations, prior paid usage retained on errors.
- Markdown manuscript import, API blueprint comparison/restoration, approved free TipTap editor, author photo upload/export, higher-cost writing confirmation and prices before publication.
- Dated official KDP trim/page/margin/cover facts. Cream-paper page limits and large-trim printing costs corrected. Automatic barcode placement stays partial.
- Heavy route splitting, local GitHub CI workflow, unknown migration column types, redirect default off, reconciled project/backup documentation.
- Expanded browser tests, process restart recovery, EPUBCheck and the long-book benchmark.

## Evidence

- PASS: `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check`.
- PASS: `npm run test:coverage`, all four documented line targets met, all source files included. CI now enforces them. Exact measurements: qa/reports/LOCAL-VALIDATION-2026-10-06.md.
- PASS: `npm test`, 499 tests (core 75, AI 148, export 87, server 189). Two default skips: MySQL and optional EPUBCheck.
- PASS separately: EPUBCheck 5.4.0 using the official temporary jar; all four EPUB tests pass when explicitly enabled.
- PASS: `npm run e2e`, all five scenarios, full book/19-file pack, interrupted server restart, import/undo/paste/reload, blueprint restore/cost confirmation/prices, photo persistence.
- PASS: web build. Main index about 373 kB, shared UI 423 kB; heavier routes load on demand.
- PASS: synthetic long book, 83,815 words, 326 pages, 7.18 seconds including PDF inspection, embedded fonts, no export warnings. Node peak RSS 612.5 MiB excludes Chromium. Reproduce with packages/export/scripts/benchmark.ts.
- Details: qa/reports/PROJECT-REVIEW-2026-10-06.md, qa/reports/LOCAL-VALIDATION-2026-10-06.md and KNOWN-ISSUES.md.

## Next steps and blockers

1. Free AI: live titles PASS (10 options) and blueprint PASS (three chapters, schema valid) on nvidia/nemotron-3-super-120b-a12b:free through the existing server. Synthetic book 01M48Z6TSDY9CCWT62HSDDSVNA, Windowsill Herbs: Free Model Test. First full-writing job 01M48ZPZJ929Q4A11JJSFZY80M failed when chapter two summarise exceeded its output limit after retry. No partial section saved. Retry 01M490V24JVYTJ6QJXDDTFVQ80 also failed on summary truncation with verified free Lightning. Both owner-selected Gemma models failed with an upstream Google AI Studio invalid-key error. Full writing acceptance FAIL; saved draft has flagged style/word-count defects. All text stages overridden on this book only; no search or image calls. Budget remains 0.000001 USD as an additional gate, not permission for paid models. Recorded cost is zero. The initial missing summarise override was stopped by the budget gate and then corrected.
2. cPanel MySQL: deferred at the owner's explicit request. No connection or remote database mutation attempted.
3. Publishing review: user granted access to one book, but current SQLite project list and app library were empty. Selected the Windowsill Herbs fixture and created the separate labelled free-test book. Fresh sample DOCX opened in Word; title, copyright, contents, chapter, table pagination/repeated header and final-page layouts visibly checked. Kindle Previewer 4 downloaded from the official help-page link; complete 489,948,921-byte package passes signing and notarisation checks outside the sandbox. The earlier sandboxed verification error is resolved. Installer not run; explicit licence acceptance question pending. Browser surfaces unavailable, so KDP draft upload and generated template comparison remain NOT TESTED. Barcode placement stays partial.
4. Owner decisions: Gideon's imprint/credentials, Harni's personal line and proposed decisions. D-020 remains proposed with redirect resolution now default off.
5. .env.example remains owner-edited as previously recorded. No environment files read. Only authorised book-list metadata and the labelled synthetic test book were accessed in data/ during this free validation.
6. Commit/push only on the owner's request. Initial private devgeereact/Volume repository is already published; the corrections and prompt revisions are included in the owner-authorised push to origin/main. Remote CI results require separate verification.

Later roadmap phases (fiction/workbooks, picture books, batches/accounts) are outside this v1 correction pass.

## Active follow-up: humanizer prompt revision completed locally

Owner approved the prompt/dead-code plan. Created new versions of all 32 prompt IDs using humanizer 3.0.0 principles; updated prompt index, guides, tests, changelog, D-031 and known issues. Old versions remain unchanged. No runtime dependency on the owner's skill path, new AI call or model-default change.

Removed only the verified unused null BookHeader component and its documentation references. Static audit examined 377 JS/TS files; unreferenced-looking CLI/manual/design tools have explicit entry points and were retained. No blanket claim that all exported or dynamically referenced code is dead.

PASS: typecheck, lint, formatting, AI 155 tests, server 189 tests (MySQL skipped), five browser scenarios and git diff --check. House-style PARTIAL: 66 existing detector findings, same counts as the original prompts, from rule examples/contracts. No new banned-phrase or dash findings. See local validation.

Next: owner-controlled restart/reload of the existing server to load prompt revisions, then fresh authorised live quality validation. No existing server restarted; no live calls, environment/data reads, dependencies, commits or pushes. This follow-up is included in the owner-authorised commit/push to origin/main; cPanel stays deferred.

## 7 October 2026: workspace server setup (Codex)

Owner requested fixed ports and local startup for all active projects. Preserved Harni 5152, mail 5153, Volume web 5180 and API 5181. Workspace start-projects.mjs provides a foreground launcher; LOCAL-SERVERS.md records commands and evidence. Runtime BLOCKED by sandbox loopback EPERM, Node 24 instead of required 26, unavailable PHP and missing Linux native dependencies. npm registry lookup also fails with EAI_AGAIN. No server running, environment/data files read, live AI call or deployment. Next: restore prerequisites in a normal network-enabled terminal, run the launcher and verify HTTP responses.

## 7 October 2026: Linux runtime restoration (Codex)

Installed project-local Mise Node 26.10.0 and added mise.toml to fulfil the existing Node >=26 requirement. Global Node remains 24.21.0. Clean workspace npm install from unchanged lockfile PASS; typecheck, lint, web/server builds and local HTTP/API SQLite health PASS. API/web stay loopback only because owner-only auth and explicit host/origin guards are part of the existing design. Core 75, AI 155 and server 189 tests PASS; export 86 PASS, one optional skip and one FAIL: PDF contents reference image mean difference 2.94352280521262 exceeds 1.5. The reference was not replaced and tolerance was not weakened. The Linux/reference images were inspected: layout is closely aligned but text rendering differs; exact cause remains unresolved. Mock browser integration results are recorded in the supplied migration report. MySQL and live AI generation NOT TESTED. No env files or private data files inspected, no commit or deployment. Earlier sandbox/network blockers are superseded.

Next: review the PDF reference discrepancy separately; use ../start-projects.mjs for normal local startup. Existing publishing/live AI acceptance items above remain open.

PASS: all five mock end-to-end scenarios completed on Linux (2.2 minutes). Export visual reference mismatch remains FAIL as recorded above.

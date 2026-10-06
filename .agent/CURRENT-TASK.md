# Current task

**Phase:** local v1 correction pass, publishing acceptance outstanding.
**Mode:** build.
**Status:** local fixes implemented and verified on 6 October 2026. Release status PARTIAL. Owner authorised free-only OpenRouter validation and reading one book’s generated files; cPanel testing is deferred. Free text validation attempts have concluded with partial acceptance. Documentation consistency pass completed; see docs/DOCUMENTATION-AUDIT-2026-10-06.md. Corrections and documentation are included in the owner-authorised local commit; no push performed.

## Completed in this pass

- Atomic project imports, manifest/row/reference checks and bounded ZIP expansion; author portrait round trips.
- Budget checks before internal AI attempts and adapter tasks, shared allowance reservations, prior paid usage retained on errors.
- Markdown manuscript import, API blueprint comparison/restoration, approved free TipTap editor, author photo upload/export, higher-cost writing confirmation and prices before publication.
- Dated official KDP trim/page/margin/cover facts. Cream-paper page limits and large-trim printing costs corrected. Automatic barcode placement stays partial.
- Heavy route splitting, local GitHub CI workflow, unknown migration column types, redirect default off, reconciled project/backup documentation.
- Expanded browser tests, process restart recovery, EPUBCheck and the long-book benchmark.

## Evidence

- PASS: `npm run typecheck`, `npm run lint`, `npm run format:check`, `git diff --check`.
- PASS: `npm run test:coverage`, all four documented line targets met, all source files included. CI now enforces them. Exact measurements: docs/LOCAL-VALIDATION-2026-10-06.md.
- PASS: `npm test`, 499 tests (core 75, AI 148, export 87, server 189). Two default skips: MySQL and optional EPUBCheck.
- PASS separately: EPUBCheck 5.4.0 using the official temporary jar; all four EPUB tests pass when explicitly enabled.
- PASS: `npm run e2e`, all five scenarios, full book/19-file pack, interrupted server restart, import/undo/paste/reload, blueprint restore/cost confirmation/prices, photo persistence.
- PASS: web build. Main index about 373 kB, shared UI 423 kB; heavier routes load on demand.
- PASS: synthetic long book, 83,815 words, 326 pages, 7.18 seconds including PDF inspection, embedded fonts, no export warnings. Node peak RSS 612.5 MiB excludes Chromium. Reproduce with packages/export/scripts/benchmark.ts.
- Details: docs/PROJECT-REVIEW-2026-10-06.md, docs/LOCAL-VALIDATION-2026-10-06.md and KNOWN-ISSUES.md.

## Next steps and blockers

1. Free AI: live titles PASS (10 options) and blueprint PASS (three chapters, schema valid) on nvidia/nemotron-3-super-120b-a12b:free through the existing server. Synthetic book 01M48Z6TSDY9CCWT62HSDDSVNA, Windowsill Herbs: Free Model Test. First full-writing job 01M48ZPZJ929Q4A11JJSFZY80M failed when chapter two summarise exceeded its output limit after retry. No partial section saved. Retry 01M490V24JVYTJ6QJXDDTFVQ80 also failed on summary truncation with verified free Lightning. Both owner-selected Gemma models failed with an upstream Google AI Studio invalid-key error. Full writing acceptance FAIL; saved draft has flagged style/word-count defects. All text stages overridden on this book only; no search or image calls. Budget remains 0.000001 USD as an additional gate, not permission for paid models. Recorded cost is zero. The initial missing summarise override was stopped by the budget gate and then corrected.
2. cPanel MySQL: deferred at the owner's explicit request. No connection or remote database mutation attempted.
3. Publishing review: user granted access to one book, but current SQLite project list and app library were empty. Selected the Windowsill Herbs fixture and created the separate labelled free-test book. Fresh sample DOCX opened in Word; title, copyright, contents, chapter, table pagination/repeated header and final-page layouts visibly checked. Kindle Previewer 4 downloaded from the official help-page link; complete 489,948,921-byte package passes signing and notarisation checks outside the sandbox. The earlier sandboxed verification error is resolved. Installer not run; explicit licence acceptance question pending. Browser surfaces unavailable, so KDP draft upload and generated template comparison remain NOT TESTED. Barcode placement stays partial.
4. Owner decisions: Gideon's imprint/credentials, Harni's personal line and proposed decisions. D-020 remains proposed with redirect resolution now default off.
5. .env.example remains owner-edited as previously recorded. No environment files read. Only authorised book-list metadata and the labelled synthetic test book were accessed in data/ during this free validation.
6. Commit/push only on the owner's request. Initial private devgeereact/Volume repository is already published; these corrections and CI are committed locally. Remote CI has not run.

Later roadmap phases (fiction/workbooks, picture books, batches/accounts) are outside this v1 correction pass.

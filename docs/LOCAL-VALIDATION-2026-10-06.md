# Local validation, 6 October 2026

The earlier automated checks below used synthetic content, with no .env, live AI or owner database. Subsequent authorised free live tests and further Word checks are recorded separately in [free AI validation](FREE-AI-VALIDATION-2026-10-06.md).

## Exports

- PASS: official EPUBCheck 5.4.0 against a generated Windowsill Herbs EPUB with a real synthetic JPEG cover. No errors or warnings. The existing test's four-byte placeholder JPEG was replaced with a valid generated image, so EPUBCheck can run meaningfully.
- PASS: synthetic long-book export, 83,815 words, 326 pages, 5 x 8 trim. Export plus PDF inspection took 7.18 seconds. PDF size: 970,361 bytes. Every detected font embedded, no Type 3 fonts, no export warnings.
- Peak Node process RSS: 612.5 MiB. This excludes Chromium memory. It is one observed run on this Mac, not a prediction of performance on other machines or a complete memory profile.
- Reproduce the benchmark: `node node_modules/tsx/dist/cli.mjs packages/export/scripts/benchmark.ts`.
- Reproduce EPUBCheck after downloading the [official release](https://github.com/w3c/epubcheck/releases/tag/v5.4.0): `EPUBCHECK_JAR=/path/to/epubcheck.jar node node_modules/vitest/vitest.mjs run --root packages/export test/epub.test.ts`.

## Web payload

Vite build: main index 372.80 kB (114.42 kB gzip), shared UI 422.58 kB (128.74 kB gzip), editor 528.16 kB (169.17 kB gzip) loaded on demand. The previous main bundle was about 1.47 MB. The index figure alone is not the total initial payload. No formal cold-load timing was measured.

## Coverage

PASS: `npm run test:coverage`, 499 tests passed, two skipped (MySQL and default optional EPUBCheck). Vitest V8 includes all TypeScript source files under each workspace’s `src/`, without exclusions.

| Workspace | Covered lines / total | Line coverage | Required | Result |
|---|---|---|---|---|
| Core | 1,301 / 1,407 | 92.46% | 90% | PASS |
| AI | 1,472 / 1,560 | 94.35% | 80% | PASS |
| Export | 915 / 1,057 | 86.56% | 80% | PASS |
| Server | 4,828 / 5,252 | 91.92% | 80% | PASS |

Server measurement includes all server source, not only services. Branch coverage ranges from 67.44% to 77.82%; line coverage does not demonstrate every branch or publishing acceptance. Reports are generated under each workspace’s ignored `coverage/` directory. Local typecheck, lint and formatting also PASS. The CI workflow now enforces these line thresholds, but remote execution remains NOT TESTED.

## Initial publishing application check (historical)

PARTIAL: generated a fresh Windowsill Herbs test DOCX using the current exportDocx implementation, then opened /private/tmp/volume-word-review.docx in Microsoft Word. No repair prompt appeared. The title, subtitle, author and demo callout rendered visibly on the title page. Word reported 31 pages, 6,177 words and English (United Kingdom). This is fixture compatibility evidence, not acceptance of an owner manuscript. A subsequent attempt to inspect later pages failed with the desktop service reporting noWindowsAvailable, so chapter, contents, table and final-page visual checks remain NOT TESTED.

Kindle Previewer was absent from /Applications. Amazon’s [current Previewer page](https://kdp.amazon.com/en_US/help/topic/G202131170) identifies version 4 as current and version 3 as unsupported. Its linked product/download page returned HTTP 503 through the web tool. No installer was downloaded and no licence accepted. Kindle rendering and KDP account/draft upload remain NOT TESTED.

The inherited execution environment has no OpenRouter API key, MYSQL_TEST_URL or explicit LIVE_AI enablement. Only presence booleans were checked; no secret values, environment files or owner data were read. The existing live smoke script loads .env and has a fixed $0.50 smoke cap; it does not constitute full r6 text/cover acceptance. The MySQL test writes migration tables and test rows, so it requires an identified empty disposable database. No remote connections or paid calls were attempted.

Further Word inspection and the complete official Kindle installer download are recorded in [free AI validation](FREE-AI-VALIDATION-2026-10-06.md). The earlier access checks above describe the execution environment, not the key already held by the existing running app.

## Outstanding acceptance

Free titles/blueprint pass; full free writing failed and production-model quality remains unverified. Sampled Word layouts pass in the later report. Kindle/KDP acceptance remains outstanding and cPanel is explicitly deferred by the owner. See KNOWN-ISSUES.md. GitHub CI is prepared locally but not yet executed remotely.

## Humanizer prompt revision and dead-code check

- PASS: 32 new prompt versions load/render with the original variables, stages, tiers and guardrail metadata; old version pins remain available. The index points to each selected revision, including JSON repair. Seven new tests capture mock provider requests from writing, voice editing, line editing and summaries and check the guidance reaches the model without an extra call.
- PASS: AI suite 155 tests; server suite 189 tests, one MySQL skip; five browser scenarios including full export pack and recovery. Root typecheck, lint, format:check and git diff --check PASS. Browser run also builds server and web.
- House-style scan PARTIAL: 66 book-content detector findings across the 32 new prompts, with the same pattern counts as the previous versions. They occur in existing prohibition examples, medical/safety rules, word-target tolerances and output contract text. No new banned-phrase or dash findings. Prompt versions were scanned without suppressing those findings.
- Static import audit inspected 377 JavaScript/TypeScript files, including tests and tools. Removed apps/web/src/shell/BookHeader.tsx, a deprecated null component with no imports or runtime references. Retained migration/seed CLIs, manual API check and design generators after confirming manifest/document/script references. No historical prompts, fixtures, demo routes or public exports were removed. Static import analysis is not proof about arbitrary runtime strings or external consumers.
- No live model request, dependency installation, owner-data/environment read, user-server restart, commit or push. New writing quality remains NOT TESTED live. Changes are local and uncommitted.

# Volume PDF investigation, 7 October 2026

Status: PARTIAL. Diagnostic tooling and transfer guide completed; PDF reference parity remains FAIL. Actual macOS execution remains NOT TESTED because no Mac path/access details were supplied.

## Reproduction

Ran the existing export PDF test on the isolated Rebrand/volume candidate. Ten tests passed and one failed at the unchanged contents-page reference assertion: mean grey-level difference 2.94352280521262 against a 1.5 threshold. The test stops comparing at its first failing page, so this understated the wider mismatch.

A separate default-settings comparison of all four existing reference images found:

| Reference | Physical page | Mean difference | Result |
| --- | --- | --- | --- |
| Title | 1 | 1.268090 | PASS |
| Contents | 3 | 2.943523 | FAIL |
| Chapter opener | 7 | 8.613240 | FAIL |
| Body | 8 | 11.101959 | FAIL |

Image dimensions match. The body-page comparison shows different line wrapping and page-boundary text, beyond a simple antialiasing difference. The original reference PNGs and font assets remain unchanged.

## Experiments and limits

Separate scratch runs tested Chromium font hinting none/full/slight, disabled subpixel positioning, and combinations with disabled LCD text. Disabling hinting reduced contents difference to 0.799508, but chapter and body differences remained 1.607557 and 2.354402, both above 1.5. No variant passed all four pages. These experiments show rendering/layout sensitivity to font settings; they do not establish the exact original reference-generation environment or prove an operating-system-only cause.

No speculative browser flag was added to production. No golden file was replaced, tolerance weakened, assertion disabled, dependency upgraded or original project changed.

## Implemented

Added packages/export/scripts/compare-pdf-reference.ts and the export workspace command:

```sh
mise exec -- npm run compare:pdf --workspace @volume/export
```

The TypeScript diagnostic uses the same public manuscript fixture, theme, fixed creation date, reference pages and 1.5 threshold as the existing PDF test. It reports every comparison, exits nonzero on failure, and includes OS, CPU, Node, Chromium and public font/reference hashes for a meaningful Mac comparison. It writes no reference or application files and requires no credentials or owner data.

The initial diagnostic incorrectly expected contents in the numbered-section map. That map omits front matter; the corrected tool uses the same contents-page fallback (physical page 3) as the existing test. The final diagnostic output was parsed and verified to contain four comparisons, with one PASS and three FAIL results.

## Verification

- PASS: export workspace TypeScript checking.
- PASS: ESLint and Prettier for the new diagnostic.
- PASS: documentation link check.
- PASS: reference/font files have no Git diff.
- PASS: diagnostic returns failure and reports all four comparisons, without suppressing the underlying mismatch.
- FAIL: existing PDF visual reference acceptance, 10 related tests PASS and one visual test FAIL.
- NOT TESTED: fresh Mac execution, live services, remote CI and complete feature/publishing acceptance.

Linux diagnostic uses Node 26.10.0 and Chromium 153.0.8010.12. Full safe results and hashes are in Volume-PDF-diagnostic.json. The common Mac/Linux transfer guide is Mac-Linux-project-guide.md, also saved as Rebrand/MAC-LINUX.md.

Next: run the same diagnostic on the actual Mac with the same source, lockfile and fonts, compare hashes/browser version and all four metrics, then identify a deterministic rendering or layout correction. Volume remains PARTIAL/NO-GO for release. The four public-site candidates retain their previously recorded Linux PASS status; this investigation does not retest or change their runtime behaviour.


## 7 October 2026: running-header correction

Corrected suppressed small capitals in PDF running headers and added a rendered-PDF regression. Full visual parity remains FAIL; reference images and tolerance remain unchanged. Ornament rendering is intact, correcting the initial diagnostic suspicion. See qa/reports/PDF-SMALLCAPS-2026-10-07.md. Release remains PARTIAL/NO-GO; actual Mac execution is NOT TESTED.

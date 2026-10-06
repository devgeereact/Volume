# Free AI validation, 6 October 2026

Owner authorised free OpenRouter models for testing, granted access to one book’s generated files and deferred cPanel testing. The app’s current library and SQLite project-title list were empty, so a labelled synthetic book was created: Windowsill Herbs: Free Model Test, project 01M48Z6TSDY9CCWT62HSDDSVNA. Its author is explicitly fictional. No existing manuscript was altered.

## Execution

Used the already running local server at 127.0.0.1:5181, confirmed as OpenRouter with a key present through its API. No key was read, printed or copied; no .env file was accessed. Default workspace models and account privacy settings were unchanged.

The public OpenRouter catalogue was checked before each selection: every pricing field was zero for the selected :free model. No search plugins or image calls were requested. A 0.000001 USD book budget provides an additional gate because the existing service rejects calls with an exhausted zero allowance; this does not authorise selecting a paid model. All text stages on this synthetic book are overridden to verified free models.

| Test | Result | Evidence |
|---|---|---|
| apodex/apodex-1.1-mini:free titles | BLOCKED | Account provider filters excluded all available providers. Paid fallback was offered but not used. Cost zero. |
| google/gemma-4-31b-it:free titles | FAIL at provider | Google AI Studio returned an invalid upstream-key error. Cost zero. |
| nvidia/nemotron-3-super-120b-a12b:free titles | PASS | Ten title options saved; job 01M48ZAYZQJG2DV3455Z1NV4X9 succeeded. Cost zero. |
| Nvidia three-chapter blueprint | PASS | Schema validation ok, no issues, exactly three chapters, version 1. Job 01M48ZFKE5C86AJ00JN7TZRCJW succeeded. Cost zero. |
| First full-writing attempt | FAIL | Job 01M48ZPZJ929Q4A11JJSFZY80M: second chapter summary truncated after retry, 6,078 reasoning tokens out of 8,000 output tokens. No partial section saved; three dependent sections cancelled. Recorded cost zero across 14 runs, all actual model slugs free. |
| Retry with free Lightning summaries | FAIL | Job 01M490V24JVYTJ6QJXDDTFVQ80 failed on a truncated summary after retry; four dependent sections cancelled. Recorded cost zero across 16 runs, all recorded models free. No budget increase. |
| Requested Gemma 26B test | FAIL at provider | Job 01M49AWE8Z02B5GFWBX786FTWC: google/gemma-4-26b-a4b-it:free returned an invalid upstream Google AI Studio key error. No output saved. |
| Requested Gemma 31B retest | FAIL at provider | Job 01M49AWJ77JQ37F41ZRYN0H9AC: google/gemma-4-31b-it:free returned the same invalid upstream-key error. No output saved. |

The initial test setup missed the summarise model override. Its default paid-model estimate was stopped by the tiny book budget before sending that call. The override was corrected, the child resumed and no budget increase made. This was a test setup correction, not a product-code change.

Final saved-draft quality findings: introduction 229 words against 200 (within tolerance), but consistency checking flags unsupported author background claims. First chapter 1,110 words against 883 (over tolerance), three em dashes, status needs_attention. The application flagged these defects; the raw generated draft is not publishing-ready.

Free-model results do not validate the configured paid production models. Research citation quality and AI cover generation remain NOT TESTED under the free-only scope.

## Publishing application evidence

Selected the existing Windowsill Herbs fixture because no owner book was present in the active library. Fresh DOCX at /private/tmp/volume-word-review.docx was generated with the current exporter. Word opened it without a repair prompt, with 31 pages, 6,177 words and English (United Kingdom). Representative title, copyright, contents, chapter, table and final-page layouts were visibly inspected. The table repeated its header across the page boundary and its rows remained legible. This is PASS for the sampled fixture layouts, not exhaustive owner publishing acceptance.

Kindle Previewer 4 was downloaded from the Mac link embedded in [Amazon’s official help page](https://kdp.amazon.com/en_US/help/topic/G202131170): 489,948,921 bytes, SHA-256 5e177630aeb5e4781d3abe87712fd365eaff1b88ba61b006d5df9e60da7e7ca1. Initial sandboxed pkgutil and spctl checks failed because the signing service was unavailable. Repeating both read-only checks outside the sandbox PASS: signed by AMZN Mobile LLC, trusted notarisation, Gatekeeper accepted. No installer was run, protection disabled or licence accepted. Explicit licence acceptance approval is pending before installation/use; Kindle rendering remains NOT TESTED. The sample EPUB passed EPUBCheck separately in the earlier correction pass.

The [KDP cover calculator](https://kdp.amazon.com/cover-calculator) was reachable through the web tool, but neither iab nor chrome browser surfaces were available through computer control. Book-specific template interaction, account draft upload and online preview remain NOT TESTED. No test book was uploaded or published.

Both requested Gemma routes were checked against the public zero-price catalogue before testing. Final cost endpoint remained 0 USD. No provider/account privacy settings were changed and no paid fallback used. Full-book writing acceptance is FAIL for these attempts, while the overall live acceptance remains PARTIAL because titles and blueprint succeeded. The synthetic book remains clearly labelled and available for inspection.

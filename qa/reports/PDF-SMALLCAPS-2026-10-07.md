# Volume PDF follow-up, 7 October 2026

Status: PARTIAL. Running-header small capitals corrected; complete PDF reference parity remains FAIL.

## Change

The global font-synthesis:none rule prevented running headers from synthesising the small capitals requested by the theme when the selected font lacked them. Allow small-cap synthesis only on small-cap running headers. Bold and italic synthesis remain disabled. No browser launch flags, dependencies, reference images or comparison thresholds changed.

The existing running-header PDF test now checks rendered glyph case as well as title content. The regression fails against the unfixed CSS and passes with the correction. This checks the exported PDF, rather than only asserting a CSS string.

## Evidence

- PASS: targeted running-header regression with the correction.
- PASS: export workspace TypeScript checking.
- Final full PDF suite including the regression: ten PASS, one visual FAIL.
- PASS: ESLint on changed source/test, documentation links (97 documents), Git whitespace checks and unchanged font/reference files.
- Default-browser visual means after the CSS correction: contents 2.943523, opener 8.613240, body 11.075217. Existing limit: 1.5.
- Diagnostic browser with font hinting disabled: title 0.434485, contents 0.799508, opener 1.607557, body 2.304198. Last two still FAIL. This is an experiment, not a production setting.

## Corrected investigation finding

An initial visual reading suggested a missing sprig ornament in the PDF.js preview. Pixel inspection disproved this: all ten ornament strokes produce pixels, and both PDF.js and the independent Poppler renderer show the sprig in the PDF. No preview stroke or clipping workaround was applied. The reference chapter-opener PNG lacks the sprig, so removing valid artwork to match that image would be unjustified.

The remaining reference differences include typography, line wrapping under default Linux browser settings and rasterisation. The precise reference-generation environment is unknown. The header correction does not establish complete parity. Actual Mac execution remains NOT TESTED.

CSS reference consulted: https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-synthesis

## Next action and recovery

Run the unchanged comparison command on the actual Mac with matching source, lockfile and font hashes. Establish the reference-generation environment before changing rendering settings or approving new reference images. Release remains NO-GO. Restore the pre-change print-html source and remove the added glyph-case assertions to undo this correction. Other local rebrand work is preserved.

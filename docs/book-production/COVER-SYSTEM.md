# Cover system: the brief, solidified (24 October 2026)

What the owner asked for: covers that are authentic and look original, with vivid, sharp colour, four really different concepts, and a preview that is exactly what the build outputs. This page is the rule set. If the code and this page disagree, stop and ask.

## 1. One renderer, so the preview is the output

- The build makes the eBook cover and the paperback wrap from one HTML page (`packages/export/src/covers.ts`, rendered by Chromium).
- The Cover studio shows that same page. `POST /books/:id/cover/preview` returns the page the build would render for the settings in the request (nothing saved, no AI call). The studio draws it in a sandboxed frame (`CoverFrame`), scaled. Nothing is redrawn in the browser.
- The page tells the studio where the title, subtitle and author sit and the title's fitted size (a message from the page itself), so the editing handles and the numbers on screen are the page's own.
- The cover cards, the eBook tab, the thumbnail tab and the wrap tab all use this page. The only picture that is not a preview is the "Covers built" tile, which is the built file.
- The studio sends only what the owner decided (`typography`: design, palette, title font, size, position, alignment, case, per-line positions). It works nothing out, so preview and build cannot drift.

## 2. Authentic, untouched art, readable type

- No gradient or wash over the art. The art keeps its colour.
- The title, subtitle and author take whichever of the palette's own colours reads best on the art behind them (`packages/core/src/cover-ink.ts`, measured on a 32 by 48 sample of the art by both the build and the studio). A light scrim appears only when no palette colour reads.
- A subtitle that would run into a title that wrapped onto more lines is moved just below it.
- The eBook JPEG is saved at quality 95 with 4:4:4 chroma.

## 3. Four concepts that differ

- Prompt `cover.cover-brief` v4: four different art directions (symbolic or abstract, literal scene or object, bold graphic in flat or two-tone colour, typographic-led with rich texture), each with its own palette family and composition, and different from the author's other books.
- Prompt `cover.cover-image` v3: vivid, fully saturated colour, sharp tactile detail, an authentic original look, a title area that is clearly light or dark and still richly coloured, no vignette.
- A typographic cover needs no artwork: `POST /books/:id/cover/build` with `{ "typographic": true }` builds the eBook cover and the paperback wrap from the book's cover style alone (title, subtitle and author set in the style's fonts and colours). It uses no AI image and no OpenRouter credit, so it works when the image model cannot be paid for. It is recorded as `wrapSpec.typographic`; building from a concept later replaces it.
- In the studio each concept card comes with its own cover design and palette (different from the others), so the choices differ in type, colour and layout as well as art. Choosing a concept applies its look; the Design and Title font pickers and the colours change it.

## 4. Numbers that match

- Title size is a percentage of the design's own size (60 to 180). A larger title wraps onto more lines. The studio shows the percentage and the real size on the page (cover width is 100).
- Positions are in cover-width percent, measured from the page.

## Checks that guard this

- `packages/export/test/cover-typography.test.ts`: real Chromium; art untouched, ink chosen, subtitle cleared, preview page reports positions.
- `packages/core/test/cover-ink.test.ts`: ink rules.
- `apps/server/test/volume-export.test.ts`: the preview route returns the build's page.
- `packages/ai/test/cover-prompts.test.ts`: the brief and image prompt rules.

## Position and size rules the page enforces

- The title keeps the size the owner picked wherever it sits. The fit cap is half the cover height, not the room below the title, so a low title is lifted, never shrunk.
- A title or subtitle that would run into the author line, or off the bottom, is lifted clear of it (`data-lifted`), in every design. The tests render all 17 designs at Bottom and 26% title size and compare box positions.
- The studio sends the title's position with the other settings (`titleTopPct`), so Move up, Move down and dragging change the preview and the build alike.
- A built cover can always be built again (Build again beside the downloads), so a change to the cover engine reaches covers built earlier.

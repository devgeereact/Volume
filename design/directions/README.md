# Design directions

Original phase 0 direction boards. The owner requested a fused direction, now implemented in design/final/ and packages/ui and specified in docs/03-design/DESIGN-SYSTEM.md. D-014 was accepted on 7 October 2026. These boards are historical references, not the current build task.

Each board is one self-contained HTML file with two 1440 by 900 screens (Library and the Blueprint for The Calm Ward) and a token strip. Screenshots are in `screenshots/`. Fonts load from Google Fonts for these boards only; the real app will self-host OFL fonts. Book covers are drawn in HTML, CSS and SVG and are the same on every board, so only the interface changes.

## A. Bindery (`direction-a.html`)

- Feel: a well-made hardback. Navy cloth sidebar with a gilt edge, cream pages for the work, covers that sit on the page like objects.
- Palette: your own draft palette. Deep Navy #1A2238, Rich Gold #F4B942, Warm Cream #FFF8E7, Soft Sage #9FA8A3, Charcoal #2D3142, plus Antique Gold #8A6514 and Sage Ink #5B6660 as text-safe versions.
- Type: Newsreader for titles and book text, Hanken Grotesk for the interface.
- Contrast: body text 12.17:1, primary button (navy on gold) 8.92:1. Soft Sage is kept for borders only, because as text it reaches just 2.31:1.
- Shines: familiar and warm, closest to what you already pictured, with the full contents visible at a glance.
- Risks: cream with a serif is a common look for AI and writing tools, so it may feel less distinctive. Gold has to stay rare or it turns loud.

## B. Galley (`direction-b.html`)

- Feel: a quiet proof room. The book is a white sheet in the middle and every note sits in the margin.
- Palette: Galley Paper #F2F3EF, Sheet #FFFFFF, Ink #1C2426, Graphite #5A6468, Blue Pencil #2448B8 for actions and selection, Proof Red #B42318 only for claims to verify and errors.
- Type: Literata (also a print font the app ships, so the screen previews the page) with Schibsted Grotesk for the interface.
- Shines: dense libraries (the ledger scales to hundreds of books), editing and review, and anyone who thinks in pages.
- Risks: it is the most restrained of the three and can read as plain. Strong colour lives only on actions, so the layout has to carry the identity.

## C. Night Desk (`direction-c.html`)

- Feel: a dark, focused studio for long sessions, with one warm lamp on. The live writing job sits at the top of the library and books are arranged along the pipeline.
- Palette: Well #17151F, Night #1D1B26, Desk #272433, Moonlight #ECE8F2, Dusk #A8A3B6, and Ember #FF8A78 (taken from the coral in your older palette) as the only accent.
- Type: Bricolage Grotesque for titles and numbers, Atkinson Hyperlegible Next for the interface, Literata for book text.
- Shines: watching automatic writing happen, night work, and seeing every book's stage at once.
- Risks: dark interfaces are harder to print-check and some people find them tiring in daylight, so a light theme would be needed later. Atkinson draws a slashed zero, which looks unusual in prices.

Owner: pick A, B or C, or mix (e.g. A's colours with B's layout).

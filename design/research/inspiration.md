# Inspiration for the Volume direction

Research done on 4 October 2026 for the fused direction in `design/final/`. The rule throughout: take the technique, never copy a site, a component or a brand. Nothing below was pasted into Volume. Every pattern was rewritten in our own code and tokens.

## The owner's three boards (the main source)

| Board | Kept | Left behind |
|---|---|---|
| A. Bindery | Navy cloth spine with a gilt edge, gilt kept for the one action that matters, covers sitting on the page like objects | Cream on cream everywhere (it blurred the work and reads as a common AI-tool look), serif headings on every panel |
| B. Galley | The galley sheet with margin notes, blue pencil for selection and focus, proof red only for claims and errors, the ledger table, Literata as the book face | Its plainness: strong colour only on actions left the library with no identity |
| C. Night Desk | The live "Writing now" panel at the top of the library, books arranged along the pipeline, today's activity strip, the dark violet-grey studio | Ember as a second brand colour (gilt now does that job in both themes), Atkinson's slashed zero in prices, Bricolage as a third family |

The fusion: paper and cloth by day, the night desk after dark, one gilt accent across both.

## getdesign.md, Lovable entry (local copy in the design-md-library skill)

File read: `~/.claude/skills/design-md-library/references/lovable/DESIGN.md`. Taken as structure only. Its cream colour, charcoal palette, Camera Plain typeface and name are not used.

- **Borders before shadows.** Cards and panels are contained by a 1 px warm border, not floating shadows. Volume uses borders for cards and keeps real shadow for three things only: covers, the galley sheet and overlays.
- **Inset highlight on the primary button.** A top 1 px white inset plus a faint inner ring makes a button feel pressed into the surface. Volume's gilt button uses the same layering (`--vol-shadow-button`).
- **A narrow radius scale with clear roles.** Small for controls, larger for cards, larger again for containers, full pill only for toggles and chips. Volume: 4, 6, 10, 16, pill, plus 3 for covers.
- **Two weights do most of the work.** 400 and 600 for the interface, hierarchy from size and spacing. Volume adds 500 for the serif.
- **Opacity 0.8 on press** became a 1 px press-down instead (transform, so it stays within the motion rule).

## Awwwards, Sites of the Month

Fetched the listing (August 2026 back to February 2025) and the detail pages for The Renaissance Edition (Shopify Design, February 2026), Floema (Bürocratik, May 2026), Anime.js (Julian Garnier, May 2025) and Dropbox Brand (Daybreak Studio, February 2025). These are marketing sites built around big motion; Volume is a calm workspace, so only techniques that survive that change were taken.

1. **Two-colour discipline.** Each of the four detail pages lists a two-colour palette: a near-black and an off-white, or one bright colour and a dark (for example #F7F7EE with #292919 on The Renaissance Edition, #0061FE with #1A1918 on Dropbox Brand). Volume keeps the same discipline: one neutral pair per theme (paper and navy ink, night and moonlight) plus gilt. Blue pencil and proof red are working signals, not decoration.
2. **Easing as a named, documented system** (Dropbox Brand's easing demo and motion timeline). Volume names three curves (`out`, `in`, `page`) and three durations as tokens, so every animation in the app comes from the same short list.
3. **Motion driven by progress, not by the clock** (Anime.js's scroll scrubber). Volume's ink-fill bars and the gilt nib move only when the job reports progress. Nothing loops for its own sake.
4. **One orchestrated transition instead of many** (hero and section transitions on The Renaissance Edition). Volume spends its one "moment" on the stage page turn, when a book moves to its next stage. Everything else is quiet.
5. **Search and menu as a first-class interaction** (Floema's menu and search interaction). Volume treats the command menu (Cmd K) as a main way around the app, styled with care rather than as a utility popup.

## uiverse.io

`uiverse.io/design/` and the home page returned HTTP 403 to the fetch tool, so the pages could not be read directly. The licence was confirmed from Uiverse's own repository README (github.com/uiverse-io/galaxy): "All UI elements in this repository are available under the MIT License". Its categories are buttons, cards, checkboxes, forms, inputs, notifications, patterns, radio buttons, toggle switches, tooltips and loaders. Ideas taken from those categories, all re-created from scratch in our tokens:

- **Toggle switch with a sliding knob.** The knob moves with `translateX` and the track fill fades in with opacity, so it animates without repainting colour (`.switch` on the board).
- **Segmented control with a sliding thumb.** One thumb element slides between options with `transform` (the Covers and Ledger view toggle).
- **Pressed button.** A 1 px downward press on `:active` and the inset highlight from above.
- **Pen-stroke loader.** Three short strokes that draw in turn, used inside a button that keeps its width and its label ("Building"). It reads as writing, not spinning.
- **Arrowed tooltip** on the spine colour, with the reason a control is disabled.

## 21st.dev

Searched with the logged-in CLI (`21st search ... --type c`): command palette, stepper and timeline, animated progress, sidebar, segmented toggle, book cover. Two components retrieved with `21st get` (the free daily limit):

| ID | Component | Author | Licence | Pattern taken |
|---|---|---|---|---|
| 23522 | Command Palette | ddoemonn | Not stated in the registry record (unknown) | Combobox input with `aria-activedescendant` over a `listbox`; fuzzy ranking that rewards word starts; the active row highlight cross-fades instead of jumping; pointer movement (not hover) moves the highlight, so the list does not shift under a still mouse; a polite live region announces the match count after a short pause; reduced motion turns the springs off |
| 29815 | Vertical Titled Stepper (c-stepper-15) | sean0205 | Not stated in the registry record (unknown). It depends on lucide-react (ISC) | Each step has a state (`completed`, `active`, `inactive`, `loading`) exposed as `data-state`; the indicator swaps between check, number and a loading mark; steps work as a tablist with arrow-key movement |

Because both licences are unknown, no code was copied. The board's command menu and stage track are our own markup built on those patterns. When the real components are built in `packages/ui`, write them fresh.

## dafont

The home page lists script, handwritten, brush and serif faces, and states that the fonts are "either freeware, shareware, demo versions or public domain", with most marked "free for personal use". Volume may become a product, so no dafont font is used. What was taken is mood: the handwritten feel of a proofreader's margin. Volume gets that from Literata italic in the margin notes rather than from a script font.

## Fonts chosen (all SIL Open Font License 1.1, from Google Fonts or Fontsource)

| Font | Role | Licence | Why |
|---|---|---|---|
| Literata | Book text, titles, big figures, the live stream, margin notes (italic) | SIL OFL 1.1 | Made for long reading on screens, has optical sizes for display, and the app already ships it for print, so the screen previews the page |
| Schibsted Grotesk | Interface: nav, labels, buttons, tables | SIL OFL 1.1 | A news-house grotesk with more character than a neutral sans, crisp at 13 to 15 px, tabular figures |
| JetBrains Mono | Model IDs (for example `anthropic/claude-sonnet`) and keyboard keys only | SIL OFL 1.1 | Identifiers should look like identifiers. Never used for labels or numbers |

The cover faces on the board (DM Serif Display, Libre Franklin, Big Shoulders Display, Bodoni Moda, Young Serif) are also OFL. They belong to the sample covers, which are book content, not the app interface.

## Icons

Lucide (ISC licence), stroke 1.75 at 18 px. The board draws a handful of Lucide icons inline. The 21st stepper also uses Lucide, so the choice fits the patterns we studied.

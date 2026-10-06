# Fonts

All fonts here are under the SIL Open Font License 1.1 (licence files beside them). Copied from the AI Starter Library engine on 4 October 2026. Serif book fonts (Literata, EB Garamond, Source Serif 4) are added in phase 1 with their OFL files.

## Book-content fonts for covers and interior themes (4 October 2026, D-017)

Installed from Fontsource (npm, exact version 5.3.0) into the `prototype` workspace (now `apps/web`) at the owner's request, so every book can have its own interior theme and cover style. All are SIL Open Font License 1.1 (checked with `npm view <package> license`, which returns `OFL-1.1` for each). The licence text ships in each package as `node_modules/<package>/LICENSE`. Only the Latin subset is loaded (`prototype/src/styles/book-fonts.css`); Latin Extended files are not referenced. The interface never uses these fonts: they belong to the books. `config/interior-themes.json` and `config/cover-styles.json` name the same families.

| Family | Package | Files used (latin) | Weights and styles | Used for |
|---|---|---|---|---|
| DM Serif Display | `@fontsource/dm-serif-display` | 400 normal, 400 italic | 400, roman and italic | Covers: serene serif, quiet italic |
| Young Serif | `@fontsource/young-serif` | 400 normal | 400 | Covers: kitchen slab. Themes: cosy mystery, cookbook headings |
| Andika | `@fontsource/andika` | 400 normal, 400 italic, 700 normal | 400, 400 italic, 700 | Themes: children's large type, bedtime soft (body) |
| Big Shoulders Display | `@fontsource-variable/big-shoulders-display` | wght normal | 100 to 900 | Covers: bold condensed. Themes: thriller chapter numbers |
| Libre Franklin | `@fontsource-variable/libre-franklin` | wght normal, wght italic | 100 to 900 | Covers: modern grotesk, headline stack, noir spaced. Themes: non-fiction headings |
| Bodoni Moda | `@fontsource-variable/bodoni-moda` | opsz normal, opsz italic | 400 to 900, opsz 6 to 96 | Covers: botanical didone |
| Playfair Display | `@fontsource-variable/playfair-display` | wght normal, wght italic | 400 to 900 | Covers: romance seaside, cosy frame. Themes: romance headings |
| Cormorant Garamond | `@fontsource-variable/cormorant-garamond` | wght normal, wght italic | 300 to 700 | Covers: faith light, fantasy crest, journal minimal. Themes: display headings only |
| EB Garamond | `@fontsource-variable/eb-garamond` | wght normal, wght italic | 400 to 800 | Themes: classic novel, fantasy epic (body) |
| Lora | `@fontsource-variable/lora` | wght normal, wght italic | 400 to 700 | Themes: romance elegant, cosy mystery, wellbeing gentle, cookbook (body) |
| Merriweather | `@fontsource-variable/merriweather` | opsz normal, opsz italic | 300 to 900, opsz 18 to 144 | Themes: modern non-fiction (body) |
| Crimson Pro | `@fontsource-variable/crimson-pro` | wght normal, wght italic | 200 to 900 | Themes: thriller sharp, practical guide, business bold, memoir warm (body) |
| Fraunces | `@fontsource-variable/fraunces` | opsz normal, opsz italic | 100 to 900, opsz 9 to 144 | Covers: storybook night. Themes: calm reflective, bedtime soft headings |
| Nunito | `@fontsource-variable/nunito` | wght normal, wght italic | 200 to 1000 | Covers: picture bright. Themes: wellbeing and children's headings |
| Atkinson Hyperlegible Next | `@fontsource-variable/atkinson-hyperlegible-next` | wght normal, wght italic | 200 to 800 | Covers: workbook blocks. Themes: healthcare practical, workbook, journal minimal (body) |
| Space Grotesk | `@fontsource-variable/space-grotesk` | wght normal | 300 to 700 | Covers: tech grid. Themes: tech guide, workbook headings |

Phase 1 export (`packages/export`) embeds the same families in PDFs and EPUBs; copy each family's WOFF2 or TTF files and its `LICENSE` (OFL) here when the export pipeline needs local files.

## Static print fonts

Added on 5 October 2026 to `packages/export` (exact versions, D-017 approval). Chromium writes variable fonts into a PDF as Type 3 fonts, which preflight rejects, so the print PDF and paperback wrap use these static files instead; the variable packages above stay for the prototype and eBook covers. Each package is SIL Open Font License 1.1 (checked with `npm view <package> license`, which returns `OFL-1.1`); the licence text ships as `node_modules/<package>/LICENSE`. Only the Latin WOFF2 files are read (`packages/export/src/fonts.ts`), and only the weights nearest to those a theme or cover style asks for are embedded: body text 400, 600 and 700 (roman and italic), headings 600 and 800 (or the nearest), cover titles at their style's weight.

| Package | Version | Licence | Static weights in the package (latin) | Used for |
|---|---|---|---|---|
| `@fontsource/eb-garamond` | 5.3.0 | OFL-1.1 | 400 to 800, roman and italic | Body and headings: classic novel; body: fantasy epic |
| `@fontsource/lora` | 5.3.0 | OFL-1.1 | 400 to 700, roman and italic | Body: romance elegant, cosy mystery, wellbeing gentle, cookbook |
| `@fontsource/playfair-display` | 5.3.0 | OFL-1.1 | 400 to 900, roman and italic | Headings: romance elegant; covers |
| `@fontsource/crimson-pro` | 5.3.0 | OFL-1.1 | 200 to 900, roman and italic | Body: thriller sharp, practical guide, business bold, memoir warm |
| `@fontsource/literata` | 5.3.0 | OFL-1.1 | 200 to 900, roman and italic | Body: calm reflective, tech guide |
| `@fontsource/merriweather` | 5.3.0 | OFL-1.1 | 300 to 900, roman and italic | Body: modern non-fiction |
| `@fontsource/libre-franklin` | 5.3.0 | OFL-1.1 | 100 to 900, roman and italic | Headings: modern non-fiction, healthcare practical, practical guide, business bold; covers |
| `@fontsource/fraunces` | 5.3.0 | OFL-1.1 | 100 to 900, roman and italic | Headings: calm reflective, bedtime soft; covers |
| `@fontsource/cormorant-garamond` | 5.3.0 | OFL-1.1 | 300 to 700, roman and italic | Headings: fantasy epic, memoir warm, journal minimal; covers |
| `@fontsource/nunito` | 5.3.0 | OFL-1.1 | 200 to 900, roman and italic | Headings: wellbeing gentle, children's large type; covers |
| `@fontsource/space-grotesk` | 5.3.0 | OFL-1.1 | 300 to 700, roman | Headings: tech guide, workbook; covers |
| `@fontsource/atkinson-hyperlegible-next` | 5.3.0 | OFL-1.1 | 200 to 800, roman and italic | Body: healthcare practical, workbook, journal minimal; covers |
| `@fontsource/big-shoulders-display` | 5.3.0 | OFL-1.1 | 100 to 900, roman | Headings: thriller sharp; covers |
| `@fontsource/bodoni-moda` | 5.3.0 | OFL-1.1 | 400 to 900, roman and italic | Covers: botanical didone |

Andika, DM Serif Display and Young Serif were already static (`@fontsource`, see the table above). With these, all 18 interior themes print in their own fonts with every font embedded and no Type 3 (checked with pdfjs-dist by `packages/export/test/themes.test.ts` and `packages/export/scripts/theme-matrix.ts`).

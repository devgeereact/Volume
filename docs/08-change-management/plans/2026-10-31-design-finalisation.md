# Plan: design finalisation (31 October 2026)

Status: closed 1 November 2026. Gaps 1, 2 and 4 to 7 were fixed and deployed (PRs #87 and #88). Not done: gap 3 (public pages in the Studio look; the owner kept the landing hero as it is), gap 8 (uppercase small labels, owner question open) and gap 9 (the demo state strip, demo mode only). The questions below were not answered and are carried in `.agent/CURRENT-TASK.md`.

Reference artifact: "Volume Finalised" (claude.ai, private to the owner): the landing, sign-in and every studio screen, working on demo data. It keeps the approved Volume Studio look (D-066): frost scene, glass, navy for the one primary action, Manrope for the interface, Literata for book content.

## Gaps found (each checked in the running app on demo data, 31 October)

Evidence: screenshots at 1440 and 390 of 19 routes, and DOM measurements in a real browser (Vite on 127.0.0.1:5180, demo data).

| # | Where | Gap | Evidence |
|---|---|---|---|
| 1 | Landing, sign-in | The 3D book's cover text cannot be seen: it is drawn in `--vol-accent`, which D-066 changed from gilt to navy, on navy cloth | Cover text colour `rgb(31,45,74)` on a navy gradient |
| 2 | Sign-in | The word "studio." in "Welcome back to the studio." cannot be seen: `text-accent` (navy) on the navy panel | Span colour `rgb(31,45,74)` on panel `rgb(31,45,74)` |
| 3 | Landing, how it works, sign-in | Still the D-014 look (gilt names, spine navy panel, uppercase mono labels with middle dots), not the Studio look the app uses | `apps/web/src/site/*.tsx`, `site.css` |
| 4 | Library | Card titles of two lines push the rows below them down, so cards in one row do not line up | Title block 55 px against 38 px in the other cards |
| 5 | Book overview | "Up next" always says Research, even when Research is done | `UpNextResearch` hard-coded in `features/overview/BookOverview.tsx:356` |
| 6 | Book overview | The three columns end at different heights | Screenshot at 1440 |
| 7 | Blueprint | The outline card is 716 px tall, the inspector 1,957 px, leaving a large empty column | DOM measurement |
| 8 | Book pages | Small labels are uppercase ("FRONT MATTER", "UP NEXT, STEP 4 OF 8"), against the sentence-case rule in DESIGN-SYSTEM.md | `text-transform: uppercase` on 11 labels on Blueprint |
| 9 | Demo pages only | The "Prototype only. Preview this screen in each state" strip shows on Research, Titles, Blueprint and New book in demo mode. The live site uses the API pages, so the owner does not see it | `features/research/DemoStates.tsx` |

Checked and not a gap: the Library side column ending early is by design. It is sticky (`LibrarySide.tsx`), and its "Today" card has content.

## What the artifact settles

- Public pages in the Studio family: frost scene, glass navigation, a readable cloth-bound book, and one pinned GSAP section where scroll walks a sample book through the eight steps, each showing its real output. Lenis on the landing only. A pause control and reduced motion leave every panel visible as a card.
- Sign-in: two steps (email, then a six-digit code) plus Google, matching Clerk email-code sign-in. A deep link opens sign-in first, then the page it pointed at (D-054).
- Even rows: library cards with a fixed slot for every line (two-line title, profile, status, steps), overview columns that end on one line, a blueprint inspector with tabs (Chapter, Book, Claims, Versions) that stays as tall as the outline.
- Up next follows the book's state, on every page including Overview.
- KDP figures in the cover studio and print facts come from `config/kdp-rules/2026-10-29.json`: 0.002252 and 0.0025 in a page, spine text from 80 pages, 0.125 in bleed, 199 characters for title and subtitle.

## Stages (one PR each; screenshots at 1440 and 390, light and dark)

1. **Public pages** (frontend). Rebuild `site/LandingPage.tsx`, fold How it works into the landing (keep `/how-it-works` as a redirect or an anchor), restyle `SignInPage.tsx` around the Clerk component with the Studio tokens, fix gaps 1 to 3. Keep the SEO entries in `seo-pages.json` and the noindex decision (D-053).
2. **Library and overview** (frontend). Gaps 4 to 6: fixed meta slots in book cards, Up next from the book's state, balanced overview columns.
3. **Blueprint and step pages** (frontend). Gap 7: inspector tabs and height. Sentence-case labels (gap 8), once the owner confirms.
4. **Polish.** Gap 9: hide the demo state strip unless `?states=1`. Fill Volume mode with batches and the schedule side by side.
5. **Live** (owner approval). Full gate, `npm run deploy -- --dry-run`, then `npm run deploy`. No migrations are expected.

## Questions for the owner

1. Small labels: DESIGN-SYSTEM.md says sentence case and no all-caps. The approved Studio artifact used uppercase section labels, and the app follows it. Which should win? The new artifact uses sentence case.
2. How it works: fold it into the landing (one page, pinned eight-step section), or keep a separate page?
3. Sign-in: keep Clerk's own component styled with the tokens (simplest, recommended), or build the two-step form on Clerk's hooks as in the artifact?

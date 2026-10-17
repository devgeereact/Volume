# KDP rules

Every KDP number Volume uses (royalties, printing cost, spine width, bleed, cover sizes, listing limits, title limits, review rules) comes from a dated JSON file in this folder. Code and prompts never carry KDP numbers from memory.

Current file: `2026-10-17.json` (adds colour printing costs, colour page limits by trim, colour paper and colour spine width for picture books, read on 17 October 2026; see `docs/reference/reference-kdp-facts-2026-10-17.md`, entries 12.1 to 12.5). Earlier files: `2026-10-06.json` (updated trim, margin and cover facts; see `docs/reference/reference-kdp-facts-2026-10-06.md`) and `2026-10-03.json`, built from `docs/reference/reference-kdp-facts-2026-10-03.md` (official pages read on 3 October 2026). Human summary: `docs/book-production/KDP-RULES.md`.

## Rule fields

| Field | Meaning |
|---|---|
| `id` | Stable key used by code, prompts and templates, for example `paperback.spine.widthPerPage` |
| `value` or `values` | The number, band table, formula or definition |
| `unit` | What the number is measured in |
| `factId` | Entry in the facts file, for example `3.9`; `null` when the rule is not in it |
| `source` | Official page URL |
| `verifiedOn` | Date the page was read; `null` when unverified |
| `status` | `confirmed`, `partial` or `unverified` |
| `note` | Cautions, quotes and how Volume applies the rule |

Status meanings:

- `confirmed`: seen on the official page.
- `partial`: the page was found but a detail was missing or inconsistent. The app shows a "check before you rely on this" warning next to anything that uses it.
- `unverified`: not in the facts file. Preflight warns, and the value must not be printed as fact or used for a final calculation until checked.

## How to update

1. Never edit a released dated file. Copy the newest file to a new one named with the date you checked the pages, for example `2027-01-02.json`.
2. Re-read each official page in `source`. Change values, `verifiedOn` and `status`. Add new facts to a dated facts file in `docs/reference/` with numbered entries, and point `factId` at them.
3. To promote an `unverified` rule, read the official page, then set `value`, `factId`, `verifiedOn` and `status: "confirmed"`.
4. Set `version`, `verifiedOn` and `recheckDue` (90 days after `verifiedOn`) at the top of the file. The top-level `verifiedOn` is the oldest `verifiedOn` of any rule in the file, not the release date. A revision that re-reads only some pages therefore keeps the older date, because the other rules were not checked again. Preflight and the export pack count the rules' age from it. Only a full re-check of every `source` page moves it forward.
5. The app loads the newest file by name. Keep the old files: books exported earlier record which rules file they used.
6. Update `docs/book-production/KDP-RULES.md` and add a `CHANGELOG.md` line. Run the KDP maths tests (spine, wrap, royalty, printing cost worked examples).

## 90-day re-check rule

KDP changes prices and limits without notice (paperback royalties became tiered; the title limit went from 3 a day to 2 per format per week). So:

- Each file carries `recheckAfterDays: 90` and `recheckDue`.
- After `recheckDue`, the Export screen and preflight show "KDP rules are more than 90 days old: re-check before you upload". It is a warning, not a block.
- The re-check reads every `source` page again and produces a new dated file, even if nothing changed (then only the dates move).

## Rules still unverified in 2026-10-03.json

- `paperback.trimSizes.list`: trim size list.
- `paperback.interiorMargins`: inside margin by page count and outside margins.
- `paperback.cover.barcodeArea`: barcode keep-out box.
- `paperback.cover.safeZone`: cover text safe distances.

Check them against KDP's trim, margin and cover guides before phase 1 export and phase 4 covers ship.

## 6 October revision

Trim sizes, interior margins and cover safe distances are confirmed. Barcode dimensions are partially confirmed; verify automatic placement with the book-specific template. The original dated file is retained.

## 17 October revision

Colour rules for picture books (phase 7): `paperback.printingCost.uk.standardColour` (72 to 600 pages), `paperback.printingCost.uk.premiumColour` (24 to 828 pages), `paperback.trimAndPages.colour` (page limits by trim, white paper) and `paperback.spine.widthPerPage.colour` are confirmed from the official pages. `paperback.colour.paper` (white only) is partial: the trim table shows colour only with white paper but does not say so in prose. The facts are entries 12.1 to 12.5 in `docs/reference/reference-kdp-facts-2026-10-17.md`, and `factsFile` points at it. Top-level `verifiedOn` stays at 2026-10-03 (step 4), so `recheckDue` stays 2027-01-01. The 6 October file is retained.

# KDP rules

Every KDP number Volume uses (royalties, printing cost, spine width, bleed, cover sizes, listing limits, title limits, review rules) comes from a dated JSON file in this folder. Code and prompts never carry KDP numbers from memory.

Current file: `2026-10-03.json`, built from `docs/reference-kdp-facts-2026-10-03.md` (official pages read on 3 October 2026). Human summary: `docs/07-KDP-RULES.md`.

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
2. Re-read each official page in `source`. Change values, `verifiedOn` and `status`. Add new facts to a dated facts file in `docs/` with numbered entries, and point `factId` at them.
3. To promote an `unverified` rule, read the official page, then set `value`, `factId`, `verifiedOn` and `status: "confirmed"`.
4. Set `version`, `verifiedOn` and `recheckDue` (90 days after `verifiedOn`) at the top of the file.
5. The app loads the newest file by name. Keep the old files: books exported earlier record which rules file they used.
6. Update `docs/07-KDP-RULES.md` and add a `CHANGELOG.md` line. Run the KDP maths tests (spine, wrap, royalty, printing cost worked examples).

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

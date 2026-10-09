# KDP rules

Volume takes every KDP number from `config/kdp-rules/`, never from memory. This page summarises the current file, `config/kdp-rules/2026-10-06.json`. The original facts are in `docs/reference/reference-kdp-facts-2026-10-03.md`; the targeted trim, margin and cover rechecks are in `docs/reference/reference-kdp-facts-2026-10-06.md`. Rules not rechecked retain their 3 October verification date. Fact ids (for example 3.9) point to numbered entries in that facts file. If this page and the JSON disagree, the JSON wins and this page is fixed.

Status: **confirmed** (seen on the official page), **partial** (page found, a detail missing or inconsistent: the app shows a "check before you rely on this" note), **unverified** (not in the facts file: preflight warns and the value is not printed as fact).

## Re-check rule

- Rules are re-checked every 90 days. The revision retains 3 October 2026 as the oldest verification date, so the re-check is due on **1 January 2027**.
- After that date the Export screen and preflight warn: "KDP rules are more than 90 days old: re-check before you upload". It warns; it does not block.
- A re-check never edits the old file. It reads every source page again and writes a new dated file (for example `2027-01-02.json`), even if nothing changed. Steps are in `config/kdp-rules/README.md`.

## eBook royalties (amazon.co.uk)

| Rule id | What | Fact | Status |
|---|---|---|---|
| `ebook.royalty.options` | 35% or 70% of list price without VAT; 70% only in eligible territories; public domain works 35% only | 2.1 | confirmed |
| `ebook.royalty.formula` | Royalty = rate x (list price - VAT - delivery cost). Delivery is taken off before the rate is applied. KDP example: 0.70 x (EUR 1.99 - 0.08 - 0.10) = EUR 1.27 | 10.1 | confirmed |
| `ebook.royalty70.priceBand.uk` | 70% needs a list price from GBP 1.77 to GBP 12.99 (with VAT), as of 7 July 2026 | 2.2 | confirmed |
| `ebook.royalty35.priceBands.uk` | 35% price range by file size: under 3 MB GBP 0.77 to 150; 3 to under 10 MB GBP 1.25 to 150; 10 MB or more GBP 1.49 to 150 | 2.3 | confirmed |
| `ebook.deliveryCost.uk` | GBP 0.10 per MB on 70% sales | 2.4 | confirmed |
| `ebook.vat.uk` | UK eBook VAT is 0% (since 1 May 2020) | 2.5 | confirmed |
| `ebook.kdpSelect` | 90-day exclusive term, renews automatically; KU capped at 3,000 KENP per title per customer | 2.6, 2.7, 2.8 | confirmed |
| `promo.countdownDeal` | In Select for 30 days first; price unchanged 30 days before and 14 days after; UK price GBP 1.99 to 15.99 incl. VAT; cut of at least GBP 1.00; up to 7 days; must end 14 days before the term ends; amazon.com and amazon.co.uk only. One promotion type per term is partial | 10.2 | confirmed (one sub-detail partial) |

Worked example (ours, not KDP's): a 2 MB eBook at GBP 2.99 on 70% earns 0.70 x (2.99 - 0 - 0.20) = GBP 1.953.

## Paperback royalties and printing (amazon.co.uk)

| Rule id | What | Fact | Status |
|---|---|---|---|
| `paperback.royalty.tiers.uk` | 50% at list prices up to GBP 7.98; 60% from GBP 7.99. Royalty = (rate x list price) - printing cost | 3.1 | confirmed |
| `paperback.royalty.expandedDistribution` | 40% of list price minus printing cost | 3.2 | confirmed |
| `paperback.printingCost.uk.blackInk` | Regular trim: 24 to 110 pages GBP 1.93 flat; 110 to 828 pages GBP 0.85 + GBP 0.010 per page. Large trim: GBP 2.15 flat at the low end, then GBP 0.85 + GBP 0.012 per page. The bands overlap at 110 pages and the large-trim bands were not stated: check the live table | 3.3 | confirmed, with cautions |
| `paperback.minimumListPrice` | Minimum list price = printing cost / rate (use the tier the price falls in) | 3.4 | confirmed |
| `print.vat.uk` | You set a VAT-exclusive print price; Amazon adds VAT. Most books 0%, some (notebooks, planners, bonus content) 20%; royalties are not affected | 3.5 | confirmed |
| `hardcover.basics` | 75 to 550 pages, five trims, 50% and 60% rates (not a v1 export) | 3.11 | confirmed |

Worked examples: KDP's own 55-page black-ink book costs GBP 1.93. Ours: a 200-page 6 x 9 in book costs 0.85 + 200 x 0.010 = GBP 2.85.

## Print interior and cover

| Rule id | What | Fact | Status |
|---|---|---|---|
| `paperback.trimAndPages` | 6 x 9 in is the most common US trim; 6 x 9 black ink on white: 24 to 828 pages; minimum 24 pages; maximums 590 to 828 by option | 3.6 | confirmed |
| `paperback.trimSizes.list` | Trim size picker list (5 x 8 to 8.5 x 11 in, including 5.5 x 8.5 in from the owner's drafts) | 11.1 | confirmed |
| `print.bleed` | Interior bleed adds 0.125 in to the width and 0.25 in to the height (6 x 9 becomes 6.125 x 9.25 in) | 3.7 | confirmed |
| `paperback.interiorMargins` | Inside margin by page count and outside minimums | 11.2 | confirmed |
| `paperback.cover` | One PDF with back, spine and front; 0.125 in (3.2 mm) bleed on all outer edges; images at least 300 DPI; KDP cover calculator gives exact sizes | 3.8 | confirmed |
| `paperback.spine.widthPerPage` | Spine width = pages x 0.002252 in (white) or x 0.0025 in (cream) | 3.9 | confirmed |
| `paperback.spine.textMinPages` | Spine text only at 80 pages or more (the page says both "at least 79" and "more than 79"; 80 is safe) | 3.10 | confirmed |
| `paperback.cover.barcodeArea` | Barcode size and clearance; automatic placement still requires the generated template | 11.4 | partial |
| `paperback.cover.safeZone` | Cover text distances from trim and spine edges | 11.3 | confirmed |
| `ebook.cover` | Ideal 1,600 x 2,560 px; ratio at least 1.6:1; minimum 625 x 1,000; maximum 10,000 px a side; JPEG or TIFF (not PNG); under 50 MB; RGB | 10.5 | confirmed |
| `manuscript.formats` | eBook: DOCX, KPF, EPUB recommended; paperback: PDF needed for bleed; MOBI not accepted for fixed layout | 6.1, 6.2 | confirmed |
| `isbn` | Free KDP ISBN for print only and usable only on KDP; optional for eBooks. Volume never generates an ISBN | 4.1, 4.2 | confirmed |

Phase 4 acceptance compares Volume's wrap sizes with KDP's cover calculator for three page counts on white and cream.

## Listing limits

| Rule id | What | Fact | Status |
|---|---|---|---|
| `listing.keywords` | Up to 7 keywords or short phrases; avoid quality claims, time-sensitive words, unauthorised brands, programme names such as Kindle Unlimited | 5.1 | confirmed |
| `listing.categories` | 3 categories | 5.2 | confirmed |
| `listing.description.maxChars` | 4,000 characters including HTML tags | 5.3 | confirmed |
| `listing.description.allowedFormatting` | Bold, italics, underline, line breaks, paragraphs, headings h4 to h6, numbered and bulleted lists. Exact tag spellings are assumed | 10.14 | partial |
| `listing.titleSubtitle.maxChars` | Title and subtitle together fewer than 200 characters (so 199 at most) | 5.4 | confirmed |

## AI, content, timing and reviews

| Rule id | What | Fact | Status |
|---|---|---|---|
| `ai.disclosure` | AI-generated = the AI made the content, even after heavy edits, and must be disclosed; AI-assisted = you made it and AI helped edit, no need to disclose. Volume sets AI-generated whenever its AI wrote text or made images | 5.5 | confirmed |
| `content.prohibited` | No disappointing or misleading content; no undifferentiated public domain copies | 5.6 | confirmed |
| `titles.creationLimit` | 2 new titles per book format per week (not 3 a day). Reset time and start date partial | 5.7 | confirmed (sub-details partial) |
| `publish.goLiveTiming` | About 3 business days to go live (low-content up to 10); eBook detail page up to 72 hours; paperback up to 72 hours on amazon.com and up to 5 days on other marketplaces | 10.15 | confirmed |
| `reviews.amazonCommunityRules` | No reviews of your own book or from friends, relatives, employers, business associates or competitors; nothing in exchange for a review; free advance copies allowed if no review is required | 10.6 | confirmed |
| `reviews.kdpRules` | Free or discounted copies allowed if you do not require or influence a review; anything else (gift cards) invalidates it | 10.7 | confirmed |
| `legalDeposit.uk` | One copy to the British Library within a month of publication; five other libraries may ask within 12 months. Whether KDP print-on-demand triggers the duty was not found | 4.5, 4.6, 4.7, 4.9 | partial |

## Where the rules are used

- KDP maths in `packages/core`: royalties, printing cost, minimum price, spine and wrap sizes.
- Export and preflight in `packages/export`: bleed, cover sizes and formats, spine text, eBook cover JPEG.
- Prompts receive limits only through `{{kdp.*}}` variables (see `prompts/README.md`).
- Book templates point to rule ids instead of copying numbers.
- Volume mode's scheduler (phase 8) refuses a third new title per format per week.

## Still to verify

Four rules are unverified because the facts file does not cover them: the trim size list, interior margins, the barcode area and the cover safe zone. Check them on KDP's trim and margin guide (`GVBQ3CMEQW3W2VL6`) and paperback cover guide (`G201953020`) before phase 1 export and phase 4 covers ship, then release a new dated rules file.

## 6 October 2026 supplement

The current dated configuration is `2026-10-06.json`. Trim options, margin minimums and cover text-safe distances were checked against the official pages and are confirmed. Barcode size is partially confirmed; automatic placement still requires the book-specific template. See [dated facts](../reference/reference-kdp-facts-2026-10-06.md). Older tables above describe the original 3 October review.

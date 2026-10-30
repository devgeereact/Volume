# KDP rules

Volume takes every KDP number from `config/kdp-rules/`, never from memory. This page summarises the current file, `config/kdp-rules/2026-10-29.json`. The original facts are in `docs/reference/reference-kdp-facts-2026-10-03.md`; the trim, margin and cover rechecks are in `docs/reference/reference-kdp-facts-2026-10-06.md`; the colour facts are in `docs/reference/reference-kdp-facts-2026-10-17.md`; the trim facts read on 29 October 2026 are entries 13.1 to 13.6 at the end of this page. Each rule keeps its own verification date. Fact ids (for example 3.9) point to numbered entries in those facts files. If this page and the JSON disagree, the JSON wins and this page is fixed.

Status: **confirmed** (seen on the official page), **partial** (page found, a detail missing or inconsistent: the app shows a "check before you rely on this" note), **unverified** (not in the facts file: preflight warns and the value is not printed as fact).

## Re-check rule

- Rules are re-checked every 90 days. A file's top-level `verifiedOn` is the date of its oldest rule check, not the release date, so a partial revision cannot hide an old fact. The 2026-10-29 file still holds rules checked on 3 October 2026, so the re-check is due on **1 January 2027**. Preflight counts the age from that date.
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
| `hardcover.basics` | 75 to 550 pages, five trims, 50% and 60% rates (not a v1 export). Re-read 29 October 2026, unchanged | 3.11 | confirmed |
| `hardcover.trimAndPages` | Five hardcover trims (5.5 x 8.5, 6 x 9, 6.14 x 9.21, 7 x 10, 8.25 x 11 in), each 75 to 550 pages on black ink with white or cream paper and on premium colour; no groundwood, no standard colour (not a v1 export) | 13.5 | confirmed |

Worked examples: KDP's own 55-page black-ink book costs GBP 1.93. Ours: a 200-page 6 x 9 in book costs 0.85 + 200 x 0.010 = GBP 2.85.

## Print interior and cover

| Rule id | What | Fact | Status |
|---|---|---|---|
| `paperback.trimAndPages` | Black-ink page range for each of the 16 trims, on white, cream and groundwood paper (minimum 24 pages; maximum 828, 800, 780 or 590 on white by trim). 6 x 9 in is the most common US trim. Large trim: wider than 6.12 in or taller than 9 in | 13.2 | confirmed |
| `paperback.trimSizes.list` | All 16 kdp.amazon.com paperback trims: 5 x 8, 5.06 x 7.81, 5.25 x 8, 5.5 x 8.5, 6 x 9, 6.14 x 9.21, 6.69 x 9.61, 7 x 10, 7.44 x 9.69, 7.5 x 9.25, 8 x 10, 8.25 x 6, 8.25 x 8.25, 8.5 x 8.5, 8.5 x 11 and 8.27 x 11.69 in | 13.1 | confirmed |
| `paperback.trimSizes.custom` | Custom paperback trim: width 4 to 8.5 in, height 6 to 11.69 in. No page counts given. Volume does not offer custom trims | 13.4 | confirmed |
| `print.bleed` | Interior bleed adds 0.125 in to the width and 0.25 in to the height (6 x 9 becomes 6.125 x 9.25 in). Re-read 29 October 2026, unchanged | 3.7 | confirmed |
| `paperback.interiorMargins` | Inside margin by page count and outside minimums, the same for every trim. Re-read 29 October 2026, unchanged | 11.2 | confirmed |
| `paperback.cover` | One PDF with back, spine and front; 0.125 in (3.2 mm) bleed on all outer edges; images at least 300 DPI; KDP cover calculator gives exact sizes | 3.8 | confirmed |
| `paperback.spine.widthPerPage` | Spine width = pages x 0.002252 in (white) or x 0.0025 in (cream) | 3.9 | confirmed |
| `paperback.spine.textMinPages` | Spine text only at 80 pages or more (the page says both "at least 79" and "more than 79"; 80 is safe) | 3.10 | confirmed |
| `paperback.cover.barcodeArea` | Barcode size and clearance; automatic placement still requires the generated template | 11.4 | partial |
| `paperback.cover.safeZone` | Cover text distances from trim and spine edges | 11.3 | confirmed |
| `ebook.cover` | Ideal 1,600 x 2,560 px; ratio at least 1.6:1; minimum 625 x 1,000; maximum 10,000 px a side; JPEG or TIFF (not PNG); under 50 MB; RGB | 10.5 | confirmed |
| `manuscript.formats` | eBook: DOCX, KPF, EPUB recommended; paperback: PDF needed for bleed; MOBI not accepted for fixed layout | 6.1, 6.2 | confirmed |
| `isbn` | Free KDP ISBN for print only and usable only on KDP; optional for eBooks. Volume never generates an ISBN | 4.1, 4.2 | confirmed |

Phase 4 acceptance compares Volume's wrap sizes with KDP's cover calculator for three page counts on white and cream.

## Colour printing (amazon.co.uk, picture books)

| Rule id | What | Fact | Status |
|---|---|---|---|
| `paperback.printingCost.uk.standardColour` | 72 to 600 pages: GBP 0.85 + GBP 0.020 per page (regular trim) or GBP 0.027 per page (large trim) | 12.1 | confirmed |
| `paperback.printingCost.uk.premiumColour` | 24 to 40 pages: GBP 2.59 flat (regular) or GBP 3.24 (large); 42 to 828 pages: GBP 0.85 + GBP 0.0435 per page (regular) or GBP 0.0598 (large) | 12.2 | confirmed |
| `paperback.trimAndPages.colour` | White paper, all 16 trims. Standard colour 72 to 600 pages, except 8.27 x 11.69 in, where it is not available. Premium colour 24 to 828, 800 or 590 pages by trim (590 on 8.5 x 8.5, 8.5 x 11 and 8.27 x 11.69 in). Standard colour is not offered on Amazon.co.jp | 13.3 | confirmed |
| `paperback.colour.paper` | Colour prints on white paper only, now stated in prose on the Print Options page | 13.6 | confirmed |

Large trim means wider than 6.12 in or taller than 9 in. Standard colour cannot print under 72 pages, so a 24-page picture book uses premium colour (D-044). Worked example (ours): a 32-page 8.5 x 8.5 in premium colour book is large trim, so it costs the flat GBP 3.24.

## Colour spine, bleed and safe area

| Rule id | What | Fact | Status |
|---|---|---|---|
| `paperback.spine.widthPerPage.colour` | Spine width = pages x 0.002252 in (standard colour) or x 0.002347 in (premium colour). Spine text still needs 80 pages (`paperback.spine.textMinPages`) | 12.5 | confirmed |
| `print.bleed` | A full-bleed picture-book page is the trim plus 0.125 in on the outside edge and 0.125 in top and bottom (the inside edge has no bleed) | 3.7 | confirmed |
| `paperback.interiorMargins` | Safe area for picture-book text: the inside minimum for the page count, and the with-bleed outside minimum (0.375 in) on top, bottom and outside, measured from the trim edge | 11.2 | confirmed |

`pictureBookGeometry` in `packages/core/src/spread.ts` builds each page from these rules, and preflight check `picture.safe-area` warns when a text box leaves the safe area. The cover wrap for a colour book uses the colour spine width instead of the paper one.

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
- Volume mode's scheduler (phase 8, D-046): `titleCreationLimit` in `packages/core/src/kdp.ts` reads `titles.creationLimit` (`maxNewTitlesPerFormat` 2, `period` week, FACTS 5.7) and `packages/core/src/schedule.ts` refuses a slot that would put a third new title of the same format inside any rolling 7-day window. The window is rolling, so it is never looser than KDP's weekly reset (whose time is partial). All pen names in one workspace share the count, because they share one KDP account.

## Still to verify

No rule is unverified. Partial rules: `paperback.cover.barcodeArea` (automatic placement), `listing.description.allowedFormatting`, `legalDeposit.uk`, and the sub-details noted on `paperback.printingCost.uk.blackInk`, `promo.countdownDeal` and `titles.creationLimit`.

## 6 October 2026 supplement

The 6 October file was `2026-10-06.json`. Trim options, margin minimums and cover text-safe distances were checked against the official pages and are confirmed. Barcode size is partially confirmed; automatic placement still requires the book-specific template. See [dated facts](../reference/reference-kdp-facts-2026-10-06.md). Older tables above describe the original 3 October review.

## 17 October 2026 supplement

The 17 October file was `2026-10-17.json`. It added the colour rules above, read on the official printing cost, trim and cover pages on 17 October 2026. Four are confirmed and white-only colour paper is partial. See [dated facts](../reference/reference-kdp-facts-2026-10-17.md). Every other rule is unchanged from the 6 October file.

## 29 October 2026 supplement

The current dated configuration is `2026-10-29.json` (`factsFile` points at this page). On 29 October 2026 these official pages were read with a plain GET and checked line by line against the page text: [Set Trim Size, Bleed, and Margins](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6), [Print Options](https://kdp.amazon.com/en_US/help/topic/G201834180) and [Hardcover](https://kdp.amazon.com/en_US/help/topic/GAVW3FZZAKA2KY3B). The trim list grows from 7 to 16 sizes. Every earlier trim keeps its page ranges. `paperback.colour.paper` moves from partial to confirmed. Bleed, margins and hardcover basics were re-read and are unchanged. Every other rule keeps its own date, so the top-level `verifiedOn` stays 2026-10-03 and the re-check is still due on 1 January 2027.

- **13.1, confirmed:** the table "Trim size specifications (width x height) with minimum and maximum page counts(kdp.amazon.com)" lists 16 paperback trims, width first ("All specifications below are shown width by height"): 5 x 8, 5.06 x 7.81, 5.25 x 8, 5.5 x 8.5, 6 x 9, then under "Large Trim Sizes" 6.14 x 9.21, 6.69 x 9.61, 7 x 10, 7.44 x 9.69, 7.5 x 9.25, 8 x 10, 8.25 x 6, 8.25 x 8.25, 8.5 x 8.5, 8.5 x 11 and 8.27 x 11.69 in. The nine new ones in Volume are 5.06 x 7.81, 6.14 x 9.21, 6.69 x 9.61, 7.44 x 9.69, 7.5 x 9.25, 8 x 10, 8.25 x 6 (landscape), 8.25 x 8.25 and 8.27 x 11.69 in. The kdp.amazon.co.jp table is not used. 8.25 x 11 in appears only in the hardcover table and the bleed examples, so it is not a paperback trim. [Trim page](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6).
- **13.2, confirmed:** black-ink columns of that table ("Black ink and white paper", "Black ink and cream paper", "Black ink and groundwood paper"). 24 - 828 / 24 - 776 / 24 - 812 for 5 x 8 to 8 x 10 in (11 trims); 24 - 800 / 24 - 750 / 24 - 784 for 8.25 x 6 and 8.25 x 8.25 in; 24 - 590 / 24 - 550 / 24 - 578 for 8.5 x 8.5 and 8.5 x 11 in; 24 - 780 / 24 - 730 / 24 - 764 for 8.27 x 11.69 in. Large trim: "Books with a measurement more than 6.12 inches (155.5 mm) in width or more than 9 inches (228.6 mm) in height are considered large trim sizes". Volume does not offer groundwood paper yet; the groundwood maximum is stored for reference. [Trim page](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6).
- **13.3, confirmed:** colour columns of the same table ("Standard color ink and white paper", "Premium color ink and white paper"). Standard colour is "72 - 600" on 15 trims and "Not available" on 8.27 x 11.69 in. Premium colour is "24 - 828" on the 11 trims from 5 x 8 to 8 x 10 in, "24 - 800" on 8.25 x 6 and 8.25 x 8.25 in, and "24 - 590" on 8.5 x 8.5, 8.5 x 11 and 8.27 x 11.69 in. For 8.27 x 11.69 in premium colour is "24 - 590" (black ink on white is "24 - 780"). The en_GB help page, read 29 October 2026, shows the same kdp.amazon.com table with 590; only the separate kdp.amazon.co.jp table gives "24 - 780", and it applies to Japan only. So 590 is the limit for Volume's marketplaces, including Amazon.co.uk ([en_GB page](https://kdp.amazon.com/en_GB/help/topic/GVBQ3CMEQW3W2VL6)). [Trim page](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6).
- **13.4, confirmed:** "For paperbacks, you can also enter your own custom trim size. Width must be within 4"-8.5" (10.16-21.59 cm). Height must be within 6"-11.69" (15.24-29.69 cm)." No page counts are given for custom sizes. [Print Options](https://kdp.amazon.com/en_US/help/topic/G201834180).
- **13.5, confirmed:** the hardcover table lists 5.5 x 8.5, 6 x 9, 6.14 x 9.21, 7 x 10 and 8.25 x 11 in, each "75 - 550" for black ink on white, black ink on cream and premium colour on white, and "Not available" for groundwood and standard colour. The Hardcover page says "There are five available trim sizes" and "The minimum and maximum page count is 75 - 550 pages", and that hardcover "isn’t available for Amazon.co.jp, or Expanded Distribution". [Trim page](https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6), [Hardcover](https://kdp.amazon.com/en_US/help/topic/GAVW3FZZAKA2KY3B).
- **13.6, confirmed:** "Books with color ink are printed on white paper, which shows a higher contrast for images and graphics." This promotes `paperback.colour.paper` (fact 12.4, partial) to confirmed. [Print Options](https://kdp.amazon.com/en_US/help/topic/G201834180).

Re-read and unchanged: bleed, "(Trim height) + (0.125" x 2 (bleed)) = Page height with bleed" and "(Trim width) +(0.125" (bleed)) = Page width with bleed" (`print.bleed`, 3.7); margins, "The top, bottom, and outside margins must be a minimum of 0.25 inches for books without bleed and 0.375 inches (9.6mm) for books with bleed", with the same inside margin table from "24 to 150 pages" (0.375 in) to "701 to 828 pages" (0.875 in) (`paperback.interiorMargins`, 11.2). The page's bleed example table rounds a few sizes differently from the formula (for example 5.5 x 8.5 in is shown as 5.626 x 8.75 in); Volume uses the formula. The Print Options page's own US paperback table showed only the 5 x 8 in row on 29 October 2026, so the full list comes from the trim page.

Where the new trims appear: the New book wizard, the profile and settings trim defaults and the cover studio read the list from the newest rules file (`apps/web/src/lib/kdpRulesFile.ts`, `apps/web/src/lib/kdpTrims.ts`), and the API accepts every listed size (`TRIMS` in `apps/server/src/repos/books.ts`, tested against the rules file).

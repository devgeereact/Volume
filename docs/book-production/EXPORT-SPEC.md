# 06 Export specification

How a book is structured, how it is written down as Markdown, and exactly what each export must produce. All KDP numbers cite fact IDs from `docs/reference/reference-kdp-facts-2026-10-03.md` (FACTS) and are read at run time from the latest dated file in `config/kdp-rules/` (currently `2026-10-17.json`), never typed into code. Section defaults per template are in `config/book-templates/`.

## Canonical book structure

A book is an ordered list of sections (`docs/02-architecture/DATA-MODEL.md`, `sections`). Every export walks the same list, skipping sections with `enabled = 0`.

| Area | Sections in order | Notes |
|---|---|---|
| Front | half title (opt), title page, copyright, dedication, epigraph (opt), contents, foreword (opt, real named person only), preface (opt), acknowledgements, introduction | Copyright text from profile templates; ISBN line only if entered |
| Body | part (opt) then chapters | Chapter: number, title in title case, hook, 3 or more `##` subheadings, prose, takeaways (opt), bridge |
| Back | conclusion or epilogue, appendix (opt), resources (opt), glossary (opt), references (opt, ticked sources only), about the author, also by, review request, newsletter or links | About the author is the profile bio verbatim; also by lists only published books |
| Publishing package | back cover blurb, short bio, Amazon description, 3 categories, 7 keywords, title check, AI disclosure note, claims report | Not part of the interior; goes in the pack |
| Marketing package | TikTok scripts, Instagram captions, launch email | Pack only |

## Manuscript Markdown dialect

`packages/core` parses and writes this dialect; it is a strict superset of the P02 demo-book format (`PROOF/p02-book/tools/book.py`), so the Windowsill Herbs manuscript imports unchanged.

**Top-level fenced blocks** (open with `::: name`, close with `:::` on its own line). They may appear anywhere between sections, including after the first `#` heading, because the template puts Dedication before Contents (for example `# Dedication` then `::: contents`). A block always closes the section before it and starts its own:

| Block | Content | Origin |
|---|---|---|
| `::: titlepage` | Lines: title, subtitle, author, then optional edition and notes | P02 |
| `::: copyright` | Paragraphs separated by blank lines | P02 |
| `::: contents` | Empty; the app builds the list | P02 |
| `::: halftitle` | One line: title | New |
| `::: part` | Two lines: label (`Part I`), title | New; may appear between chapters, starts a new page, chapters after it belong to it |

**Sections:** `# Heading` starts a section on a new page. `# Chapter N: Title` is a chapter (kicker "Chapter N", display title "Title"). Other headings map to a kind by name, case-insensitive, text before any colon: Dedication, Epigraph, Foreword, Preface, Acknowledgements, Introduction, Conclusion, Epilogue, Appendix, Resources, Glossary, References, About the Author, Also By, A Small Request (review request), Stay in Touch (newsletter). An explicit kind can be added at the end: `# A Note to You {kind=review_request}`; the marker is removed on output.

**Blocks inside a section:**

| Syntax | Meaning | Origin |
|---|---|---|
| `## Heading` | Subheading | P02 |
| `### Heading` and `#### Heading` | Sub-subheadings (for example Key Takeaways): DOCX Heading 3 and 4, EPUB and print `<h3>` and `<h4>`, TXT on their own line | Added 5 October 2026 (live book) |
| Plain line | Paragraph (one line per paragraph) | P02 |
| `- item` | Bulleted list | P02 |
| `\| a \| b \|` | Table (separator rows of dashes ignored) | P02 |
| `***` (or `* * *`) | Scene break; the writer always writes `***` | P02; `* * *` accepted from phase 6 (D-042) |
| `**bold**` | Bold inline | P02 |
| `*italic*` | Italic inline | New |
| `::: takeaways` with `- ` items | Key Takeaways box (3 to 5 items) | New |
| `::: epigraph` with quote lines, last line `- Name` | Owner-supplied quote only | New |
| `::: demo` | Demo note (P02 compatibility) | P02 |
| `::: exercise <kind> [title]` ... `:::` | Workbook exercise. `<kind>`: reflection, checklist, fill-in, tracker or scenario. Holds paragraphs, lists, tables and the blocks below. Printed label "Exercise: Title" | Phase 6 (D-042) |
| `::: lines N` then `:::` | N ruled writing lines, 1 to 30 (exports clamp, preflight warns) | Phase 6 |
| `- [ ] item` | Tick-box checklist (every item in the list has the box) | Phase 6 |
| `::: fill-in` (or `::: fill-in page`) | One prompt per line, each followed by a blank; `page` starts a new page | Phase 6 |

An `::: exercise` without a known kind stays a callout, so older manuscripts still parse.

Round-trip rule: parse then write returns byte-identical Markdown for any file the writer produced (golden test).

## Print PDF (interior)

- **Engine:** HTML and CSS from the book model, paginated by Paged.js inside Playwright Chromium, printed with `preferCSSPageSize`; pdf-lib sets title, author, subject, creator and producer. No separate fallback engine is implemented. The observed long-book benchmark is recorded in `../reports/volume/qa/reports/LOCAL-VALIDATION-2026-10-06.md`.
- **Trims:** 5 x 8, 5.5 x 8.5, 6 x 9 (default; FACTS 3.6), 8.5 x 11 in. Page count limits per trim come from the rules file (FACTS 3.6: minimum 24, maximums 590 to 828).
- **Margins:** mirrored (`@page :left` and `:right`), inside margin larger. House defaults below; preflight raises the inside margin to the KDP minimum for the page count from the rules file.

| Trim (in) | Top | Bottom | Inside | Outside |
|---|---|---|---|---|
| 5 x 8 | 0.70 | 0.75 | 0.75 | 0.50 |
| 5.5 x 8.5 | 0.72 | 0.78 | 0.78 | 0.52 |
| 6 x 9 | 0.75 | 0.80 | 0.80 | 0.55 |
| 8.5 x 11 | 0.90 | 0.95 | 0.90 | 0.70 |

- **Bleed:** none for text books. Picture books (phase 7) use page size plus 0.125 in width and 0.25 in height (FACTS 3.7).
- **Running heads:** book title on left (even) pages, chapter title on right (odd) pages, small caps, none on section opening pages or blank pages.
- **Page numbers:** footer, outside corner. Arabic numbering starts at 1 on the introduction; pages before it carry no visible number.
- **Openings:** each `#` section starts on a new page; chapters and parts start on a right-hand page by default (a blank left page is added), with an option to allow any page.
- **Type:** body in a serif book font (Literata, EB Garamond or Source Serif 4, added in phase 1), 10.5 to 11.5 pt, leading 1.45; headings in the profile's heading font (Plus Jakarta Sans by default). First paragraph after a heading not indented; others indented 1.3 em; no blank lines between paragraphs. Widows and orphans 2.
- **Fonts:** every font embedded and subset; preflight reads the PDF and fails on any unembedded or Type 3 font.
- **Symbols the fonts lack** (`packages/export/src/print-glyphs.ts`): the print fonts are Latin subsets, so a character outside them would print in a system font, as Type 3. Before rendering the print PDF, the wrap, the eBook cover and the picture book, arrows become words ("A → B" prints "A to B"; an arrow that opens a line is dropped), ticks print as "√", crosses as "×", ballot boxes as "[ ]", other bullets as "•", and emoji are removed; the export warnings list each replacement. Maths symbols (≤, ≥, ≠, ≈, √ and the rest) fall back to Lora's maths subset (OFL, `@fontsource/lora`), embedded like the other fonts. The manuscript itself is not changed.
- **Fiction:** chapters have no subheadings and no takeaways (preflight fails them). A scene break prints the theme glyph (default `* * *`) centred, never ends a page on its own, and the paragraph after it is not indented. The contents lists chapters (and parts) only: the fiction template's contents section has `"entries": "chapters"`, which the server copies into `book.meta.contentsEntries` with `contentsEntriesFromTemplate()`; PDF, DOCX, EPUB and TXT contents all honour it. A heading `# Chapter 1` with no title is an untitled chapter: it prints "Chapter 1" (in the theme's number style) as the chapter title and in the contents.
- **Workbook blocks (D-042):** an exercise has a rule above it, its label in the heading font, and is kept on one page where it fits. `lines N` draws N ruled lines 22 pt apart. Checklist items get an empty tick box. A fill-in block puts one ruled line under each prompt; a fill-in page starts on a new page with three ruled lines per prompt. Tracker tables get rows tall enough to write in. Lines are drawn, never typed as underscores.
- **Contents:** chapter titles with page numbers and dot leaders; subheadings listed under each chapter (as in the drafts) without page numbers.

## Picture-book print PDF (phase 7, D-044)

- **Model** (`packages/core/src/spread.ts`): `PictureBookDoc { meta, front, spreads, back }`, `Spread { n, text, imageKey, layout, sceneSummary }`, layouts `text-left`, `text-right`, `text-top`, `text-bottom` (the same values as `SPREAD_LAYOUTS` in `@volume/ai`). `pictureBookToBookDoc()` turns it into a normal book (one chapter per spread) for house style, the about-the-author check, TXT and MD.
- **Pages** (`pictureBookPages()`): page 1 is a right-hand page. Front matter one page each, a blank page if needed so spread 1 opens on a left-hand page, each spread as a left and a right page, back matter one page each, a blank page at the end if the count is odd.
- **Default length** (`defaultPictureBookPlan()`): the colour minimum for the trim and ink (rule `paperback.trimAndPages.colour`), filled with spreads after 3 front pages (title page, copyright, today's new word) and 1 back page (about the author). Premium colour on 8.5 x 8.5 in gives 24 pages = 10 spreads + 4 matter pages (plan PHASES-6-8, section 7). The template default of 12 spreads stays for longer books. Default trim 8.5 x 8.5 in, premium colour ink (D-044).
- **Geometry** (`pictureBookGeometry()`): every PDF page is trim plus bleed (rule `print.bleed`): the added width on the outside edge, the added height split between top and bottom. The safe area (`safeAreaIn()`, rule `paperback.interiorMargins`) keeps text the with-bleed outside minimum from the top, bottom and outside trim edges and the page-count inside minimum from the gutter, measured from the trim edge (at least as safe whichever edge KDP measures from). The PDF carries matching TrimBox and BleedBox entries.
- **Rendering** (`exportPictureBookPdf()` in `packages/export/src/picture-book.ts`): every page is a fixed box, so there is nothing to paginate; Chromium prints the HTML directly at the bleed size (no Paged.js). Chromium rounds the page size to 1/300 in, so pdf-lib sets the MediaBox to the exact bleed size from the top-left corner (only a blank sliver of under 0.2 pt is removed). Each 2:1 picture is cropped around its centre to the shape of both pages with bleed, split at the gutter with sharp and placed full-bleed on the two pages. The story text sits in a soft white panel inside the safe area: `text-left` and `text-right` on that page, vertically centred; `text-top` and `text-bottom` on the left-hand page at the top or bottom of the safe area. Fonts: the default theme's body and display fonts from `assets/fonts`, embedded.
- **Measured layout:** after layout every text box is measured in the page DOM (`layout.textBoxes`, inches from the page's top-left corner) and checked with `checkTextInSafeArea()`; text that does not fit its panel is listed in `layout.overflowing`; spread pages whose picture did not load are in `layout.missingImages`.
- **Not in phase 7:** EPUB and DOCX for picture books (a fixed-layout eBook is a later format); the upload pack README says so.

## DOCX

Ported from `build_docx.py` using the `docx` package.
- Page size per trim, mirror margins (`w:mirrorMargins`), same margins as the PDF.
- Styles, no direct formatting: Normal, First Paragraph, Heading 1 (page break before), Heading 2, Title Page Title, Title Page Subtitle, Title Page Author, Copyright, Contents Heading, Part Title, Epigraph, Dedication, List Bullet, Takeaways Heading, Takeaways Item, Scene Break.
- Contents: one linked entry per Heading 1 (bookmarks and internal hyperlinks), subheadings as plain indented lines, so Kindle conversion keeps a working table of contents.
- Footer with a PAGE field. No blank paragraphs or tabs for spacing. The only empty paragraphs are workbook ruled lines (a bottom border), which are content, not spacing.
- Workbook blocks use existing styles only, so `styles.xml` is the same for every template: exercise label in Takeaways Heading, ruled lines as First Paragraph with a bottom border, checklist items with a Word check box (`w14:checkbox`), a fill-in page after a page break with three ruled lines per prompt.

## EPUB 3

- `mimetype` first and stored uncompressed, `META-INF/container.xml`, `OEBPS/content.opf`, `nav.xhtml` (contents with chapters and subheadings, plus landmarks), one XHTML file per section, one CSS file.
- Metadata: `dc:title`, `dc:creator` (pen name), `dc:language` (`en-GB`), `dc:identifier` (eBook ISBN if entered, otherwise `urn:uuid:` from the project id), `dc:publisher` (imprint), `dc:date`, `dcterms:modified`.
- Cover: the eBook cover JPEG with `properties="cover-image"`, plus a cover XHTML page.
- Workbook blocks: an exercise is an `<aside class="exercise">` with its label; `lines N` and each fill-in block become one line "Space to write your answer." (D-042), because ruled lines look broken on a reflowable screen. Checklists are plain lists. Scene breaks are `<hr class="break"/>`.
- Reflowable, no fixed font sizes, fonts not embedded by default. EPUBCheck integration tests require Java and an explicit `EPUBCHECK_JAR`; without that jar they skip. Automated validation is separate from Kindle rendering acceptance.
- EPUB and upload packs use the installed `jszip` dependency in packages/export. Project-transfer ZIP parsing is a separate bounded server implementation.

## TXT (owner's format)

From the "Book Architect Pro" draft, kept as an export format with three fixes: the year comes from the book, the ISBN line appears only when entered, and every enabled section is included.

Rules:
- UTF-8 without BOM, LF line endings, file ends with a newline.
- Separator: a line of 80 `=` characters.
- Title block: separator, title in capitals, subtitle, `by <pen name>`, separator.
- Copyright lines follow without a heading, then a separator.
- Each later section: blank line, heading in capitals, blank line, body, blank line, separator. Chapters use `CHAPTER N: TITLE`.
- `SUMMARY` (the blueprint summary) after the copyright block only when asked for (`includeSummary: true`). Off by default since 5 October 2026: the summary belongs to the listing and back cover, not the book interior.
- Contents: front and back sections by name, chapters as `N. Title`, subheadings indented 3 spaces.
- Paragraphs separated by one blank line and wrapped at 80 characters on word boundaries. Lines that cannot break (category paths, URLs) stay whole.
- Subheadings on their own line in title case. Lists as `- ` with continuation lines indented 2 spaces. `KEY TAKEAWAYS` label before takeaways. Scene breaks as `* * *`. Bold and italic markers removed.
- Workbook blocks: `EXERCISE: TITLE` in capitals, its contents below, checklist items as `[ ] item`, and "Space to write your answer." in place of ruled lines or after a fill-in block's prompts. No underscores.
- After the last book section: `AMAZON MARKETING PACKAGE` with `PRODUCT DESCRIPTION:` (HTML stripped to paragraphs), `CATEGORIES:` and `KEYWORDS:` numbered.
- Ends with separator, `END OF BOOK`, `Total Word Count: N`, separator. N counts words (tokens with a letter or digit) in section bodies, including subheadings and list items, excluding headings, labels, the title page, copyright, contents and the marketing package.

Exact example (golden fixture `tests/golden/txt/mini-book.txt`):

```text
================================================================================
WINDOWSILL HERBS
Grow Fresh Herbs in a Small UK Home
by Sam Rowe
================================================================================

Copyright © 2026 Sam Rowe
All rights reserved.
First edition.

================================================================================

SUMMARY

A short, practical guide for people who grow herbs on a windowsill because that
is all they have. It shows how to read the light at each window, choose pots
that fit a narrow sill, and water without drowning the plants.

================================================================================

DEDICATION

For everyone who has watched a supermarket basil collapse in a fortnight.

================================================================================

CONTENTS

Introduction
1. Read Your Windows Before You Buy a Plant
   North, East, South and West
About the Author

================================================================================

INTRODUCTION

If you have ever brought home a pot of supermarket basil and watched it collapse
within a fortnight, this book is for you. I have done it more times than I like
to admit.

Right. Let's go and look at your windows.

================================================================================

CHAPTER 1: READ YOUR WINDOWS BEFORE YOU BUY A PLANT

Your basil did not die because you are bad with plants. It died because of where
you put it.

North, East, South and West

A north-facing sill gets soft, even light all day and almost no direct sun.

KEY TAKEAWAYS

- Check the light before you buy the plant.
- Move a pot a little at a time and watch how the leaves respond over the
  following week.

Next, we choose a pot that fits the sill you have.

================================================================================

ABOUT THE AUTHOR

Sam Rowe has grown herbs on rented windowsills in Sheffield and Leeds since
2020.

Instagram: @example_handle

================================================================================

AMAZON MARKETING PACKAGE

PRODUCT DESCRIPTION:
Grow fresh herbs on the windowsill you already have.

CATEGORIES:
1. Books > Crafts, Hobbies & Home > Gardening & Horticulture > Herbs
2. Books > Crafts, Hobbies & Home > Gardening & Horticulture > Container Gardening
3. Books > Crafts, Hobbies & Home > Gardening & Horticulture > Indoor Gardening

KEYWORDS:
1. windowsill herb garden
2. growing herbs indoors uk
3. small space gardening
4. herbs for beginners
5. container herbs flat
6. kitchen herb garden
7. north facing window plants

================================================================================
END OF BOOK
Total Word Count: 145
================================================================================
```

The fixture is deliberately tiny (one subheading) so the example stays readable; real chapters have 3 or more.

## Markdown

The canonical manuscript in the dialect above, with every enabled section, including the generated title page, copyright and about the author text. This is the file Volume imports back.

## eBook cover

- 1600 x 2560 px, JPEG, RGB, quality 90, under 50 MB (FACTS 10.5: ideal 2,560 high by 1,600 wide, ratio at least 1.6:1, JPEG or TIFF, RGB).
- Composed by Playwright (HTML with the chosen concept image and app-set type), saved by sharp. Title must stay legible at 160 px wide (thumbnail check in preflight).

## Paperback wrap

One PDF: back cover, spine, front cover, 0.125 in bleed on all outer edges, images at 300 DPI or more (FACTS 3.8).

```
spine_in = pages x 0.002252   (white paper)    FACTS 3.9
spine_in = pages x 0.0025     (cream paper)    FACTS 3.9
width_in  = 0.125 + trim_w + spine_in + trim_w + 0.125
height_in = 0.125 + trim_h + 0.125
```

| Example (6 x 9 in) | Spine | Wrap |
|---|---|---|
| 120 pages, white | 0.2702 in | 12.5202 x 9.25 in |
| 200 pages, white | 0.4504 in | 12.7004 x 9.25 in |
| 200 pages, cream | 0.5000 in | 12.7500 x 9.25 in |
| 300 pages, cream | 0.7500 in | 13.0000 x 9.25 in |

- Spine text only at 80 pages or more (FACTS 3.10: KDP says both "at least 79" and "more than 79", so Volume uses 80).
- `pages` is the interior PDF's real page count, read from the file, never estimated.
- Back cover: blurb, short bio, and an empty area for KDP's barcode (size/clearance recorded, automatic placement still partial, `KNOWN-ISSUES.md`).
- Phase 4 check: sizes match KDP's cover calculator (FACTS 3.8) for 3 page counts on white and cream.

## Preflight

| Check | Level | Source |
|---|---|---|
| All template sections present or deliberately off; contents matches headings | block | template |
| Template chapter rules (`structure.template-rules`): fiction chapters have no subheadings and no takeaways; a workbook chapter with no exercises | block | template `chapterRules`, `checkTemplateRules` |
| Workbook exercises outside the per-chapter range, unknown exercise kinds, `lines N` outside 1 to 30, workbook blocks in a template without exercises, malformed workbook fences | warn | template `chapterRules` |
| No em dashes, no banned phrases, no US spellings (or waived) | block | house style |
| No open blocking checks or invented-content flags | block | `docs/02-architecture/AI-PIPELINE.md` |
| Open claims in the claims report | warn | guardrails |
| About the author equals profile bio (hash) | block | guardrails |
| Also by lists only published books of this pen name | block | guardrails |
| Copyright year correct, no unfilled `{placeholders}` | block | profile templates |
| ISBN, if entered, passes the ISBN-13 checksum; never generated | block | FACTS 4.1, 4.2 |
| Title plus subtitle under 200 characters | block | FACTS 5.4 |
| Description 4,000 characters or fewer including tags; allowed tags only | block | FACTS 5.3, 10.14 |
| Exactly 7 keywords, 3 categories | block | FACTS 5.1, 5.2 |
| AI disclosure set to match content | block | FACTS 5.5 |
| Interior trim size matches, fonts embedded, page count within trim limits | block | FACTS 3.6, 6.6 |
| Picture books: page size equals trim plus bleed (`interior.bleed`) | block | rule `print.bleed` |
| Picture books: page count within the colour range for the trim and ink (`picture.page-count`; warns while `paperback.colour.paper` is partial) | block | rule `paperback.trimAndPages.colour` |
| Picture books: every spread page shows its picture, read from the PDF and the layout (`picture.spread-images`) | block | D-044 |
| Picture books: every text box inside the safe area and every text fits its panel (`picture.safe-area`) | block | rules `print.bleed`, `paperback.interiorMargins` |
| Picture books: every spread has text and is numbered in order; words per spread and spread count within the template (`picture.spreads`) | block (text), warn (rest) | template `spreads` |
| Picture books: the AI disclosure covers images, because the spread pictures come from the image model (`kdp.ai-disclosure`) | block | FACTS 5.5, D-045 |
| Wrap size matches formula, spine text only at 80 pages or more, images 300 DPI or more | block | FACTS 3.8 to 3.10 |
| eBook cover 1600 x 2560 JPEG RGB | block | FACTS 10.5 |
| EPUBCheck passes (when Java present) | warn | FACTS 7.8 |
| Exports older than the latest manuscript change | warn | `exports.manuscript_hash` |
| Oldest KDP rule check older than `recheckAfterDays` (`rules.age`, counted from the file's `verifiedOn`, which is the date of its oldest check, not the date of the file) | warn | rules file `verifiedOn` |
| A third new title this week in one format (phase 8) | block | FACTS 5.7 |

## Golden samples

`packages/export/test/fixtures/` holds four short books, each with goldens in `packages/export/test/golden/`: the Windowsill Herbs manuscript (non-fiction), `fiction-mini.md` (two chapters, scene breaks written both ways) and `workbook-mini.md` (every exercise kind, lines, a checklist, a tracker table and a fill-in page), and `picture-mini.json` (a 24-page picture book: 3 front pages, 10 spreads in all four layouts, 1 back page; deterministic placeholder pictures made in `test/helpers.ts`). For each: TXT and MD exact, DOCX normalised `document.xml` (the fiction and workbook samples must keep the Windowsill `styles.xml`), EPUB chapter and nav XHTML exact (`<name>.epub.txt`), PDF page size, page count (`<name>.pages.txt`), embedded fonts, extracted text and 4 page images. The picture book has its own goldens: page text per page (`picture-mini.pages-text.txt`), TXT and MD of the story, the full preflight report (`picture-mini.preflight.txt`) and the four pages of spreads 1 and 2 (`picture-mini-page-1.png` to `-4.png`); its PDF checks are page count from the rules, page box equal to trim plus bleed, trim boxes, embedded fonts, a picture on every spread page and text boxes inside the safe area. Update with `UPDATE_GOLDEN=1` on one test file at a time and review the diff; PDF images on Linux live in `golden/linux/`; the fiction and workbook samples have none yet, so on Linux they get only the layout check against the macOS images.

## Upload pack (zip)

`<slug>-kdp-pack-<YYYY-MM-DD>.zip`:

```
README.txt                      what each file is and the KDP upload order (FACTS 10.3)
manuscript/<slug>-interior-<trim>.pdf
manuscript/<slug>.epub
manuscript/<slug>.docx
manuscript/<slug>.txt
manuscript/<slug>.md
cover/<slug>-ebook-cover.jpg
cover/<slug>-paperback-wrap-<trim>-<paper>-<pages>p.pdf
listing/metadata.txt            title, subtitle, author, edition, series, ISBNs if entered, prices, keywords, categories
listing/description.html
listing/back-cover-blurb.txt    the back-cover blurb as plain text (matter stage, else the blueprint blurb)
listing/short-bio.txt           the short author bio as plain text
listing/ai-disclosure.txt       what was AI-generated (text, images) and why
reports/preflight.txt
reports/claims-to-verify.csv    chapter, sentence, category, check needed, status
reports/kdp-rules-used.txt      rules file version, fact IDs and dates
marketing/tiktok-scripts.txt
marketing/instagram-captions.txt
marketing/launch-email.txt
```

`listing/back-cover-blurb.txt` and `listing/short-bio.txt` come from the optional `backCoverBlurb` and `shortBio` inputs to `buildUploadPack()` (D-049). Each is written only when its text is not blank, as UTF-8 with one trailing newline, and the README's `listing/` line names it. The caller picks the blurb: the matter-stage back-cover blurb, falling back to the blueprint blurb. Marketing files follow the same rule: only the ones with text are written. Marketing counts come from the book template at `packages.marketing[].default.count` (5 TikTok scripts and 5 Instagram captions in every template).

A picture-book pack (`buildUploadPack({ ..., pictureBook: true })`) has the interior PDF but no EPUB or DOCX (D-044); its README says to choose colour ink, white paper and bleed in KDP, and `listing/ai-disclosure.txt` says the spread pictures and the cover art came from an image model.

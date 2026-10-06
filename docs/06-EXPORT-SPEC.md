# 06 Export specification

How a book is structured, how it is written down as Markdown, and exactly what each export must produce. All KDP numbers cite fact IDs from `docs/reference-kdp-facts-2026-10-03.md` (FACTS) and are read at run time from `config/kdp-rules/2026-10-03.json`, never typed into code. Section defaults per template are in `config/book-templates/`.

## Canonical book structure

A book is an ordered list of sections (`03-DATA-MODEL.md`, `sections`). Every export walks the same list, skipping sections with `enabled = 0`.

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
| `***` | Scene break | P02 |
| `**bold**` | Bold inline | P02 |
| `*italic*` | Italic inline | New |
| `::: takeaways` with `- ` items | Key Takeaways box (3 to 5 items) | New |
| `::: epigraph` with quote lines, last line `- Name` | Owner-supplied quote only | New |
| `::: demo` | Demo note (P02 compatibility) | P02 |
| `::: exercise`, `::: lines N` | Workbook exercise and N fill-in lines | New, phase 6 |

Round-trip rule: parse then write returns byte-identical Markdown for any file the writer produced (golden test).

## Print PDF (interior)

- **Engine:** HTML and CSS from the book model, paginated by Paged.js inside Playwright Chromium, printed with `preferCSSPageSize`; pdf-lib sets title, author, subject, creator and producer. Fallback engine (ported from `build_pdf.py`: Chromium print plus stamping) if Paged.js is too slow on long books (`KNOWN-ISSUES.md`).
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
- **Fonts:** every font embedded and subset; preflight reads the PDF and fails on any unembedded font.
- **Contents:** chapter titles with page numbers and dot leaders; subheadings listed under each chapter (as in the drafts) without page numbers.

## DOCX

Ported from `build_docx.py` using the `docx` package.
- Page size per trim, mirror margins (`w:mirrorMargins`), same margins as the PDF.
- Styles, no direct formatting: Normal, First Paragraph, Heading 1 (page break before), Heading 2, Title Page Title, Title Page Subtitle, Title Page Author, Copyright, Contents Heading, Part Title, Epigraph, Dedication, List Bullet, Takeaways Heading, Takeaways Item, Scene Break.
- Contents: one linked entry per Heading 1 (bookmarks and internal hyperlinks), subheadings as plain indented lines, so Kindle conversion keeps a working table of contents.
- Footer with a PAGE field. No blank paragraphs or tabs for spacing.

## EPUB 3

- `mimetype` first and stored uncompressed, `META-INF/container.xml`, `OEBPS/content.opf`, `nav.xhtml` (contents with chapters and subheadings, plus landmarks), one XHTML file per section, one CSS file.
- Metadata: `dc:title`, `dc:creator` (pen name), `dc:language` (`en-GB`), `dc:identifier` (eBook ISBN if entered, otherwise `urn:uuid:` from the project id), `dc:publisher` (imprint), `dc:date`, `dcterms:modified`.
- Cover: the eBook cover JPEG with `properties="cover-image"`, plus a cover XHTML page.
- Reflowable, no fixed font sizes, fonts not embedded by default. Passes EPUBCheck when Java is present (test skips with NOT TESTED otherwise).
- The zip library is not yet named in the docs; it needs the owner's OK in phase 1 (`KNOWN-ISSUES.md`).

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
- Back cover: blurb, short bio, and an empty area for KDP's barcode (size unverified, `KNOWN-ISSUES.md`).
- Phase 4 check: sizes match KDP's cover calculator (FACTS 3.8) for 3 page counts on white and cream.

## Preflight

| Check | Level | Source |
|---|---|---|
| All template sections present or deliberately off; contents matches headings | block | template |
| No em dashes, no banned phrases, no US spellings (or waived) | block | house style |
| No open blocking checks or invented-content flags | block | `04-AI-PIPELINE.md` |
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
| Wrap size matches formula, spine text only at 80 pages or more, images 300 DPI or more | block | FACTS 3.8 to 3.10 |
| eBook cover 1600 x 2560 JPEG RGB | block | FACTS 10.5 |
| EPUBCheck passes (when Java present) | warn | FACTS 7.8 |
| Exports older than the latest manuscript change | warn | `exports.manuscript_hash` |
| KDP rules file older than 90 days | warn | rules file date |
| A third new title this week in one format (phase 8) | block | FACTS 5.7 |

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
listing/ai-disclosure.txt       what was AI-generated (text, images) and why
reports/preflight.txt
reports/claims-to-verify.csv    chapter, sentence, category, check needed, status
reports/kdp-rules-used.txt      rules file version, fact IDs and dates
marketing/tiktok-scripts.txt
marketing/instagram-captions.txt
marketing/launch-email.txt
```

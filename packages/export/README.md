# @volume/export

Exporters for a `BookDoc` from `@volume/core`: print PDF (Paged.js in Playwright Chromium), DOCX, EPUB 3, TXT,
Markdown, the eBook cover JPEG, the paperback wrap PDF, preflight and the KDP upload pack. Node only. Every KDP number
comes from the rules object passed in (`loadKdpRules()` from `@volume/core/node`). See `docs/06-EXPORT-SPEC.md`.

```ts
import { parseManuscript, DEFAULT_INTERIOR_THEME } from '@volume/core';
import { loadKdpRules, loadInteriorThemes } from '@volume/core/node';
import { acquireBrowser, releaseBrowser, exportPrintPdf, exportDocx, exportEpub, exportTxt } from '@volume/export';

const book = parseManuscript(markdown);
const theme = loadInteriorThemes().find((t) => t.id === themeId) ?? DEFAULT_INTERIOR_THEME;
const browser = await acquireBrowser();          // optional: share one Chromium across several exports
try {
  const pdf = await exportPrintPdf(book, theme, { trim: '6x9', browser, rules: loadKdpRules() });
  // pdf.buffer, pdf.pageCount (use it for the wrap), pdf.sections, pdf.warnings
} finally {
  await releaseBrowser();
}
```

Scripts: `npm run typecheck -w packages/export`, `npm run test -w packages/export` (Vitest, golden files in
`test/golden/`, set `UPDATE_GOLDEN=1` to rewrite them after a reviewed change), and the manual check script:

```
npx tsx packages/export/scripts/export-book.ts <manuscript.md> <out-folder> [--meta meta.json] [--trim 6x9]
    [--paper white|cream] [--theme <interior theme id>] [--cover-style <cover style id>] [--any-page] [--render 1,3,7,8]
```

It writes every format, PNG renders of four PDF pages, a wrap preview, the preflight report and the upload pack.
`npx tsx packages/export/scripts/theme-matrix.ts <manuscript.md> <out-folder>` prints the book once per interior theme
and lists the fonts each PDF embeds.

## Public API

### Text formats

```ts
function exportTxt(book: BookDoc, opts?: TxtOptions): Buffer;
interface TxtOptions { width?: number /* 80 */; includeSummary?: boolean /* false */; includeMarketing?: boolean /* true */ }
function txtWordCount(book: BookDoc): number;
function htmlToParagraphs(html: string): string[];

function exportMarkdown(book: BookDoc): Buffer;   // the dialect; byte-identical round trip
```

TXT follows the owner's `====` format exactly (the example in the spec is a golden test, word count 145). The blueprint
summary belongs to the listing and back cover, so no exporter puts it in the interior: TXT prints the `SUMMARY` block from
`book.meta.summary` only with `includeSummary: true` (the spec example uses it). The marketing package comes from
`book.meta.listing`. `###` and `####` sub-subheadings print on their own line in every exporter: DOCX Heading 3 and
Heading 4 (outline levels 2 and 3), EPUB and print `<h3>` and `<h4>` with their own CSS.

### Print PDF

```ts
function exportPrintPdf(book: BookDoc, theme?: InteriorTheme, opts?: PrintPdfOptions): Promise<PrintPdfResult>;

interface PrintPdfOptions {
  trim?: TrimKey;                      // '6x9' (default), '5x8', '5.5x8.5', '8.5x11', any 'WxH'
  chapterStart?: 'right' | 'any';      // overrides the theme; default from theme ('right', D-013)
  contentsSubheadings?: boolean;       // default true
  images?: Record<string, Buffer>;     // for image blocks whose src is a key
  browser?: Browser;                   // reuse a Playwright browser
  fonts?: FontLibrary;
  subject?: string;
  keywords?: string[];
  creationDate?: Date;                 // fixed date for reproducible files
  allowVariableFonts?: boolean;        // default false (see Fonts below)
  rules?: KdpRules;                    // raise the inside margin to the KDP minimum for the page count + theme extra
  timeoutMs?: number;                  // default 120000
}
interface PrintPdfResult {
  buffer: Buffer; pageCount: number; widthPt: number; heightPt: number;
  sections: Record<string, { page: number; folio: string }>;   // where each section opens
  numberingStartPage: number | undefined;                       // Arabic 1 (the introduction)
  blankPages: number[]; warnings: string[]; html: string; insideMarginIn: number;
}
function buildPrintHtml(book: BookDoc, theme: InteriorTheme, lib: FontLibrary, opts: PrintHtmlOptions): PrintHtml;
```

Mirrored margins (`@page :left/:right`), running heads (left and right content from the theme, none on openers,
blank pages and front matter), folios in the outside corner from Arabic 1 on the introduction, chapters and parts on
right-hand pages with blank left pages added, contents page numbers from `target-counter()` (checked against the
layout and corrected if Paged.js drifts, with a warning), fonts embedded as data URLs, pdf-lib metadata.

### DOCX and EPUB

```ts
function exportDocx(book: BookDoc, theme?: InteriorTheme, opts?: DocxOptions): Promise<Buffer>;
interface DocxOptions { trim?: TrimKey; embedFonts?: boolean /* true */; images?: Record<string, Buffer>; fonts?: FontLibrary }
const DOCX_STYLE_IDS: readonly string[];
function addMirrorMargins(settingsXml: string, embedTrueTypeFonts?: boolean): string;

function exportEpub(book: BookDoc, theme?: InteriorTheme, opts?: EpubOptions): Promise<Buffer>;
interface EpubOptions { coverJpeg?: Buffer; embedFonts?: boolean /* false */; images?: Record<string, Buffer>; modified?: Date; fonts?: FontLibrary }
function uuidFromId(id: string): string;
```

DOCX: named styles only (Normal, First Paragraph, Heading 1 with page break before, Heading 2, Heading 3, Heading 4, Title Page Title,
Subtitle and Author, Copyright, Contents Heading, Contents Entry, Part Title, Epigraph, Dedication, List Bullet,
Takeaways Heading and Item, Scene Break, Demo Note and more), contents linked to bookmarks, trim page size, mirrored
margins, PAGE field footers (outside corner, none on the title page), static TTF fonts embedded.
EPUB: `mimetype` first and stored, XHTML per section, nav with chapters, subheadings and landmarks, OPF metadata
(`urn:uuid` from `meta.identifier`, or `urn:isbn` when an eBook ISBN is entered), cover image, reflowable CSS.
`coverJpeg` is the eBook cover JPEG from the cover studio: it becomes the `cover-image` item and a cover page. Anything
that is not a JPEG is refused with an error (the item is declared `image/jpeg`).

### Covers

```ts
function exportEbookCover(meta: BookMeta, style?: CoverStyle, opts?: EbookCoverOptions): Promise<EbookCoverResult>;
interface EbookCoverOptions { background?: Buffer; browser?: Browser; fonts?: FontLibrary; rules?: KdpRules; quality?: number /* 90 */ }
interface EbookCoverResult { jpeg: Buffer; widthPx: number; heightPx: number; titlePxAt160: number; warnings: string[] }

function exportPaperbackWrap(meta: BookMeta, style: CoverStyle | undefined, opts: WrapOptions): Promise<WrapResult>;
interface WrapOptions {
  rules: KdpRules; pages: number /* real interior page count */; paper: 'white' | 'cream'; trim?: TrimKey;
  blurb?: string; shortBio?: string; background?: Buffer;
  raster?: 'auto' | 'always' | 'never'; showBarcodeBox?: boolean; browser?: Browser; fonts?: FontLibrary;
}
interface WrapResult { pdf: Buffer; size: WrapSize; widthPt: number; heightPt: number; spineText: boolean; rasterised: boolean; imageDpi?: number; warnings: string[] }
```

```ts
function applyCoverTypography(style: CoverStyle, typography: CoverTypography | Record<string, unknown> | null): CoverStyle;
interface CoverTypography {
  styleId?: string | null; paletteId?: string | null; showSubtitle?: boolean;   // read by the caller
  titlePosition?: 'top' | 'middle' | 'bottom'; titleTopPct?: number; subtitleTopPct?: number; align?: 'left' | 'center';
  titleSize?: 'small' | 'medium' | 'large' | number; palette?: Partial<CoverStyle['colours']>; colours?: Partial<CoverStyle['colours']>;
  fonts?: Partial<CoverStyle['fonts']>; titleUppercase?: boolean; authorUppercase?: boolean;
}
```

The owner's typography from the cover studio goes on top of the cover style before `exportEbookCover` and
`exportPaperbackWrap`. Missing or invalid values (a colour that is not hex, a size out of range) keep the style's own.

eBook cover: 1600 x 2560 sRGB JPEG with an ICC profile (size from rule `ebook.cover`). Wrap: exact formula size
(bleed + back + spine + front + bleed), TrimBox and BleedBox set, spine text only from 80 pages, barcode keep-out box
and safe zone from the dated rules (automatic barcode placement remains partial), background DPI checked against `paperback.cover`.

### Preflight and pack

```ts
function inspectPdf(pdf: Buffer, opts?: { text?: boolean }): Promise<PdfInspection>;
interface PdfInspection {
  pageCount: number; pageSizes: { widthPt: number; heightPt: number }[];
  fonts: { name: string; type: string; embedded: boolean; type3: boolean }[];
  pageText: string[]; pageParts: { head: string; foot: string; body: string }[];
}
function runPreflight(input: PreflightInput): Promise<PreflightReport>;
interface PreflightInput {
  book: BookDoc; rules: KdpRules; houseStyle: CompiledHouseStyle; trim: TrimKey; paper: Paper; listing: ListingInput;
  template?: unknown; sectionsOff?: string[]; interiorPdf?: Buffer; insideMarginIn?: number; wrapPdf?: Buffer;
  wrapInfo?: { spineText: boolean; imageDpi?: number }; ebookCover?: Buffer;
  epubcheck?: { ok: boolean; messages: string[] } | { skipped: string }; claims?: ClaimItem[]; profileBio?: string;
  aiDisclosure?: { aiWroteText: boolean; aiMadeImages: boolean; disclosed: 'ai-generated' | 'ai-assisted' | 'none' };
  copyrightYear?: number; exportsHash?: string; manuscriptHash?: string; now?: Date;
  isbns?: string[];   // owner-entered ISBNs, allowed in the text (see below)
}
interface PreflightReport { items: CheckItem[]; counts: { pass: number; warn: number; fail: number }; ok: boolean; interiorPages?: number }
function isbnDigits(text: string): string;   // 'ISBN: 978-0-306-40615-7' -> '9780306406157'
function preflightText(report: PreflightReport, title?: string): string;
function preflightHtml(report: PreflightReport, title?: string): string;

function buildUploadPack(input: UploadPackInput): Promise<{ fileName: string; zip: Buffer }>;
interface UploadPackInput {
  book: BookDoc; files: PackFiles; trim: TrimKey; paper: Paper; pages?: number; rules: KdpRules; ruleIds?: string[];
  preflight?: PreflightReport; claims?: ClaimItem[]; ai: AiDisclosure; metadata?: PackMetadata;
  marketing?: { tiktokScripts?: string; instagramCaptions?: string; launchEmail?: string }; date?: Date;
}
interface PackFiles { interiorPdf?: Buffer; epub?: Buffer; docx?: Buffer; txt?: Buffer; md?: Buffer; ebookCover?: Buffer; wrapPdf?: Buffer }
interface ClaimItem { chapter: string; sentence: string; category: string; check: string; status: 'open' | 'verified' | 'removed' }
function claimsCsv(claims: ClaimItem[]): string;
function metadataSheet(book: BookDoc, md?: PackMetadata): string;
function aiDisclosureNote(ai: AiDisclosure, rules: KdpRules): string;
```

Preflight checks: template sections, house style (dashes, banned phrases, US spellings), invented-content flags,
claims, about the author equals the profile bio, copyright year, placeholders, AI disclosure, title length, description
length and tags, keyword and category counts, ISBN checksum, interior trim, fonts embedded with no Type 3 (pdfjs-dist),
page count within trim limits, inside margin against the KDP minimum, wrap size against the formula, spine text rule,
cover image DPI, eBook cover size and colour, EPUBCheck result, stale exports, rules file age and unverified rules.
Owner-entered ISBNs (`isbns`, plus `book.meta.isbnPrint` and `isbnEbook`) are allowed in the text, so a copyright page
that prints them passes the invented-content check; the house-style ISBN rules (`isbn`, `isbn-bare`) still fail any
other ISBN. Matching ignores hyphens, spaces and an `ISBN` or `ISBN-13:` label.
Callers that build files first (the server's export job) run preflight again with `interiorPdf` and the covers and do
not build the pack while that final report fails, for example when the page count is under the trim's minimum.
The pack follows the spec's layout: `<slug>-kdp-pack-<YYYY-MM-DD>.zip` with manuscript/, cover/, listing/, reports/
(preflight.txt and preflight.html) and marketing/ (only the marketing texts that exist; a pack built before marketing
has no marketing/ folder, and the README lists what is there).

### Browser, fonts and previews

```ts
function acquireBrowser(): Promise<Browser>;           // shared headless Chromium, reference counted
function releaseBrowser(): Promise<void>;
function withBrowser<T>(given: Browser | undefined, fn: (b: Browser) => Promise<T>): Promise<T>;
function renderPdfPages(pdf: Buffer, pages: number[], opts?: { scale?: number; browser?: Browser }): Promise<Buffer[]>;  // PNGs via pdf.js
function loadFontLibrary(root?: string): FontLibrary;  // assets/fonts + node_modules/@fontsource*
function createFontLibrary(files: FontFile[]): FontLibrary;
function isVariableOnly(lib: FontLibrary, family: string): boolean;
function resolveFamily(lib: FontLibrary, wanted: string, fallback: string, warnings: string[], opts?: { allowVariable?: boolean }): string;
function fontFaceCss(lib: FontLibrary, families: string[]): string;
function fontBytes(lib: FontLibrary, family: string, weight: number, style?: 'normal' | 'italic'): Buffer | undefined;
function ornamentSvg(name: string, colour: string, width: number): string;
const ORNAMENT_NAMES: readonly string[];
```

## Fonts

Files are found by family slug in `assets/fonts/<slug>-<weight>-<style>.ttf` (preferred) and in
`node_modules/@fontsource/*` and `@fontsource-variable/*` (latin subset). Chromium prints variable fonts and
synthetic bold or italic as Type 3 fonts, which preflight rejects, so the print PDF falls back to the default theme
fonts (with a warning) for any family that is only installed as a variable font, and turns off font synthesis. Covers
may use variable fonts: the eBook cover is a screenshot, and the wrap is rendered as one 300 DPI image when they are
used. Adding static files for a family (to `assets/fonts` or as an `@fontsource/<family>` package) makes the theme
print with its own fonts with no code change.

Static `@fontsource/*` packages (5.3.0, OFL-1.1) are installed in this workspace for every family the interior themes
and cover styles name, so all 18 themes in `config/interior-themes.json` print in their own fonts with every font
embedded and no Type 3 (`test/themes.test.ts`; `scripts/theme-matrix.ts <manuscript.md> <out>` prints a report). Only
the Latin WOFF2 files are read, and only the weights nearest to those the theme or cover style uses are embedded. The
variable-font fallback stays as a safety net for any family without static files. The full list is in
`assets/fonts/README.md` (Static print fonts).

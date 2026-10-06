# @volume/core

The book model, the manuscript Markdown parser and writer, the house-style checker, KDP maths and the theme types.
Pure TypeScript: no file system and no network. The only Node code is in `@volume/core/node`, which reads the config
files from the repo.

```ts
import { parseManuscript, serialiseManuscript, compileHouseStyle, checkBookStyle, wrapSizeIn } from '@volume/core';
import { loadKdpRules, loadHouseStyle, loadInteriorThemes } from '@volume/core/node';
```

Scripts: `npm run typecheck -w packages/core`, `npm run test -w packages/core` (Vitest, tests in `test/`).

## Book model (`src/model.ts`)

```ts
type SectionKind = 'front' | 'part' | 'chapter' | 'back';
type SectionSubtype = 'titlepage' | 'copyright' | 'contents' | 'halftitle' | 'dedication' | 'epigraph' | 'foreword'
  | 'preface' | 'acknowledgements' | 'introduction' | 'part' | 'chapter' | 'conclusion' | 'epilogue' | 'appendix'
  | 'resources' | 'glossary' | 'references' | 'about_the_author' | 'also_by' | 'review_request' | 'newsletter' | 'other';

type Block =
  | { type: 'paragraph'; text: string }                 // text is inline Markdown: **bold**, *italic*
  | { type: 'heading2'; text: string }
  | { type: 'heading3'; text: string; level?: 4 }      // ### (level 3) or #### (level 4) sub-subheading
  | { type: 'list'; ordered?: boolean; items: string[] }
  | { type: 'table'; rows: string[][] }                  // first row is the header
  | { type: 'sceneBreak' }
  | { type: 'quote'; variant: 'epigraph' | 'quote'; lines: string[]; attribution?: string }
  | { type: 'takeaways'; items: string[] }
  | { type: 'callout'; variant: string; text: string }   // 'demo', 'exercise', 'lines 5', 'note', ...
  | { type: 'image'; src: string; alt: string; caption?: string }  // src: data: URL or a key in the exporter's images map
  | { type: 'pageBreak' };

interface Section {
  id: string;                 // unique slug of the heading, used as anchor
  kind: SectionKind;
  subtype: SectionSubtype;
  title: string;              // chapters: the part after "Chapter N: "
  kicker?: string;            // "Chapter 1", "Part I"
  number?: number;            // chapter number
  lines?: string[];           // raw lines of ::: titlepage / ::: halftitle
  blocks: Block[];
  enabled?: boolean;          // false = switched off by the owner; exporters skip it
  explicitKind?: boolean;     // heading carried {kind=...}
}

interface BookMeta {
  title: string; subtitle?: string; author: string; edition?: string; titlePageNotes?: string[];
  language: string; year?: number; imprint?: string; isbnPrint?: string; isbnEbook?: string;
  identifier?: string;        // project id; EPUB urn:uuid comes from it
  summary?: string;           // blueprint summary: listing and back cover only, kept out of interiors (TXT prints it only with includeSummary)
  listing?: { description?: string; keywords?: string[]; categories?: string[] };
}

interface BookDoc { meta: BookMeta; sections: Section[] }

const bookDocSchema, sectionSchema, blockSchema, bookMetaSchema, inlineRunSchema; // zod
function enabledSections(book: BookDoc): Section[];
function sectionHeading(s: Section): string;           // "Chapter 1: Title"
```

## Manuscript dialect (`src/markdown.ts`, `src/inline.ts`)

```ts
function parseManuscript(markdown: string, opts?: { language?: string }): BookDoc;
function serialiseManuscript(book: BookDoc, opts?: { includeDisabled?: boolean }): string;
function parseBlocks(lines: string[]): Block[];
function subtypeForHeading(heading: string): SectionSubtype;
function kindForSubtype(subtype: SectionSubtype, afterChapters: boolean): SectionKind;
function titlePageLines(meta: BookMeta): string[];
function partLabel(n: number): string;                 // "Part IV"

function parseInline(text: string): InlineRun[];       // InlineRun = { text; bold?; italic? }
function serialiseInline(runs: InlineRun[]): string;
function stripInline(text: string): string;
function inlineToHtml(text: string): string;           // escaped, <strong>/<em>
function escapeHtml(text: string): string;
```

Round trip: `serialiseManuscript(parseManuscript(x)) === x` for the Windowsill Herbs manuscript and any file the writer
produced (tested byte for byte). Supported: `::: titlepage`, `::: copyright`, `::: contents`, `::: halftitle`,
`::: part` (label, title, optional paragraphs), `# Heading`, `# Chapter N: Title`, `{kind=...}` markers, `##`, `###` and `####` (sub-subheadings), `- `
and `1. ` lists, tables, `***`, `**bold**`, `*italic*`, `::: takeaways`, `::: epigraph` (last line `- Name`),
`::: demo` and any other `::: name` block (kept as a callout), `::: pagebreak`, `> ` quotes, `![alt](src "caption")`.
`::: titlepage/copyright/contents/halftitle/part` are accepted anywhere between sections, including after the first
`#` heading, because the template puts Dedication before Contents (docs/06-EXPORT-SPEC.md says so).

## House style (`src/style.ts`)

Typed port of `.claude/skills/volume-house-style/scripts/check-style.mjs`. Reads the `config/house-style.json` object.

```ts
function compileHouseStyle(config: unknown, extraBanned?: readonly string[]): CompiledHouseStyle;
function checkText(text: string, style: CompiledHouseStyle, opts?: { rules?: readonly StyleRule[]; ignoreMarkers?: boolean }): StyleFinding[];
function checkBookStyle(book: BookDoc, style: CompiledHouseStyle, opts?: CheckBookOptions): BookStyleFinding[];
function fixDashes(text: string, style: CompiledHouseStyle): string;
function checkHeadingCase(heading: string, style: CompiledHouseStyle): string | null;
function wordCountReport(book: BookDoc, template: WordTargetsTemplate, overrides?: Record<string, number>): { items: WordCountItem[]; total: WordCountItem };
function sectionWordCount(s: Section, opts?: { skipCalloutVariants?: string[] }): number;
function blockTexts(s: Section): string[];
function phraseRegExp(phrase: string, inflections?: readonly string[], dropFinalE?: boolean): RegExp;
function matchCase(original: string, replacement: string): string;

function checkDisclaimers(units: readonly HabitUnit[], style: CompiledHouseStyle): DisclaimerFinding[];  // per book

type StyleRule = 'emdash' | 'endash' | 'banned' | 'spelling' | 'phrasing' | 'guardrail' | 'titlecase' | 'wordcount' | 'habit';
interface HabitUnit { sectionId: string; text: string; blockIndex?: number }
interface DisclaimerFinding extends StyleFinding { sectionId: string; blockIndex?: number }
interface StyleFinding {
  rule: StyleRule; severity: 'error' | 'warn' | 'info'; message: string;
  start: number; end: number; line: number; col: number;   // offsets into the checked text
  match: string; suggestion?: string; id?: string; action?: string;  // action: block | claims-report | autofix
}
interface BookStyleFinding extends StyleFinding { sectionId: string; blockIndex: number }  // -1 = heading
```

Banned phrases match whole words, case-insensitively, with the configured single-word inflections and the drop-final-e
rule, straight and curly apostrophes alike. `house-style: ignore` lines and `house-style:off/on` ranges are skipped.
P02 `::: demo` notes are skipped in book checks.

AI habits (`aiHabits` in the config, rule `habit`, always `warn`): `checkText` on a section body flags every
scaffolding paragraph opener ("Here's the", "Here's how", "Let's", "In this chapter, we will") when the text has more
than `maxPerSection` of them; `checkBookStyle` does the same per section and also counts "this is illustrative" style
disclaimers per book (one per paragraph, front fences excluded) and flags each when there are more than `maxPerBook`.
`checkDisclaimers` runs that book count on raw section bodies, for the server.

## Repetition (`src/repetition.ts`)

Deterministic, model-free check for repeats across sections. Only repeats that span two or more sections are reported.

```ts
function findRepetitions(units: readonly RepetitionUnit[], opts?: RepetitionOptions): RepetitionFinding[];
function findBookRepetitions(book: BookDoc, opts?: RepetitionOptions): RepetitionFinding[];  // one unit per prose block

interface RepetitionUnit { sectionId: string; text: string; blockIndex?: number; title?: string }  // text: a section body in the dialect, or one block
interface RepetitionFinding {
  id: string;                  // "definition:chat assistant", "advice:contract", "sentence:12", "phrase:..."
  kind: 'sentence' | 'definition' | 'advice' | 'phrase';
  severity: 'warn' | 'info';   // phrases are info
  key: string; message: string; suggestion: string;
  similarity: number;          // best pairwise score, 1 for definitions and phrases
  occurrences: { sectionId: string; blockIndex?: number; start: number; end: number; text: string }[];  // reading order; keep the first
}
interface RepetitionOptions { minContentWords?: number; sentenceThreshold?: number; adviceThreshold?: number; minPhraseWords?: number; phrases?: boolean }
```

Offsets point into the unit text passed in, so a server that passes each section's `bodyMd` can map occurrences straight
onto the editor. Sentences are split on `.`, `!` and `?` followed by a space (GOV.UK stays whole); headings, fences and
tables are skipped and list markers dropped. Kinds: `definition` (the same term glossed in several sections: "X is a",
"X (the ...)", "X, which is", "called X"), `sentence` (idf-weighted word overlap of 0.6 or more), `advice` (imperative or
"you should" sentences that overlap by 0.45 or more, or keep returning to the same uncommon word in three or more
sections, such as "contract"), and `phrase` (a run of five or more words, three of them content words, in two sections).

## KDP maths (`src/kdp.ts`, `src/listing.ts`)

Every number is read from the rules object (`config/kdp-rules/<date>.json`). Results that use partial or unverified
rules carry warnings.

```ts
function parseKdpRules(raw: unknown): KdpRules;                     // zod-validated
function getRule(rules: KdpRules, id: string): KdpRule;             // throws KdpRuleError when missing
function spineWidthIn(rules: KdpRules, pages: number, paper: 'white' | 'cream'): number;
function wrapSizeIn(rules: KdpRules, args: { trim: TrimSize; pages: number; paper: Paper }): WrapSize;
function spineTextAllowed(rules: KdpRules, pages: number): boolean;  // from 80 pages
function spineTextMinPages(rules: KdpRules): number;
function interiorBleedSizeIn(rules: KdpRules, trim: TrimSize): TrimSize;
function coverMinDpi(rules: KdpRules): number;
function barcodeArea(rules: KdpRules): KdpResult<{ widthIn: number; heightIn: number; position: string }>;  // unverified
function coverSafeZone(rules: KdpRules): KdpResult<{ textInsetFromTrimIn: number; spineTextClearanceIn: number }>;  // unverified
function trimSizes(rules: KdpRules): KdpResult<TrimSize[]>;          // unverified
function trimPageRange(rules: KdpRules, trim: TrimSize, paper?: Paper): KdpResult<{ min: number; max: number }>;
function insideMarginMinIn(rules: KdpRules, pages: number): KdpResult<number | null>;   // unverified
function outsideMarginMinIn(rules: KdpRules, bleed: boolean): KdpResult<number>;      // unverified
function printingCostGBP(rules: KdpRules, args: { pages: number; trimClass?: 'regular' | 'large' }): KdpResult<number>;
function paperbackRoyaltyRate(rules: KdpRules, listPrice: number): number;
function paperbackRoyaltyGBP(rules: KdpRules, args: { listPrice: number; printingCost: number; expandedDistribution?: boolean }): KdpResult<number>;
function minimumListPriceGBP(rules: KdpRules, printingCost: number): KdpResult<number>;
function ebookRoyaltyGBP(rules: KdpRules, args: { listPrice: number; fileSizeMB: number; rate: 0.35 | 0.7 }): KdpResult<EbookRoyalty>;
function listingLimits(rules: KdpRules): ListingLimits;
function ebookCoverSpec(rules: KdpRules): EbookCoverSpec;
function rulesAge(rules: KdpRules, now: Date): { days: number; stale: boolean };
function describeRules(rules: KdpRules, ids: readonly string[]): string[];
function checkListing(rules: KdpRules, l: ListingInput): CheckItem[];   // title length, description, tags, keywords, categories, ISBN checksum
function isValidIsbn13(isbn: string): boolean;

interface KdpResult<T> { value: T; ruleIds: string[]; warnings: string[] }
interface EbookRoyalty { royalty: number; royaltyRounded: number; vat: number; deliveryCost: number; priceInBand: boolean }
interface WrapSize { widthIn: number; heightIn: number; spineIn: number; bleedIn: number; trim: TrimSize; pages: number; paper: Paper }
interface CheckItem { id: string; label: string; level: 'pass' | 'warn' | 'fail'; detail: string; factIds?: string[]; ruleIds?: string[] }
```

Worked examples under test: GBP 2.99, 2 MB, 70% = GBP 1.953 (1.95); 55 pages cost GBP 1.93; 200 pages cost GBP 2.85;
minimum price for GBP 2.85 is GBP 5.70; 50% at GBP 7.98, 60% at GBP 7.99; spine and wrap for 120, 200 and 300 pages;
title 199 characters pass, 200 fail; description of 4,001 characters including tags fails.

Notes: the printing cost bands overlap at 110 pages (the flat band is used, with a warning); large-trim page bands are
not in the rules file, so the regular boundaries are used with a warning; trims other than 6 x 9 in use the lowest
maximum page count across options with a warning.

## Themes and cover styles (`src/theme.ts`)

```ts
const DEFAULT_INTERIOR_THEME: InteriorTheme;   // the P02 look: Source Sans 3 body, Plus Jakarta Sans headings
const DEFAULT_COVER_STYLE: CoverStyle;
const HOUSE_MARGINS: Record<string, MarginsIn>; // docs/06-EXPORT-SPEC.md margins table
function normaliseInteriorTheme(raw: unknown, base?: InteriorTheme): InteriorTheme;
function interiorThemesFromConfig(raw: unknown): InteriorTheme[];
function normaliseCoverStyle(raw: unknown, base?: CoverStyle, paletteId?: string): CoverStyle;
function coverStylesFromConfig(raw: unknown): CoverStyle[];
function marginsFor(theme: InteriorTheme, trim: TrimKey, kdpMinInsideIn?: number): MarginsIn;
function parseTrimKey(key: string): { widthIn: number; heightIn: number };   // "6x9"
function trimKey(widthIn: number, heightIn: number): TrimKey;
function numberToWords(n: number): string;
```

`InteriorTheme` holds fonts (body, heading, display, running head), weights, sizes (body, chapter title, subheading,
kicker, running head, folio, small, title page), leading, paragraph (indent, alignment, hyphenation), margins per trim
plus `extraInsideIn`, opener (style classic, centred, minimal, number or rule; sink; rule; ornament; dropFolio;
numberFormat numerals, words, roman or none), scene break, running heads (left and right content, style), drop caps,
colours and `chapterStart` ('right' or 'any'). The normaliser reads `config/interior-themes.json` as it is today
(bodyFont, headingFont, accentFont, sizes.lineHeight, text, margins.extraInsideIn, chapterOpener, runningHeads as free
text, dropCaps, sceneBreak.glyph with fallback) and common aliases. `CoverStyle` reads `config/cover-styles.json`
(typography, layout positions in cover-width percent, band, frame, motif, palettes).

## Node helpers (`@volume/core/node`)

```ts
function findRepoRoot(from?: string): string;
function loadKdpRules(root?: string, version?: string): KdpRules;   // newest dated file by default
function loadHouseStyleConfig(root?: string): unknown;
function loadHouseStyle(root?: string, extraBanned?: readonly string[]): CompiledHouseStyle;
function loadBookTemplate(id: string, root?: string): unknown;
function loadInteriorThemes(root?: string): InteriorTheme[];        // [] when the file is missing
function loadCoverStyles(root?: string): CoverStyle[];
```

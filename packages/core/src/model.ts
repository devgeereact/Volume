// Book model: the single structure every exporter walks.
// Inline text is stored as the dialect's inline Markdown (**bold**, *italic*) so a parse and
// write round trip is byte-identical; parseInline() turns it into marked runs for exporters.

import { z } from 'zod';

export const SECTION_KINDS = ['front', 'part', 'chapter', 'back'] as const;
export type SectionKind = (typeof SECTION_KINDS)[number];

/** Section subtypes. `other` is any heading the dialect does not name. */
export const SECTION_SUBTYPES = [
  'titlepage',
  'copyright',
  'contents',
  'halftitle',
  'dedication',
  'epigraph',
  'foreword',
  'preface',
  'acknowledgements',
  'introduction',
  'part',
  'chapter',
  'conclusion',
  'epilogue',
  'appendix',
  'resources',
  'glossary',
  'references',
  'about_the_author',
  'also_by',
  'review_request',
  'newsletter',
  'other',
] as const;
export type SectionSubtype = (typeof SECTION_SUBTYPES)[number];

export interface InlineRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

export interface ParagraphBlock {
  type: 'paragraph';
  /** Inline Markdown: **bold** and *italic*. */
  text: string;
}
export interface Heading2Block {
  type: 'heading2';
  text: string;
}
/** A sub-subheading: `### ` (level 3, the default) or `#### ` (level 4) in the dialect. */
export interface Heading3Block {
  type: 'heading3';
  text: string;
  /** 4 for a `#### ` heading. Absent means level 3. */
  level?: 4;
}
export interface ListBlock {
  type: 'list';
  ordered?: boolean;
  items: string[];
}
export interface TableBlock {
  type: 'table';
  /** First row is the header row. */
  rows: string[][];
}
export interface SceneBreakBlock {
  type: 'sceneBreak';
}
export interface QuoteBlock {
  type: 'quote';
  /** `epigraph` is the `::: epigraph` block (owner-supplied quotes only); `quote` is a `> ` line. */
  variant: 'epigraph' | 'quote';
  lines: string[];
  attribution?: string;
}
export interface TakeawaysBlock {
  type: 'takeaways';
  items: string[];
}
export interface CalloutBlock {
  type: 'callout';
  /** `demo` (P02), `exercise`, `lines 5`, `note` or any other fenced block name. */
  variant: string;
  text: string;
}
export interface ImageBlock {
  type: 'image';
  /** A data: URL, or a key looked up in the exporter's `images` option. */
  src: string;
  alt: string;
  caption?: string;
}
export interface PageBreakBlock {
  type: 'pageBreak';
}

export type Block =
  | ParagraphBlock
  | Heading2Block
  | Heading3Block
  | ListBlock
  | TableBlock
  | SceneBreakBlock
  | QuoteBlock
  | TakeawaysBlock
  | CalloutBlock
  | ImageBlock
  | PageBreakBlock;

export interface Section {
  /** Stable anchor id, unique in the book (slug of the heading). */
  id: string;
  kind: SectionKind;
  subtype: SectionSubtype;
  /** Display title. For chapters the part after "Chapter N: ". */
  title: string;
  /** "Chapter 1" for chapters, "Part I" for parts, otherwise absent. */
  kicker?: string;
  /** Chapter number when the heading is "Chapter N: ...". */
  number?: number;
  /** Raw lines for fenced front blocks (titlepage, halftitle). */
  lines?: string[];
  blocks: Block[];
  /** False when the owner switched the section off. Exporters skip it. Defaults to true. */
  enabled?: boolean;
  /** True when the heading carried an explicit `{kind=...}` marker (kept for round trip). */
  explicitKind?: boolean;
}

export interface ListingInfo {
  /** Amazon description, may contain the allowed HTML tags. */
  description?: string;
  keywords?: string[];
  categories?: string[];
}

export interface BookMeta {
  title: string;
  subtitle?: string;
  /** Pen name. */
  author: string;
  edition?: string;
  /** Extra title page lines after the edition. */
  titlePageNotes?: string[];
  language: string;
  year?: number;
  imprint?: string;
  isbnPrint?: string;
  isbnEbook?: string;
  /** Project id or other stable id; used for the EPUB urn:uuid when no eBook ISBN. */
  identifier?: string;
  /** Blueprint summary (TXT SUMMARY block). */
  summary?: string;
  listing?: ListingInfo;
}

export interface BookDoc {
  meta: BookMeta;
  sections: Section[];
}

// ---------- zod schemas ----------

export const inlineRunSchema = z.object({
  text: z.string(),
  bold: z.boolean().optional(),
  italic: z.boolean().optional(),
});

export const blockSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('paragraph'), text: z.string() }),
  z.object({ type: z.literal('heading2'), text: z.string() }),
  z.object({ type: z.literal('heading3'), text: z.string(), level: z.literal(4).optional() }),
  z.object({ type: z.literal('list'), ordered: z.boolean().optional(), items: z.array(z.string()) }),
  z.object({ type: z.literal('table'), rows: z.array(z.array(z.string())) }),
  z.object({ type: z.literal('sceneBreak') }),
  z.object({
    type: z.literal('quote'),
    variant: z.enum(['epigraph', 'quote']),
    lines: z.array(z.string()),
    attribution: z.string().optional(),
  }),
  z.object({ type: z.literal('takeaways'), items: z.array(z.string()) }),
  z.object({ type: z.literal('callout'), variant: z.string(), text: z.string() }),
  z.object({ type: z.literal('image'), src: z.string(), alt: z.string(), caption: z.string().optional() }),
  z.object({ type: z.literal('pageBreak') }),
]);

export const sectionSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(SECTION_KINDS),
  subtype: z.enum(SECTION_SUBTYPES),
  title: z.string(),
  kicker: z.string().optional(),
  number: z.number().int().positive().optional(),
  lines: z.array(z.string()).optional(),
  blocks: z.array(blockSchema),
  enabled: z.boolean().optional(),
  explicitKind: z.boolean().optional(),
});

export const bookMetaSchema = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  author: z.string().min(1),
  edition: z.string().optional(),
  titlePageNotes: z.array(z.string()).optional(),
  language: z.string().min(2),
  year: z.number().int().optional(),
  imprint: z.string().optional(),
  isbnPrint: z.string().optional(),
  isbnEbook: z.string().optional(),
  identifier: z.string().optional(),
  summary: z.string().optional(),
  listing: z
    .object({
      description: z.string().optional(),
      keywords: z.array(z.string()).optional(),
      categories: z.array(z.string()).optional(),
    })
    .optional(),
});

export const bookDocSchema = z.object({
  meta: bookMetaSchema,
  sections: z.array(sectionSchema),
});

/** Sections that exporters print (enabled ones). */
export function enabledSections(book: BookDoc): Section[] {
  return book.sections.filter((s) => s.enabled !== false);
}

/** "Chapter 1: Title" for chapters, "Part I: Title" for parts, otherwise the title. */
export function sectionHeading(s: Section): string {
  return s.kicker ? `${s.kicker}: ${s.title}` : s.title;
}

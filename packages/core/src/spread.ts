// Picture-book spreads (phase 7, P7-2, D-044): the model, the page plan, the page geometry with bleed and the safe
// area, and the checks. Every size comes from the KDP rules object (kdp.ts); nothing is typed in from memory.
//
// Page sides follow print: page 1 is a right-hand page (recto), so odd pages are right and even pages are left. A
// spread is a left page and the right page facing it, so every spread starts on an even page.

import { z } from 'zod';
import { bleedEdgesIn, colourPageRange, interiorBleedSizeIn, safeAreaIn, type ColourInk, type KdpRules, type SafeAreaIn, type TrimSize } from './kdp.ts';
import { bookMetaSchema, sectionSchema, type Block, type BookDoc, type BookMeta, type Section } from './model.ts';
import { countWords } from './text.ts';

/** Where the text sits on a spread; the picture keeps that area calm. Same values as `SPREAD_LAYOUTS` in @volume/ai. */
export const SPREAD_LAYOUTS = ['text-left', 'text-right', 'text-top', 'text-bottom'] as const;
export type SpreadLayout = (typeof SPREAD_LAYOUTS)[number];

export interface Spread {
  /** 1-based spread number. */
  n: number;
  /** Story text for the spread: inline Markdown, paragraphs split by a blank line. */
  text: string;
  /** Key of the 2:1 picture in the exporter's `images` map; null until the image is made. */
  imageKey: string | null;
  layout: SpreadLayout;
  /** One line about the scene (from the story stage), for the owner and the image prompt. */
  sceneSummary: string;
}

export interface PictureBookDoc {
  meta: BookMeta;
  /** Front matter, one printed page each (title page, copyright, today's new word, dedication). */
  front: Section[];
  spreads: Spread[];
  /** Back matter, one printed page each (about the author, goodnight, new words, also by). */
  back: Section[];
}

export const spreadSchema = z.object({
  n: z.number().int().positive(),
  text: z.string(),
  imageKey: z.string().min(1).nullable(),
  layout: z.enum(SPREAD_LAYOUTS),
  sceneSummary: z.string(),
});

export const pictureBookDocSchema = z.object({
  meta: bookMetaSchema,
  front: z.array(sectionSchema),
  spreads: z.array(spreadSchema),
  back: z.array(sectionSchema),
});

// ---------- page plan ----------

/** `left` is a verso (even page), `right` a recto (odd page). */
export type PageSide = 'left' | 'right';

export type PictureBookPage =
  { kind: 'matter'; sectionId: string; side: PageSide } | { kind: 'blank'; side: PageSide } | { kind: 'spread'; n: number; side: PageSide };

export const sideOfPage = (page: number): PageSide => (page % 2 === 1 ? 'right' : 'left');

const enabled = (secs: Section[]) => secs.filter((s) => s.enabled !== false);

/**
 * Every printed page in order: front matter one page each, a blank page if needed so the first spread starts on a
 * left page, each spread as a left and a right page, back matter one page each, and a blank page at the end if the
 * count is odd (a printed book has an even number of pages).
 */
export function pictureBookPages(doc: PictureBookDoc): PictureBookPage[] {
  const pages: PictureBookPage[] = [];
  const next = () => sideOfPage(pages.length + 1);
  for (const s of enabled(doc.front)) pages.push({ kind: 'matter', sectionId: s.id, side: next() });
  if (doc.spreads.length && next() === 'right') pages.push({ kind: 'blank', side: 'right' });
  for (const sp of doc.spreads) {
    pages.push({ kind: 'spread', n: sp.n, side: 'left' });
    pages.push({ kind: 'spread', n: sp.n, side: 'right' });
  }
  for (const s of enabled(doc.back)) pages.push({ kind: 'matter', sectionId: s.id, side: next() });
  if (pages.length % 2 === 1) pages.push({ kind: 'blank', side: next() });
  return pages;
}

/**
 * Default matter for the shortest picture book (plan PHASES-6-8 section 7, question 4): title page, copyright and
 * today's new word before the spreads (an odd number, so the first spread opens on a left page), about the author
 * after. "Also by" and the optional pages add pages on top.
 */
export const DEFAULT_PICTURE_BOOK_MATTER = { frontPages: 3, backPages: 1 } as const;

export interface PictureBookPlan {
  pages: number;
  spreads: number;
  frontPages: number;
  backPages: number;
  ruleIds: string[];
  warnings: string[];
}

/**
 * The shortest book KDP prints in colour on this trim and ink (rule paperback.trimAndPages.colour), filled with spreads
 * after the matter pages. With today's rules, premium colour on 8.5 x 8.5 in gives 24 pages = 10 spreads + 4 matter pages.
 */
export function defaultPictureBookPlan(
  rules: KdpRules,
  trim: TrimSize,
  ink: ColourInk,
  matter: { frontPages: number; backPages: number } = DEFAULT_PICTURE_BOOK_MATTER,
): PictureBookPlan {
  const range = colourPageRange(rules, trim, ink);
  const lead = matter.frontPages % 2 === 1 ? matter.frontPages : matter.frontPages + 1; // blank page before spread 1
  const spreads = Math.max(0, Math.floor((range.value.min - lead - matter.backPages) / 2));
  const used = lead + spreads * 2 + matter.backPages;
  const pages = used % 2 === 1 ? used + 1 : used;
  const warnings = [...range.warnings];
  if (pages !== range.value.min) warnings.push(`The matter pages do not fill ${range.value.min} pages exactly; the plan has ${pages} pages.`);
  return { pages, spreads, frontPages: matter.frontPages, backPages: matter.backPages, ruleIds: range.ruleIds, warnings };
}

// ---------- geometry ----------

/** A box on a page, in inches from the top-left corner of the page with bleed. */
export interface RectIn {
  xIn: number;
  yIn: number;
  widthIn: number;
  heightIn: number;
}

export interface PictureBookGeometry {
  trim: TrimSize;
  /** Page size with bleed: the size of every PDF page. */
  page: TrimSize;
  bleed: { outsideIn: number; topIn: number; bottomIn: number };
  /** Minimum distance of text from each trim edge. */
  safe: SafeAreaIn;
  pageCount: number;
  ruleIds: string[];
  warnings: string[];
}

/** Page size, bleed and safe area for a picture book of `pageCount` pages (rules print.bleed, paperback.interiorMargins). */
export function pictureBookGeometry(rules: KdpRules, trim: TrimSize, pageCount: number): PictureBookGeometry {
  const safe = safeAreaIn(rules, trim, pageCount);
  return {
    trim,
    page: interiorBleedSizeIn(rules, trim),
    bleed: bleedEdgesIn(rules),
    safe: safe.value,
    pageCount,
    ruleIds: ['print.bleed', ...safe.ruleIds],
    warnings: safe.warnings,
  };
}

/** The trim box on a page: a left page has its bleed on the left (outside), a right page on the right. */
export function trimBoxIn(g: PictureBookGeometry, side: PageSide): RectIn {
  return { xIn: side === 'left' ? g.bleed.outsideIn : 0, yIn: g.bleed.topIn, widthIn: g.trim.widthIn, heightIn: g.trim.heightIn };
}

/** The area text must stay inside on a page. */
export function safeRectIn(g: PictureBookGeometry, side: PageSide): RectIn {
  const t = trimBoxIn(g, side);
  const left = side === 'left' ? g.safe.outsideIn : g.safe.insideIn;
  const right = side === 'left' ? g.safe.insideIn : g.safe.outsideIn;
  return { xIn: t.xIn + left, yIn: t.yIn + g.safe.topIn, widthIn: t.widthIn - left - right, heightIn: t.heightIn - g.safe.topIn - g.safe.bottomIn };
}

/** Distance in inches each edge of `inner` sticks out of `outer` (0 when inside). */
export function overflowIn(inner: RectIn, outer: RectIn): { top: number; right: number; bottom: number; left: number } {
  const pos = (v: number) => Math.max(0, Math.round(v * 10_000) / 10_000);
  return {
    top: pos(outer.yIn - inner.yIn),
    right: pos(inner.xIn + inner.widthIn - (outer.xIn + outer.widthIn)),
    bottom: pos(inner.yIn + inner.heightIn - (outer.yIn + outer.heightIn)),
    left: pos(outer.xIn - inner.xIn),
  };
}

export interface TextBoxIn {
  /** 1-based page in the PDF. */
  page: number;
  rect: RectIn;
  /** What the box holds, for the message ("spread 3"). */
  label: string;
}

export interface SafeAreaFinding {
  page: number;
  label: string;
  overflow: { top: number; right: number; bottom: number; left: number };
  message: string;
}

/**
 * Text boxes that leave the safe area of their page. `toleranceIn` absorbs layout rounding (default half a point).
 */
export function checkTextInSafeArea(g: PictureBookGeometry, boxes: readonly TextBoxIn[], toleranceIn = 0.5 / 72): SafeAreaFinding[] {
  const out: SafeAreaFinding[] = [];
  for (const b of boxes) {
    const o = overflowIn(b.rect, safeRectIn(g, sideOfPage(b.page)));
    const edges = (Object.entries(o) as [keyof typeof o, number][]).filter(([, v]) => v > toleranceIn);
    if (edges.length)
      out.push({
        page: b.page,
        label: b.label,
        overflow: o,
        message: `Text of ${b.label} on page ${b.page} is outside the safe area by ${edges.map(([k, v]) => `${v.toFixed(3)} in (${k})`).join(', ')}.`,
      });
  }
  return out;
}

// ---------- checks ----------

export type PictureBookFindingCode =
  | 'picture.no-spreads'
  | 'picture.spread-image'
  | 'picture.spread-text'
  | 'picture.spread-numbering'
  | 'picture.spread-count'
  | 'picture.words-per-spread'
  | 'picture.page-count';

export interface PictureBookFinding {
  code: PictureBookFindingCode;
  severity: 'warn' | 'block';
  message: string;
  /** Spread number, when the finding is about one spread. */
  spread?: number;
}

const rangeSchema = z.object({ min: z.number().int().min(0), max: z.number().int().min(0) });
/** The subset of a picture-book template the checks read (`spreads.count`, `spreads.wordsPerSpread`). */
export const pictureBookRulesSchema = z.object({
  count: rangeSchema.partial().optional(),
  wordsPerSpread: rangeSchema.partial().optional(),
});
export type PictureBookRules = z.infer<typeof pictureBookRulesSchema>;

export function pictureBookRulesFromTemplate(template: unknown): PictureBookRules {
  const spreads = typeof template === 'object' && template !== null ? (template as Record<string, unknown>)['spreads'] : undefined;
  return pictureBookRulesSchema.parse(spreads ?? {});
}

/**
 * Check a picture book: spreads exist, are numbered 1 to N, each has an image and text, words per spread and spread
 * count within the template, and the page count within KDP's colour range for the trim and ink.
 */
export function checkPictureBook(
  doc: PictureBookDoc,
  opts: { rules: KdpRules; trim: TrimSize; ink: ColourInk; template?: PictureBookRules },
): PictureBookFinding[] {
  const out: PictureBookFinding[] = [];
  if (!doc.spreads.length) out.push({ code: 'picture.no-spreads', severity: 'block', message: 'The book has no spreads.' });
  doc.spreads.forEach((sp, k) => {
    if (sp.n !== k + 1)
      out.push({
        code: 'picture.spread-numbering',
        severity: 'warn',
        spread: sp.n,
        message: `Spread ${sp.n} is in position ${k + 1}; number the spreads 1 to ${doc.spreads.length}.`,
      });
    if (!sp.imageKey) out.push({ code: 'picture.spread-image', severity: 'block', spread: sp.n, message: `Spread ${sp.n} has no picture.` });
    if (!sp.text.trim()) out.push({ code: 'picture.spread-text', severity: 'block', spread: sp.n, message: `Spread ${sp.n} has no text.` });
    const words = countWords(sp.text);
    const w = opts.template?.wordsPerSpread;
    if (sp.text.trim() && w && ((w.min !== undefined && words < w.min) || (w.max !== undefined && words > w.max)))
      out.push({
        code: 'picture.words-per-spread',
        severity: 'warn',
        spread: sp.n,
        message: `Spread ${sp.n} has ${words} words (template ${w.min ?? 0} to ${w.max ?? 'any'}).`,
      });
  });
  const c = opts.template?.count;
  if (c && doc.spreads.length && ((c.min !== undefined && doc.spreads.length < c.min) || (c.max !== undefined && doc.spreads.length > c.max)))
    out.push({ code: 'picture.spread-count', severity: 'warn', message: `${doc.spreads.length} spreads (template ${c.min ?? 0} to ${c.max ?? 'any'}).` });
  const pages = pictureBookPages(doc).length;
  const range = colourPageRange(opts.rules, opts.trim, opts.ink);
  if (pages < range.value.min || pages > range.value.max)
    out.push({
      code: 'picture.page-count',
      severity: 'block',
      message: `${pages} pages; KDP prints ${opts.ink} colour on ${opts.trim.widthIn} x ${opts.trim.heightIn} in from ${range.value.min} to ${range.value.max} pages.`,
    });
  return out;
}

// ---------- conversion ----------

/** Paragraph blocks of a spread's text (split on blank lines). */
export function spreadBlocks(sp: Spread): Block[] {
  return sp.text
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((text) => ({ type: 'paragraph', text }));
}

/** Section id of a spread when the book is seen as a BookDoc. */
export const spreadSectionId = (n: number) => `spread-${n}`;

/**
 * The picture book as a BookDoc (front, one chapter section per spread, back), so house style, guardrails, the
 * about-the-author check and the TXT and MD writers work on it unchanged.
 */
export function pictureBookToBookDoc(doc: PictureBookDoc): BookDoc {
  const spreads: Section[] = doc.spreads.map((sp) => ({
    id: spreadSectionId(sp.n),
    kind: 'chapter',
    subtype: 'chapter',
    title: `Spread ${sp.n}`,
    blocks: spreadBlocks(sp),
  }));
  return { meta: doc.meta, sections: [...doc.front, ...spreads, ...doc.back] };
}

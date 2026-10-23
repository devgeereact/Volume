// Interior themes and cover styles: typed shapes, built-in defaults, and lenient normalisers for
// config/interior-themes.json and config/cover-styles.json (D-017). The normalisers read the shapes those files use
// today (bodyFont, sizes.lineHeight, chapterOpener, palettes, layout in cover-width units) and common aliases, and
// fill gaps from the defaults. Pure: the caller reads the files.

export type TrimKey = '5x8' | '5.25x8' | '5.5x8.5' | '6x9' | '7x10' | '8.5x8.5' | '8.5x11' | (string & {});

export interface MarginsIn {
  topIn: number;
  bottomIn: number;
  insideIn: number;
  outsideIn: number;
}

/** House margins from docs/book-production/EXPORT-SPEC.md (Print PDF, Margins). Not KDP minimums: preflight checks those. */
export const HOUSE_MARGINS: Record<string, MarginsIn> = {
  '5x8': { topIn: 0.7, bottomIn: 0.75, insideIn: 0.75, outsideIn: 0.5 },
  '5.5x8.5': { topIn: 0.72, bottomIn: 0.78, insideIn: 0.78, outsideIn: 0.52 },
  '6x9': { topIn: 0.75, bottomIn: 0.8, insideIn: 0.8, outsideIn: 0.55 },
  '8.5x11': { topIn: 0.9, bottomIn: 0.95, insideIn: 0.9, outsideIn: 0.7 },
};

export function parseTrimKey(key: string): { widthIn: number; heightIn: number } {
  const m = /^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/.exec(key.replace(/\s*in$/, '').trim());
  if (!m) throw new Error(`Bad trim "${key}". Use for example "6x9".`);
  return { widthIn: Number(m[1]), heightIn: Number(m[2]) };
}

function houseMargins(trim: TrimKey): MarginsIn {
  const house = HOUSE_MARGINS[trim];
  if (house) return house;
  const { widthIn } = parseTrimKey(trim);
  const nearest = Object.entries(HOUSE_MARGINS).sort(
    (a, b) => Math.abs(parseTrimKey(a[0]).widthIn - widthIn) - Math.abs(parseTrimKey(b[0]).widthIn - widthIn),
  )[0];
  return nearest ? nearest[1] : { topIn: 0.75, bottomIn: 0.8, insideIn: 0.8, outsideIn: 0.55 };
}

/**
 * Margins for a trim: the house table (or the nearest house trim), overridden by the theme's own values for that trim
 * (or its "*" values). When the KDP minimum inside margin for the page count is known, the inside margin is at least
 * that minimum plus the theme's extraInsideIn.
 */
export function marginsFor(theme: InteriorTheme, trim: TrimKey, kdpMinInsideIn?: number): MarginsIn {
  const base = houseMargins(trim);
  const own = theme.margins?.[trim] ?? theme.margins?.['*'] ?? {};
  const m: MarginsIn = { ...base, ...own };
  if (kdpMinInsideIn !== undefined) m.insideIn = Math.max(m.insideIn, kdpMinInsideIn + (theme.extraInsideIn ?? 0));
  return m;
}

export type OpenerStyle = 'classic' | 'centred' | 'minimal' | 'number' | 'rule';
export type RunningHeadStyle = 'small-caps' | 'italic' | 'caps' | 'plain';
export type RunningHeadContent = 'book-title' | 'author' | 'chapter-title' | 'none';
export type NumberFormat = 'numerals' | 'words' | 'roman' | 'none';

export interface InteriorTheme {
  id: string;
  name: string;
  fonts: {
    /** Family names; files are resolved by the exporter from assets/fonts and Fontsource packages. */
    body: string;
    heading: string;
    display: string;
    runningHead: string;
  };
  weights: { body: number; bold: number; heading: number; display: number; subheading: number };
  sizes: {
    bodyPt: number;
    chapterTitlePt: number;
    subheadingPt: number;
    kickerPt: number;
    /** The "Chapter 3" label on chapter and part openers (defaults to kickerPt). */
    chapterLabelPt: number;
    runningHeadPt: number;
    folioPt: number;
    smallPt: number;
    titlePagePt: number;
  };
  /** Line height as a multiple of the body size. */
  leading: number;
  /** spaceLines: blank lines between body paragraphs (block paragraphs); 0 for none. */
  paragraph: { indentEm: number; align: 'justify' | 'left'; hyphenate: boolean; spaceLines: number };
  /** Per-trim (or "*") overrides of the house margins. */
  margins?: Partial<Record<string, Partial<MarginsIn>>>;
  /** Extra inside margin added to the KDP minimum for the page count (interior-themes.json margins.extraInsideIn). */
  extraInsideIn?: number;
  opener: {
    style: OpenerStyle;
    /** Space above the opener block (chapter sink) in inches. */
    sinkIn: number;
    kickerUppercase: boolean;
    rule: boolean;
    /** Named ornament (see ornaments in @volume/export) or an inline SVG string; "none" for nothing. */
    ornament: string;
    /** No page number on chapter opening pages. */
    dropFolio: boolean;
    /** How "Chapter 3" is printed: Chapter 3, Chapter Three, Chapter III, or no kicker. */
    numberFormat: NumberFormat;
    /** The opener (label and title) sits alone on its page, vertically centred; the text starts on the next page. */
    ownPage: boolean;
    /** Chapter titles in capitals. */
    titleUppercase: boolean;
  };
  /** Subheadings (h2) inside chapters: each on a new page, in capitals, left or centred. */
  sections: { newPage: boolean; uppercase: boolean; align: 'left' | 'center' };
  sceneBreak: string;
  runningHeads: { enabled: boolean; style: RunningHeadStyle; left: RunningHeadContent; right: RunningHeadContent };
  dropCaps: { enabled: boolean; lines: number };
  /** label: the "Chapter 3" kicker on openers (defaults to muted). */
  colours: { text: string; accent: string; muted: string; label: string };
  /** Page numbers: on or off, at the outside corner or centred at the foot. */
  folios: { enabled: boolean; position: 'outside' | 'center' };
  /** Chapters and parts open on a right-hand page (D-013) or on any page. */
  chapterStart: 'right' | 'any';
}

/** Built-in default: the proven P02 demo-book look (Source Sans 3 body, Plus Jakarta Sans headings). */
export const DEFAULT_INTERIOR_THEME: InteriorTheme = {
  id: 'volume-default',
  name: 'Volume default',
  fonts: { body: 'Source Sans 3', heading: 'Plus Jakarta Sans', display: 'Plus Jakarta Sans', runningHead: 'Source Sans 3' },
  weights: { body: 400, bold: 700, heading: 800, display: 800, subheading: 600 },
  sizes: {
    bodyPt: 10.6,
    chapterTitlePt: 21,
    subheadingPt: 11.6,
    kickerPt: 8.4,
    chapterLabelPt: 8.4,
    runningHeadPt: 8.6,
    folioPt: 9,
    smallPt: 8.6,
    titlePagePt: 30,
  },
  leading: 1.48,
  paragraph: { indentEm: 1.3, align: 'justify', hyphenate: true, spaceLines: 0 },
  opener: {
    style: 'classic',
    sinkIn: 1.05,
    kickerUppercase: true,
    rule: true,
    ornament: 'sprig',
    dropFolio: false,
    numberFormat: 'numerals',
    ownPage: false,
    titleUppercase: false,
  },
  sections: { newPage: false, uppercase: false, align: 'left' },
  sceneBreak: '* * *',
  runningHeads: { enabled: true, style: 'small-caps', left: 'book-title', right: 'chapter-title' },
  dropCaps: { enabled: false, lines: 3 },
  colours: { text: '#111111', accent: '#111111', muted: '#555555', label: '#555555' },
  folios: { enabled: true, position: 'outside' },
  chapterStart: 'right',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
/** Key comparison ignores case, punctuation and a trailing unit (bodyPt == body, topIn == top). */
const norm = (k: string) =>
  k
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/(pt|in|em|px|pct)$/, '');

/** Find the first key (case, punctuation and unit insensitive) among aliases. */
function pick(obj: unknown, ...aliases: string[]): unknown {
  if (!isObj(obj)) return undefined;
  for (const a of aliases.map(norm)) for (const [k, v] of Object.entries(obj)) if (norm(k) === a) return v;
  return undefined;
}
const asNum = (v: unknown): number | undefined => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') {
    const m = /^\s*(-?\d+(?:\.\d+)?)\s*(pt|in|em)?\s*$/.exec(v);
    if (m) return Number(m[1]);
  }
  return undefined;
};
const asStr = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/** Family name from "Literata", { family: "Literata" }, or a CSS stack "'Literata', serif". */
function familyOf(v: unknown): string | undefined {
  const s = asStr(v) ?? asStr(pick(v, 'family', 'name', 'fontFamily'));
  if (!s) return undefined;
  return (s.split(',')[0] ?? s).trim().replace(/^['"]|['"]$/g, '');
}

function partialMargins(m: unknown): Partial<MarginsIn> | undefined {
  if (!isObj(m)) return undefined;
  const out: Partial<MarginsIn> = {};
  const top = asNum(pick(m, 'topIn', 'top'));
  const bottom = asNum(pick(m, 'bottomIn', 'bottom', 'foot'));
  const inside = asNum(pick(m, 'insideIn', 'inside', 'gutter', 'inner'));
  const outside = asNum(pick(m, 'outsideIn', 'outside', 'outer'));
  if (top !== undefined) out.topIn = top;
  if (bottom !== undefined) out.bottomIn = bottom;
  if (inside !== undefined) out.insideIn = inside;
  if (outside !== undefined) out.outsideIn = outside;
  return Object.keys(out).length ? out : undefined;
}

function marginsOf(v: unknown): Partial<Record<string, Partial<MarginsIn>>> | undefined {
  if (!isObj(v)) return undefined;
  const flat = partialMargins(v);
  if (flat) return { '*': flat };
  const out: Partial<Record<string, Partial<MarginsIn>>> = {};
  for (const [k, m] of Object.entries(v)) {
    const mm = partialMargins(m);
    if (mm) out[k.replace(/\s+/g, '').replace(/in$/, '')] = mm;
  }
  return Object.keys(out).length ? out : undefined;
}

/** "Author on left pages, book title on right pages, small caps" and similar free text. */
function headContent(text: string, side: 'left' | 'right'): RunningHeadContent | undefined {
  const re = side === 'left' ? /([a-z ]+?)\s+(?:on\s+)?left/i : /([a-z ]+?)\s+(?:on\s+)?right/i;
  const m = re.exec(text);
  if (!m?.[1]) return undefined;
  const what = (m[1].split(',').pop() ?? '').toLowerCase();
  if (what.includes('author')) return 'author';
  if (what.includes('chapter')) return 'chapter-title';
  if (what.includes('book') || what.includes('series') || what.includes('title')) return 'book-title';
  return undefined;
}

/** Characters every OFL text font here carries; other scene-break glyphs use the theme's fallback. */
const SAFE_GLYPHS = /^[\x20-\x7E·•\u00A0~]*$/;

/**
 * Accept one theme entry from config/interior-themes.json (any reasonable shape) and return a full InteriorTheme.
 * Unknown keys are ignored; missing values come from `base` (default DEFAULT_INTERIOR_THEME).
 */
export function normaliseInteriorTheme(raw: unknown, base: InteriorTheme = DEFAULT_INTERIOR_THEME): InteriorTheme {
  const t = clone(base);
  if (!isObj(raw)) return t;
  t.id = asStr(pick(raw, 'id', 'slug', 'key')) ?? t.id;
  t.name = asStr(pick(raw, 'name', 'label', 'title')) ?? t.name;

  const fonts = pick(raw, 'fonts', 'typefaces', 'typography');
  const bodyF = pick(fonts, 'body', 'text', 'bodyFont') ?? pick(raw, 'bodyFont');
  const headF = pick(fonts, 'heading', 'headings', 'headingFont') ?? pick(raw, 'headingFont');
  const dispF = pick(fonts, 'display', 'accent', 'chapterTitle') ?? pick(raw, 'displayFont', 'accentFont') ?? headF;
  const rhF = pick(fonts, 'runningHead', 'runningHeads', 'header');
  t.fonts.body = familyOf(bodyF) ?? t.fonts.body;
  t.fonts.heading = familyOf(headF) ?? t.fonts.heading;
  t.fonts.display = familyOf(dispF) ?? t.fonts.heading;
  t.fonts.runningHead = familyOf(rhF) ?? t.fonts.body;
  t.weights.body = asNum(pick(bodyF, 'weight')) ?? t.weights.body;
  t.weights.heading = asNum(pick(headF, 'weight')) ?? asNum(pick(raw, 'headingWeight')) ?? t.weights.heading;
  t.weights.display = asNum(pick(dispF, 'weight')) ?? t.weights.heading;

  const sizes = pick(raw, 'sizes', 'size', 'fontSizes');
  t.sizes.bodyPt = asNum(pick(sizes, 'body', 'text')) ?? asNum(pick(bodyF, 'size')) ?? asNum(pick(raw, 'bodySize', 'fontSize', 'body')) ?? t.sizes.bodyPt;
  t.sizes.chapterTitlePt = asNum(pick(sizes, 'chapterTitle', 'chapter', 'h1', 'title')) ?? asNum(pick(dispF, 'size')) ?? t.sizes.chapterTitlePt;
  t.sizes.subheadingPt = asNum(pick(sizes, 'subheading', 'h2', 'subhead', 'heading')) ?? t.sizes.subheadingPt;
  t.sizes.kickerPt = asNum(pick(sizes, 'kicker', 'chapterNumber', 'label')) ?? Math.max(7.5, Math.round(t.sizes.bodyPt * 0.8 * 10) / 10);
  t.sizes.chapterLabelPt = asNum(pick(sizes, 'chapterLabel', 'openerLabel')) ?? t.sizes.kickerPt;
  t.sizes.runningHeadPt = asNum(pick(sizes, 'runningHead', 'header')) ?? Math.max(7.5, Math.round(t.sizes.bodyPt * 0.82 * 10) / 10);
  t.sizes.folioPt = asNum(pick(sizes, 'folio', 'pageNumber')) ?? Math.max(8, Math.round(t.sizes.bodyPt * 0.85 * 10) / 10);
  t.sizes.smallPt = asNum(pick(sizes, 'small', 'copyright', 'caption', 'footnote')) ?? t.sizes.smallPt;
  t.sizes.titlePagePt = asNum(pick(sizes, 'titlePage', 'bookTitle')) ?? Math.max(t.sizes.titlePagePt, t.sizes.chapterTitlePt * 1.2);

  const leading =
    asNum(pick(raw, 'leading', 'lineHeight', 'lineSpacing')) ?? asNum(pick(sizes, 'leading', 'lineHeight')) ?? asNum(pick(bodyF, 'leading', 'lineHeight'));
  if (leading !== undefined) t.leading = leading > 4 ? leading / t.sizes.bodyPt : leading; // 15.5 (pt) or 1.45
  const para = pick(raw, 'paragraph', 'paragraphs', 'text', 'body');
  t.paragraph.indentEm =
    asNum(pick(para, 'indent', 'paragraphIndent', 'firstLineIndent')) ?? asNum(pick(raw, 'indent', 'paragraphIndent')) ?? t.paragraph.indentEm;
  const align = asStr(pick(para, 'align', 'alignment')) ?? asStr(pick(raw, 'align', 'alignment', 'justification'));
  if (align) t.paragraph.align = /left|rag/i.test(align) ? 'left' : 'justify';
  t.paragraph.hyphenate = asBool(pick(para, 'hyphenate', 'hyphens')) ?? asBool(pick(raw, 'hyphenate', 'hyphenation')) ?? t.paragraph.hyphenate;
  t.paragraph.spaceLines = asNum(pick(para, 'spaceLines', 'paragraphSpaceLines', 'spaceBetweenLines')) ?? t.paragraph.spaceLines;

  const marginsRaw = pick(raw, 'margins', 'margin');
  const margins = marginsOf(marginsRaw);
  if (margins) t.margins = margins;
  const extra = asNum(pick(marginsRaw, 'extraInside', 'insideExtra'));
  if (extra !== undefined) t.extraInsideIn = extra;

  const opener = pick(raw, 'opener', 'chapterOpener', 'openers', 'chapterOpening');
  const style = asStr(opener) ?? asStr(pick(opener, 'style', 'type', 'layout'));
  if (style) {
    const s = style.toLowerCase();
    t.opener.style = /centr|center/.test(s)
      ? 'centred'
      : /(huge|large|big)[a-z ]*number|number[a-z ]*(large|huge|big)|numeral|square|block|bar/.test(s)
        ? 'number'
        : /rule|line|hairline/.test(s)
          ? 'rule'
          : /minimal|plain|no chapter openers/.test(s)
            ? 'minimal'
            : 'classic';
  }
  t.opener.sinkIn =
    asNum(pick(opener, 'sinkIn', 'sink', 'dropIn', 'topSpaceIn')) ?? (style && /third down|set low|low on/i.test(style) ? 1.9 : t.opener.sinkIn);
  t.opener.rule = asBool(pick(opener, 'rule', 'showRule')) ?? (style ? /rule|hairline|line/i.test(style) || t.opener.style === 'classic' : t.opener.rule);
  t.opener.kickerUppercase = asBool(pick(opener, 'kickerUppercase', 'uppercaseKicker')) ?? t.opener.kickerUppercase;
  t.opener.dropFolio = asBool(pick(opener, 'dropFolio', 'noFolio')) ?? t.opener.dropFolio;
  const nf = asStr(pick(opener, 'numberFormat', 'numbering'));
  if (nf) t.opener.numberFormat = /word/i.test(nf) ? 'words' : /roman/i.test(nf) ? 'roman' : /none|off/i.test(nf) ? 'none' : 'numerals';
  t.opener.ownPage = asBool(pick(opener, 'ownPage', 'alonePage', 'standalone')) ?? t.opener.ownPage;
  t.opener.titleUppercase = asBool(pick(opener, 'titleUppercase', 'uppercaseTitle')) ?? t.opener.titleUppercase;
  const secRaw = pick(raw, 'sections', 'subheadings', 'sectionHeadings');
  if (isObj(secRaw)) {
    t.sections.newPage = asBool(pick(secRaw, 'newPage', 'pageBreakBefore', 'startOnNewPage')) ?? t.sections.newPage;
    t.sections.uppercase = asBool(pick(secRaw, 'uppercase', 'caps')) ?? t.sections.uppercase;
    const sa = asStr(pick(secRaw, 'align', 'alignment'));
    if (sa) t.sections.align = /cent/i.test(sa) ? 'center' : 'left';
  }
  const orn = pick(raw, 'ornament', 'ornaments', 'fleuron') ?? pick(opener, 'ornament');
  const ornName = asStr(orn) ?? asStr(pick(orn, 'name', 'opener', 'svg', 'glyph'));
  if (ornName) t.opener.ornament = ornName;
  if (orn === false || orn === null) t.opener.ornament = 'none';
  const sbRaw = pick(raw, 'sceneBreak', 'sceneBreakGlyph');
  const glyph = asStr(sbRaw) ?? asStr(pick(sbRaw, 'glyph', 'text'));
  const fallback = asStr(pick(sbRaw, 'fallback')) ?? '* * *';
  if (glyph !== undefined) t.sceneBreak = SAFE_GLYPHS.test(glyph) ? glyph : fallback;
  else if (isObj(sbRaw)) t.sceneBreak = fallback;

  const rh = pick(raw, 'runningHeads', 'runningHead', 'headers');
  if (typeof rh === 'boolean') t.runningHeads.enabled = rh;
  else if (isObj(rh)) {
    t.runningHeads.enabled = asBool(pick(rh, 'enabled', 'on', 'show')) ?? true;
    const st = asStr(pick(rh, 'style', 'case'));
    if (st) t.runningHeads.style = /small/i.test(st) ? 'small-caps' : /ital/i.test(st) ? 'italic' : /cap|upper/i.test(st) ? 'caps' : 'plain';
    const left = asStr(pick(rh, 'left', 'verso', 'even'));
    if (left) t.runningHeads.left = headContent(`${left} left`, 'left') ?? 'book-title';
    const right = asStr(pick(rh, 'right', 'recto', 'odd'));
    if (right) t.runningHeads.right = headContent(`${right} right`, 'right') ?? 'chapter-title';
  } else if (typeof rh === 'string') {
    t.runningHeads.enabled = !/^(none|off|false)\b/i.test(rh.trim());
    t.runningHeads.style = /small cap/i.test(rh) ? 'small-caps' : /ital/i.test(rh) ? 'italic' : /\bcaps\b|upper/i.test(rh) ? 'caps' : 'plain';
    t.runningHeads.left = headContent(rh, 'left') ?? 'none';
    t.runningHeads.right = headContent(rh, 'right') ?? (/title only/i.test(rh) ? 'book-title' : 'none');
  }

  const dc = pick(raw, 'dropCaps', 'dropCap', 'initials');
  if (typeof dc === 'boolean') t.dropCaps.enabled = dc;
  else if (typeof dc === 'number') t.dropCaps = { enabled: dc > 0, lines: dc };
  else if (isObj(dc)) {
    const lines = asNum(pick(dc, 'lines', 'size')) ?? t.dropCaps.lines;
    t.dropCaps = { enabled: (asBool(pick(dc, 'enabled', 'on')) ?? true) && lines > 0, lines: lines > 0 ? lines : t.dropCaps.lines };
  }

  const colours = pick(raw, 'colours', 'colors', 'palette');
  t.colours.text = asStr(pick(colours, 'text', 'ink', 'body')) ?? t.colours.text;
  t.colours.accent = asStr(pick(colours, 'accent', 'heading', 'highlight')) ?? t.colours.accent;
  t.colours.muted = asStr(pick(colours, 'muted', 'secondary', 'subtle')) ?? t.colours.muted;
  t.colours.label = asStr(pick(colours, 'label', 'kicker', 'chapterLabel')) ?? t.colours.muted;

  const fol = pick(raw, 'folios', 'folio', 'pageNumbers');
  if (typeof fol === 'boolean') t.folios.enabled = fol;
  else if (typeof fol === 'string') {
    t.folios.enabled = !/^(none|off|false)\b/i.test(fol.trim());
    if (/cent/i.test(fol)) t.folios.position = 'center';
  } else if (isObj(fol)) {
    t.folios.enabled = asBool(pick(fol, 'enabled', 'on', 'show')) ?? true;
    const fp = asStr(pick(fol, 'position', 'align', 'place'));
    if (fp) t.folios.position = /cent/i.test(fp) ? 'center' : 'outside';
  }

  const start = asStr(pick(raw, 'chapterStart', 'openOn', 'chapterStartsOn')) ?? asStr(pick(opener, 'startsOn', 'startOn', 'page'));
  if (start) t.chapterStart = /any|either|next/i.test(start) ? 'any' : 'right';
  const recto = asBool(pick(raw, 'chaptersOnRight', 'rectoOpeners')) ?? asBool(pick(opener, 'rightHand', 'recto'));
  if (recto !== undefined) t.chapterStart = recto ? 'right' : 'any';
  return t;
}

/** All themes in an interior-themes config ({ themes: [...] }, an array, or a record keyed by id). */
export function interiorThemesFromConfig(raw: unknown): InteriorTheme[] {
  const list = Array.isArray(raw) ? raw : isObj(raw) ? (pick(raw, 'themes', 'interiorThemes', 'items') ?? raw) : [];
  if (Array.isArray(list)) return list.map((x) => normaliseInteriorTheme(x));
  if (isObj(list))
    return Object.entries(list)
      .filter(([k, v]) => isObj(v) && !k.startsWith('$'))
      .map(([k, v]) => normaliseInteriorTheme({ id: k, ...(v as Record<string, unknown>) }));
  return [];
}

const ONES = [
  'Zero',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
/** 1 to 99 in words ("Twenty-One"); larger numbers stay as digits. */
export function numberToWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return ONES[n] ?? String(n);
  const t = TENS[Math.floor(n / 10)] ?? '';
  return n % 10 ? `${t}-${ONES[n % 10] ?? ''}` : t;
}

// ---------- cover styles ----------

export type CoverLayout = 'stacked' | 'band' | 'frame' | 'split' | 'minimal';

export type CoverAlign = 'left' | 'center' | 'right';

export interface CoverStyle {
  id: string;
  name: string;
  layout: CoverLayout;
  align: CoverAlign;
  /** Per-element alignment set in the cover studio. Each falls back to `align` when missing. */
  titleAlign?: CoverAlign;
  subtitleAlign?: CoverAlign;
  authorAlign?: CoverAlign;
  fonts: { title: string; subtitle: string; author: string };
  weights: { title: number; subtitle: number; author: number };
  titleItalic: boolean;
  authorItalic: boolean;
  colours: { background: string; title: string; subtitle: string; author: string; accent: string; band: string };
  /** Title size as a fraction of the cover width (0.14 = 224 px on a 1600 px cover). */
  titleScale: number;
  /** Optional positions in cover-width percent from the top (cover-styles.json units). */
  titleTopPct?: number;
  subtitleTopPct?: number;
  /** Author line top in cover-width percent; when missing the author sits at the foot of the cover. */
  authorTopPct?: number;
  /** Size multipliers for the subtitle and author lines (0.6 to 1.6; missing means 1). */
  subtitleScale?: number;
  authorScale?: number;
  band?: { topPct: number; heightPct: number };
  titleUppercase: boolean;
  authorUppercase: boolean;
  /** Kept for older style files; covers over art now use the palette wash (packages/export ART_WASH_OPACITY). */
  imageOverlay: number;
  /** Ornament drawn in the open middle when there is no background image (name or inline SVG; "none" for nothing). */
  ornament: string;
}

export const DEFAULT_COVER_STYLE: CoverStyle = {
  id: 'volume-default-cover',
  name: 'Volume default cover',
  layout: 'stacked',
  align: 'center',
  fonts: { title: 'Plus Jakarta Sans', subtitle: 'Source Sans 3', author: 'Plus Jakarta Sans' },
  weights: { title: 800, subtitle: 600, author: 600 },
  titleItalic: false,
  authorItalic: false,
  colours: { background: '#F3EEE1', title: '#1E4A2C', subtitle: '#2A3A2E', author: '#1F2A22', accent: '#C26D48', band: '#1E4A2C' },
  titleScale: 0.13,
  titleUppercase: false,
  authorUppercase: true,
  imageOverlay: 0.35,
  ornament: 'sprig',
};

/**
 * One entry of config/cover-styles.json (or a loose shape) to a CoverStyle. `paletteId` picks one of the style's
 * palettes; the first is used otherwise.
 */
export function normaliseCoverStyle(raw: unknown, base: CoverStyle = DEFAULT_COVER_STYLE, paletteId?: string): CoverStyle {
  const c = clone(base);
  if (!isObj(raw)) return c;
  c.id = asStr(pick(raw, 'id', 'slug', 'key')) ?? c.id;
  c.name = asStr(pick(raw, 'name', 'label')) ?? c.name;
  const layoutRaw = pick(raw, 'layout', 'composition', 'template');
  const layout = asStr(layoutRaw) ?? asStr(pick(layoutRaw, 'name', 'type'));
  if (layout) {
    const l = layout.toLowerCase();
    c.layout =
      l.includes('band') || l.includes('stripe')
        ? 'band'
        : l.includes('frame') || l.includes('border')
          ? 'frame'
          : l.includes('split')
            ? 'split'
            : l.includes('minimal')
              ? 'minimal'
              : 'stacked';
  }
  if (asBool(pick(layoutRaw, 'frame')) === true) c.layout = 'frame';
  const align = asStr(pick(layoutRaw, 'align', 'alignment')) ?? asStr(pick(raw, 'align'));
  if (align) c.align = /left/i.test(align) ? 'left' : /right/i.test(align) ? 'right' : 'center';
  const titleTop = asNum(pick(layoutRaw, 'titleTop'));
  if (titleTop !== undefined) c.titleTopPct = titleTop;
  const subTop = asNum(pick(layoutRaw, 'subtitleTop'));
  if (subTop !== undefined) c.subtitleTopPct = subTop;
  const band = pick(layoutRaw, 'band');
  if (isObj(band)) c.band = { topPct: asNum(pick(band, 'top')) ?? 0, heightPct: asNum(pick(band, 'height')) ?? 10 };
  const sizeRaw = asNum(pick(layoutRaw, 'titleSize')) ?? asNum(pick(raw, 'titleScale', 'titleSize'));
  if (sizeRaw !== undefined) c.titleScale = sizeRaw > 100 ? sizeRaw / 1600 : sizeRaw > 1 ? sizeRaw / 100 : sizeRaw;

  const fonts = pick(raw, 'fonts', 'typefaces', 'typography');
  const tf = pick(fonts, 'title', 'titleFont', 'display', 'heading') ?? pick(raw, 'titleFont');
  const sf = pick(fonts, 'subtitle', 'subtitleFont', 'body', 'text') ?? pick(raw, 'subtitleFont');
  const af = pick(fonts, 'author', 'authorFont', 'byline') ?? pick(raw, 'authorFont') ?? tf;
  c.fonts.title = familyOf(tf) ?? c.fonts.title;
  c.fonts.subtitle = familyOf(sf) ?? c.fonts.subtitle;
  c.fonts.author = familyOf(af) ?? c.fonts.author;
  c.weights.title = asNum(pick(tf, 'weight')) ?? asNum(pick(fonts, 'titleWeight')) ?? c.weights.title;
  c.weights.subtitle = asNum(pick(sf, 'weight')) ?? asNum(pick(fonts, 'subtitleWeight')) ?? c.weights.subtitle;
  c.weights.author = asNum(pick(af, 'weight')) ?? asNum(pick(fonts, 'authorWeight')) ?? c.weights.author;
  c.titleItalic = asBool(pick(fonts, 'titleItalic')) ?? c.titleItalic;
  const tcase = asStr(pick(fonts, 'titleCase')) ?? asStr(pick(raw, 'titleCase', 'titleTransform'));
  if (tcase) c.titleUppercase = /upper|caps/i.test(tcase);
  c.titleUppercase = asBool(pick(raw, 'titleUppercase', 'uppercaseTitle')) ?? c.titleUppercase;
  const astyle = asStr(pick(fonts, 'authorStyle'));
  if (astyle) {
    c.authorUppercase = /caps|upper/i.test(astyle);
    c.authorItalic = /ital/i.test(astyle);
  }
  c.authorUppercase = asBool(pick(raw, 'authorUppercase', 'uppercaseAuthor')) ?? c.authorUppercase;

  const palettes = pick(raw, 'palettes');
  const paletteList: unknown[] = Array.isArray(palettes) ? palettes : [];
  const pal = paletteList.find((p) => isObj(p) && p.id === paletteId) ?? paletteList[0];
  const col = pal ?? pick(raw, 'colours', 'colors', 'palette');
  c.colours.background = asStr(pick(col, 'background', 'bg', 'paper')) ?? c.colours.background;
  c.colours.title = asStr(pick(col, 'title', 'primary', 'ink')) ?? c.colours.title;
  c.colours.subtitle = asStr(pick(col, 'subtitle', 'secondary', 'text')) ?? c.colours.subtitle;
  c.colours.author = asStr(pick(col, 'author', 'byline', 'text')) ?? c.colours.author;
  c.colours.accent = asStr(pick(col, 'accent', 'motif', 'highlight')) ?? c.colours.accent;
  c.colours.band = asStr(pick(col, 'band', 'stripe', 'motifAlt', 'accent', 'motif')) ?? c.colours.band;
  c.imageOverlay = asNum(pick(raw, 'imageOverlay', 'overlay', 'scrim')) ?? c.imageOverlay;
  const corn = pick(raw, 'ornament', 'motif');
  c.ornament = asStr(corn) ?? asStr(pick(corn, 'kind', 'name', 'svg')) ?? (corn === false || corn === null ? 'none' : c.ornament);
  return c;
}

export function coverStylesFromConfig(raw: unknown): CoverStyle[] {
  const list = Array.isArray(raw) ? raw : isObj(raw) ? (pick(raw, 'styles', 'coverStyles', 'items') ?? raw) : [];
  if (Array.isArray(list)) return list.map((x) => normaliseCoverStyle(x));
  if (isObj(list))
    return Object.entries(list)
      .filter(([k, v]) => isObj(v) && !k.startsWith('$'))
      .map(([k, v]) => normaliseCoverStyle({ id: k, ...(v as Record<string, unknown>) }));
  return [];
}

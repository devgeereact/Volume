// Preflight (docs/book-production/EXPORT-SPEC.md, Preflight): pass / warn / fail items before the upload pack is built.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { PDFArray, PDFBool, PDFDocument, PDFName, PDFNumber, PDFRef, PDFStream, type PDFObject } from 'pdf-lib';
import sharp, { type Metadata } from 'sharp';
import {
  curlQuotes,
  bleedPageSizeIn,
  checkPictureBook,
  checkTextInSafeArea,
  colourPageRange,
  coverMinDpi,
  pictureBookGeometry,
  pictureBookPages,
  pictureBookRulesFromTemplate,
  checkBookStyle,
  checkText,
  countWords,
  checkBookTemplateRules,
  checkListing,
  ebookCoverSpec,
  blockTexts,
  enabledSections,
  escapeHtml,
  findPricePromise,
  findTemplateJunk,
  findUndatedPrices,
  insideMarginMinIn,
  parseTrimKey,
  rulesAge,
  stripInline,
  templateRulesFromTemplate,
  trimPageRange,
  wrapSizeIn,
  type BookDoc,
  type CheckItem,
  type ColourInk,
  type PictureBookDoc,
  type CompiledHouseStyle,
  type KdpRules,
  type ListingInput,
  type Paper,
  type TrimKey,
} from '@volume/core';
import type { PictureBookLayout } from './picture-book.ts';
import { htmlToParagraphs } from './txt.ts';

export type { CheckItem, CheckLevel } from '@volume/core';

// ---------- PDF inspection (pdfjs-dist) ----------

export interface PdfFontInfo {
  name: string;
  type: string;
  embedded: boolean;
  type3: boolean;
}
export interface PdfInspection {
  pageCount: number;
  /** Unique page sizes in points, rounded to 0.01. */
  pageSizes: { widthPt: number; heightPt: number }[];
  fonts: PdfFontInfo[];
  /** Text per page (items joined with spaces). */
  pageText: string[];
  /** Per page: text in the top 8% (running heads), bottom 8% (folios) and the rest (body). */
  pageParts: { head: string; foot: string; body: string }[];
  /** Per page: how many images are drawn on it. */
  imagesPerPage: number[];
  /** Every raster image drawn: pixel size and the resolution it prints at (from the drawing matrix). */
  images: PdfImageUse[];
}

export interface PdfImageUse {
  page: number;
  widthPx: number;
  heightPx: number;
  /** Lower of the horizontal and vertical resolution at the drawn size, in dots per inch. */
  dpi: number;
}

type Matrix = [number, number, number, number, number, number];
const multiply = (m: Matrix, n: Matrix): Matrix => [
  n[0] * m[0] + n[1] * m[2],
  n[0] * m[1] + n[1] * m[3],
  n[2] * m[0] + n[3] * m[2],
  n[2] * m[1] + n[3] * m[3],
  n[4] * m[0] + n[5] * m[2] + m[4],
  n[4] * m[1] + n[5] * m[3] + m[5],
];
const asMatrix = (v: unknown): Matrix | null => {
  if (!v || typeof v !== 'object' || !('length' in v) || (v as ArrayLike<number>).length !== 6) return null;
  const a = Array.from(v as ArrayLike<number>);
  return a.every((x) => typeof x === 'number' && Number.isFinite(x)) ? (a as Matrix) : null;
};

/** Raster images drawn by one page's operator list, with the resolution each prints at (the matrix maps the unit square to points). */
function imageUses(page: number, fnArray: number[], argsArray: unknown[]): PdfImageUse[] {
  const out: PdfImageUse[] = [];
  const stack: Matrix[] = [];
  let ctm: Matrix = [1, 0, 0, 1, 0, 0];
  fnArray.forEach((fn, k) => {
    const args = (argsArray[k] ?? []) as unknown[];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) {
      const m = asMatrix(args);
      if (m) ctm = multiply(ctm, m);
    } else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      const m = asMatrix(args[0]);
      if (m) ctm = multiply(ctm, m);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const img = args[0];
      const inline = typeof img === 'object' && img !== null ? (img as { width?: number; height?: number }) : null;
      const w = inline ? (inline.width ?? 0) : Number(args[1] ?? 0);
      const h = inline ? (inline.height ?? 0) : Number(args[2] ?? 0);
      const drawnW = Math.hypot(ctm[0], ctm[1]) / 72;
      const drawnH = Math.hypot(ctm[2], ctm[3]) / 72;
      if (w > 0 && h > 0 && drawnW > 0 && drawnH > 0) out.push({ page, widthPx: w, heightPx: h, dpi: Math.min(w / drawnW, h / drawnH) });
    }
  });
  return out;
}

/** Read a PDF with pdfjs-dist: page sizes, every font used (embedded or not, Type 3 or not) and the text per page. */
export async function inspectPdf(pdf: Buffer, opts: { text?: boolean } = {}): Promise<PdfInspection> {
  const task = getDocument({ data: new Uint8Array(pdf), fontExtraProperties: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const sizes = new Map<string, { widthPt: number; heightPt: number }>();
  const fonts = new Map<string, PdfFontInfo>();
  const pageText: string[] = [];
  const pageParts: PdfInspection['pageParts'] = [];
  const imagesPerPage: number[] = [];
  const images: PdfImageUse[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
      const w = Math.round((x1 - x0) * 100) / 100;
      const h = Math.round((y1 - y0) * 100) / 100;
      sizes.set(`${w}x${h}`, { widthPt: w, heightPt: h });
      const ops = await page.getOperatorList();
      imagesPerPage.push(ops.fnArray.filter((fn) => fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject).length);
      images.push(...imageUses(i, ops.fnArray, ops.argsArray));
      ops.fnArray.forEach((fn, k) => {
        if (fn !== OPS.setFont) return;
        const id = String((ops.argsArray[k] as unknown[])[0]);
        if (fonts.has(id)) return;
        const f = page.commonObjs.get(id) as { name?: string; type?: string; missingFile?: boolean; isType3Font?: boolean } | undefined;
        fonts.set(id, {
          name: f?.name ?? id,
          type: f?.type ?? 'unknown',
          embedded: f?.missingFile === false,
          type3: f?.isType3Font === true || f?.type === 'Type3',
        });
      });
      if (opts.text !== false) {
        const tc = await page.getTextContent();
        const clean = (xs: string[]) => xs.join(' ').replace(/\s+/g, ' ').trim();
        const head: string[] = [];
        const foot: string[] = [];
        const body: string[] = [];
        for (const it of tc.items) {
          if (!('str' in it)) continue;
          const y = (it.transform[5] as number) - y0;
          (y > h * 0.92 ? head : y < h * 0.08 ? foot : body).push(it.str);
        }
        pageText.push(clean(tc.items.map((it) => ('str' in it ? it.str : ''))));
        pageParts.push({ head: clean(head), foot: clean(foot), body: clean(body) });
      }
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
  const byName = new Map<string, PdfFontInfo>();
  for (const f of fonts.values()) byName.set(f.name, f);
  return { pageCount: doc.numPages, pageSizes: [...sizes.values()], fonts: [...byName.values()], pageText, pageParts, imagesPerPage, images };
}

/**
 * Colour spaces of the raster images in a PDF (DeviceRGB, DeviceCMYK, DeviceGray, ICCBased with its component count
 * read as RGB, CMYK or Gray, and the base of Indexed spaces). Image masks are skipped. Unique, sorted.
 */
export async function pdfImageColourSpaces(pdf: Buffer): Promise<string[]> {
  const doc = await PDFDocument.load(pdf, { ignoreEncryption: true, updateMetadata: false });
  const ctx = doc.context;
  const ICC: Record<number, string> = { 1: 'Gray', 3: 'RGB', 4: 'CMYK' };
  const name = (cs: PDFObject | undefined, depth = 0): string => {
    const v = cs instanceof PDFRef ? ctx.lookup(cs) : cs;
    if (v instanceof PDFName) return v.decodeText();
    if (v instanceof PDFArray && v.size() > 0 && depth < 4) {
      const kind = v.lookup(0);
      const k = kind instanceof PDFName ? kind.decodeText() : '?';
      if (k === 'ICCBased') {
        const stream = v.lookup(1);
        const n = stream instanceof PDFStream ? stream.dict.lookup(PDFName.of('N')) : undefined;
        return `ICCBased ${n instanceof PDFNumber ? (ICC[n.asNumber()] ?? String(n.asNumber())) : '?'}`;
      }
      if (k === 'Indexed') return `Indexed ${name(v.get(1), depth + 1)}`;
      return k;
    }
    return 'unknown';
  };
  const found = new Set<string>();
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFStream)) continue;
    const subtype = obj.dict.lookup(PDFName.of('Subtype'));
    if (!(subtype instanceof PDFName) || subtype.decodeText() !== 'Image') continue;
    const mask = obj.dict.lookup(PDFName.of('ImageMask'));
    if (mask instanceof PDFBool && mask.asBoolean()) continue;
    const cs = obj.dict.get(PDFName.of('ColorSpace'));
    // JPX images may carry their colour space inside the codestream.
    found.add(cs ? name(cs) : 'embedded in the image');
  }
  return [...found].sort();
}

// ---------- preflight ----------

export interface ClaimItem {
  chapter: string;
  sentence: string;
  category: string;
  check: string;
  /** Softened and author_experience are settled too: only 'open' still needs checking. */
  status: 'open' | 'verified' | 'softened' | 'author_experience' | 'removed';
  /**
   * Claim tiers: true (or missing, for older callers) when the owner must check it; false when it is listed for the
   * record only (low or medium risk, harmless if wrong). Only claims that need a check count towards claims.open.
   */
  needsCheck?: boolean;
}

export interface PreflightInput {
  book: BookDoc;
  rules: KdpRules;
  houseStyle: CompiledHouseStyle;
  trim: TrimKey;
  paper: Paper;
  listing: ListingInput;
  /** Book template (config/book-templates/*.json) to check required sections. */
  template?: unknown;
  /** Template section ids the owner switched off on purpose (no fail). */
  sectionsOff?: string[];
  interiorPdf?: Buffer;
  /** Interior inside margin in inches (from the theme), checked against the KDP minimum for the page count. */
  insideMarginIn?: number;
  wrapPdf?: Buffer;
  /** Spine text drawn on the wrap, and background image DPI (from exportPaperbackWrap). */
  wrapInfo?: { spineText: boolean; imageDpi?: number };
  ebookCover?: Buffer;
  /** Back-cover blurb as plain text (pack listing/back-cover-blurb.txt): house style and the template's word range. */
  blurb?: string;
  /** Marketing text for the pack's marketing/ folder: house style, as warnings (it is not uploaded to KDP). */
  marketing?: { tiktokScripts?: string; instagramCaptions?: string; launchEmail?: string };
  /**
   * Covers the owner made and uploaded ("use my own cover"), not built by Volume. They are checked against the KDP
   * limits in the rules (eBook: file type, pixel limits, ratio, RGB, file size; wrap: size from the real page count
   * with bleed, image resolution, fonts, colour, spine text) instead of Volume's own build settings.
   */
  ownCovers?: { ebook?: boolean; wrap?: boolean };
  /** EPUBCheck result when it ran; undefined means it did not run. */
  epubcheck?: { ok: boolean; messages: string[] } | { skipped: string };
  claims?: ClaimItem[];
  /** Profile bio: About the Author must equal it word for word. */
  profileBio?: string;
  /**
   * ISBNs the owner entered (any format, hyphens allowed). They may appear in the book (the copyright page), so
   * the ISBN guardrails do not block them; any other ISBN still fails. `book.meta.isbnPrint` and `isbnEbook` are
   * always allowed too. The listing check still validates each entered ISBN's checksum.
   */
  isbns?: string[];
  /** What the AI made, and what the owner set in the KDP disclosure. */
  aiDisclosure?: { aiWroteText: boolean; aiMadeImages: boolean; disclosed: 'ai-generated' | 'ai-assisted' | 'none' };
  /**
   * True for the KDP upload pack's final check: the pack needs the eBook cover or the paperback wrap (or both).
   * Single-file exports leave it unset, so a book with no cover still exports its manuscript files.
   */
  pack?: boolean;
  /** True when the book type asks for dated prices (every price carries the month it was checked). */
  datedPrices?: boolean;
  /** Year expected on the copyright page (default: the year of `now`). */
  copyrightYear?: number;
  /**
   * Picture book (phase 7, D-044): the spreads, the ink and the layout measured by exportPictureBookPdf. With it the
   * interior is checked at the bleed size (`interior.bleed`) and against the colour page range, and the `picture.*`
   * items run. `book` should be pictureBookToBookDoc(doc), so house style and the about-the-author check still run.
   */
  pictureBook?: { doc: PictureBookDoc; ink: ColourInk; layout?: PictureBookLayout };
  /** Manuscript hash at export time vs now (stale exports warning). */
  exportsHash?: string;
  manuscriptHash?: string;
  now?: Date;
}

export interface PreflightReport {
  items: CheckItem[];
  counts: { pass: number; warn: number; fail: number };
  /** True when nothing fails (warnings allowed). */
  ok: boolean;
  /** Interior page count read from the PDF (when given). */
  interiorPages?: number;
}

const TEMPLATE_TO_SUBTYPE: Record<string, string> = {
  'half-title': 'halftitle',
  'title-page': 'titlepage',
  copyright: 'copyright',
  dedication: 'dedication',
  epigraph: 'epigraph',
  contents: 'contents',
  foreword: 'foreword',
  preface: 'preface',
  acknowledgements: 'acknowledgements',
  introduction: 'introduction',
  parts: 'part',
  chapters: 'chapter',
  conclusion: 'conclusion',
  appendix: 'appendix',
  resources: 'resources',
  glossary: 'glossary',
  references: 'references',
  'about-the-author': 'about_the_author',
  'also-by': 'also_by',
  'review-request': 'review_request',
  'newsletter-socials': 'newsletter',
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Digits (and a final X) of an ISBN, without the "ISBN" label, hyphens or spaces. */
export function isbnDigits(text: string): string {
  return text
    .replace(/^\s*ISBN(?:-1[03])?\s*:?/i, '')
    .replace(/[^0-9Xx]/g, '')
    .toUpperCase();
}

/** True for an ISBN guardrail hit (house-style ids isbn and isbn-bare) on an ISBN the owner entered. */
function isAllowedIsbn(ruleId: string | undefined, match: string, allowed: ReadonlySet<string>): boolean {
  if (allowed.size === 0 || (ruleId !== 'isbn' && ruleId !== 'isbn-bare')) return false;
  return allowed.has(isbnDigits(match));
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;
/** Wrap size tolerance in inches: Volume's own (no KDP rounding rule in config/kdp-rules), so unverified. */
const WRAP_TOLERANCE_IN = 0.001;

export async function runPreflight(input: PreflightInput): Promise<PreflightReport> {
  const items: CheckItem[] = [];
  const add = (i: CheckItem) => items.push(i);
  const now = input.now ?? new Date();
  const { book, rules } = input;
  const secs = enabledSections(book);
  const subtypes = new Set(secs.map((s) => s.subtype));

  // Structure
  if (isObj(input.template) && Array.isArray(input.template.sections)) {
    const off = new Set(input.sectionsOff ?? []);
    const missing: string[] = [];
    for (const t of input.template.sections) {
      if (!isObj(t) || t.kind === 'package' || t.required !== true || t.defaultOn !== true) continue;
      const id = String(t.id);
      const sub = TEMPLATE_TO_SUBTYPE[id];
      if (!sub || off.has(id)) continue;
      const ok = subtypes.has(sub as never) || (sub === 'conclusion' && subtypes.has('epilogue'));
      if (!ok) missing.push(typeof t.title === 'string' ? t.title : id);
    }
    add({
      id: 'structure.sections',
      label: 'Template sections present',
      level: missing.length ? 'fail' : 'pass',
      detail: missing.length
        ? `Missing: ${missing.join(', ')}. Add them or switch them off on purpose.`
        : 'Every required section is present or deliberately off.',
    });
  }
  // Template chapter rules (D-042): fiction has no subheadings or takeaways; workbooks have 2 to 4 exercises per
  // chapter and ruled-line counts in range. Findings come from checkTemplateRules in @volume/core.
  if (isObj(input.template) && isObj(input.template.chapterRules)) add(templateRulesItem(book, input.template));
  const contents = secs.find((s) => s.subtype === 'contents');
  const pb = input.pictureBook;
  if (!pb)
    add({
      id: 'structure.contents',
      label: 'Contents page',
      level: contents ? 'pass' : 'warn',
      detail: contents ? 'Contents is built from the headings, so it always matches them.' : 'No contents section.',
    });

  // House style
  const findings = checkBookStyle(book, input.houseStyle, { titleCase: false });
  const blocking = findings.filter((f) => ['emdash', 'endash', 'banned', 'spelling'].includes(f.rule) && f.severity === 'error');
  add({
    id: 'style.house',
    label: 'House style (dashes, banned phrases, US spellings)',
    level: blocking.length ? 'fail' : 'pass',
    detail: blocking.length
      ? `${blocking.length} problem(s), first: ${blocking
          .slice(0, 3)
          .map((f) => `"${f.match}" in ${f.sectionId}`)
          .join('; ')}.`
      : 'No em dashes, banned phrases or US spellings.',
  });
  const allowedIsbns = new Set(
    [...(input.isbns ?? []), book.meta.isbnPrint, book.meta.isbnEbook]
      .filter((x): x is string => !!x)
      .map(isbnDigits)
      .filter(Boolean),
  );
  const blockGuard = findings.filter((f) => f.rule === 'guardrail' && f.action === 'block' && !isAllowedIsbn(f.id, f.match, allowedIsbns));
  add({
    id: 'style.invented-content',
    label: 'Invented-content flags (ISBNs, awards, rankings, reviews, guarantees)',
    level: blockGuard.length ? 'fail' : 'pass',
    detail: blockGuard.length
      ? blockGuard
          .slice(0, 4)
          .map((f) => `${f.id}: "${f.match}" (${f.sectionId})`)
          .join('; ')
      : 'None found.',
  });
  const claimHits = findings.filter((f) => f.rule === 'guardrail' && f.action === 'claims-report');
  // Per open claim: statements about the author the profile does not support (warn), and a named firm, product
  // or person given a regulatory or safety status (block until the owner verifies or removes it).
  (input.claims ?? [])
    .filter((c) => c.status === 'open')
    .forEach((c, n) => {
      if (c.category === 'personal')
        add({
          id: `claims.personal.${n + 1}`,
          label: 'Personal claim not in the profile',
          level: 'warn',
          detail: `"${clip(c.sentence)}"${c.chapter ? ` (${c.chapter})` : ''}. Remove it, or add the fact to the profile if it is true.`,
        });
      else if (c.category === 'regulatory')
        add({
          id: `claims.regulatory.${n + 1}`,
          label: 'Named firm with a regulatory claim',
          level: 'fail',
          detail: `"${clip(c.sentence)}"${c.chapter ? ` (${c.chapter})` : ''}. Verify it against the regulator's own register and mark it verified, or remove the name.`,
        });
    });
  const openClaims = (input.claims ?? []).filter((c) => c.status === 'open');
  // Claim tiers: only open claims that need the owner's check count; the rest are listed for the record in the report.
  const needCheck = openClaims.filter((c) => c.needsCheck !== false).length;
  const forRecord = openClaims.length - needCheck;
  add({
    id: 'claims.open',
    label: 'Claims to verify',
    level: needCheck || (!input.claims && claimHits.length) ? 'warn' : 'pass',
    detail: input.claims
      ? `${needCheck} open claim(s) need your check; ${forRecord} more are listed for the record in the claims report.`
      : `${claimHits.length} statement(s) match the claims patterns; no claims report was supplied.`,
  });

  // Honesty and front matter
  const about = secs.find((s) => s.subtype === 'about_the_author');
  if (input.profileBio !== undefined) {
    const text = about
      ? about.blocks
          .filter((b) => b.type === 'paragraph')
          .map((b) => (b.type === 'paragraph' ? stripInline(b.text) : ''))
          .join('\n\n')
      : '';
    // The typeset book sets curly quotes (curlQuotes), so the bio is compared in the same typography.
    const same = curlQuotes(text).replace(/\s+/g, ' ').trim() === curlQuotes(input.profileBio).replace(/\s+/g, ' ').trim();
    add({
      id: 'honesty.about-author',
      label: 'About the author equals the profile bio',
      level: same ? 'pass' : 'fail',
      detail: same ? 'Word for word.' : 'About the author differs from the profile bio.',
    });
  }
  const year = input.copyrightYear ?? now.getUTCFullYear();
  add({
    id: 'front.copyright-year',
    label: 'Copyright year',
    level: book.meta.year === year ? 'pass' : 'fail',
    detail: book.meta.year ? `Copyright page says ${book.meta.year}; expected ${year}.` : 'No year found on the copyright page.',
  });
  // Template junk (live run 3 shipped a "- x: x" resource): echo lines, TBD, lorem, [NEEDS ...], {placeholder}, empty items.
  const placeholders = secs.flatMap((s) => s.blocks.flatMap((b) => findTemplateJunk(blockSource(b)).map((h) => `"${h.match}" (${sectionLabel(s)})`)));
  add({
    id: 'front.placeholders',
    label: 'No unfilled placeholders',
    level: placeholders.length ? 'fail' : 'pass',
    detail: placeholders.length ? `Found ${[...new Set(placeholders)].slice(0, 6).join(', ')}. Replace or delete them.` : 'None.',
  });
  if (input.datedPrices) {
    // Dated prices (tech how-to, travel): every price carries the month it was checked, and the book may only
    // promise that when it is true.
    const undated = secs.flatMap((s) => blockTexts(s).flatMap((t) => findUndatedPrices(t).map((h) => `${h.match} (${sectionLabel(s)})`)));
    const promise =
      secs.map((s) => findPricePromise(blockTexts(s).join('\n'))).find((p) => p !== null) ?? findPricePromise(input.listing.description ?? '') ?? null;
    add({
      id: 'style.dated-prices',
      label: 'Prices carry the month checked',
      level: undated.length === 0 ? 'pass' : promise ? 'fail' : 'warn',
      detail:
        undated.length === 0
          ? 'Every price carries the month it was checked.'
          : `${undated.length} price(s) have no month checked, first: ${undated.slice(0, 4).join(', ')}.${promise ? ` The book promises dated prices ("${clip(promise)}"): add the month to each price or remove the promise.` : ' Add "(checked Month Year)" after each.'}`,
    });
  }
  // A picture book's spread pictures come from the image model (D-045), so the disclosure must cover images even
  // when the caller did not record them, and a picture book with no disclosure recorded fails.
  const spreadPictures = pb ? pb.doc.spreads.some((s) => s.imageKey) : false;
  if (input.aiDisclosure || pb) {
    const a = input.aiDisclosure ?? { aiWroteText: false, aiMadeImages: false, disclosed: 'none' as const };
    const images = a.aiMadeImages || spreadPictures;
    const needed = a.aiWroteText || images;
    const ok = needed ? a.disclosed === 'ai-generated' && (!spreadPictures || a.aiMadeImages) : true;
    add({
      id: 'kdp.ai-disclosure',
      label: 'KDP AI disclosure',
      level: ok ? 'pass' : 'fail',
      detail: needed
        ? `AI made ${[a.aiWroteText ? 'text' : '', images ? 'images' : ''].filter(Boolean).join(' and ')}: disclosure must be AI-generated (set: ${a.disclosed}).${spreadPictures && !a.aiMadeImages ? ' The spread pictures come from the image model: record AI-made images.' : ''}`
        : 'No AI-generated content recorded.',
      factIds: ['5.5'],
    });
  }

  // Listing
  for (const i of checkListing(rules, input.listing)) add(i);
  // House style beyond the manuscript (live acceptance 18 October 2026): the listing and the blurb go to KDP and the
  // back cover, so they block like the manuscript; marketing is the owner's own posts, so it warns.
  for (const i of outsideTextItems(input)) add(i);

  // Interior PDF
  let interiorPages: number | undefined;
  const trim = parseTrimKey(input.trim);
  if (input.interiorPdf) {
    const info = await inspectPdf(input.interiorPdf, { text: false });
    interiorPages = info.pageCount;
    if (pb) {
      const want = bleedPageSizeIn(rules, trim).value;
      const ok =
        info.pageSizes.length === 1 &&
        near(info.pageSizes[0]?.widthPt ?? 0, want.widthIn * 72, 0.5) &&
        near(info.pageSizes[0]?.heightPt ?? 0, want.heightIn * 72, 0.5);
      add({
        id: 'interior.bleed',
        label: 'Interior page size with bleed',
        level: ok ? 'pass' : 'fail',
        detail: `${info.pageSizes.map((s) => `${s.widthPt} x ${s.heightPt} pt`).join(', ')} (want ${trim.widthIn} x ${trim.heightIn} in plus bleed = ${want.widthIn * 72} x ${want.heightIn * 72} pt).`,
        factIds: ['3.7'],
      });
    }
    const sizeOk =
      info.pageSizes.length === 1 &&
      near(info.pageSizes[0]?.widthPt ?? 0, trim.widthIn * 72, 0.5) &&
      near(info.pageSizes[0]?.heightPt ?? 0, trim.heightIn * 72, 0.5);
    if (!pb)
      add({
        id: 'interior.trim',
        label: 'Interior trim size',
        level: sizeOk ? 'pass' : 'fail',
        detail: `${info.pageSizes.map((s) => `${s.widthPt} x ${s.heightPt} pt`).join(', ')} (want ${trim.widthIn * 72} x ${trim.heightIn * 72} pt).`,
        factIds: ['3.6'],
      });
    const bad = info.fonts.filter((f) => !f.embedded || f.type3);
    add({
      id: 'interior.fonts',
      label: 'Fonts embedded, no Type 3',
      level: bad.length ? 'fail' : 'pass',
      detail: bad.length
        ? `Problem fonts: ${bad.map((f) => `${f.name}${f.type3 ? ' (Type 3)' : ' (not embedded)'}`).join(', ')}.`
        : `${info.fonts.length} fonts, all embedded: ${info.fonts.map((f) => f.name.replace(/^[A-Z]{6}\+/, '')).join(', ')}.`,
      factIds: ['6.6'],
    });
    const range = trimPageRange(rules, trim, input.paper);
    const inRange = info.pageCount >= range.value.min && info.pageCount <= range.value.max;
    if (!pb)
      add({
        id: 'interior.pages',
        label: 'Page count within trim limits',
        level: inRange ? (range.warnings.length ? 'warn' : 'pass') : 'fail',
        detail: `${info.pageCount} pages (allowed ${range.value.min} to ${range.value.max}).${range.warnings.length ? ` ${range.warnings.join(' ')}` : ''}`,
        factIds: ['3.6'],
      });
    if (pb) for (const i of pictureBookItems(pb, rules, trim, info, input.template)) add(i);
    if (input.insideMarginIn !== undefined && !pb) {
      const min = insideMarginMinIn(rules, info.pageCount);
      if (min.value !== null) {
        const ok = input.insideMarginIn >= min.value;
        add({
          id: 'interior.inside-margin',
          label: 'Inside margin',
          level: ok ? 'pass' : 'fail',
          detail: `${input.insideMarginIn} in inside margin; minimum for ${info.pageCount} pages is ${min.value} in. ${min.warnings.join(' ')}`,
        });
      }
    }
  }

  if (pb && !input.interiorPdf) for (const i of pictureBookItems(pb, rules, trim, undefined, input.template)) add(i);

  // Paperback wrap
  if (input.wrapPdf) {
    const pages = interiorPages;
    const info = await inspectPdf(input.wrapPdf, { text: false });
    if (pages === undefined) {
      add({
        id: 'wrap.size',
        label: 'Wrap size',
        level: 'warn',
        detail: 'No interior PDF given, so the page count (and the wrap formula) could not be checked.',
      });
    } else {
      const want = wrapSizeIn(rules, pb ? { trim, pages, paper: input.paper, ink: pb.ink } : { trim, pages, paper: input.paper });
      const got = info.pageSizes[0];
      // config/kdp-rules gives no rounding or tolerance for the cover size (checked 19 October 2026), so this
      // 0.001 in tolerance is Volume's own and unverified: KDP's template may round differently.
      const ok = got !== undefined && near(got.widthPt / 72, want.widthIn, WRAP_TOLERANCE_IN) && near(got.heightPt / 72, want.heightIn, WRAP_TOLERANCE_IN);
      add({
        id: 'wrap.size',
        label: 'Wrap size matches the formula',
        level: ok ? 'pass' : 'fail',
        detail: `${got ? `${(got.widthPt / 72).toFixed(4)} x ${(got.heightPt / 72).toFixed(4)} in` : 'no page'}; formula for ${pages} pages on ${pb ? `${pb.ink} colour` : input.paper}: ${want.widthIn.toFixed(4)} x ${want.heightIn.toFixed(4)} in (spine ${want.spineIn.toFixed(4)} in).${ok ? '' : ` Volume allows ${WRAP_TOLERANCE_IN} in either way; the KDP rules give no rounding, so that tolerance is unverified: compare with KDP's cover calculator.`}`,
        factIds: ['3.8', '3.9'],
      });
    }
    if (input.wrapInfo && pages !== undefined) {
      const minPages = rules.rules.find((r) => r.id === 'paperback.spine.textMinPages')?.value;
      const allowed = typeof minPages === 'number' && pages >= minPages;
      const ok = !input.wrapInfo.spineText || allowed;
      add({
        id: 'wrap.spine-text',
        label: 'Spine text rule',
        level: ok ? 'pass' : 'fail',
        detail: `${input.wrapInfo.spineText ? 'Spine text' : 'No spine text'} at ${pages} pages (text allowed from ${String(minPages)}).`,
        factIds: ['3.10'],
      });
      if (input.wrapInfo.imageDpi !== undefined) {
        const min = rules.rules.find((r) => r.id === 'paperback.cover')?.values as { minDpi?: number } | undefined;
        add({
          id: 'wrap.dpi',
          label: 'Cover image resolution',
          level: input.wrapInfo.imageDpi >= (min?.minDpi ?? 300) ? 'pass' : 'fail',
          detail: `About ${Math.floor(input.wrapInfo.imageDpi)} DPI (minimum ${min?.minDpi ?? 300}).`,
          factIds: ['3.8'],
        });
      }
    }
    if (input.ownCovers?.wrap) for (const i of await ownWrapItems(input.wrapPdf, info, rules, pages)) add(i);
    const bad = info.fonts.filter((f) => !f.embedded || f.type3);
    add({
      id: 'wrap.fonts',
      label: 'Wrap fonts embedded',
      level: bad.length ? 'fail' : 'pass',
      detail: bad.length ? bad.map((f) => f.name).join(', ') : `${info.fonts.length} fonts, all embedded.`,
    });
  }

  // eBook cover
  if (input.ebookCover && input.ownCovers?.ebook) add(await ownEbookCoverItem(input.ebookCover, rules));
  else if (input.ebookCover) {
    const spec = ebookCoverSpec(rules);
    const meta = await sharp(input.ebookCover).metadata();
    const ok =
      meta.format === 'jpeg' &&
      meta.width === spec.widthPx &&
      meta.height === spec.heightPx &&
      (meta.space === 'srgb' || meta.space === 'rgb') &&
      input.ebookCover.length < spec.maxFileSizeMB * 1024 * 1024;
    add({
      id: 'ebook.cover',
      label: 'eBook cover',
      level: ok ? 'pass' : 'fail',
      detail: `${meta.format ?? '?'} ${meta.width ?? '?'} x ${meta.height ?? '?'} px, ${meta.space ?? '?'}, ${(input.ebookCover.length / 1024).toFixed(0)} KB (want JPEG ${spec.widthPx} x ${spec.heightPx} RGB under ${spec.maxFileSizeMB} MB).`,
      factIds: ['10.5'],
    });
  }

  // Covers for the KDP pack (live run 3 built a pack with no cover folder and said nothing).
  if (input.pack) {
    const missing = [input.ebookCover ? null : 'eBook cover', input.wrapPdf ? null : 'paperback wrap'].filter((x): x is string => x !== null);
    add({
      id: 'cover.files',
      label: 'KDP pack covers',
      level: missing.length === 2 ? 'fail' : missing.length ? 'warn' : 'pass',
      detail:
        missing.length === 2
          ? 'No eBook cover or paperback wrap yet. Build the covers in the cover studio or upload your own there. Single files still export.'
          : missing.length
            ? `No ${missing[0] ?? ''} yet; the pack goes without it.`
            : 'eBook cover and paperback wrap are in the pack.',
    });
  }

  // EPUBCheck
  if (input.epubcheck) {
    const e = input.epubcheck;
    if ('skipped' in e) add({ id: 'epub.check', label: 'EPUBCheck', level: 'warn', detail: `Not run: ${e.skipped}`, factIds: ['7.8'] });
    else
      add({
        id: 'epub.check',
        label: 'EPUBCheck',
        level: e.ok ? 'pass' : 'warn',
        detail: e.ok ? 'No errors.' : e.messages.slice(0, 5).join(' | '),
        factIds: ['7.8'],
      });
  }

  // Freshness
  if (input.exportsHash && input.manuscriptHash)
    add({
      id: 'exports.fresh',
      label: 'Exports match the manuscript',
      level: input.exportsHash === input.manuscriptHash ? 'pass' : 'warn',
      detail: input.exportsHash === input.manuscriptHash ? 'Up to date.' : 'The manuscript changed after these files were exported.',
    });
  const age = rulesAge(rules, now);
  add({
    id: 'rules.age',
    // The age counts from the file's verifiedOn, the date of its oldest check (newer rules carry their own dates),
    // so a file released today can say 14 days: that is the oldest fact, not the file.
    label: 'KDP rules last checked',
    level: age.stale ? 'warn' : 'pass',
    detail: age.stale
      ? `The oldest KDP rule check in file ${rules.version} is more than ${rules.recheckAfterDays} days old (${rules.verifiedOn}, ${age.days} days): re-check before you upload.`
      : `Rules file ${rules.version}; oldest check ${rules.verifiedOn} (${age.days} days ago, re-check after ${rules.recheckAfterDays} days).`,
  });
  const unverified = rules.rules.filter((r) => r.status === 'unverified').map((r) => r.id);
  if (unverified.length)
    add({
      id: 'rules.unverified',
      label: 'Unverified KDP rules in use',
      level: 'warn',
      detail: `${unverified.join(', ')}: check the official pages before relying on them.`,
    });

  const counts = { pass: 0, warn: 0, fail: 0 };
  for (const i of items) counts[i.level]++;
  return { items, counts, ok: counts.fail === 0, ...(interiorPages !== undefined ? { interiorPages } : {}) };
}

/**
 * Picture-book items: `picture.page-count` (colour range for the trim and ink), `picture.spread-images` (every spread
 * page shows a picture, read from the PDF when given and from the layout), `picture.safe-area` (measured text boxes
 * inside the safe area, and every text fits its box) and `picture.spreads` (text, numbering, template ranges).
 */
function pictureBookItems(
  pb: NonNullable<PreflightInput['pictureBook']>,
  rules: KdpRules,
  trim: { widthIn: number; heightIn: number },
  info: PdfInspection | undefined,
  template: unknown,
): CheckItem[] {
  const out: CheckItem[] = [];
  const plan = pictureBookPages(pb.doc);
  const pages = info?.pageCount ?? plan.length;
  const range = colourPageRange(rules, trim, pb.ink);
  const inRange = pages >= range.value.min && pages <= range.value.max;
  out.push({
    id: 'picture.page-count',
    label: 'Page count within the colour limits',
    level: inRange ? (range.warnings.length ? 'warn' : 'pass') : 'fail',
    detail: `${pages} pages (${pb.ink} colour on ${trim.widthIn} x ${trim.heightIn} in: ${range.value.min} to ${range.value.max}).${info && info.pageCount !== plan.length ? ` The page plan has ${plan.length} pages.` : ''}${range.warnings.length ? ` ${range.warnings.join(' ')}` : ''}`,
  });

  const missing = new Set<number>(pb.doc.spreads.filter((s) => !s.imageKey).map((s) => s.n));
  for (const n of pb.layout?.missingImages ?? []) missing.add(n);
  if (info)
    plan.forEach((p, i) => {
      if (p.kind === 'spread' && !(info.imagesPerPage[i] ?? 0)) missing.add(p.n);
    });
  out.push({
    id: 'picture.spread-images',
    label: 'Every spread has its picture',
    level: missing.size || !pb.doc.spreads.length ? 'fail' : 'pass',
    detail: !pb.doc.spreads.length
      ? 'The book has no spreads.'
      : missing.size
        ? `No picture on spread ${[...missing].sort((a, b) => a - b).join(', ')}. Make the missing pictures before upload.`
        : `${pb.doc.spreads.length} spreads, each with a picture across both pages${info ? ' (checked in the PDF)' : ''}.`,
  });

  if (pb.layout) {
    const g = pictureBookGeometry(rules, trim, pages);
    const outside = checkTextInSafeArea(g, pb.layout.textBoxes);
    const problems = [...outside.map((f) => f.message), ...pb.layout.overflowing.map((l) => `The text of ${l} does not fit its box.`)];
    out.push({
      id: 'picture.safe-area',
      label: 'Text inside the safe area',
      level: problems.length ? 'fail' : 'pass',
      detail: problems.length
        ? `${problems.slice(0, 4).join(' ')}${problems.length > 4 ? ` And ${problems.length - 4} more.` : ''}`
        : `${pb.layout.textBoxes.length} text boxes, all at least ${g.safe.outsideIn} in from the outside, top and bottom trim edges and ${g.safe.insideIn} in from the gutter.`,
    });
  } else {
    out.push({ id: 'picture.safe-area', label: 'Text inside the safe area', level: 'warn', detail: 'Not measured: export the picture-book PDF first.' });
  }

  const tpl = isObj(template) && isObj(template.spreads) ? pictureBookRulesFromTemplate(template) : undefined;
  const findings = checkPictureBook(pb.doc, { rules, trim, ink: pb.ink, ...(tpl ? { template: tpl } : {}) }).filter(
    (f) => f.code !== 'picture.page-count' && f.code !== 'picture.spread-image',
  );
  const blocking = findings.filter((f) => f.severity === 'block');
  out.push({
    id: 'picture.spreads',
    label: 'Spreads complete',
    level: blocking.length ? 'fail' : findings.length ? 'warn' : 'pass',
    detail: findings.length
      ? `${findings
          .slice(0, 4)
          .map((f) => f.message)
          .join(' ')}${findings.length > 4 ? ` And ${findings.length - 4} more.` : ''}`
      : 'Every spread has text and the spreads are numbered in order.',
  });
  return out;
}

/** House-style findings that block in the manuscript (em and en dashes, banned phrases, US spellings), per text. */
function houseFindings(texts: { where: string; text: string }[], style: CompiledHouseStyle): string[] {
  return texts.flatMap(({ where, text }) =>
    checkText(text, style, { rules: ['emdash', 'endash', 'banned', 'spelling'] })
      .filter((f) => f.severity === 'error')
      .map((f) => `"${f.match}" in ${where}`),
  );
}

/** The nonfiction template's back-cover-blurb range (packages.publishing limits.words), for templates that set none (the workbook, "same as nonfiction"). */
const DEFAULT_BLURB_WORDS = { min: 120, max: 200 };

/** The word range for the back-cover blurb: the template's packages.publishing back-cover-blurb limits.words, else the nonfiction template's. */
export function blurbWordRange(template: unknown): { min?: number; max?: number } {
  const publishing = isObj(template) && isObj(template.packages) ? template.packages.publishing : undefined;
  const item: unknown = Array.isArray(publishing) ? (publishing as unknown[]).find((p) => isObj(p) && p.id === 'back-cover-blurb') : undefined;
  const words = isObj(item) && isObj(item.limits) && isObj(item.limits.words) ? item.limits.words : undefined;
  if (!words) return DEFAULT_BLURB_WORDS;
  const out: { min?: number; max?: number } = {};
  if (typeof words.min === 'number') out.min = words.min;
  if (typeof words.max === 'number') out.max = words.max;
  return out;
}

/** `listing.style`, `listing.blurb-style`, `listing.blurb-length` and `marketing.style`, for the texts that are given. */
function outsideTextItems(input: PreflightInput): CheckItem[] {
  const out: CheckItem[] = [];
  const style = input.houseStyle;
  const l = input.listing;
  const listingTexts = [
    { where: 'the title', text: l.title },
    { where: 'the subtitle', text: l.subtitle ?? '' },
    { where: 'the description', text: htmlToParagraphs(l.description ?? '').join('\n\n') },
  ].filter((t) => t.text.trim());
  const listingHits = houseFindings(listingTexts, style);
  out.push({
    id: 'listing.style',
    label: 'Listing house style (title, subtitle, description)',
    level: listingHits.length ? 'fail' : 'pass',
    detail: listingHits.length
      ? `${listingHits.length} problem(s), first: ${listingHits.slice(0, 3).join('; ')}.`
      : 'No em or en dashes, banned phrases or US spellings.',
  });
  const blurb = input.blurb?.trim();
  if (blurb) {
    const hits = houseFindings([{ where: 'the blurb', text: blurb }], style);
    out.push({
      id: 'listing.blurb-style',
      label: 'Back-cover blurb house style',
      level: hits.length ? 'fail' : 'pass',
      detail: hits.length ? `${hits.length} problem(s), first: ${hits.slice(0, 3).join('; ')}.` : 'No em or en dashes, banned phrases or US spellings.',
    });
    const range = blurbWordRange(input.template);
    const words = countWords(blurb);
    const short = range.min !== undefined && words < range.min;
    const long = range.max !== undefined && words > range.max;
    const want =
      range.min !== undefined && range.max !== undefined
        ? `${range.min} to ${range.max}`
        : range.min !== undefined
          ? `at least ${range.min}`
          : `at most ${range.max ?? '?'}`;
    out.push({
      id: 'listing.blurb-length',
      label: 'Back-cover blurb length',
      level: short || long ? 'warn' : 'pass',
      detail: `${words} words (the template asks for ${want}).${short ? ' Add to it so the back cover sells the book.' : long ? ' Cut it so it fits the back cover.' : ''}`,
    });
  }
  const mk = input.marketing ?? {};
  const marketingTexts = [
    { where: 'the TikTok scripts', text: mk.tiktokScripts ?? '' },
    { where: 'the Instagram captions', text: mk.instagramCaptions ?? '' },
    { where: 'the launch email', text: mk.launchEmail ?? '' },
  ].filter((t) => t.text.trim());
  if (marketingTexts.length) {
    const hits = houseFindings(marketingTexts, style);
    out.push({
      id: 'marketing.style',
      label: 'Marketing house style',
      level: hits.length ? 'warn' : 'pass',
      detail: hits.length
        ? `${hits.length} problem(s), first: ${hits.slice(0, 3).join('; ')}. Fix them before you post.`
        : 'No em or en dashes, banned phrases or US spellings.',
    });
  }
  return out;
}

/**
 * The owner's own eBook cover against rule ebook.cover (FACTS 10.5): JPEG or TIFF, at least the minimum pixels, at
 * most the maximum a side, height at least minHeightToWidthRatio times the width, RGB, under the size limit. Smaller
 * than the ideal size passes with a warning.
 */
export async function ownEbookCoverItem(cover: Buffer, rules: KdpRules): Promise<CheckItem> {
  const spec = ebookCoverSpec(rules);
  const base = { id: 'ebook.cover', label: 'eBook cover (your own)', factIds: ['10.5'] };
  let meta: Metadata;
  try {
    meta = await sharp(cover).metadata();
  } catch {
    return { ...base, level: 'fail', detail: 'The file could not be read as an image. Upload a JPEG or TIFF.' };
  }
  const types = new Set(spec.fileTypes.map((t) => t.toLowerCase()));
  const format = meta.format === 'jpeg' ? 'jpeg' : meta.format === 'tiff' ? 'tiff' : (meta.format ?? '?');
  const w = meta.width;
  const h = meta.height;
  const problems: string[] = [];
  if (!types.has(format)) problems.push(`${format.toUpperCase()} is not a KDP eBook cover type (${spec.fileTypes.join(', ')})`);
  if (w < spec.minWidthPx || h < spec.minHeightPx) problems.push(`${w} x ${h} px is under the minimum ${spec.minWidthPx} x ${spec.minHeightPx} px`);
  if (w > spec.maxPxEachSide || h > spec.maxPxEachSide) problems.push(`a side is over ${spec.maxPxEachSide} px`);
  // Pixel sizes are whole numbers, so allow the rounding of one pixel in the height.
  if (w > 0 && (h + 1) / w < spec.minRatio) problems.push(`height to width is ${(h / w).toFixed(2)}:1, under ${spec.minRatio}:1`);
  const rgb = meta.space === 'srgb' || meta.space === 'rgb';
  if (!rgb) problems.push(`colour is ${meta.space ?? 'unknown'}, not ${spec.colourMode}`);
  if (cover.length >= spec.maxFileSizeMB * 1024 * 1024) problems.push(`the file is over ${spec.maxFileSizeMB} MB`);
  const small = w < spec.widthPx || h < spec.heightPx;
  const said = `${format.toUpperCase()} ${w} x ${h} px, ${meta.space ?? '?'}, ${(cover.length / 1024).toFixed(0)} KB`;
  if (problems.length) return { ...base, level: 'fail', detail: `${said}: ${problems.join('; ')}.` };
  return {
    ...base,
    level: small ? 'warn' : 'pass',
    detail: small
      ? `${said}. Accepted, but KDP's ideal is ${spec.widthPx} x ${spec.heightPx} px; a smaller cover can look soft on large screens.`
      : `${said}. Within KDP's limits.`,
  };
}

/**
 * The owner's own paperback wrap (the size and fonts are checked by the caller): image resolution against
 * paperback.cover minDpi, the colour of its images (no KDP colour rule for paperback covers in config/kdp-rules, so a
 * warning marked unverified), and the spine text rule, which Volume cannot read from the PDF.
 */
async function ownWrapItems(wrap: Buffer, info: PdfInspection, rules: KdpRules, pages: number | undefined): Promise<CheckItem[]> {
  const out: CheckItem[] = [];
  const min = coverMinDpi(rules);
  const lowest = info.images.reduce<PdfImageUse | undefined>((lo, i) => (!lo || i.dpi < lo.dpi ? i : lo), undefined);
  out.push({
    id: 'wrap.dpi',
    label: 'Cover image resolution',
    level: !lowest || lowest.dpi >= min - 0.5 ? 'pass' : 'fail',
    detail: lowest
      ? `${info.images.length} image(s); the lowest is ${lowest.widthPx} x ${lowest.heightPx} px at about ${Math.floor(lowest.dpi + 0.5)} DPI (minimum ${min}).`
      : 'No raster images in the wrap (text and shapes only).',
    factIds: ['3.8'],
  });
  const spaces = await pdfImageColourSpaces(wrap).catch(() => ['not readable']);
  out.push({
    id: 'wrap.colour',
    label: 'Cover colour (unverified rule)',
    level: 'warn',
    detail: `${spaces.length ? `Image colour: ${spaces.join(', ')}.` : 'No raster images.'} config/kdp-rules has no confirmed rule on the colour mode of a paperback cover PDF, so this is not checked: confirm it in KDP's cover guidance and the printed proof.`,
  });
  const minPages = rules.rules.find((r) => r.id === 'paperback.spine.textMinPages')?.value;
  if (pages !== undefined && typeof minPages === 'number')
    out.push({
      id: 'wrap.spine-text',
      label: 'Spine text rule',
      level: pages >= minPages ? 'pass' : 'warn',
      detail:
        pages >= minPages
          ? `${pages} pages: spine text is allowed (from ${minPages} pages).`
          : `${pages} pages: KDP rejects spine text under ${minPages} pages. Volume cannot read text on your wrap's spine, so check it has none.`,
      factIds: ['3.10'],
    });
  return out;
}

/** Preflight item `structure.template-rules`: block findings fail, warn findings warn. */
function templateRulesItem(book: BookDoc, template: Record<string, unknown>): CheckItem {
  const name = typeof template.name === 'string' ? template.name : 'book';
  const base = { id: 'structure.template-rules', label: `${name} template rules` };
  let findings;
  try {
    findings = checkBookTemplateRules(book, templateRulesFromTemplate(template));
  } catch (e) {
    return { ...base, level: 'fail', detail: `The template's chapter rules could not be read: ${e instanceof Error ? clip(e.message) : 'unknown error'}.` };
  }
  if (!findings.length) return { ...base, level: 'pass', detail: 'Every chapter follows the template rules.' };
  const blocking = findings.filter((f) => f.severity === 'block');
  const first = [...blocking, ...findings.filter((f) => f.severity !== 'block')].slice(0, 4).map((f) => f.message);
  return {
    ...base,
    level: blocking.length ? 'fail' : 'warn',
    detail: `${findings.length} problem(s): ${first.join(' ')}${findings.length > first.length ? ` And ${findings.length - first.length} more.` : ''}`,
  };
}

/** A block as plain lines for the junk check: list and takeaway items keep their "- " marker, empty ones included. */
function blockSource(b: BookDoc['sections'][number]['blocks'][number]): string {
  switch (b.type) {
    case 'paragraph':
    case 'heading2':
    case 'heading3':
    case 'callout':
      return b.text;
    case 'list':
    case 'takeaways':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'table':
      return b.rows.map((r) => r.join(' | ')).join('\n');
    case 'quote':
      return [...b.lines, b.attribution ?? ''].join('\n');
    case 'image':
      return b.caption ?? '';
    case 'checklist':
      return b.items.map((i) => `- ${i}`).join('\n');
    case 'fillIn':
      return b.prompts.join('\n');
    case 'exercise':
      return [b.title ?? '', ...b.blocks.map(blockSource)].filter(Boolean).join('\n');
    default:
      return '';
  }
}

function sectionLabel(s: BookDoc['sections'][number]): string {
  return s.title || s.id;
}

const clip = (t: string, n = 90) => {
  const s = t.replace(/\s+/g, ' ').trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}...` : s;
};

export function preflightText(report: PreflightReport, title = 'Preflight'): string {
  const lines = [title, '='.repeat(title.length), `${report.counts.pass} pass, ${report.counts.warn} warn, ${report.counts.fail} fail`, ''];
  for (const i of report.items)
    lines.push(`${i.level.toUpperCase().padEnd(4)}  ${i.label}: ${i.detail}${i.factIds?.length ? ` (FACTS ${i.factIds.join(', ')})` : ''}`);
  return `${lines.join('\n')}\n`;
}

export function preflightHtml(report: PreflightReport, title = 'Preflight'): string {
  const colour = { pass: '#1f6b3a', warn: '#8a5a00', fail: '#a1261b' } as const;
  const rows = report.items
    .map(
      (i) =>
        `<tr><td><span class="b" style="background:${colour[i.level]}">${i.level.toUpperCase()}</span></td><td>${escapeHtml(i.label)}</td><td>${escapeHtml(i.detail)}${i.factIds?.length ? ` <small>(FACTS ${escapeHtml(i.factIds.join(', '))})</small>` : ''}</td></tr>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>
body{font:15px/1.45 system-ui,sans-serif;margin:24px;color:#1b1b1b;background:#faf8f3}h1{font-size:22px}table{border-collapse:collapse;width:100%;background:#fff}
td{border-bottom:1px solid #e3ded3;padding:8px;vertical-align:top}.b{color:#fff;border-radius:4px;padding:2px 6px;font-size:12px;font-weight:600}
</style></head><body><h1>${escapeHtml(title)}</h1><p>${report.counts.pass} pass, ${report.counts.warn} warn, ${report.counts.fail} fail.</p><table>${rows}</table></body></html>
`;
}

// Preflight (docs/06-EXPORT-SPEC.md, Preflight): pass / warn / fail items before the upload pack is built.
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import sharp from 'sharp';
import {
  checkBookStyle,
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
  trimPageRange,
  wrapSizeIn,
  type BookDoc,
  type CheckItem,
  type CompiledHouseStyle,
  type KdpRules,
  type ListingInput,
  type Paper,
  type TrimKey,
} from '@volume/core';

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
}

/** Read a PDF with pdfjs-dist: page sizes, every font used (embedded or not, Type 3 or not) and the text per page. */
export async function inspectPdf(pdf: Buffer, opts: { text?: boolean } = {}): Promise<PdfInspection> {
  const task = getDocument({ data: new Uint8Array(pdf), fontExtraProperties: true, useSystemFonts: false, verbosity: 0 });
  const doc = await task.promise;
  const sizes = new Map<string, { widthPt: number; heightPt: number }>();
  const fonts = new Map<string, PdfFontInfo>();
  const pageText: string[] = [];
  const pageParts: PdfInspection['pageParts'] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = page.view;
      const w = Math.round((x1 - x0) * 100) / 100;
      const h = Math.round((y1 - y0) * 100) / 100;
      sizes.set(`${w}x${h}`, { widthPt: w, heightPt: h });
      const ops = await page.getOperatorList();
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
  return { pageCount: doc.numPages, pageSizes: [...sizes.values()], fonts: [...byName.values()], pageText, pageParts };
}

// ---------- preflight ----------

export interface ClaimItem {
  chapter: string;
  sentence: string;
  category: string;
  check: string;
  status: 'open' | 'verified' | 'removed';
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
  const contents = secs.find((s) => s.subtype === 'contents');
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
  add({
    id: 'claims.open',
    label: 'Claims to verify',
    level: openClaims.length || (!input.claims && claimHits.length) ? 'warn' : 'pass',
    detail: input.claims
      ? `${openClaims.length} open claim(s) in the claims report.`
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
    const same = text.replace(/\s+/g, ' ').trim() === input.profileBio.replace(/\s+/g, ' ').trim();
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
  if (input.aiDisclosure) {
    const a = input.aiDisclosure;
    const needed = a.aiWroteText || a.aiMadeImages;
    const ok = needed ? a.disclosed === 'ai-generated' : true;
    add({
      id: 'kdp.ai-disclosure',
      label: 'KDP AI disclosure',
      level: ok ? 'pass' : 'fail',
      detail: needed
        ? `AI made ${[a.aiWroteText ? 'text' : '', a.aiMadeImages ? 'images' : ''].filter(Boolean).join(' and ')}: disclosure must be AI-generated (set: ${a.disclosed}).`
        : 'No AI-generated content recorded.',
      factIds: ['5.5'],
    });
  }

  // Listing
  for (const i of checkListing(rules, input.listing)) add(i);

  // Interior PDF
  let interiorPages: number | undefined;
  const trim = parseTrimKey(input.trim);
  if (input.interiorPdf) {
    const info = await inspectPdf(input.interiorPdf, { text: false });
    interiorPages = info.pageCount;
    const sizeOk =
      info.pageSizes.length === 1 &&
      near(info.pageSizes[0]?.widthPt ?? 0, trim.widthIn * 72, 0.5) &&
      near(info.pageSizes[0]?.heightPt ?? 0, trim.heightIn * 72, 0.5);
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
    const range = trimPageRange(rules, trim);
    const inRange = info.pageCount >= range.value.min && info.pageCount <= range.value.max;
    add({
      id: 'interior.pages',
      label: 'Page count within trim limits',
      level: inRange ? (range.warnings.length ? 'warn' : 'pass') : 'fail',
      detail: `${info.pageCount} pages (allowed ${range.value.min} to ${range.value.max}).${range.warnings.length ? ` ${range.warnings.join(' ')}` : ''}`,
      factIds: ['3.6'],
    });
    if (input.insideMarginIn !== undefined) {
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
      const want = wrapSizeIn(rules, { trim, pages, paper: input.paper });
      const got = info.pageSizes[0];
      const ok = got !== undefined && near(got.widthPt / 72, want.widthIn, 0.001) && near(got.heightPt / 72, want.heightIn, 0.001);
      add({
        id: 'wrap.size',
        label: 'Wrap size matches the formula',
        level: ok ? 'pass' : 'fail',
        detail: `${got ? `${(got.widthPt / 72).toFixed(4)} x ${(got.heightPt / 72).toFixed(4)} in` : 'no page'}; formula for ${pages} pages on ${input.paper}: ${want.widthIn.toFixed(4)} x ${want.heightIn.toFixed(4)} in (spine ${want.spineIn.toFixed(4)} in).`,
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
    const bad = info.fonts.filter((f) => !f.embedded || f.type3);
    add({
      id: 'wrap.fonts',
      label: 'Wrap fonts embedded',
      level: bad.length ? 'fail' : 'pass',
      detail: bad.length ? bad.map((f) => f.name).join(', ') : `${info.fonts.length} fonts, all embedded.`,
    });
  }

  // eBook cover
  if (input.ebookCover) {
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
          ? 'No eBook cover or paperback wrap yet. Build the covers in the cover studio. Single files still export.'
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
    label: 'KDP rules file age',
    level: age.stale ? 'warn' : 'pass',
    detail: age.stale
      ? `KDP rules are more than ${rules.recheckAfterDays} days old (${age.days} days): re-check before you upload.`
      : `Rules ${rules.version}, ${age.days} days old.`,
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

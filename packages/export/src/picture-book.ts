// Picture-book print PDF (phase 7, P7-3, D-044): full-colour interior with bleed, one 2:1 picture across each spread
// and the text in a box inside the safe area. Sizes come only from the KDP rules (pictureBookGeometry in @volume/core).
//
// Every page has a fixed size and fixed content, so there is nothing to paginate: the HTML is a list of page boxes
// printed by Chromium at the bleed page size (no Paged.js). After layout, each text box is measured in the page DOM
// and checked against the safe area.
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { Browser } from 'playwright';
import {
  DEFAULT_INTERIOR_THEME,
  checkTextInSafeArea,
  escapeHtml,
  inlineToHtml,
  parseTrimKey,
  pictureBookGeometry,
  pictureBookPages,
  safeRectIn,
  spreadBlocks,
  trimBoxIn,
  type KdpRules,
  type PageSide,
  type PictureBookDoc,
  type PictureBookGeometry,
  type PictureBookPage,
  type RectIn,
  type SafeAreaFinding,
  type Section,
  type Spread,
  type TextBoxIn,
  type TrimKey,
} from '@volume/core';
import { withBrowser } from './browser.ts';
import { fontFaceCss, loadFontLibrary, resolveFamily, type FontLibrary } from './fonts.ts';

/** Default trim for picture books (D-044); the owner can pick another trim from the rules file. */
export const PICTURE_BOOK_DEFAULT_TRIM: TrimKey = '8.5x8.5';

export interface PictureBookPdfOptions {
  /** Trim size. Default 8.5 x 8.5 in (D-044). */
  trim?: TrimKey;
  /** Pictures by `Spread.imageKey`: PNG, JPEG or WebP, ideally 2:1. Each is cropped to the spread and split at the gutter. */
  images: Record<string, Buffer>;
  browser?: Browser;
  fonts?: FontLibrary;
  /** Text and heading families (OFL fonts from assets/fonts). Default: the default interior theme's body and display fonts. */
  bodyFont?: string;
  displayFont?: string;
  /** Story text size in points. Default 17. */
  textPt?: number;
  /** Fixed dates make the output reproducible. */
  creationDate?: Date;
  timeoutMs?: number;
}

/** What the page DOM showed after layout: used by preflight (`picture.safe-area`, `picture.spread-images`). */
export interface PictureBookLayout {
  /** Every text box, in inches from the top-left corner of its page (with bleed). */
  textBoxes: TextBoxIn[];
  /** Text boxes whose text does not fit their box (labels). */
  overflowing: string[];
  /** Spread numbers with no picture on one or both pages. */
  missingImages: number[];
}

export interface PictureBookPdfResult {
  buffer: Buffer;
  pageCount: number;
  widthPt: number;
  heightPt: number;
  pages: PictureBookPage[];
  geometry: PictureBookGeometry;
  layout: PictureBookLayout;
  /** Text boxes outside the safe area (empty when every box is inside). */
  safeArea: SafeAreaFinding[];
  /** KDP rule ids the layout used. */
  ruleIds: string[];
  warnings: string[];
  html: string;
}

const PX_PER_IN = 96;

interface SpreadArt {
  left: string;
  right: string;
}

/** Crop a picture to the spread's shape (both pages with bleed) around its centre and split it at the gutter. */
async function splitSpreadImage(buf: Buffer, g: PictureBookGeometry): Promise<SpreadArt> {
  const aspect = (2 * g.page.widthIn) / g.page.heightIn;
  const meta = await sharp(buf).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  if (!w || !h) throw new Error('A spread picture has no size.');
  let cw = w;
  let ch = h;
  if (w / h > aspect) cw = Math.round(h * aspect);
  else ch = Math.round(w / aspect);
  const x = Math.floor((w - cw) / 2);
  const y = Math.floor((h - ch) / 2);
  const half = Math.floor(cw / 2);
  const part = async (left: number, width: number) =>
    `data:image/jpeg;base64,${(
      await sharp(buf)
        .extract({ left, top: y, width, height: ch })
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 90, chromaSubsampling: '4:4:4' })
        .toBuffer()
    ).toString('base64')}`;
  return { left: await part(x, half), right: await part(x + half, cw - half) };
}

const inches = (r: RectIn) => `left:${r.xIn}in;top:${r.yIn}in;width:${r.widthIn}in;height:${r.heightIn}in;`;

/** The page a spread's text goes on, and where in the safe area: left and right pages by layout; top and bottom on the left page. */
export function spreadTextPlacement(layout: Spread['layout']): { side: PageSide; align: 'top' | 'middle' | 'bottom' } {
  switch (layout) {
    case 'text-left':
      return { side: 'left', align: 'middle' };
    case 'text-right':
      return { side: 'right', align: 'middle' };
    case 'text-top':
      return { side: 'left', align: 'top' };
    case 'text-bottom':
      return { side: 'left', align: 'bottom' };
  }
}

function matterHtml(s: Section, book: PictureBookDoc): string {
  const paras = (cls = '') =>
    s.blocks
      .map((b) =>
        b.type === 'paragraph'
          ? `<p${cls ? ` class="${cls}"` : ''}>${inlineToHtml(b.text)}</p>`
          : b.type === 'list'
            ? b.items.map((i) => `<p>${inlineToHtml(i)}</p>`).join('')
            : '',
      )
      .join('');
  if (s.subtype === 'titlepage') {
    const [t = book.meta.title, sub = '', author = book.meta.author, ...rest] = s.lines ?? [];
    return `<div class="txt title" data-label="${escapeHtml(s.title || 'Title Page')}"><div class="t">${escapeHtml(t)}</div>${sub ? `<div class="s">${escapeHtml(sub)}</div>` : ''}<div class="a">${escapeHtml(author)}</div>${rest.map((x) => `<div class="lbl">${escapeHtml(x)}</div>`).join('')}</div>`;
  }
  if (s.subtype === 'copyright') return `<div class="txt copyright" data-label="Copyright">${paras()}</div>`;
  return `<div class="txt matter" data-label="${escapeHtml(s.title)}"><h1>${escapeHtml(s.title)}</h1>${paras()}</div>`;
}

/** Runs in the page after fonts load (plain JS string, see pdf.ts). */
const MEASURE_SCRIPT = `(() => {
  const px = ${PX_PER_IN};
  const boxes = [];
  const overflowing = [];
  const missing = new Set();
  document.querySelectorAll('.pg').forEach((pg, i) => {
    const pr = pg.getBoundingClientRect();
    const sn = pg.dataset.spread;
    if (sn) {
      const img = pg.querySelector('img.art');
      if (!img || !img.complete || img.naturalWidth === 0) missing.add(Number(sn));
    }
    pg.querySelectorAll('.txt').forEach((t) => {
      const r = t.getBoundingClientRect();
      boxes.push({ page: i + 1, label: t.dataset.label || '', rect: { xIn: (r.left - pr.left) / px, yIn: (r.top - pr.top) / px, widthIn: r.width / px, heightIn: r.height / px } });
      if (t.scrollHeight > t.clientHeight + 1 || t.scrollWidth > t.clientWidth + 1) overflowing.push(t.dataset.label || '');
    });
  });
  return { textBoxes: boxes, overflowing, missingImages: [...missing].sort((a, b) => a - b) };
})()`;

/** Build the picture-book HTML (exported for previews and tests). */
export async function buildPictureBookHtml(
  doc: PictureBookDoc,
  g: PictureBookGeometry,
  opts: Pick<PictureBookPdfOptions, 'images' | 'bodyFont' | 'displayFont' | 'textPt'> & { fonts: FontLibrary },
): Promise<{ html: string; pages: PictureBookPage[]; warnings: string[] }> {
  const warnings: string[] = [];
  const pages = pictureBookPages(doc);
  const body = resolveFamily(opts.fonts, opts.bodyFont ?? DEFAULT_INTERIOR_THEME.fonts.body, DEFAULT_INTERIOR_THEME.fonts.body, warnings);
  const display = resolveFamily(opts.fonts, opts.displayFont ?? DEFAULT_INTERIOR_THEME.fonts.display, DEFAULT_INTERIOR_THEME.fonts.display, warnings);
  const sections = new Map([...doc.front, ...doc.back].map((s) => [s.id, s]));
  const spreads = new Map(doc.spreads.map((s) => [s.n, s]));
  const art = new Map<number, SpreadArt>();
  for (const sp of doc.spreads) {
    const buf = sp.imageKey ? opts.images[sp.imageKey] : undefined;
    if (buf) art.set(sp.n, await splitSpreadImage(buf, g));
    else warnings.push(`Spread ${sp.n} has no picture${sp.imageKey ? ` (no data for "${sp.imageKey}")` : ''}.`);
  }

  const html = pages.map((p, i) => {
    const side = p.side;
    const safe = inches(safeRectIn(g, side));
    if (p.kind === 'blank') return `<div class="pg ${side}" data-page="${i + 1}"></div>`;
    if (p.kind === 'matter') {
      const s = sections.get(p.sectionId);
      return `<div class="pg ${side} matter-page" data-page="${i + 1}">${s ? `<div class="safe ${s.subtype === 'copyright' ? 'bottom' : 'middle'}" style="${safe}">${matterHtml(s, doc)}</div>` : ''}</div>`;
    }
    const sp = spreads.get(p.n);
    const a = art.get(p.n);
    const img = a ? `<img class="art" src="${side === 'left' ? a.left : a.right}" alt="">` : '';
    const place = sp ? spreadTextPlacement(sp.layout) : undefined;
    const text =
      sp && place && place.side === side && sp.text.trim()
        ? `<div class="safe ${place.align}" style="${safe}"><div class="txt story" data-label="spread ${sp.n}">${spreadBlocks(sp)
            .map((b) => (b.type === 'paragraph' ? `<p>${inlineToHtml(b.text)}</p>` : ''))
            .join('')}</div></div>`
        : '';
    return `<div class="pg ${side}" data-page="${i + 1}" data-spread="${p.n}">${img}${text}</div>`;
  });

  const textPt = opts.textPt ?? 17;
  const css = `
${fontFaceCss(opts.fonts, [body], [400, 600])}
${display !== body ? fontFaceCss(opts.fonts, [display], [800]) : ''}
@page { size: ${g.page.widthIn}in ${g.page.heightIn}in; margin: 0; }
* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-synthesis: none; }
body { margin: 0; font-family: '${body}'; color: #1b1b1b; }
.pg { position: relative; width: ${g.page.widthIn}in; height: ${g.page.heightIn}in; overflow: hidden; background: #ffffff; }
.pg + .pg { break-before: page; }
img.art { position: absolute; left: 0; top: 0; width: 100%; height: 100%; display: block; }
.safe { position: absolute; display: flex; flex-direction: column; }
.safe.top { justify-content: flex-start; }
.safe.middle { justify-content: center; }
.safe.bottom { justify-content: flex-end; }
.txt { max-height: 100%; overflow: hidden; flex: none; }
.story { background: rgba(255, 255, 255, 0.84); border-radius: 0.14in; padding: 0.16in 0.2in; font-size: ${textPt}pt; line-height: 1.38; }
.story p { margin: 0; }
.story p + p { margin-top: 0.5em; }
.title { text-align: center; }
.title .t { font-family: '${display}'; font-weight: 800; font-size: 34pt; line-height: 1.12; }
.title .s { font-size: 16pt; margin-top: 10pt; font-weight: 600; }
.title .a { font-size: 16pt; margin-top: 40pt; font-weight: 600; }
.title .lbl { font-size: 10pt; margin-top: 18pt; }
.copyright { font-size: 9pt; line-height: 1.45; }
.copyright p { margin: 0 0 5pt; }
.matter { text-align: center; font-size: 14pt; line-height: 1.45; }
.matter h1 { font-family: '${display}'; font-weight: 800; font-size: 22pt; margin: 0 0 14pt; }
.matter p { margin: 0 0 8pt; }
`;
  const title = doc.meta.subtitle ? `${doc.meta.title}: ${doc.meta.subtitle}` : doc.meta.title;
  return {
    html: `<!doctype html><html lang="${escapeHtml(doc.meta.language)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${css}</style></head><body>${html.join('\n')}</body></html>`,
    pages,
    warnings,
  };
}

/** Export a picture book as a full-bleed colour print PDF, with the measured layout for preflight. */
export async function exportPictureBookPdf(doc: PictureBookDoc, rules: KdpRules, opts: PictureBookPdfOptions): Promise<PictureBookPdfResult> {
  const trimKey = opts.trim ?? PICTURE_BOOK_DEFAULT_TRIM;
  const trim = parseTrimKey(trimKey);
  const g = pictureBookGeometry(rules, trim, pictureBookPages(doc).length);
  const fonts = opts.fonts ?? loadFontLibrary();
  const built = await buildPictureBookHtml(doc, g, { ...opts, fonts });
  const { pdf, layout } = await withBrowser(opts.browser, async (browser) => {
    const ctx = await browser.newContext();
    try {
      const page = await ctx.newPage();
      await page.setContent(built.html, { waitUntil: 'load', timeout: opts.timeoutMs ?? 120_000 });
      await page.evaluate('document.fonts.ready.then(() => true)');
      await page.emulateMedia({ media: 'print' });
      const measured = await page.evaluate<PictureBookLayout>(MEASURE_SCRIPT);
      const bytes = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true });
      return { pdf: bytes, layout: measured };
    } finally {
      await ctx.close();
    }
  });

  const pdfDoc = await PDFDocument.load(pdf, { updateMetadata: false });
  // Chromium rounds the PDF page size to whole 1/300 in units (8.625 in comes out as 621.12 pt) and lays the content
  // out at its exact CSS size from the top-left corner, leaving a blank sliver on the right or bottom. The media box
  // is set to the exact bleed size from the top-left, which removes only that sliver. Trim and bleed boxes then show
  // where KDP cuts: the bleed sits on the outside edge, top and bottom.
  const W = g.page.widthIn * 72;
  const H = g.page.heightIn * 72;
  pdfDoc.getPages().forEach((p, i) => {
    const y0 = p.getHeight() - H;
    p.setMediaBox(0, y0, W, H);
    p.setCropBox(0, y0, W, H);
    p.setBleedBox(0, y0, W, H);
    const t = trimBoxIn(g, built.pages[i]?.side ?? (i % 2 === 0 ? 'right' : 'left'));
    p.setTrimBox(t.xIn * 72, y0 + H - (t.yIn + t.heightIn) * 72, t.widthIn * 72, t.heightIn * 72);
  });
  const title = doc.meta.subtitle ? `${doc.meta.title}: ${doc.meta.subtitle}` : doc.meta.title;
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(doc.meta.author);
  pdfDoc.setSubject(`Picture book interior, ${trimKey} in with bleed, full colour`);
  pdfDoc.setCreator('Volume');
  pdfDoc.setProducer('Volume export (Chromium, pdf-lib)');
  pdfDoc.setLanguage(doc.meta.language);
  const when = opts.creationDate ?? new Date();
  pdfDoc.setCreationDate(when);
  pdfDoc.setModificationDate(when);
  const bytes = await pdfDoc.save({ useObjectStreams: true });
  const first = pdfDoc.getPage(0).getSize();

  const warnings = [...g.warnings, ...built.warnings];
  if (pdfDoc.getPageCount() !== built.pages.length) warnings.push(`The PDF has ${pdfDoc.getPageCount()} pages; the page plan has ${built.pages.length}.`);
  if (Math.abs(first.width - g.page.widthIn * 72) > 0.5 || Math.abs(first.height - g.page.heightIn * 72) > 0.5)
    warnings.push(`Page size ${first.width} x ${first.height} pt does not match the bleed size ${g.page.widthIn} x ${g.page.heightIn} in.`);
  for (const label of layout.overflowing) warnings.push(`The text of ${label} does not fit its box.`);
  return {
    buffer: Buffer.from(bytes),
    pageCount: pdfDoc.getPageCount(),
    widthPt: first.width,
    heightPt: first.height,
    pages: built.pages,
    geometry: g,
    layout,
    safeArea: checkTextInSafeArea(g, layout.textBoxes),
    ruleIds: [...g.ruleIds],
    warnings,
    html: built.html,
  };
}

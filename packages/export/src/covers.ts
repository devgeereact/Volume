// Covers: the eBook cover JPEG (1600 x 2560, sRGB) and the paperback wrap PDF (back, spine, front with bleed).
// Typography is HTML in Playwright Chromium; sharp writes the JPEG; pdf-lib fixes the wrap's exact page size.

import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import type { Browser } from 'playwright';
import {
  barcodeArea,
  coverMinDpi,
  coverSafeZone,
  DEFAULT_COVER_STYLE,
  ebookCoverSpec,
  escapeHtml,
  parseTrimKey,
  spineTextAllowed,
  wrapSizeIn,
  type BookMeta,
  type ColourInk,
  type CoverStyle,
  type KdpRules,
  type Paper,
  type TrimKey,
  type WrapSize,
} from '@volume/core';
import { withBrowser } from './browser.ts';
import { fontFaceCss, isVariableOnly, loadFontLibrary, resolveFamily, type FontLibrary } from './fonts.ts';
import { normalisePrintStrings, normalisePrintText } from './print-glyphs.ts';
import { ornamentSvg } from './ornaments.ts';

function sniff(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  return 'image/webp';
}
const dataUrl = (buf: Buffer) => `data:${sniff(buf)};base64,${buf.toString('base64')}`;

interface Fonts {
  css: string;
  title: string;
  subtitle: string;
  author: string;
}
function coverFonts(style: CoverStyle, lib: FontLibrary, warnings: string[]): Fonts & { variable: boolean } {
  // Covers may use variable fonts: the eBook cover is a screenshot, and the wrap is rasterised when they are used.
  const fo = { allowVariable: true };
  const title = resolveFamily(lib, style.fonts.title, 'Plus Jakarta Sans', warnings, fo);
  const subtitle = resolveFamily(lib, style.fonts.subtitle, 'Source Sans 3', warnings, fo);
  const author = resolveFamily(lib, style.fonts.author, title, warnings, fo);
  const fams = [...new Set([title, subtitle, author])];
  return {
    css: fontFaceCss(lib, fams, [style.weights.title, style.weights.subtitle, style.weights.author, 400]),
    title,
    subtitle,
    author,
    variable: fams.some((f) => isVariableOnly(lib, f)),
  };
}

/**
 * Front cover composition. Sizes use container units (cqw/cqh) so the same design fills a 1600 x 2560 px eBook cover
 * and a trim-sized paperback front panel.
 */
function frontHtml(meta: BookMeta, style: CoverStyle, bg: string | undefined): string {
  const title = style.titleUppercase ? meta.title.toUpperCase() : meta.title;
  const author = style.authorUppercase ? meta.author.toUpperCase() : meta.author;
  const low = (style.titleTopPct ?? 0) > 50;
  const motif = bg ? '' : ornamentSvg(style.ornament, style.colours.accent, 240);
  const sub = meta.subtitle ? `<div class="sub${style.subtitleTopPct !== undefined ? ' abs' : ''}">${escapeHtml(meta.subtitle)}</div>` : '';
  return `<div class="front ${style.layout} ${style.align === 'left' ? 'left' : 'centre'}${bg ? ' has-bg' : ''}">
${bg ? `<img class="bg" src="${bg}" alt="">` : ''}
${style.layout === 'band' || style.band ? '<div class="band"></div>' : ''}${style.layout === 'frame' ? '<div class="frame"></div>' : ''}
${motif && low ? `<div class="motif high">${motif}</div>` : ''}
${style.subtitleTopPct !== undefined ? sub : ''}
<div class="stack">
  <div class="title" data-fit="1">${escapeHtml(title)}</div>
  ${style.subtitleTopPct === undefined ? sub : ''}
  <div class="spacer"></div>
  ${motif && !low ? `<div class="motif">${motif}</div><div class="spacer"></div>` : ''}
  <div class="rule"></div>
  <div class="author">${escapeHtml(author)}</div>
</div>
</div>`;
}

function frontCss(style: CoverStyle, f: Fonts): string {
  const c = style.colours;
  const scale = (style.titleScale * 100).toFixed(2);
  const top = style.titleTopPct !== undefined ? `${style.titleTopPct}cqw` : '9cqh';
  const band = style.band ?? { topPct: 0, heightPct: 3.5 };
  return `
.front { position: relative; width: 100%; height: 100%; overflow: hidden; container-type: size; background: ${c.background}; color: ${c.title}; }
.front .bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.front.has-bg::after { content: ""; position: absolute; inset: 0; background: rgba(0,0,0,${style.imageOverlay}); }
.front .band { position: absolute; left: 0; right: 0; top: ${band.topPct}cqw; height: ${band.heightPct}cqw; background: ${c.band}; }
.front .frame { position: absolute; inset: 4cqw; border: 0.6cqw solid ${c.accent}; }
.front .stack { position: absolute; z-index: 2; top: ${top}; left: 8cqw; right: 8cqw; bottom: 7cqh; display: flex; flex-direction: column; align-items: center; text-align: center; }
.front.left .stack { align-items: flex-start; text-align: left; }
.front .title { font-family: '${f.title}'; font-weight: ${style.weights.title}; ${style.titleItalic ? 'font-style: italic;' : ''} font-size: ${scale}cqw; line-height: 1.0; letter-spacing: -0.02em; color: ${c.title}; overflow-wrap: normal; word-break: keep-all; hyphens: manual; }
.front .sub { font-family: '${f.subtitle}'; font-weight: ${style.weights.subtitle}; font-size: 4.4cqw; line-height: 1.2; margin-top: 3.2cqh; color: ${c.subtitle}; max-width: 82cqw; }
.front .sub.abs { position: absolute; z-index: 2; top: ${style.subtitleTopPct ?? 0}cqw; left: 8cqw; right: 12cqw; margin: 0; }
.front.centre .sub.abs { text-align: center; left: 10cqw; right: 10cqw; max-width: none; }
.front .spacer { flex: 1; }
.front .motif svg { width: 22cqw; height: auto; display: block; }
.front .motif.high { position: absolute; z-index: 1; top: 16cqw; left: 0; right: 0; display: flex; justify-content: center; }
.front.left .motif.high { justify-content: flex-start; padding-left: 8cqw; }
.front .rule { width: 8cqw; height: 0.4cqw; background: ${c.accent}; margin-bottom: 2.4cqh; }
.front .author { font-family: '${f.author}'; font-weight: ${style.weights.author}; ${style.authorItalic ? 'font-style: italic;' : ''} font-size: 5.6cqw; letter-spacing: ${style.authorUppercase ? '0.12em' : '0.02em'}; color: ${c.author}; }
.front.has-bg .title, .front.has-bg .sub, .front.has-bg .author { color: #fff; }
.front.minimal .rule { display: none; }
`;
}

/** Shrink each [data-fit] element until it fits its box width and a share of the height. Plain JS (runs in the page). */
const FIT_SCRIPT = `<script>
document.fonts.ready.then(function () {
  document.querySelectorAll('[data-fit]').forEach(function (el) {
    var box = el.parentElement;
    var size = parseFloat(getComputedStyle(el).fontSize);
    var maxH = box.clientHeight * 0.45;
    var guard = 0;
    while ((el.scrollWidth > box.clientWidth + 1 || el.offsetHeight > maxH) && size > 8 && guard < 200) {
      size = size * 0.97; el.style.fontSize = size + 'px'; guard++;
    }
    el.setAttribute('data-fitted-px', String(size));
  });
  window.__coverReady = true;
});
</script>`;

export interface EbookCoverOptions {
  /** Concept or background image (PNG or JPEG). */
  background?: Buffer;
  browser?: Browser;
  fonts?: FontLibrary;
  /** Rules file for the cover size (FACTS 10.5). Without it, 1600 x 2560. */
  rules?: KdpRules;
  /** JPEG quality, default 90. */
  quality?: number;
}

export interface EbookCoverResult {
  jpeg: Buffer;
  widthPx: number;
  heightPx: number;
  /** Title cap height proxy: the fitted title font size scaled to a 160 px wide thumbnail. */
  titlePxAt160: number;
  warnings: string[];
}

export async function exportEbookCover(source: BookMeta, style: CoverStyle = DEFAULT_COVER_STYLE, opts: EbookCoverOptions = {}): Promise<EbookCoverResult> {
  const meta = normalisePrintStrings(source); // no Type 3 fallback fonts for symbols the cover fonts lack
  const spec = opts.rules ? ebookCoverSpec(opts.rules) : { widthPx: 1600, heightPx: 2560 };
  const W = spec.widthPx;
  const H = spec.heightPx;
  const warnings: string[] = [];
  const f = coverFonts(style, opts.fonts ?? loadFontLibrary(), warnings);
  const html = `<!doctype html><html lang="${escapeHtml(meta.language)}"><head><meta charset="utf-8"><style>${f.css}
html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
${frontCss(style, f)}</style></head><body>${frontHtml(meta, style, opts.background ? dataUrl(opts.background) : undefined)}${FIT_SCRIPT}</body></html>`;
  const { png, fitted } = await withBrowser(opts.browser, async (browser) => {
    const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
    try {
      const page = await ctx.newPage();
      await page.setContent(html, { waitUntil: 'load' });
      await page.waitForFunction('window.__coverReady === true');
      const fitted = Number(await page.evaluate(`document.querySelector('[data-fit]').getAttribute('data-fitted-px')`));
      const png = await page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: W, height: H } });
      return { png, fitted };
    } finally {
      await ctx.close();
    }
  });
  const jpeg = await sharp(png)
    .removeAlpha()
    .toColourspace('srgb')
    .withIccProfile('srgb')
    .jpeg({ quality: opts.quality ?? 90, chromaSubsampling: '4:4:4' })
    .toBuffer();
  const titlePxAt160 = (fitted * 160) / W;
  if (titlePxAt160 < 10) warnings.push(`Title is about ${titlePxAt160.toFixed(1)} px tall at 160 px wide; it may not be legible as a thumbnail.`);
  return { jpeg, widthPx: W, heightPx: H, titlePxAt160, warnings };
}

export interface WrapOptions {
  rules: KdpRules;
  /** Interior page count, read from the real interior PDF. */
  pages: number;
  paper: Paper;
  /** Colour ink for a colour interior (picture books): the spine then uses the colour rule. */
  ink?: ColourInk;
  trim?: TrimKey;
  /** Back cover blurb (plain text, paragraphs split on blank lines). */
  blurb?: string;
  shortBio?: string;
  background?: Buffer;
  /**
   * Render the whole wrap as one 300 DPI image inside the PDF. "auto" (default) does so when a cover font is only
   * installed as a variable font (Chromium would print it as Type 3); "always" and "never" force the choice.
   */
  raster?: 'auto' | 'always' | 'never';
  /** Draw the barcode keep-out box in white (KDP prints its barcode there). Default true. */
  showBarcodeBox?: boolean;
  browser?: Browser;
  fonts?: FontLibrary;
}

export interface WrapResult {
  pdf: Buffer;
  size: WrapSize;
  widthPt: number;
  heightPt: number;
  spineText: boolean;
  /** True when the wrap was rasterised at 300 DPI. */
  rasterised: boolean;
  /** Effective DPI of the background image across the front panel, if one was given. */
  imageDpi?: number;
  warnings: string[];
}

export async function exportPaperbackWrap(source: BookMeta, style: CoverStyle = DEFAULT_COVER_STYLE, opts: WrapOptions): Promise<WrapResult> {
  const meta = normalisePrintStrings(source); // no Type 3 fallback fonts for symbols the cover fonts lack
  const trimKey = opts.trim ?? '6x9';
  const trim = parseTrimKey(trimKey);
  const size = wrapSizeIn(
    opts.rules,
    opts.ink ? { trim, pages: opts.pages, paper: opts.paper, ink: opts.ink } : { trim, pages: opts.pages, paper: opts.paper },
  );
  const warnings: string[] = [];
  const spineText = spineTextAllowed(opts.rules, opts.pages);
  const safe = coverSafeZone(opts.rules);
  const barcode = barcodeArea(opts.rules);
  warnings.push(...safe.warnings, ...barcode.warnings);
  const f = coverFonts(style, opts.fonts ?? loadFontLibrary(), warnings);
  const b = size.bleedIn;
  const inset = safe.value.textInsetFromTrimIn;
  const clearance = safe.value.spineTextClearanceIn;
  const backPad = Math.max(0.5, inset); // house padding for the blurb, never inside the safe zone
  const bc = barcode.value;
  const barcodeInset = Math.max(inset, bc.insetFromTrimIn);
  let imageDpi: number | undefined;
  if (opts.background) {
    const meta2 = await sharp(opts.background).metadata();
    if (meta2.width) {
      imageDpi = meta2.width / (trim.widthIn + b);
      const min = coverMinDpi(opts.rules);
      if (imageDpi < min) warnings.push(`Cover image is about ${Math.floor(imageDpi)} DPI across the front; KDP asks for ${min} DPI or more.`);
    }
  }
  const paras = (t: string | undefined) =>
    t
      ? t
          .split(/\n\s*\n/)
          .map((p) => `<p>${escapeHtml(normalisePrintText(p.trim()))}</p>`)
          .join('')
      : '';
  const spineFont = Math.min(16, Math.max(5, (size.spineIn - 2 * clearance) * 72 * 0.62));
  const c = style.colours;
  const html = `<!doctype html><html lang="${escapeHtml(meta.language)}"><head><meta charset="utf-8"><style>${f.css}
@page { size: ${size.widthIn}in ${size.heightIn}in; margin: 0; }
html, body { margin: 0; width: ${size.widthIn}in; height: ${size.heightIn}in; font-synthesis: none; }
* { box-sizing: border-box; }
.wrap { position: relative; width: ${size.widthIn}in; height: ${size.heightIn}in; background: ${c.background}; overflow: hidden; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.back { position: absolute; left: 0; top: 0; width: ${b + trim.widthIn}in; height: ${size.heightIn}in; background: ${c.background}; }
.back .text { position: absolute; left: ${b + backPad}in; right: ${backPad}in; top: ${b + backPad + 0.2}in; font-family: '${f.subtitle}'; font-size: 10.5pt; line-height: 1.45; color: ${c.subtitle}; }
.back .text p { margin: 0 0 8pt; }
.back .bio { margin-top: 18pt; padding-top: 10pt; border-top: 0.8pt solid ${c.accent}; font-size: 9pt; }
.back .barcode { position: absolute; width: ${bc.widthIn}in; height: ${bc.heightIn}in; left: ${b + trim.widthIn - barcodeInset - bc.widthIn}in; top: ${b + trim.heightIn - barcodeInset - bc.heightIn}in; background: ${opts.showBarcodeBox === false ? 'transparent' : '#ffffff'}; }
.spine { position: absolute; left: ${b + trim.widthIn}in; top: 0; width: ${size.spineIn}in; height: ${size.heightIn}in; background: ${c.band}; display: flex; align-items: center; justify-content: center; }
.spine .st { writing-mode: vertical-rl; white-space: nowrap; font-family: '${f.title}'; font-weight: ${style.weights.title}; font-size: ${spineFont.toFixed(2)}pt; color: ${c.background}; letter-spacing: 0.04em; max-height: ${trim.heightIn - 2 * inset - 0.5}in; overflow: hidden; }
.spine .st .au { font-family: '${f.author}'; font-weight: ${style.weights.author}; margin-top: 0.3in; opacity: 0.9; }
.frontpanel { position: absolute; left: ${b + trim.widthIn + size.spineIn}in; top: 0; width: ${trim.widthIn + b}in; height: ${size.heightIn}in; }
${frontCss(style, f)}
</style></head><body><div class="wrap">
<div class="back"><div class="text">${paras(opts.blurb)}${opts.shortBio ? `<div class="bio">${paras(opts.shortBio)}</div>` : ''}</div><div class="barcode"></div></div>
<div class="spine">${spineText ? `<div class="st">${escapeHtml(meta.title)}<span class="au">&#8195;${escapeHtml(meta.author)}</span></div>` : ''}</div>
<div class="frontpanel">${frontHtml(meta, style, opts.background ? dataUrl(opts.background) : undefined)}</div>
</div>${FIT_SCRIPT}</body></html>`;

  const W = size.widthIn * 72;
  const H = size.heightIn * 72;
  const minDpi = coverMinDpi(opts.rules);
  const rasterised = opts.raster === 'always' || (opts.raster !== 'never' && f.variable);
  if (rasterised && opts.raster !== 'always')
    warnings.push(`A cover font is only installed as a variable font, so the wrap was rendered as a ${minDpi} DPI image.`);
  const out = await PDFDocument.create();
  const page = out.addPage([W, H]);
  if (rasterised) {
    const png = await withBrowser(opts.browser, async (browser) => {
      const ctx = await browser.newContext({
        viewport: { width: Math.ceil(size.widthIn * 96), height: Math.ceil(size.heightIn * 96) },
        deviceScaleFactor: minDpi / 96,
      });
      try {
        const p = await ctx.newPage();
        await p.setContent(html, { waitUntil: 'load' });
        await p.waitForFunction('window.__coverReady === true');
        return await p.screenshot({ type: 'png', clip: { x: 0, y: 0, width: size.widthIn * 96, height: size.heightIn * 96 } });
      } finally {
        await ctx.close();
      }
    });
    const jpg = await sharp(png).removeAlpha().toColourspace('srgb').withIccProfile('srgb').jpeg({ quality: 92, chromaSubsampling: '4:4:4' }).toBuffer();
    const img = await out.embedJpg(jpg);
    page.drawImage(img, { x: 0, y: 0, width: W, height: H });
  } else {
    const raw = await withBrowser(opts.browser, async (browser) => {
      const ctx = await browser.newContext();
      try {
        const p = await ctx.newPage();
        await p.setContent(html, { waitUntil: 'load' });
        await p.waitForFunction('window.__coverReady === true');
        return await p.pdf({ preferCSSPageSize: true, printBackground: true });
      } finally {
        await ctx.close();
      }
    });
    // Re-seat the rendered page on a page of the exact formula size (Chromium rounds paper sizes).
    const src = await PDFDocument.load(raw);
    const [embedded] = await out.embedPdf(src, [0]);
    if (embedded) page.drawPage(embedded, { x: 0, y: 0, width: W, height: H });
  }
  page.setBleedBox(0, 0, W, H);
  page.setTrimBox(b * 72, b * 72, W - 2 * b * 72, H - 2 * b * 72);
  out.setTitle(`${meta.title}: paperback cover`);
  out.setAuthor(meta.author);
  out.setCreator('Volume');
  out.setProducer('Volume export (Chromium, pdf-lib)');
  out.setSubject(`Paperback wrap ${trimKey} in, ${opts.pages} pages, ${opts.paper} paper, spine ${size.spineIn.toFixed(4)} in`);
  const pdf = Buffer.from(await out.save());
  return { pdf, size, widthPt: W, heightPt: H, spineText, rasterised, ...(imageDpi !== undefined ? { imageDpi } : {}), warnings };
}

// ---------- owner typography on top of a cover style ----------

/**
 * What the owner picked in the cover studio (stored by POST /cover/choose). Every field is optional; anything
 * missing or not valid keeps the cover style's own value. `styleId`, `paletteId` and `showSubtitle` are read
 * by the caller (they pick the style and palette and drop the subtitle); the rest are applied here.
 */
export interface CoverTypography {
  styleId?: string | null;
  paletteId?: string | null;
  showSubtitle?: boolean;
  /** Where the title sits: top, middle or bottom of the front. */
  titlePosition?: 'top' | 'middle' | 'bottom';
  /** Exact title top in cover-width percent (wins over titlePosition). */
  titleTopPct?: number;
  subtitleTopPct?: number;
  align?: 'left' | 'center' | 'centre';
  /** small, medium or large (x0.8, x1, x1.2 of the style's size), or a size: a fraction of the cover width (0.05 to 0.3) or a percent (5 to 30). */
  titleSize?: 'small' | 'medium' | 'large' | number;
  /** Colours by role. `palette` and `colours` are the same thing. Hex only. */
  palette?: Partial<CoverStyle['colours']>;
  colours?: Partial<CoverStyle['colours']>;
  fonts?: Partial<CoverStyle['fonts']>;
  titleUppercase?: boolean;
  authorUppercase?: boolean;
}

const TITLE_TOP: Record<'top' | 'middle' | 'bottom', number> = { top: 10, middle: 60, bottom: 105 };
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, min: number, max: number): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined);

/** The cover style with the owner's typography applied (title position, palette, sizes, fonts, case). Pure. */
export function applyCoverTypography(style: CoverStyle, typography: CoverTypography | Record<string, unknown> | null | undefined): CoverStyle {
  const t = isObj(typography) ? typography : {};
  const out: CoverStyle = { ...style, fonts: { ...style.fonts }, weights: { ...style.weights }, colours: { ...style.colours } };
  const pos = t['titlePosition'];
  if (pos === 'top' || pos === 'middle' || pos === 'bottom') out.titleTopPct = TITLE_TOP[pos];
  const top = num(t['titleTopPct'], 0, 150);
  if (top !== undefined) out.titleTopPct = top;
  const subTop = num(t['subtitleTopPct'], 0, 150);
  if (subTop !== undefined) out.subtitleTopPct = subTop;
  if (t['align'] === 'left') out.align = 'left';
  else if (t['align'] === 'center' || t['align'] === 'centre') out.align = 'center';
  const size = t['titleSize'];
  if (size === 'small' || size === 'medium' || size === 'large') out.titleScale = style.titleScale * { small: 0.8, medium: 1, large: 1.2 }[size];
  else if (typeof size === 'number' && Number.isFinite(size)) {
    const scale = size > 1 ? size / 100 : size;
    if (scale >= 0.05 && scale <= 0.3) out.titleScale = scale;
  }
  for (const source of [t['colours'], t['palette']]) {
    if (!isObj(source)) continue;
    for (const role of Object.keys(out.colours) as (keyof CoverStyle['colours'])[]) {
      const c = source[role];
      if (typeof c === 'string' && HEX.test(c)) out.colours[role] = c;
    }
  }
  if (isObj(t['fonts'])) {
    for (const role of ['title', 'subtitle', 'author'] as const) {
      const f = t['fonts'][role];
      if (typeof f === 'string' && f.trim()) out.fonts[role] = f.trim();
    }
  }
  if (typeof t['titleUppercase'] === 'boolean') out.titleUppercase = t['titleUppercase'];
  if (typeof t['authorUppercase'] === 'boolean') out.authorUppercase = t['authorUppercase'];
  return out;
}

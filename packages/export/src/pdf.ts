// Print PDF: Paged.js paginates the book HTML inside Playwright Chromium; pdf-lib sets the metadata.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'playwright';
import {
  DEFAULT_INTERIOR_THEME,
  insideMarginMinIn,
  marginsFor,
  parseTrimKey,
  type BookDoc,
  type InteriorTheme,
  type KdpRules,
  type TrimKey,
} from '@volume/core';
import { withBrowser } from './browser.ts';
import { loadFontLibrary, type FontLibrary } from './fonts.ts';
import { buildPrintHtml } from './print-html.ts';

export interface PrintPdfOptions {
  /** Trim size, for example "6x9" (default), "5x8", "5.5x8.5", "8.5x11". */
  trim?: TrimKey;
  /** Overrides the theme: chapters open on a right-hand page (default, D-013) or any page. */
  chapterStart?: 'right' | 'any';
  /** Subheadings listed under each chapter in the contents. Default true. */
  contentsSubheadings?: boolean;
  images?: Record<string, Buffer>;
  /** Reuse a browser (otherwise a shared one is launched and closed). */
  browser?: Browser;
  fonts?: FontLibrary;
  /** PDF metadata extras. */
  subject?: string;
  keywords?: string[];
  /** Fixed dates make the output reproducible. */
  creationDate?: Date;
  /** Print variable-only font families anyway (they come out as Type 3). Default false. */
  allowVariableFonts?: boolean;
  /** KDP rules: when given, the inside margin is raised to the minimum for the page count plus the theme's extra. */
  rules?: KdpRules;
  /** Paged.js render timeout in ms. Default 120000. */
  timeoutMs?: number;
}

export interface SectionPage {
  /** 1-based physical page in the PDF. */
  page: number;
  /** Printed page number ("" when the page carries none). */
  folio: string;
}

export interface PrintPdfResult {
  buffer: Buffer;
  pageCount: number;
  widthPt: number;
  heightPt: number;
  /** Where each section's opener landed. */
  sections: Record<string, SectionPage>;
  /** Physical page where Arabic page 1 is. */
  numberingStartPage: number | undefined;
  blankPages: number[];
  warnings: string[];
  /** The HTML that was printed (for debugging and previews). */
  html: string;
  /** Inside margin used, in inches. */
  insideMarginIn: number;
}

const require = createRequire(import.meta.url);

/**
 * Runs in the page after Paged.js. Kept as a plain JS string: TS transpilers can add helpers (such as __name)
 * to functions, which do not exist in the browser.
 */
const LAYOUT_SCRIPT = `(sid) => {
        const pages = Array.from(document.querySelectorAll('.pagedjs_page'));
        const openers = {};
        const blanks = [];
        const front = [];
        let startPage = null;
        pages.forEach((p, i) => {
          const n = i + 1;
          const blank = p.classList.contains('pagedjs_blank_page');
          const isFront = p.querySelector('[data-front]') !== null;
          const opener = p.querySelector('[data-opener]');
          if (blank) blanks.push(n);
          if (isFront) front.push(n);
          if (blank || isFront) p.classList.add('vol-nohead', 'vol-nofolio');
          if (opener) {
            p.classList.add('vol-nohead');
            const id = opener.dataset.opener ?? '';
            if (!(id in openers)) openers[id] = n;
          }
          if (sid && startPage === null && p.querySelector(\`#\${CSS.escape(sid)}\`)) startPage = n;
        });
        // Folios are written by us (Paged.js's page counter drifts after a counter-reset): Arabic 1 at the
        // numbering start, none before it, none on blank pages.
        const folioOf = (n) => (startPage !== null && n >= startPage && !blanks.includes(n) ? String(n - startPage + 1) : '');
        pages.forEach((p, i) => {
          const n = i + 1;
          if (startPage === null || n < startPage) p.classList.add('vol-nofolio');
          if (document.body.dataset.dropFolio === '1' && p.querySelector('[data-opener]')) p.classList.add('vol-nofolio');
          // Theme folios: data-folio="off" prints none; "center" uses the centred bottom box.
          const folio = document.body.dataset.folio;
          const side = folio === 'center' ? 'center' : p.classList.contains('pagedjs_left_page') ? 'left' : 'right';
          const box = folio === 'off' ? null : p.querySelector(\`.pagedjs_margin-bottom-\${side} > .pagedjs_margin-content\`);
          if (box) {
            box.textContent = folioOf(n);
            p.classList.add('vol-folio-set');
          }
        });
        // Contents numbers come from target-counter(); check each against the real folio and correct any drift.
        let tocFixed = 0;
        document.querySelectorAll('.toc a.pg').forEach((a) => {
          const id = decodeURIComponent((a.getAttribute('href') ?? '').slice(1));
          const want = openers[id] !== undefined ? folioOf(openers[id]) : '';
          // Paged.js renders target-counter() as counter(name) plus a counter-reset on the link's ::after.
          const content = getComputedStyle(a, '::after').content;
          const reset = getComputedStyle(a, '::after').counterReset;
          const m = content.startsWith('counter(') ? /(-?\\d+)\\s*$/.exec(reset) : /^["']?(.*?)["']?$/.exec(content);
          const got = m ? m[1] : '';
          if (got !== want) {
            a.textContent = want;
            a.classList.add('fixed');
            tocFixed++;
          }
        });
        return { pages: pages.length, openers, blanks, front, startPage, tocFixed };
      }`;
let polyfill: string | undefined;
function pagedPolyfill(): string {
  // pagedjs's exports map hides dist/, so resolve the package entry and step to dist/paged.polyfill.js.
  polyfill ??= readFileSync(path.join(path.dirname(require.resolve('pagedjs')), '..', 'dist', 'paged.polyfill.js'), 'utf8');
  return polyfill;
}

interface LayoutInfo {
  pages: number;
  openers: Record<string, number>;
  blanks: number[];
  front: number[];
  startPage: number | null;
  tocFixed: number;
}

/** Export the paperback interior as a PDF. */
export async function exportPrintPdf(book: BookDoc, theme: InteriorTheme = DEFAULT_INTERIOR_THEME, opts: PrintPdfOptions = {}): Promise<PrintPdfResult> {
  const trim = opts.trim ?? '6x9';
  const lib = opts.fonts ?? loadFontLibrary();
  const render = async (kdpMinInsideIn: number | undefined) => {
    const htmlOpts: Parameters<typeof buildPrintHtml>[3] = { trim };
    if (opts.chapterStart) htmlOpts.chapterStart = opts.chapterStart;
    if (opts.contentsSubheadings !== undefined) htmlOpts.contentsSubheadings = opts.contentsSubheadings;
    if (opts.images) htmlOpts.images = opts.images;
    if (kdpMinInsideIn !== undefined) htmlOpts.kdpMinInsideIn = kdpMinInsideIn;
    if (opts.allowVariableFonts) htmlOpts.allowVariableFonts = true;
    const built = buildPrintHtml(book, theme, lib, htmlOpts);
    const config = `<script>window.PagedConfig = { auto: true, before: async () => { await document.fonts.ready; }, after: () => { window.__volumeDone = true; } };</script>`;
    const inject = `${config}<script>${pagedPolyfill().replace(/<\/script>/gi, '<\\/script>')}</script></head>`;
    // function replacer: the polyfill source contains $& and $' sequences
    const html = built.html.replace('</head>', () => inject);
    const out = await withBrowser(opts.browser, async (browser) => {
      const ctx = await browser.newContext();
      try {
        const page = await ctx.newPage();
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(e.message));
        page.on('console', (m) => {
          if (m.type() === 'error') errors.push(m.text());
        });
        await page.setContent(html, { waitUntil: 'load', timeout: opts.timeoutMs ?? 120_000 });
        try {
          await page.waitForFunction('window.__volumeDone === true', undefined, { timeout: opts.timeoutMs ?? 120_000 });
        } catch (e) {
          throw new Error(`Paged.js did not finish: ${errors.join(' | ') || String(e)}`, { cause: e });
        }
        const startId = built.numberingStartId ?? null;
        const layout = await page.evaluate<LayoutInfo>(`(${LAYOUT_SCRIPT})(${JSON.stringify(startId)})`);
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true, tagged: true, outline: true });
        return { pdf, layout };
      } finally {
        await ctx.close();
      }
    });
    return { ...out, built, html, inside: marginsFor(theme, trim, kdpMinInsideIn).insideIn };
  };

  let pass = await render(undefined);
  // With the rules file, the inside margin must be at least the KDP minimum for the real page count plus the
  // theme's extra; if the house margin is smaller, lay out again (the page count can change, so check twice).
  if (opts.rules) {
    for (let k = 0; k < 2; k++) {
      const min = insideMarginMinIn(opts.rules, pass.layout.pages).value;
      if (min === null || marginsFor(theme, trim, min).insideIn <= pass.inside + 1e-9) break;
      pass = await render(min);
    }
  }
  const { pdf, layout, built, html } = pass;

  const doc = await PDFDocument.load(pdf, { updateMetadata: false });
  const title = book.meta.subtitle ? `${book.meta.title}: ${book.meta.subtitle}` : book.meta.title;
  doc.setTitle(title);
  doc.setAuthor(book.meta.author);
  doc.setSubject(opts.subject ?? `Paperback interior, ${trim} in`);
  if (opts.keywords?.length) doc.setKeywords(opts.keywords);
  doc.setCreator('Volume');
  doc.setProducer('Volume export (Paged.js, Chromium, pdf-lib)');
  doc.setLanguage(book.meta.language);
  const when = opts.creationDate ?? new Date();
  doc.setCreationDate(when);
  doc.setModificationDate(when);
  const bytes = await doc.save({ useObjectStreams: true });
  const first = doc.getPage(0).getSize();
  const { widthIn, heightIn } = parseTrimKey(trim);
  const warnings = [...built.warnings];
  if (layout.tocFixed) warnings.push(`${layout.tocFixed} contents page numbers from target-counter() did not match the layout and were corrected.`);
  if (Math.abs(first.width - widthIn * 72) > 0.5 || Math.abs(first.height - heightIn * 72) > 0.5)
    warnings.push(`Page size ${first.width} x ${first.height} pt does not match ${trim} in.`);

  const start = layout.startPage ?? undefined;
  const folio = (n: number) => (start !== undefined && n >= start && !layout.blanks.includes(n) ? String(n - start + 1) : '');
  const sections: Record<string, SectionPage> = {};
  for (const [id, n] of Object.entries(layout.openers)) sections[id] = { page: n, folio: folio(n) };
  return {
    buffer: Buffer.from(bytes),
    pageCount: doc.getPageCount(),
    widthPt: first.width,
    heightPt: first.height,
    sections,
    numberingStartPage: start,
    blankPages: layout.blanks,
    warnings,
    html,
    insideMarginIn: pass.inside,
  };
}

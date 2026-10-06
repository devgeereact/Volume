// Book model -> print HTML and CSS for Paged.js (docs/06-EXPORT-SPEC.md, Print PDF).
import {
  DEFAULT_INTERIOR_THEME,
  enabledSections,
  escapeHtml,
  inlineToHtml,
  marginsFor,
  parseTrimKey,
  type Block,
  type BookDoc,
  type InteriorTheme,
  type Section,
  numberToWords,
  toRoman,
  type TrimKey,
} from '@volume/core';
import { fontFaceCss, resolveFamily, type FontLibrary } from './fonts.ts';
import { ornamentSvg } from './ornaments.ts';

export interface PrintHtmlOptions {
  trim: TrimKey;
  /** Overrides the theme: chapters and parts open on a right-hand page, or on any page. */
  chapterStart?: 'right' | 'any';
  /** List subheadings under each chapter in the contents (no page numbers). Default true. */
  contentsSubheadings?: boolean;
  /** Images referenced by key in image blocks. */
  images?: Record<string, Buffer>;
  /** Use variable-only font families anyway (they print as Type 3). Default false: fall back to the default theme fonts. */
  allowVariableFonts?: boolean;
  /** KDP minimum inside margin for the page count (rule paperback.interiorMargins); the theme's extra is added. */
  kdpMinInsideIn?: number;
}

export interface PrintHtml {
  html: string;
  /** Section id where Arabic page 1 starts, if any. */
  numberingStartId: string | undefined;
  warnings: string[];
}

const FENCED = new Set(['titlepage', 'copyright', 'contents', 'halftitle']);
const cssString = (s: string) => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ')}"`;

function sniffMime(buf: Buffer): string {
  if (buf[0] === 0x89 && buf[1] === 0x50) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF') return 'image/webp';
  return 'image/svg+xml';
}

export function imageSrc(src: string, images: Record<string, Buffer> | undefined): string | undefined {
  if (src.startsWith('data:')) return src;
  const buf = images?.[src];
  return buf ? `data:${sniffMime(buf)};base64,${buf.toString('base64')}` : undefined;
}

function blocksHtml(s: Section, theme: InteriorTheme, opts: PrintHtmlOptions, warnings: string[]): string {
  const out: string[] = [];
  let afterBreak = true;
  let first = true;
  for (const b of s.blocks) {
    out.push(blockHtml(b));
    afterBreak = b.type !== 'paragraph';
  }
  return out.join('\n');

  function blockHtml(b: Block): string {
    switch (b.type) {
      case 'paragraph': {
        const label = b.text.startsWith('**');
        const cls = [
          label ? 'label' : '',
          afterBreak && !label ? 'noindent' : '',
          first && s.kind === 'chapter' && theme.dropCaps.enabled ? 'dropcap' : '',
        ].filter(Boolean);
        first = false;
        return `<p${cls.length ? ` class="${cls.join(' ')}"` : ''}>${inlineToHtml(b.text)}</p>`;
      }
      case 'heading2':
        first = false;
        return `<h2>${inlineToHtml(b.text)}</h2>`;
      case 'heading3': {
        first = false;
        const tag = b.level === 4 ? 'h4' : 'h3';
        return `<${tag}>${inlineToHtml(b.text)}</${tag}>`;
      }
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return `<${tag}>${b.items.map((it) => `<li>${inlineToHtml(it)}</li>`).join('')}</${tag}>`;
      }
      case 'table': {
        const [head, ...rows] = b.rows;
        if (!head) return '';
        return `<table><thead><tr>${head.map((c) => `<th>${inlineToHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inlineToHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      }
      case 'sceneBreak':
        return `<div class="break" role="separator">${escapeHtml(theme.sceneBreak)}</div>`;
      case 'quote':
        return `<blockquote class="${b.variant}">${b.lines.map((l) => `<p>${inlineToHtml(l)}</p>`).join('')}${b.attribution ? `<p class="attr">${escapeHtml(b.attribution)}</p>` : ''}</blockquote>`;
      case 'takeaways':
        return `<aside class="takeaways"><p class="th">Key Takeaways</p><ul>${b.items.map((it) => `<li>${inlineToHtml(it)}</li>`).join('')}</ul></aside>`;
      case 'callout': {
        const lines = /^lines\s+(\d+)$/i.exec(b.variant);
        if (lines) return `<div class="writing-lines">${'<div class="wl"></div>'.repeat(Number(lines[1]))}</div>`;
        return `<p class="callout ${escapeHtml(b.variant.split(/\s+/)[0] ?? '')}">${inlineToHtml(b.text)}</p>`;
      }
      case 'image': {
        const src = imageSrc(b.src, opts.images);
        if (!src) {
          warnings.push(`Image "${b.src}" in ${s.id} has no data; left out.`);
          return '';
        }
        return `<figure><img src="${src}" alt="${escapeHtml(b.alt)}">${b.caption ? `<figcaption>${inlineToHtml(b.caption)}</figcaption>` : ''}</figure>`;
      }
      case 'pageBreak':
        return '<div class="pagebreak"></div>';
    }
  }
}

function tocHtml(secs: Section[], from: number, withSubs: boolean): string {
  const rows: string[] = [];
  for (const s of secs.slice(from)) {
    if (FENCED.has(s.subtype)) continue;
    const k = s.kicker ? `<span class="k">${escapeHtml(s.kicker)}</span>` : '<span class="nk"></span>';
    rows.push(
      `<div class="row ${s.kind}">${k}<span class="n"><a class="t" href="#${s.id}">${escapeHtml(s.title)}</a><span class="dots"></span><a class="pg" href="#${s.id}"></a></span></div>`,
    );
    if (withSubs && s.kind === 'chapter') {
      const subs = s.blocks.filter((b) => b.type === 'heading2').map((b) => (b.type === 'heading2' ? b.text : ''));
      if (subs.length) rows.push(`<div class="subs">${subs.map((t) => `<div class="sub">${inlineToHtml(t)}</div>`).join('')}</div>`);
    }
  }
  return rows.join('');
}

/** "Chapter 3" as the theme wants it: Chapter 3, Chapter Three or Chapter III. */
export function kickerText(s: Section, theme: InteriorTheme): string {
  if (!s.kicker || s.number === undefined) return s.kicker ?? '';
  const word = s.kicker.replace(/\s*\d+\s*$/, '');
  if (theme.opener.numberFormat === 'words') return `${word} ${numberToWords(s.number)}`;
  if (theme.opener.numberFormat === 'roman') return `${word} ${toRoman(s.number)}`;
  return s.kicker;
}

function openerHtml(s: Section, theme: InteriorTheme): string {
  const orn = theme.opener.style === 'minimal' ? '' : ornamentSvg(theme.opener.ornament, theme.colours.accent, 40);
  const kicker = s.kicker && theme.opener.numberFormat !== 'none' ? `<div class="kicker">${escapeHtml(kickerText(s, theme))}</div>` : '';
  const numeral = theme.opener.style === 'number' && s.number !== undefined ? `<div class="numeral">${s.number}</div>` : '';
  const rule = theme.opener.rule && theme.opener.style !== 'minimal' ? '<div class="rule"></div>' : '';
  const ruleTop = theme.opener.style === 'rule' ? '<div class="rule top"></div>' : '';
  return `<div class="opener ${theme.opener.style}" data-opener="${s.id}">${orn ? `<div class="orn">${orn}</div>` : ''}${ruleTop}${numeral}${theme.opener.style === 'number' ? '' : kicker}<h1 class="st">${escapeHtml(s.title)}</h1>${theme.opener.style === 'rule' ? '' : rule}</div>`;
}

export function buildPrintHtml(book: BookDoc, theme: InteriorTheme, lib: FontLibrary, opts: PrintHtmlOptions): PrintHtml {
  const warnings: string[] = [];
  const secs = enabledSections(book);
  const trim = parseTrimKey(opts.trim);
  const m = marginsFor(theme, opts.trim, opts.kdpMinInsideIn);
  const start = opts.chapterStart ?? theme.chapterStart;
  const fo = { allowVariable: opts.allowVariableFonts === true };
  const body = resolveFamily(lib, theme.fonts.body, DEFAULT_INTERIOR_THEME.fonts.body, warnings, fo);
  const heading = resolveFamily(lib, theme.fonts.heading, DEFAULT_INTERIOR_THEME.fonts.heading, warnings, fo);
  const display = theme.fonts.display === theme.fonts.heading ? heading : resolveFamily(lib, theme.fonts.display, heading, warnings, fo);
  const rh = theme.fonts.runningHead === theme.fonts.body ? body : resolveFamily(lib, theme.fonts.runningHead, body, warnings, fo);
  const w = theme.weights;
  const fontCss = [
    fontFaceCss(lib, [body], [w.body, w.bold, 600]),
    fontFaceCss(lib, [...new Set([heading, display].filter((f) => f !== body))], [w.heading, w.display, w.subheading]),
    heading === body || display === body ? fontFaceCss(lib, [body], [w.heading, w.display, w.subheading]) : '',
    rh !== body && rh !== heading ? fontFaceCss(lib, [rh], [400]) : '',
  ].join('\n');

  // Arabic page 1: the introduction, else the first part or chapter, else the first body section.
  const startIdx = (() => {
    const intro = secs.findIndex((s) => s.subtype === 'introduction');
    if (intro >= 0) return intro;
    const body1 = secs.findIndex((s) => s.kind === 'chapter' || s.kind === 'part');
    if (body1 >= 0) return body1;
    return secs.findIndex((s) => !FENCED.has(s.subtype) && s.kind !== 'front');
  })();
  const numberingStartId = startIdx >= 0 ? secs[startIdx]?.id : undefined;

  const contentH = trim.heightIn - m.topIn - m.bottomIn;
  const parts: string[] = [];
  secs.forEach((s, idx) => {
    const front = startIdx < 0 || idx < startIdx ? ' data-front="1"' : '';
    if (s.subtype === 'titlepage') {
      const ls = s.lines ?? [];
      const [t = book.meta.title, sub = '', author = book.meta.author, ed = '', ...rest] = ls;
      const orn = ornamentSvg(theme.opener.ornament, theme.colours.accent, 64);
      parts.push(
        `<section class="titlepage" id="${s.id}"${front}>${orn ? `<div class="orn">${orn}</div>` : ''}<div class="t">${escapeHtml(t)}</div>${sub ? `<div class="s">${escapeHtml(sub)}</div>` : ''}<div class="a">${escapeHtml(author)}</div>${ed ? `<div class="ed">${escapeHtml(ed)}</div>` : ''}${rest.map((x) => `<div class="lbl">${escapeHtml(x)}</div>`).join('')}</section>`,
      );
    } else if (s.subtype === 'halftitle') {
      parts.push(`<section class="halftitle page" id="${s.id}"${front}><div class="t">${escapeHtml(s.title)}</div></section>`);
    } else if (s.subtype === 'copyright') {
      parts.push(
        `<section class="copyright page" id="${s.id}"${front}>${s.blocks.map((b) => (b.type === 'paragraph' ? `<p>${inlineToHtml(b.text)}</p>` : '')).join('')}</section>`,
      );
    } else if (s.subtype === 'contents') {
      parts.push(
        `<section class="contents ${start === 'right' ? 'recto' : 'page'}" id="${s.id}"${front}><h1 class="ch">Contents</h1><nav class="toc">${tocHtml(secs, idx + 1, opts.contentsSubheadings !== false)}</nav></section>`,
      );
    } else if (s.kind === 'part') {
      const paras = s.blocks.map((b) => (b.type === 'paragraph' ? `<p class="noindent">${inlineToHtml(b.text)}</p>` : '')).join('');
      parts.push(
        `<section class="part ${start === 'right' ? 'recto' : 'page'}" id="${s.id}"${front}><div class="opener part-opener" data-opener="${s.id}">${s.kicker ? `<div class="kicker">${escapeHtml(s.kicker)}</div>` : ''}<h1 class="st">${escapeHtml(s.title)}</h1></div>${paras}</section>`,
      );
    } else {
      const recto = start === 'right' && (s.kind === 'chapter' || idx === startIdx);
      parts.push(
        `<section class="sec ${s.kind} ${recto ? 'recto' : 'page'}" id="${s.id}"${front}>${openerHtml(s, theme)}${blocksHtml(s, theme, opts, warnings)}</section>`,
      );
    }
  });

  const headFor = (c: 'book-title' | 'author' | 'chapter-title' | 'none'): string =>
    !theme.runningHeads.enabled || c === 'none'
      ? 'none'
      : c === 'author'
        ? cssString(book.meta.author)
        : c === 'book-title'
          ? cssString(book.meta.title)
          : 'string(sectitle)';
  const leftHeadCss = headFor(theme.runningHeads.left);
  const rightHeadCss = headFor(theme.runningHeads.right);
  const rhStyle =
    theme.runningHeads.style === 'small-caps'
      ? 'font-variant: small-caps; letter-spacing: 0.06em;'
      : theme.runningHeads.style === 'italic'
        ? 'font-style: italic;'
        : theme.runningHeads.style === 'caps'
          ? 'text-transform: uppercase; letter-spacing: 0.12em; font-size: 0.85em;'
          : '';
  const marginBox = `font-family: '${rh}'; font-size: ${theme.sizes.runningHeadPt}pt; color: ${theme.colours.muted};`;
  const folioBox = `font-family: '${rh}'; font-size: ${theme.sizes.folioPt}pt; color: ${theme.colours.text};`;
  const dc = theme.dropCaps;
  const lineH = theme.leading;
  const startId = numberingStartId ? `#${numberingStartId}` : '.no-numbering';

  const css = `
${fontCss}
@page {
  size: ${trim.widthIn}in ${trim.heightIn}in;
  margin: ${m.topIn}in ${m.outsideIn}in ${m.bottomIn}in ${m.insideIn}in;
}
@page :left {
  margin-left: ${m.outsideIn}in; margin-right: ${m.insideIn}in;
  @top-center { content: ${leftHeadCss}; ${marginBox} ${rhStyle} vertical-align: bottom; padding-bottom: 0.2in; }
  @bottom-left { content: counter(page); ${folioBox} vertical-align: top; padding-top: 0.22in; }
}
@page :right {
  margin-left: ${m.insideIn}in; margin-right: ${m.outsideIn}in;
  @top-center { content: ${rightHeadCss}; ${marginBox} ${rhStyle} vertical-align: bottom; padding-bottom: 0.2in; }
  @bottom-right { content: counter(page); ${folioBox} vertical-align: top; padding-top: 0.22in; }
}
@page :blank {
  @top-center { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
.pagedjs_page.vol-nohead .pagedjs_margin-top { visibility: hidden; }
.pagedjs_page.vol-nofolio .pagedjs_margin-bottom { visibility: hidden; }
.pagedjs_page.vol-folio-set .pagedjs_margin-bottom-left > .pagedjs_margin-content::after,
.pagedjs_page.vol-folio-set .pagedjs_margin-bottom-right > .pagedjs_margin-content::after,
.toc a.pg.fixed::after { content: none !important; }
${startId} { counter-reset: page 1; }

* { box-sizing: border-box; }
html { -webkit-print-color-adjust: exact; print-color-adjust: exact; font-synthesis: none; }
body { margin: 0; font-family: '${body}'; font-weight: ${theme.weights.body}; font-size: ${theme.sizes.bodyPt}pt; line-height: ${lineH};
  color: ${theme.colours.text}; text-align: ${theme.paragraph.align}; hyphens: ${theme.paragraph.hyphenate ? 'auto' : 'manual'};
  -webkit-hyphens: ${theme.paragraph.hyphenate ? 'auto' : 'manual'}; orphans: 2; widows: 2; }
p { margin: 0; text-indent: ${theme.paragraph.indentEm}em; }
p.noindent, h2 + p, h3 + p, h4 + p, .opener + p { text-indent: 0; }
p.label { text-indent: 0; margin-top: 2.5pt; }
strong { font-weight: ${theme.weights.bold}; }
a { color: inherit; text-decoration: none; }
.page { break-before: page; }
/* Paged.js sets text-align-last: justify on split elements; keep it off everything that is not itself split. */
section > :not([data-split-to]), .opener *, .toc * { text-align-last: auto; }
.recto { break-before: right; }
.pagebreak { break-after: page; }

.titlepage { height: ${contentH}in; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; hyphens: manual; }
.titlepage .t { font-family: '${display}'; font-weight: ${theme.weights.display}; font-size: ${theme.sizes.titlePagePt}pt; line-height: 1.1; letter-spacing: -0.01em; margin-top: 14pt; color: ${theme.colours.accent}; }
.titlepage .s { font-weight: 600; font-size: ${(theme.sizes.bodyPt * 1.18).toFixed(2)}pt; margin-top: 10pt; color: ${theme.colours.muted}; }
.titlepage .a { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${(theme.sizes.bodyPt * 1.23).toFixed(2)}pt; margin-top: 72pt; }
.titlepage .ed { font-size: 9pt; letter-spacing: 0.14em; text-transform: uppercase; color: ${theme.colours.muted}; margin-top: 8pt; }
.titlepage .lbl { font-size: 8.4pt; color: ${theme.colours.muted}; margin-top: 64pt; max-width: 3.4in; line-height: 1.4; }
.halftitle { height: ${contentH}in; display: flex; align-items: center; justify-content: center; text-align: center; }
.halftitle .t { font-family: '${display}'; font-weight: ${theme.weights.display}; font-size: ${(theme.sizes.titlePagePt * 0.7).toFixed(1)}pt; }

.copyright { height: ${contentH}in; display: flex; flex-direction: column; justify-content: flex-end; font-size: ${theme.sizes.smallPt}pt; line-height: 1.45; text-align: left; hyphens: manual; }
.copyright p { text-indent: 0; margin: 0 0 6pt; }
.copyright p:first-child { font-weight: 600; }

.contents { padding-top: 0.9in; }
.contents h1.ch, .opener h1 { font-family: '${display}'; font-weight: ${theme.weights.display}; font-size: ${theme.sizes.chapterTitlePt}pt; line-height: 1.15; margin: 0; text-align: left; hyphens: manual; letter-spacing: -0.01em; color: ${theme.colours.accent}; }
.toc { margin-top: 22pt; text-align: left; hyphens: manual; }
.toc .row { display: flex; align-items: baseline; margin: 0 0 7pt; font-size: ${theme.sizes.bodyPt}pt; break-inside: avoid; }
.toc .k { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${theme.sizes.kickerPt * 0.9}pt; letter-spacing: 0.12em; text-transform: uppercase; color: ${theme.colours.muted}; width: 0.78in; flex: none; }
.toc .nk { width: 0.78in; flex: none; }
.toc .n { flex: 1; display: flex; align-items: baseline; }
.toc .dots { flex: 1; border-bottom: 0.6pt dotted #888; margin: 0 5pt; transform: translateY(-3pt); }
.toc .pg { font-weight: 600; min-width: 14pt; text-align: right; }
.toc a.pg::after { content: target-counter(attr(href), page); }
.toc .subs { margin: -3pt 0 8pt 0.78in; font-size: ${(theme.sizes.bodyPt * 0.8).toFixed(2)}pt; line-height: 1.3; color: ${theme.colours.muted}; break-before: avoid; }
.toc .sub { margin: 0 0 1pt; }

.opener { padding-top: ${theme.opener.sinkIn}in; margin-bottom: 20pt; hyphens: manual; }
.opener.centred, .opener.number { text-align: center; }
.opener.centred h1, .opener.number h1 { text-align: center; }
.opener.centred .orn svg, .opener.number .orn svg { margin-left: auto; margin-right: auto; }
.opener.minimal { padding-top: ${(theme.opener.sinkIn * 0.6).toFixed(2)}in; }
.opener .orn svg { display: block; margin-bottom: 14pt; }
.opener .kicker, .part-opener .kicker { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${theme.sizes.kickerPt}pt; letter-spacing: 0.16em; ${theme.opener.kickerUppercase ? 'text-transform: uppercase;' : ''} color: ${theme.colours.muted}; margin-bottom: 7pt; }
.opener .numeral { font-family: '${display}'; font-weight: ${theme.weights.display}; font-size: ${theme.sizes.chapterTitlePt * 2.6}pt; line-height: 1; color: ${theme.colours.accent}; margin-bottom: 10pt; }
.opener .rule { width: 0.6in; height: 1.4pt; background: ${theme.colours.accent}; margin-top: 16pt; }
.opener.centred .rule { margin-left: auto; margin-right: auto; }
.opener .rule.top { margin: 0 0 14pt; }
.part { text-align: center; }
.part-opener { padding-top: 2.2in; }
.part-opener h1 { text-align: center !important; font-size: ${(theme.sizes.chapterTitlePt * 1.15).toFixed(1)}pt !important; }
.part p { margin-top: 18pt; text-align: center; }

h2 { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${theme.sizes.subheadingPt}pt; line-height: 1.25; margin: 15pt 0 5pt; text-align: left; hyphens: manual; break-after: avoid; color: ${theme.colours.accent}; }
h3 { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${Math.max(theme.sizes.bodyPt * 1.05, theme.sizes.subheadingPt * 0.88).toFixed(2)}pt; line-height: 1.25; margin: 12pt 0 4pt; text-align: left; hyphens: manual; break-after: avoid; color: ${theme.colours.text}; }
h4 { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-style: italic; font-size: ${theme.sizes.bodyPt}pt; line-height: 1.25; margin: 10pt 0 3pt; text-align: left; hyphens: manual; break-after: avoid; color: ${theme.colours.text}; }
ul, ol { margin: 5pt 0 7pt; padding-left: 1.15em; }
li { margin: 0 0 3pt; padding-left: 0.15em; }
li::marker { color: ${theme.colours.muted}; }
table { width: 100%; border-collapse: collapse; margin: 8pt 0 10pt; font-size: ${(theme.sizes.bodyPt * 0.8).toFixed(2)}pt; line-height: 1.3; text-align: left; hyphens: manual; break-inside: avoid; }
th, td { border-bottom: 0.6pt solid #999; padding: 3.5pt 4pt 3.5pt 0; vertical-align: top; }
th { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${(theme.sizes.bodyPt * 0.74).toFixed(2)}pt; border-bottom: 1pt solid ${theme.colours.text}; }
.break { text-align: center; letter-spacing: 0.6em; margin: 12pt 0 10pt; font-weight: 600; break-after: avoid; text-indent: 0; }
.callout { border: 0.8pt solid ${theme.colours.text}; padding: 6pt 8pt; margin: 12pt 0; font-size: ${theme.sizes.smallPt}pt; line-height: 1.4; text-indent: 0; text-align: left; hyphens: manual; break-inside: avoid; }
.takeaways { border-top: 1.2pt solid ${theme.colours.accent}; border-bottom: 0.6pt solid ${theme.colours.accent}; padding: 7pt 0 4pt; margin: 14pt 0 12pt; break-inside: avoid; }
.takeaways .th { font-family: '${heading}'; font-weight: ${theme.weights.subheading}; font-size: ${theme.sizes.kickerPt}pt; letter-spacing: 0.14em; text-transform: uppercase; text-indent: 0; margin-bottom: 4pt; color: ${theme.colours.accent}; }
.takeaways ul { margin: 0; }
blockquote { margin: 10pt 1.2em; font-style: italic; }
blockquote p { text-indent: 0; }
blockquote.epigraph { text-align: center; margin: 1.2in 0.4in 0; }
blockquote .attr { font-style: normal; margin-top: 6pt; font-size: ${theme.sizes.smallPt}pt; }
blockquote .attr::before { content: "- "; }
figure { margin: 10pt 0; break-inside: avoid; text-align: center; }
figure img { max-width: 100%; max-height: 5in; }
figcaption { font-size: ${theme.sizes.smallPt}pt; margin-top: 4pt; color: ${theme.colours.muted}; }
.writing-lines .wl { border-bottom: 0.6pt solid #888; height: 22pt; }
p.dropcap::first-letter { float: left; font-family: '${display}'; font-weight: ${theme.weights.display}; font-size: ${(dc.lines * lineH * 0.98).toFixed(2)}em; line-height: 0.85; margin: 0.06em 0.08em 0 0; color: ${theme.colours.accent}; }
h1.st { string-set: sectitle content(text); }
`;

  const html = `<!doctype html><html lang="${escapeHtml(book.meta.language)}"><head><meta charset="utf-8"><title>${escapeHtml(book.meta.subtitle ? `${book.meta.title}: ${book.meta.subtitle}` : book.meta.title)}</title><style>${css}</style></head><body${theme.opener.dropFolio ? ' data-drop-folio="1"' : ''}>${parts.join('\n')}</body></html>`;
  return { html, numberingStartId, warnings };
}

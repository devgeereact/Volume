import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { InteriorTheme } from '@volume/core';
import { loadInteriorThemes, loadKdpRules } from '@volume/core/node';
import { acquireBrowser, buildPrintHtml, exportDocx, exportPrintPdf, inspectPdf, loadFontLibrary, releaseBrowser, type PdfInspection } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// The clean-handbook interior theme (config/interior-themes.json), modelled on the handbooks laid out in Apple Pages.
const found = loadInteriorThemes().find((t) => t.id === 'clean-handbook');
if (!found) throw new Error('config/interior-themes.json has no clean-handbook theme');
const theme: InteriorTheme = found;
const NAVY = '#10315B';
const squash = (s: string) => s.replace(/\s+/g, '');

describe('clean-handbook theme tokens', () => {
  it('reads the handbook look from the config', () => {
    expect(theme.fonts.body).toBe('Libre Franklin');
    expect(theme.sizes.bodyPt).toBe(11.5);
    expect(theme.sizes.bodyPt * theme.leading).toBeCloseTo(16, 0);
    expect(theme.paragraph).toEqual({ indentEm: 0, align: 'left', hyphenate: false, spaceLines: 1 });
    expect(theme.opener).toMatchObject({ style: 'centred', ownPage: true, titleUppercase: true, ornament: 'none', rule: false });
    expect(theme.sections).toEqual({ newPage: true, uppercase: true, align: 'center' });
    expect(theme.runningHeads.enabled).toBe(false);
    expect(theme.dropCaps.enabled).toBe(false);
    expect(theme.folios).toEqual({ enabled: true, position: 'center' });
    expect(theme.colours.label).toBe(NAVY);
    expect(theme.chapterStart).toBe('any');
  });
});

describe('clean-handbook print HTML (mini book)', () => {
  const { html } = buildPrintHtml(loadMiniBook(), theme, loadFontLibrary(), { trim: '6x9' });

  it('starts each section (h2) in a chapter on a new page, except one straight after the opener', () => {
    expect(html).toContain('.sec.chapter h2 { break-before: page; page-break-before: always;');
    expect(html).toContain('.sec.chapter .opener + h2 { break-before: auto; page-break-before: auto; }');
    expect(html).toContain('.sec.chapter h2 { text-align: center; }');
  });

  it('prints the CHAPTER label in navy and the opener alone on its page', () => {
    const kicker = /\.opener \.kicker, \.part-opener \.kicker \{[^}]*\}/.exec(html)?.[0] ?? '';
    expect(kicker).toContain(`color: ${NAVY};`);
    expect(kicker).toContain('text-transform: uppercase;');
    expect(html).toContain('<div class="opener centred own" data-opener=');
    expect(html).toMatch(/\.opener\.own \{[^}]*break-after: page;/);
    expect(html).toContain('<div class="kicker">Chapter 1</div>');
  });

  it('has no running heads, ornaments or drop caps, and centred folios', () => {
    const tops = [...html.matchAll(/@top-center \{ content: ([^;]*);/g)].map((m) => m[1]);
    expect(tops.length).toBeGreaterThan(0);
    expect(new Set(tops)).toEqual(new Set(['none']));
    expect(html).not.toContain('string(sectitle);');
    expect(html).not.toContain('class="orn"');
    expect(html).not.toContain('dropcap"');
    expect(html).toContain('@bottom-center { content: counter(page);');
    expect(html).not.toMatch(/@bottom-(left|right) \{ content: counter/);
    expect(html).toContain('data-folio="center"');
  });

  it('switches folios off with the folios token', () => {
    const off = { ...theme, folios: { enabled: false, position: 'center' as const } };
    const r = buildPrintHtml(loadMiniBook(), off, loadFontLibrary(), { trim: '6x9' });
    expect(r.html).not.toContain('content: counter(page)');
    expect(r.html).toContain('data-folio="off"');
  });
});

describe('clean-handbook print PDF (mini book)', () => {
  let browser: Browser;
  let info: PdfInspection;
  beforeAll(async () => {
    browser = await acquireBrowser();
    const r = await exportPrintPdf(loadMiniBook(), theme, { browser, rules: loadKdpRules(), creationDate: new Date('2026-10-21T00:00:00Z') });
    expect(r.warnings).toEqual([]);
    info = await inspectPdf(r.buffer);
  });
  afterAll(async () => {
    await releaseBrowser();
  });

  it('is 6 x 9 in with every font embedded', () => {
    expect(info.pageSizes).toEqual([{ widthPt: 432, heightPt: 648 }]);
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
  });

  it('puts the chapter opener alone on its page and the section at the top of the next', () => {
    // Extracted text starts with the folio (its margin box comes first) and letter-spaced labels split into letters.
    const opener = info.pageText.findIndex((t) => squash(t).startsWith('CHAPTER1'));
    expect(opener).toBeGreaterThan(0);
    expect(squash(info.pageText[opener] ?? '')).toBe(squash('CHAPTER 1 READ YOUR WINDOWS BEFORE YOU BUY A PLANT'));
    expect(info.pageText[opener + 1]).toMatch(/^\d+ Your basil did not die/);
    expect(info.pageText[opener + 2]).toMatch(/^\d+ NORTH, EAST, SOUTH AND WEST A north-facing sill/);
  });

  it('prints no running head: the book title appears only on the title page', () => {
    const withTitle = info.pageText.map((t, i) => (t.includes('Windowsill Herbs') ? i : -1)).filter((i) => i >= 0);
    expect(withTitle).toEqual([0]);
  });

  it('prints a folio on body pages but not on the opener, and the introduction runs on below its heading', () => {
    const intro = info.pageText.findIndex((t) => t.includes('INTRODUCTION'));
    expect(info.pageText[intro]).toMatch(/INTRODUCTION If you have ever brought home/);
    const opener = info.pageText.findIndex((t) => squash(t).startsWith('CHAPTER1'));
    expect(info.pageText[opener]).not.toMatch(/^\d/);
    expect(info.pageText[opener + 1]).toMatch(/^3 /);
  });
});

describe('clean-handbook DOCX (mini book)', () => {
  let doc = '';
  let footers: string[] = [];
  beforeAll(async () => {
    const zip = await JSZip.loadAsync(await exportDocx(loadMiniBook(), theme));
    doc = (await zip.file('word/document.xml')?.async('string')) ?? '';
    const names = Object.keys(zip.files).filter((f) => /word\/footer\d+\.xml/.test(f));
    footers = await Promise.all(names.map((f) => zip.file(f)?.async('string') ?? Promise.resolve('')));
  });

  it('breaks the page before each section heading and after the opener, in capitals and centred', () => {
    const h2 = /<w:p>(?:(?!<\/w:p>).)*<w:pStyle w:val="Heading2"\/>(?:(?!<\/w:p>).)*<\/w:p>/s.exec(doc)?.[0] ?? '';
    expect(h2).toContain('<w:pageBreakBefore/>');
    expect(h2).toContain('<w:jc w:val="center"/>');
    expect(h2).toContain('<w:caps/>');
  });

  it('colours the CHAPTER label navy and keeps the folio centred with no header', () => {
    expect(doc).toContain(`<w:color w:val="${NAVY.slice(1)}"/>`);
    expect(footers.some((x) => x.includes('PAGE') && x.includes('<w:jc w:val="center"/>'))).toBe(true);
    expect(footers.some((x) => /<w:jc w:val="(right|left|end|start)"\/>/.test(x))).toBe(false);
  });
});

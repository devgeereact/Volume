// P6-2 goldens: a short fiction sample and a short workbook sample in every format (D-042).
// TXT and MD exact; DOCX normalised document.xml (styles.xml must equal the Windowsill golden: no new styles);
// EPUB chapter XHTML and nav exact; PDF page count, page size, embedded fonts, extracted text and 4 page images.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { blockTexts, DEFAULT_INTERIOR_THEME, parseManuscript, stripInline, WRITING_SPACE_TEXT } from '@volume/core';
import { loadBookTemplate, loadHouseStyle, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  buildPrintHtml,
  exportDocx,
  exportEpub,
  exportMarkdown,
  exportPrintPdf,
  exportTxt,
  inspectPdf,
  loadFontLibrary,
  preflightText,
  releaseBrowser,
  renderPdfPages,
  runPreflight,
  type PdfInspection,
  type PrintPdfResult,
} from '../src/index.ts';
import { comparePages, golden, goldenPath, loadSample, normaliseXml, type SampleName } from './helpers.ts';

const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const SAMPLES: [SampleName, string][] = [
  ['fiction-mini', 'fiction'],
  ['workbook-mini', 'workbook'],
];

describe.each(SAMPLES)('%s: text formats', (name) => {
  it('MD writes the canonical manuscript (scene breaks as ***) and reads back unchanged', () => {
    const { md, book } = loadSample(name);
    const out = exportMarkdown(book).toString('utf8');
    expect(out).toBe(golden(`${name}.md`, out));
    expect(out).toBe(md.replace(/^\* \* \*$/m, '***'));
  });

  it('TXT matches the golden file, wrapped at 80 columns', () => {
    const out = exportTxt(loadSample(name).book).toString('utf8');
    expect(out).toBe(golden(`${name}.txt`, out));
    expect(out.split('\n').filter((l) => l.length > 80 && /\s/.test(l))).toEqual([]);
    expect(out).not.toContain(':::');
    expect(out).not.toContain('____');
  });

  it('DOCX matches the normalised golden document.xml and adds no styles', async () => {
    const zip = await JSZip.loadAsync(await exportDocx(loadSample(name).book));
    const doc = normaliseXml((await zip.file('word/document.xml')?.async('string')) ?? '');
    const styles = normaliseXml((await zip.file('word/styles.xml')?.async('string')) ?? '');
    expect(doc).toBe(golden(`${name}.document.xml`, doc));
    expect(styles).toBe(readFileSync(goldenPath('windowsill-herbs.styles.xml'), 'utf8'));
  });

  it('EPUB chapters and nav match the golden XHTML', async () => {
    const { book } = loadSample(name);
    const zip = await JSZip.loadAsync(await exportEpub(book, undefined, { modified: new Date('2026-10-17T00:00:00Z') }));
    const files = Object.keys(zip.files)
      .filter((f) => f === 'OEBPS/nav.xhtml' || /OEBPS\/text\/.*chapter-.*\.xhtml$/.test(f))
      .sort();
    expect(files.length).toBe(1 + book.sections.filter((s) => s.kind === 'chapter').length);
    const parts = await Promise.all(files.map(async (f) => `<!-- ${f} -->\n${(await zip.file(f)?.async('string')) ?? ''}`));
    const out = `${parts.join('\n')}\n`;
    expect(out).toBe(golden(`${name}.epub.txt`, out));
    expect(out).not.toContain('writing-lines');
  });
});

describe('fiction layout', () => {
  const { book } = loadSample('fiction-mini');
  it('has chapters without subheadings or takeaways, and every scene break as one break in each format', async () => {
    const chapters = book.sections.filter((s) => s.kind === 'chapter');
    expect(chapters.flatMap((s) => s.blocks.filter((b) => b.type === 'heading2' || b.type === 'takeaways'))).toEqual([]);
    expect(chapters.flatMap((s) => s.blocks.filter((b) => b.type === 'sceneBreak'))).toHaveLength(2);
    expect(
      exportTxt(book)
        .toString('utf8')
        .match(/^\* \* \*$/gm),
    ).toHaveLength(2);
    const zip = await JSZip.loadAsync(await exportDocx(book));
    const doc = (await zip.file('word/document.xml')?.async('string')) ?? '';
    expect(doc.match(/<w:pStyle w:val="SceneBreak"\/>/g)).toHaveLength(2);
    expect(doc).not.toContain('w:val="Heading2"');
    expect(doc).not.toContain('w:val="TakeawaysHeading"');
  });
});

describe('untitled chapters', () => {
  it('print "Chapter 1" as the heading in TXT, EPUB, DOCX and the print HTML', async () => {
    const book = parseManuscript('::: contents\n:::\n\n# Chapter 1\n\nIt was raining.\n');
    expect(exportTxt(book).toString('utf8')).toMatch(/^CHAPTER 1$/m);
    expect(exportTxt(book).toString('utf8')).toMatch(/^1\. Chapter 1$/m);
    const epub = await JSZip.loadAsync(await exportEpub(book, undefined, { modified: new Date('2026-10-17T00:00:00Z') }));
    const chapter = await epub.file('OEBPS/text/chapter-1.xhtml')?.async('string');
    expect(chapter).toContain('<header><h1>Chapter 1</h1></header>');
    const docx = await JSZip.loadAsync(await exportDocx(book));
    expect(await docx.file('word/document.xml')?.async('string')).toContain('>Chapter 1</w:t>');
    const html = buildPrintHtml(book, DEFAULT_INTERIOR_THEME, loadFontLibrary(), { trim: '6x9' }).html;
    expect(html).toContain('<h1 class="st">Chapter 1</h1>');
    expect(html).not.toContain('<div class="kicker">');
  });
});

describe.each(SAMPLES)('%s: preflight with its template', (name, template) => {
  it('passes the template rules item and blocks on a seeded break of the rules', async () => {
    const { book } = loadSample(name);
    const input = {
      book,
      rules: loadKdpRules(),
      houseStyle: loadHouseStyle(),
      template: loadBookTemplate(template),
      trim: '6x9' as const,
      paper: 'white' as const,
      listing: { title: book.meta.title },
      copyrightYear: 2026,
      now: new Date('2026-10-17T12:00:00Z'),
    };
    const r = await runPreflight(input);
    const item = (rep: typeof r, id: string) => rep.items.find((i) => i.id === id);
    expect(item(r, 'structure.template-rules')?.level, preflightText(r)).toBe('pass');
    expect(item(r, 'structure.sections')?.level).toBe('pass');
    expect(item(r, 'style.house')?.level).toBe('pass');

    const bad = loadSample(name).book;
    const ch = bad.sections.find((s) => s.kind === 'chapter');
    if (!ch) throw new Error('no chapter');
    if (template === 'fiction') ch.blocks.push({ type: 'heading2', text: 'A Subheading' }, { type: 'takeaways', items: ['One'] });
    else ch.blocks = ch.blocks.filter((b) => b.type !== 'exercise');
    const r2 = await runPreflight({ ...input, book: bad });
    expect(item(r2, 'structure.template-rules')?.level).toBe('fail');
    expect(item(r2, 'structure.template-rules')?.detail).toMatch(template === 'fiction' ? /subheading.*takeaways/s : /no exercises/);
  });
});

// ---------- PDF ----------

let browser: Browser;
beforeAll(async () => {
  browser = await acquireBrowser();
});
afterAll(async () => {
  await releaseBrowser();
});

/** Front matter is not in the section map, so find the contents page by its heading. */
const contentsPage = (info: PdfInspection) => info.pageText.findIndex((t) => t.startsWith('Contents')) + 1;

function checkText(name: SampleName, info: PdfInspection, r: PrintPdfResult): void {
  const { book } = loadSample(name);
  const all = letters(info.pageParts.map((p) => p.body).join(' '));
  for (const s of book.sections.filter((x) => x.kind === 'chapter')) {
    expect(r.sections[s.id]?.page, s.id).toBeDefined();
    for (const t of blockTexts(s)) expect(all, t.slice(0, 40)).toContain(letters(stripInline(t)));
  }
  expect(info.pageText.join(' ')).not.toContain(WRITING_SPACE_TEXT);
}

describe('fiction-mini: print PDF', () => {
  const { book } = loadSample('fiction-mini');
  let r: PrintPdfResult;
  let info: PdfInspection;
  beforeAll(async () => {
    r = await exportPrintPdf(book, DEFAULT_INTERIOR_THEME, { browser, creationDate: new Date('2026-10-17T00:00:00Z') });
    info = await inspectPdf(r.buffer);
  });

  it('has 6 x 9 in pages, the recorded page count, embedded fonts and the chapter text', () => {
    expect(info.pageSizes).toEqual([{ widthPt: 432, heightPt: 648 }]);
    expect(info.pageCount).toBe(Number(golden('fiction-mini.pages.txt', `${info.pageCount}\n`).trim()));
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
    expect(r.warnings).toEqual([]);
    checkText('fiction-mini', info, r);
  });

  it('looks the same as the golden render on 4 pages (title, contents, chapter 1 opener with a scene break, chapter 2)', async () => {
    const [ch1, ch2] = book.sections.filter((s) => s.kind === 'chapter');
    const pages = [1, contentsPage(info), r.sections[ch1?.id ?? '']?.page ?? 0, r.sections[ch2?.id ?? '']?.page ?? 0];
    expect(info.pageText[(pages[2] ?? 1) - 1]).toContain(DEFAULT_INTERIOR_THEME.sceneBreak);
    const failures = await comparePages('fiction-mini', await renderPdfPages(r.buffer, pages, { browser, scale: 1 }));
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('workbook-mini: print PDF', () => {
  const { book } = loadSample('workbook-mini');
  let r: PrintPdfResult;
  let info: PdfInspection;
  beforeAll(async () => {
    r = await exportPrintPdf(book, DEFAULT_INTERIOR_THEME, { browser, creationDate: new Date('2026-10-17T00:00:00Z') });
    info = await inspectPdf(r.buffer);
  });

  it('has 6 x 9 in pages, the recorded page count, embedded fonts and the chapter text', () => {
    expect(info.pageSizes).toEqual([{ widthPt: 432, heightPt: 648 }]);
    expect(info.pageCount).toBe(Number(golden('workbook-mini.pages.txt', `${info.pageCount}\n`).trim()));
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
    // "How to Use This Workbook" sits after the contents but before page 1, so it has no folio: the contents
    // safety net blanks the number target-counter() gave it. That is the only warning allowed.
    expect(r.warnings).toEqual(['1 contents page numbers from target-counter() did not match the layout and were corrected.']);
    checkText('workbook-mini', info, r);
  });

  it('puts the fill-in page on a page of its own', () => {
    const at = info.pageText.findIndex((t) => t.includes('My goal for the next four weeks'));
    expect(at).toBeGreaterThan(0);
    expect(info.pageParts[at]?.body.startsWith('My goal for the next four weeks')).toBe(true);
  });

  it('looks the same as the golden render on 4 pages (title, contents, first exercise, fill-in page)', async () => {
    const exercise = info.pageText.findIndex((t) => t.includes('Exercise: Your Busiest Day')) + 1;
    const fillIn = info.pageText.findIndex((t) => t.includes('My goal for the next four weeks')) + 1;
    expect(exercise).toBeGreaterThan(0);
    const pages = [1, contentsPage(info), exercise, fillIn];
    const failures = await comparePages('workbook-mini', await renderPdfPages(r.buffer, pages, { browser, scale: 1 }));
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

import sharp from 'sharp';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { blockTexts, DEFAULT_INTERIOR_THEME, stripInline } from '@volume/core';
import { acquireBrowser, exportPrintPdf, inspectPdf, releaseBrowser, renderPdfPages, type PdfInspection, type PrintPdfResult } from '../src/index.ts';
import { goldenPath, layoutMismatch, loadMiniBook, loadWindowsill, meanGreyDifference, VISUAL_REFERENCE_PLATFORM, visualReferencePath } from './helpers.ts';

const PYTHON_PAGES = 29; // windowsill-herbs-interior-6x9.pdf from the P02 Python build
const letters = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

let browser: Browser;
beforeAll(async () => {
  browser = await acquireBrowser();
});
afterAll(async () => {
  await releaseBrowser();
});

describe('print PDF, chapters on any page (compared with the Python build)', () => {
  const { book } = loadWindowsill();
  let r: PrintPdfResult;
  let info: PdfInspection;
  beforeAll(async () => {
    r = await exportPrintPdf(book, DEFAULT_INTERIOR_THEME, { browser, chapterStart: 'any', creationDate: new Date('2026-10-04T00:00:00Z') });
    info = await inspectPdf(r.buffer);
  });

  it('has 432 x 648 pt pages and a page count within 2 of the Python build', () => {
    expect(info.pageSizes).toEqual([{ widthPt: 432, heightPt: 648 }]);
    expect(Math.abs(info.pageCount - PYTHON_PAGES)).toBeLessThanOrEqual(2);
    expect(r.warnings).toEqual([]);
  });

  it('embeds every font and has no Type 3 fonts', () => {
    expect(info.fonts.length).toBeGreaterThanOrEqual(4);
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
  });

  it('prints correct page numbers in the contents', () => {
    const contentsPages = info.pageText.filter((t) => t.startsWith('Contents') || t.includes('A small request'));
    const toc = contentsPages.join(' ');
    for (const s of book.sections.filter((x) => x.kind === 'chapter' || x.subtype === 'conclusion' || x.subtype === 'introduction')) {
      const at = r.sections[s.id];
      expect(at, s.id).toBeDefined();
      const folio = at?.folio ?? '';
      expect(folio).toMatch(/^\d+$/);
      expect(toc, s.title).toContain(`${s.title} ${folio}`);
      // the folio is printed on the opener page itself
      expect(info.pageText[(at?.page ?? 1) - 1]?.split(' ')).toContain(folio);
    }
    expect(r.sections.introduction?.folio).toBe('1');
  });

  it('prints running heads: book title on left pages, chapter title on right pages, none on openers', () => {
    const ch1 = book.sections.find((s) => s.number === 1);
    const opener = r.sections[ch1?.id ?? '']?.page ?? 0;
    const left = [opener + 1, opener + 2].find((n) => n % 2 === 0) ?? 0;
    const right = [opener + 1, opener + 2].find((n) => n % 2 === 1) ?? 0;
    // small caps with letter spacing extract as spaced capitals, so compare letters only
    expect(letters(info.pageParts[left - 1]?.head ?? '')).toBe(letters('Windowsill Herbs'));
    expect(letters(info.pageParts[right - 1]?.head ?? '')).toBe(letters(ch1?.title ?? '?'));
    // Check rendered glyph case as well as content: global font-synthesis:none
    // previously suppressed the theme's requested small capitals.
    for (const n of [left, right]) {
      const head = info.pageParts[n - 1]?.head ?? '';
      expect(head).toMatch(/[A-Z]/);
      expect(head).not.toMatch(/[a-z]/);
    }
    expect(info.pageParts[opener - 1]?.head).toBe('');
    expect(info.pageParts[0]?.head).toBe('');
    expect(info.pageParts[opener - 1]?.foot).toBe(r.sections[ch1?.id ?? '']?.folio);
  });

  it('extracts the text of chapter 1 intact', () => {
    const ch1 = book.sections.find((s) => s.number === 1);
    const ch2 = book.sections.find((s) => s.number === 2);
    const from = r.sections[ch1?.id ?? '']?.page ?? 0;
    const to = (r.sections[ch2?.id ?? '']?.page ?? 0) - 1;
    const got = letters(
      info.pageParts
        .slice(from - 1, to)
        .map((p) => p.body)
        .join(' '),
    );
    const want = ch1
      ? blockTexts(ch1)
          .map((t) => letters(stripInline(t)))
          .filter(Boolean)
      : [];
    expect(want.length).toBeGreaterThan(10);
    for (const w of want) expect(got, w.slice(0, 40)).toContain(w);
    expect(got.startsWith(letters(`Chapter 1 ${ch1?.title ?? ''}`))).toBe(true);
  });
});

describe('print PDF, chapters on right-hand pages (D-013 default)', () => {
  it('opens every chapter on an odd page and leaves added pages blank', async () => {
    const { book } = loadWindowsill();
    const r = await exportPrintPdf(book, DEFAULT_INTERIOR_THEME, { browser });
    const info = await inspectPdf(r.buffer);
    for (const s of book.sections.filter((x) => x.kind === 'chapter')) expect((r.sections[s.id]?.page ?? 0) % 2, s.id).toBe(1);
    expect(r.blankPages.length).toBeGreaterThan(0);
    for (const n of r.blankPages) expect(info.pageText[n - 1]).toBe('');
    expect(Math.abs(info.pageCount - PYTHON_PAGES)).toBeLessThanOrEqual(2 + r.blankPages.length + 1);
  });

  it('looks the same as the golden render on 4 pages (title, contents, chapter opener, body)', async () => {
    const { book } = loadWindowsill();
    const r = await exportPrintPdf(book, DEFAULT_INTERIOR_THEME, { browser, creationDate: new Date('2026-10-04T00:00:00Z') });
    const opener = r.sections['chapter-1-read-your-windows-before-you-buy-a-plant']?.page ?? 7;
    const pages = [1, r.sections.contents?.page ?? 3, opener, opener + 1];
    const pngs = await renderPdfPages(r.buffer, pages, { browser, scale: 1 });
    const failures: string[] = [];
    for (const [i, png] of pngs.entries()) {
      const name = `windowsill-page-${i + 1}.png`;
      const p = visualReferencePath(name);
      if (process.env.UPDATE_GOLDEN === '1') {
        mkdirSync(new URL('.', p), { recursive: true });
        writeFileSync(p, png);
      }
      if (!existsSync(p)) {
        failures.push(`${name}: ${VISUAL_REFERENCE_PLATFORM} reference is missing; restore the approved reference before testing.`);
        continue;
      }
      const a = await sharp(png).greyscale().raw().toBuffer({ resolveWithObject: true });
      const b = await sharp(readFileSync(p)).greyscale().raw().toBuffer({ resolveWithObject: true });
      if (a.info.width !== b.info.width || a.info.height !== b.info.height) {
        failures.push(`${name}: dimensions differ (${a.info.width}x${a.info.height} versus ${b.info.width}x${b.info.height}).`);
        continue;
      }
      const mean = meanGreyDifference(a.data, b.data);
      if (mean >= 1.5) failures.push(`${name}: mean grey-level difference ${mean} exceeds the unchanged 1.5 threshold.`);
      // Every platform must also lay out like the approved macOS originals (same lines, words and page breaks).
      const original = await sharp(readFileSync(goldenPath(name)))
        .greyscale()
        .raw()
        .toBuffer({ resolveWithObject: true });
      if (original.info.width !== a.info.width || original.info.height !== a.info.height) {
        failures.push(
          `${name}: dimensions differ from the approved macOS reference (${a.info.width}x${a.info.height} versus ${original.info.width}x${original.info.height}).`,
        );
        continue;
      }
      // One way only: macOS text is heavier, so light grey macOS ink has no Linux counterpart at the same
      // threshold. Missing text is caught by the mean grey check against this platform's own reference.
      const moved = layoutMismatch(a.data, original.data, a.info.width, a.info.height);
      if (moved > 0.01) failures.push(`${name}: ${(moved * 100).toFixed(2)}% of the text ink has moved against the approved macOS reference.`);
    }
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('print PDF trims', () => {
  it.each([
    ['5x8', 360, 576],
    ['5.5x8.5', 396, 612],
    ['6x9', 432, 648],
    ['8.5x11', 612, 792],
  ])('%s in gives %i x %i pt pages with fonts embedded', async (trim, w, h) => {
    const r = await exportPrintPdf(loadMiniBook(), DEFAULT_INTERIOR_THEME, { browser, trim });
    const info = await inspectPdf(r.buffer, { text: false });
    expect(info.pageSizes).toEqual([{ widthPt: w, heightPt: h }]);
    expect(info.fonts.every((f) => f.embedded && !f.type3)).toBe(true);
  });
});

import JSZip from 'jszip';
import sharp from 'sharp';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_COVER_STYLE, wrapSizeIn } from '@volume/core';
import { loadBookTemplate, loadHouseStyle, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  buildUploadPack,
  exportDocx,
  exportEbookCover,
  exportEpub,
  exportMarkdown,
  exportPaperbackWrap,
  exportPrintPdf,
  exportTxt,
  inspectPdf,
  releaseBrowser,
  runPreflight,
} from '../src/index.ts';
import { loadMiniBook, loadWindowsill } from './helpers.ts';

const rules = loadKdpRules();
let browser: Browser;
beforeAll(async () => {
  browser = await acquireBrowser();
});
afterAll(async () => {
  await releaseBrowser();
});

describe('eBook cover', () => {
  it('is a 1600 x 2560 sRGB JPEG with a legible title', async () => {
    const r = await exportEbookCover(loadWindowsill().book.meta, DEFAULT_COVER_STYLE, { browser, rules });
    const m = await sharp(r.jpeg).metadata();
    expect([m.format, m.width, m.height, m.space, m.channels]).toEqual(['jpeg', 1600, 2560, 'srgb', 3]);
    expect(m.icc).toBeDefined();
    expect(r.titlePxAt160).toBeGreaterThanOrEqual(10);
  });

  it('takes a background image', async () => {
    const bg = await sharp({ create: { width: 800, height: 1280, channels: 3, background: '#3f7f4b' } })
      .png()
      .toBuffer();
    const r = await exportEbookCover(loadMiniBook().meta, DEFAULT_COVER_STYLE, { browser, rules, background: bg });
    const { data } = await sharp(r.jpeg).resize(1, 1).raw().toBuffer({ resolveWithObject: true });
    expect(data[1] ?? 0).toBeGreaterThan(data[0] ?? 0); // green dominates under the overlay
  });
});

describe('paperback wrap', () => {
  it.each([
    [60, 'white' as const, false],
    [120, 'white' as const, true],
    [200, 'cream' as const, true],
    [300, 'cream' as const, true],
  ])('%i pages on %s paper matches the formula to 0.001 in', async (pages, paper, spineText) => {
    const meta = loadWindowsill().book.meta;
    const r = await exportPaperbackWrap(meta, DEFAULT_COVER_STYLE, { rules, pages, paper, browser, blurb: 'A short blurb.' });
    const want = wrapSizeIn(rules, { trim: { widthIn: 6, heightIn: 9 }, pages, paper });
    const info = await inspectPdf(r.pdf);
    const size = info.pageSizes[0];
    expect(Math.abs((size?.widthPt ?? 0) / 72 - want.widthIn)).toBeLessThan(0.001);
    expect(Math.abs((size?.heightPt ?? 0) / 72 - want.heightIn)).toBeLessThan(0.001);
    expect(r.spineText).toBe(spineText);
    expect(info.fonts.every((f) => f.embedded && !f.type3)).toBe(true);
    // the spine carries the title only from 80 pages
    const titleCount = (info.pageText[0]?.match(/Windowsill Herbs/g) ?? []).length;
    expect(titleCount).toBe(spineText ? 2 : 1);
  });
});

describe('preflight and upload pack on the sample book', () => {
  it('passes everything except the sections the demo book leaves out, and packs every file', async () => {
    const { book } = loadWindowsill();
    Object.assign(book.meta, {
      listing: {
        description: '<p>Grow fresh herbs on the windowsill you already have.</p>',
        keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
        categories: ['x', 'y', 'z'],
      },
    });
    const pdf = await exportPrintPdf(book, undefined, { browser });
    const cover = await exportEbookCover(book.meta, DEFAULT_COVER_STYLE, { browser, rules });
    const wrap = await exportPaperbackWrap(book.meta, DEFAULT_COVER_STYLE, { rules, pages: pdf.pageCount, paper: 'white', browser });
    const report = await runPreflight({
      book,
      rules,
      houseStyle: loadHouseStyle(),
      template: loadBookTemplate('nonfiction'),
      trim: '6x9',
      paper: 'white',
      listing: {
        title: book.meta.title,
        subtitle: book.meta.subtitle ?? '',
        description: book.meta.listing?.description ?? '',
        keywords: book.meta.listing?.keywords ?? [],
        categories: book.meta.listing?.categories ?? [],
      },
      interiorPdf: pdf.buffer,
      insideMarginIn: 0.8,
      wrapPdf: wrap.pdf,
      wrapInfo: { spineText: wrap.spineText },
      ebookCover: cover.jpeg,
      profileBio: 'Not the bio.',
      copyrightYear: 2026,
      now: new Date('2026-10-04T12:00:00Z'),
    });
    const fails = report.items.filter((i) => i.level === 'fail').map((i) => i.id);
    expect(fails.sort()).toEqual(['honesty.about-author', 'structure.sections']);
    for (const id of ['interior.trim', 'interior.fonts', 'interior.pages', 'wrap.size', 'wrap.spine-text', 'ebook.cover', 'style.house', 'listing.keywords']) {
      expect(report.items.find((i) => i.id === id)?.level, id).toBe('pass');
    }
    expect(report.interiorPages).toBe(pdf.pageCount);

    const pack = await buildUploadPack({
      book,
      files: {
        interiorPdf: pdf.buffer,
        epub: await exportEpub(book, undefined, { coverJpeg: cover.jpeg }),
        docx: await exportDocx(book),
        txt: exportTxt(book),
        md: exportMarkdown(book),
        ebookCover: cover.jpeg,
        wrapPdf: wrap.pdf,
      },
      trim: '6x9',
      paper: 'white',
      pages: pdf.pageCount,
      rules,
      preflight: report,
      claims: [{ chapter: 'Chapter 4', sentence: 'Feed every couple of weeks.', category: 'safety', check: 'label', status: 'open' }],
      ai: { aiWroteText: true, aiMadeImages: false },
      marketing: { launchEmail: 'Subject: The book is out', tiktokScripts: '  ' },
      backCoverBlurb: 'Fresh herbs from the windowsill you already have.',
      shortBio: 'Ada Green grows herbs in a small London flat.\n',
      date: new Date('2026-10-04T00:00:00Z'),
    });
    expect(pack.fileName).toBe('windowsill-herbs-kdp-pack-2026-10-04.zip');
    const z = await JSZip.loadAsync(pack.zip);
    const files = Object.keys(z.files)
      .filter((f) => !f.endsWith('/'))
      .sort();
    expect(files).toEqual(
      [
        'README.txt',
        'cover/windowsill-herbs-ebook-cover.jpg',
        `cover/windowsill-herbs-paperback-wrap-6x9-white-${pdf.pageCount}p.pdf`,
        'listing/ai-disclosure.txt',
        'listing/back-cover-blurb.txt',
        'listing/description.html',
        'listing/metadata.txt',
        'listing/short-bio.txt',
        'manuscript/windowsill-herbs-interior-6x9.pdf',
        'manuscript/windowsill-herbs.docx',
        'manuscript/windowsill-herbs.epub',
        'manuscript/windowsill-herbs.md',
        'manuscript/windowsill-herbs.txt',
        'marketing/launch-email.txt',
        'reports/claims-to-verify.csv',
        'reports/kdp-rules-used.txt',
        'reports/preflight.html',
        'reports/preflight.txt',
      ].sort(),
    );
    // Marketing files only for text that exists, and the README says what is there.
    expect(await z.file('marketing/launch-email.txt')?.async('string')).toBe('Subject: The book is out\n');
    const readme = (await z.file('README.txt')?.async('string')) ?? '';
    expect(readme).toContain('marketing/    The launch email\n');
    // Blurb and short bio as UTF-8 text with one trailing newline (D-049).
    expect(await z.file('listing/back-cover-blurb.txt')?.async('string')).toBe('Fresh herbs from the windowsill you already have.\n');
    expect(await z.file('listing/short-bio.txt')?.async('string')).toBe('Ada Green grows herbs in a small London flat.\n');
    expect(readme).toContain('listing/      metadata, the HTML description, the back-cover blurb, the short bio and the AI disclosure note\n');
    expect(readme).not.toContain('Not written yet');
    expect(await z.file('listing/ai-disclosure.txt')?.async('string')).toContain('Text: AI-generated');
    expect(await z.file('reports/claims-to-verify.csv')?.async('string')).toContain('chapter,sentence,category,check needed,status');
  });
});

import JSZip from 'jszip';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { parseTrimKey, wrapSizeIn } from '@volume/core';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { buildUploadPack, inspectPdf, isTiff, ownEbookCoverItem, pdfImageColourSpaces, runPreflight, type PreflightInput } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// "Use my own cover" (live acceptance 18 October 2026, defect 4): the owner's eBook cover and paperback wrap are
// checked against config/kdp-rules, not against Volume's own build settings.

const rules = loadKdpRules();
const houseStyle = loadHouseStyle();

const image = (w: number, h: number) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 40, g: 90, b: 140 } } });

describe('own eBook cover (rule ebook.cover)', () => {
  it('passes a 1600 x 2560 RGB JPEG and a TIFF', async () => {
    expect((await ownEbookCoverItem(await image(1600, 2560).jpeg().toBuffer(), rules)).level).toBe('pass');
    const tiff = await image(1600, 2560).tiff().toBuffer();
    expect(isTiff(tiff)).toBe(true);
    expect((await ownEbookCoverItem(tiff, rules)).level).toBe('pass');
  });

  it('warns below the ideal size but inside the limits', async () => {
    const r = await ownEbookCoverItem(await image(1000, 1600).jpeg().toBuffer(), rules);
    expect(r.level).toBe('warn');
    expect(r.detail).toContain('1600 x 2560');
  });

  it('fails PNG, CMYK, a short ratio and a tiny image', async () => {
    const png = await ownEbookCoverItem(await image(1600, 2560).png().toBuffer(), rules);
    expect(png.level).toBe('fail');
    expect(png.detail).toContain('PNG is not a KDP eBook cover type');
    const cmyk = await ownEbookCoverItem(await image(1600, 2560).toColourspace('cmyk').jpeg().toBuffer(), rules);
    expect(cmyk.level).toBe('fail');
    expect(cmyk.detail).toContain('not RGB');
    expect((await ownEbookCoverItem(await image(1600, 2400).jpeg().toBuffer(), rules)).detail).toContain('under 1.6:1');
    expect((await ownEbookCoverItem(await image(500, 800).jpeg().toBuffer(), rules)).detail).toContain('under the minimum 625 x 1000');
    expect((await ownEbookCoverItem(Buffer.from('not an image'), rules)).level).toBe('fail');
  });
});

async function interior(pages: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i++) doc.addPage([432, 648]);
  return Buffer.from(await doc.save());
}

/** A wrap PDF of the given size in inches with one JPEG drawn across the whole page. */
async function wrap(widthIn: number, heightIn: number, px: { w: number; h: number }): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([widthIn * 72, heightIn * 72]);
  const jpg = await doc.embedJpg(await image(px.w, px.h).jpeg().toBuffer());
  page.drawImage(jpg, { x: 0, y: 0, width: widthIn * 72, height: heightIn * 72 });
  return Buffer.from(await doc.save());
}

async function report(extra: Partial<PreflightInput>) {
  return runPreflight({
    book: loadMiniBook(),
    rules,
    houseStyle,
    trim: '6x9',
    paper: 'white',
    listing: { title: 'Mini' },
    pack: true,
    now: new Date('2026-10-19T12:00:00Z'),
    ...extra,
  });
}
const item = (r: Awaited<ReturnType<typeof report>>, id: string) => r.items.find((i) => i.id === id);

describe('own paperback wrap (rules paperback.cover, paperback.spine.*)', () => {
  const pages = 120;
  const size = wrapSizeIn(rules, { trim: parseTrimKey('6x9'), pages, paper: 'white' });

  it('passes the size from the real page count, 300 DPI and the spine rule; colour is an unverified warning', async () => {
    const wrapPdf = await wrap(size.widthIn, size.heightIn, { w: Math.ceil(size.widthIn * 300), h: Math.ceil(size.heightIn * 300) });
    const r = await report({ interiorPdf: await interior(pages), wrapPdf, ownCovers: { wrap: true } });
    expect(item(r, 'wrap.size')?.level).toBe('pass');
    expect(item(r, 'wrap.dpi')?.level).toBe('pass');
    expect(item(r, 'wrap.fonts')?.level).toBe('pass');
    expect(item(r, 'wrap.spine-text')?.level).toBe('pass');
    expect(item(r, 'wrap.colour')?.level).toBe('warn');
    expect(item(r, 'wrap.colour')?.detail).toContain('DeviceRGB');
    expect(item(r, 'cover.files')?.level).toBe('warn');
  });

  it('fails a wrap sized for another page count and a low-resolution image', async () => {
    const other = wrapSizeIn(rules, { trim: parseTrimKey('6x9'), pages: 200, paper: 'white' });
    const wrapPdf = await wrap(other.widthIn, other.heightIn, { w: 1200, h: 900 });
    const r = await report({ interiorPdf: await interior(pages), wrapPdf, ownCovers: { wrap: true } });
    expect(item(r, 'wrap.size')?.level).toBe('fail');
    expect(item(r, 'wrap.size')?.detail).toContain('tolerance is unverified');
    expect(item(r, 'wrap.dpi')?.level).toBe('fail');
    expect(item(r, 'wrap.dpi')?.detail).toContain('1200 x 900 px');
  });

  it('warns about spine text under the minimum pages', async () => {
    const small = wrapSizeIn(rules, { trim: parseTrimKey('6x9'), pages: 40, paper: 'white' });
    const wrapPdf = await wrap(small.widthIn, small.heightIn, { w: Math.ceil(small.widthIn * 300), h: Math.ceil(small.heightIn * 300) });
    const r = await report({ interiorPdf: await interior(40), wrapPdf, ownCovers: { wrap: true } });
    expect(item(r, 'wrap.spine-text')?.level).toBe('warn');
  });

  it('reads the drawn resolution and the colour spaces', async () => {
    const pdf = await wrap(10, 5, { w: 2000, h: 1000 });
    const info = await inspectPdf(pdf, { text: false });
    expect(info.images).toHaveLength(1);
    expect(Math.round(info.images[0]?.dpi ?? 0)).toBe(200);
    expect(await pdfImageColourSpaces(pdf)).toEqual(['DeviceRGB']);
  });
});

describe('pack with an own TIFF eBook cover', () => {
  it('names the cover .tif', async () => {
    const book = loadMiniBook();
    const { zip } = await buildUploadPack({
      book,
      files: { ebookCover: await image(1600, 2560).tiff().toBuffer() },
      trim: '6x9',
      paper: 'white',
      rules,
      ai: { aiWroteText: true, aiMadeImages: false },
      date: new Date('2026-10-19T00:00:00Z'),
    });
    const names = Object.keys((await JSZip.loadAsync(zip)).files);
    expect(names.some((n) => /^cover\/.+-ebook-cover\.tif$/.test(n))).toBe(true);
  });
});

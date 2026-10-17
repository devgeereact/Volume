// P7-3 goldens: a 24-page picture book (premium colour, 8.5 x 8.5 in, full bleed) with deterministic placeholder
// pictures. PDF page count from the rules, page box = trim + bleed, embedded fonts, a picture on every spread page,
// text boxes inside the safe area (measured in the page DOM), extracted text exact, and page images of two spreads.
// TXT and MD of the story exact. Preflight shown in full for the sample.
import { PDFDocument } from 'pdf-lib';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { defaultPictureBookPlan, interiorBleedSizeIn, parseTrimKey, pictureBookToBookDoc, type PictureBookDoc } from '@volume/core';
import { loadBookTemplate, loadHouseStyle, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  buildUploadPack,
  exportMarkdown,
  exportPictureBookPdf,
  exportTxt,
  inspectPdf,
  preflightText,
  releaseBrowser,
  renderPdfPages,
  runPreflight,
  type PdfInspection,
  type PictureBookPdfResult,
  type PreflightInput,
} from '../src/index.ts';
import { comparePages, golden, loadPictureMini, placeholderSpread } from './helpers.ts';
import JSZip from 'jszip';

const rules = loadKdpRules();
const trim = parseTrimKey('8.5x8.5');
const BIO = 'Nell Ashby writes gentle bedtime stories about small animals and big feelings. She lives by the sea with a very sleepy cat.';
const NOW = new Date('2026-10-17T12:00:00Z');

async function imagesFor(doc: PictureBookDoc): Promise<Record<string, Buffer>> {
  const out: Record<string, Buffer> = {};
  for (const s of doc.spreads) if (s.imageKey) out[s.imageKey] = await placeholderSpread(s.n);
  return out;
}

let browser: Browser;
let images: Record<string, Buffer>;
const doc = loadPictureMini();
let r: PictureBookPdfResult;
let info: PdfInspection;

beforeAll(async () => {
  browser = await acquireBrowser();
  images = await imagesFor(doc);
  r = await exportPictureBookPdf(doc, rules, { images, browser, creationDate: new Date('2026-10-17T00:00:00Z') });
  info = await inspectPdf(r.buffer);
});
afterAll(async () => {
  await releaseBrowser();
});

const preflightInput = (over: Partial<PreflightInput> = {}): PreflightInput => ({
  book: pictureBookToBookDoc(doc),
  rules,
  houseStyle: loadHouseStyle(),
  template: loadBookTemplate('picture-book'),
  trim: '8.5x8.5',
  paper: 'white',
  listing: {
    title: doc.meta.title,
    description: '<p>A small grey mouse called Mabel learns what being brave means on a gentle night walk with her friend Hedge.</p>',
    keywords: ['bedtime story', 'picture book mouse', 'brave mouse story', 'gentle bedtime book', 'hedgehog friend', 'moonlit garden', 'new word brave'],
    categories: ["Children's Books > Animals > Mice", "Children's Books > Bedtime", "Children's Books > Emotions > Courage"],
  },
  interiorPdf: r.buffer,
  pictureBook: { doc, ink: 'premium', layout: r.layout },
  aiDisclosure: { aiWroteText: true, aiMadeImages: true, disclosed: 'ai-generated' },
  profileBio: BIO,
  copyrightYear: 2026,
  now: NOW,
  ...over,
});

describe('picture-mini: print PDF', () => {
  it('has the default 24 pages from the colour rules: 3 front pages, 10 spreads, 1 back page', () => {
    const plan = defaultPictureBookPlan(rules, trim, 'premium');
    expect(plan.pages).toBe(24);
    expect(plan.spreads).toBe(10);
    expect(doc.spreads).toHaveLength(plan.spreads);
    expect(info.pageCount).toBe(plan.pages);
    expect(r.pages.map((p) => (p.kind === 'spread' ? `s${p.n}${p.side[0]}` : p.kind))).toEqual([
      'matter',
      'matter',
      'matter',
      ...doc.spreads.flatMap((s) => [`s${s.n}l`, `s${s.n}r`]),
      'matter',
    ]);
  });

  it('prints every page at trim plus bleed, with trim boxes on the right edges', async () => {
    const bleed = interiorBleedSizeIn(rules, trim);
    expect(info.pageSizes).toEqual([{ widthPt: bleed.widthIn * 72, heightPt: bleed.heightIn * 72 }]);
    const pdf = await PDFDocument.load(r.buffer);
    const box = (i: number) => {
      const b = pdf.getPage(i).getTrimBox();
      return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 100) / 100);
    };
    const outside = (bleed.widthIn - trim.widthIn) * 72;
    const bottom = ((bleed.heightIn - trim.heightIn) / 2) * 72;
    expect(box(0)).toEqual([0, bottom, trim.widthIn * 72, trim.heightIn * 72]); // page 1 is a right-hand page
    expect(box(3)).toEqual([outside, bottom, trim.widthIn * 72, trim.heightIn * 72]); // page 4, a left-hand page
  });

  it('embeds every font, has no warnings, and every spread page shows a picture', () => {
    expect(info.fonts.length).toBeGreaterThan(0);
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.layout.missingImages).toEqual([]);
    r.pages.forEach((p, i) => {
      if (p.kind === 'spread') expect(info.imagesPerPage[i], `page ${i + 1}`).toBeGreaterThan(0);
      else expect(info.imagesPerPage[i], `page ${i + 1}`).toBe(0);
    });
  });

  it('keeps every text box inside the safe area, measured in the page DOM', () => {
    expect(r.layout.textBoxes).toHaveLength(doc.spreads.length + doc.front.length + doc.back.length);
    expect(r.layout.overflowing).toEqual([]);
    expect(r.safeArea).toEqual([]);
    // Each story box sits on the page its layout names.
    for (const s of doc.spreads) {
      const b = r.layout.textBoxes.find((x) => x.label === `spread ${s.n}`);
      const page = r.pages.findIndex((p) => p.kind === 'spread' && p.n === s.n && p.side === (s.layout === 'text-right' ? 'right' : 'left')) + 1;
      expect(b?.page, `spread ${s.n}`).toBe(page);
    }
  });

  it('has the golden text on every page', () => {
    const out = `${info.pageText.map((t, i) => `[${i + 1}] ${t}`).join('\n')}\n`;
    expect(out).toBe(golden('picture-mini.pages-text.txt', out));
  });

  it('looks the same as the golden render on 4 pages (spreads 1 and 2, both pages each)', async () => {
    const pages = [1, 2].flatMap((n) => r.pages.flatMap((p, i) => (p.kind === 'spread' && p.n === n ? [i + 1] : [])));
    expect(pages).toEqual([4, 5, 6, 7]);
    const failures = await comparePages('picture-mini', await renderPdfPages(r.buffer, pages, { browser, scale: 1 }));
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

describe('picture-mini: text formats', () => {
  it('TXT and MD of the story match the golden files', () => {
    const book = pictureBookToBookDoc(doc);
    const txt = exportTxt(book).toString('utf8');
    expect(txt).toBe(golden('picture-mini.txt', txt));
    const md = exportMarkdown(book).toString('utf8');
    expect(md).toBe(golden('picture-mini.md', md));
  });
});

describe('picture-mini: preflight', () => {
  it('passes with the picture-book items, and the report matches the golden text', async () => {
    const rep = await runPreflight(preflightInput());
    const text = preflightText(rep, `Preflight: ${doc.meta.title}`);
    expect(rep.ok, text).toBe(true);
    // paperback.colour.paper is a partial rule, so the colour page count passes with a check-before-use warning.
    const pageCount = rep.items.find((i) => i.id === 'picture.page-count');
    expect(pageCount?.level).toBe('warn');
    expect(pageCount?.detail).toContain('paperback.colour.paper is partial');
    for (const id of [
      'interior.bleed',
      'interior.fonts',
      'picture.spread-images',
      'picture.safe-area',
      'picture.spreads',
      'kdp.ai-disclosure',
      'honesty.about-author',
    ])
      expect(rep.items.find((i) => i.id === id)?.level, id).toBe('pass');
    expect(rep.items.map((i) => i.id)).not.toContain('interior.trim');
    expect(rep.items.map((i) => i.id)).not.toContain('structure.contents');
    expect(text).toBe(golden('picture-mini.preflight.txt', text));
  });

  it('fails a spread with no picture and a disclosure that leaves out images', async () => {
    const noPicture: PictureBookDoc = { ...doc, spreads: doc.spreads.map((s) => (s.n === 4 ? { ...s, imageKey: null } : s)) };
    const rep = await runPreflight(
      preflightInput({
        pictureBook: { doc: noPicture, ink: 'premium', layout: r.layout },
        aiDisclosure: { aiWroteText: true, aiMadeImages: false, disclosed: 'ai-generated' },
      }),
    );
    const images = rep.items.find((i) => i.id === 'picture.spread-images');
    expect(images?.level).toBe('fail');
    expect(images?.detail).toContain('spread 4');
    const disclosure = rep.items.find((i) => i.id === 'kdp.ai-disclosure');
    expect(disclosure?.level).toBe('fail');
    expect(disclosure?.detail).toContain('record AI-made images');
  });

  it('fails a picture book whose text does not fit inside the safe area', async () => {
    const long = Array.from({ length: 30 }, (_, k) => `Mabel counted star number ${k + 1} and smiled at the moon.`).join(' ');
    const crowded: PictureBookDoc = { ...doc, spreads: doc.spreads.map((s) => (s.n === 2 ? { ...s, text: long } : s)) };
    const out = await exportPictureBookPdf(crowded, rules, { images, browser, creationDate: new Date('2026-10-17T00:00:00Z') });
    expect(out.layout.overflowing).toEqual(['spread 2']);
    const rep = await runPreflight(
      preflightInput({ book: pictureBookToBookDoc(crowded), interiorPdf: out.buffer, pictureBook: { doc: crowded, ink: 'premium', layout: out.layout } }),
    );
    const safe = rep.items.find((i) => i.id === 'picture.safe-area');
    expect(safe?.level).toBe('fail');
    expect(safe?.detail).toContain('spread 2');
  });

  it('fails a page count below the colour minimum, and standard colour at 24 pages', async () => {
    const short: PictureBookDoc = { ...doc, spreads: doc.spreads.slice(0, 4) };
    const input = preflightInput({ pictureBook: { doc: short, ink: 'premium', layout: r.layout } });
    delete input.interiorPdf;
    const rep = await runPreflight(input);
    expect(rep.items.find((i) => i.id === 'picture.page-count')?.level).toBe('fail');
    const standard = await runPreflight(preflightInput({ pictureBook: { doc, ink: 'standard', layout: r.layout } }));
    expect(standard.items.find((i) => i.id === 'picture.page-count')?.level).toBe('fail');
  });
});

describe('picture-mini: upload pack', () => {
  it('says the pack is print only and that the disclosure covers the spread pictures', async () => {
    const { zip } = await buildUploadPack({
      book: pictureBookToBookDoc(doc),
      files: { interiorPdf: r.buffer },
      trim: '8.5x8.5',
      paper: 'white',
      pages: r.pageCount,
      rules,
      ruleIds: r.ruleIds,
      ai: { aiWroteText: true, aiMadeImages: true },
      pictureBook: true,
      date: NOW,
    });
    const z = await JSZip.loadAsync(zip);
    expect(Object.keys(z.files).filter((f) => f.startsWith('manuscript/'))).toEqual([
      'manuscript/',
      'manuscript/mabel-and-the-moonlit-garden-interior-8.5x8.5.pdf',
    ]);
    expect(await z.file('README.txt')?.async('string')).toContain('This pack has no EPUB or DOCX');
    expect(await z.file('listing/ai-disclosure.txt')?.async('string')).toContain('the spread pictures and the cover art');
    expect(await z.file('reports/kdp-rules-used.txt')?.async('string')).toContain('print.bleed');
  });
});

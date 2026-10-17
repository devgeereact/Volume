/// <reference types="node" />
// P7-2: picture-book spread model, page plan, bleed and safe-area geometry, colour page range and cost.
// Expected sizes are read from the rules file, never typed in, so a new dated rules file keeps these tests honest.
import { describe, expect, it } from 'vitest';
import {
  bleedEdgesIn,
  bleedPageSizeIn,
  checkPictureBook,
  checkTextInSafeArea,
  colourPageRange,
  colourPrintingCost,
  contentsEntriesFromTemplate,
  defaultPictureBookPlan,
  getRule,
  inContents,
  parseManuscript,
  pictureBookDocSchema,
  pictureBookGeometry,
  pictureBookPages,
  pictureBookRulesFromTemplate,
  pictureBookToBookDoc,
  safeAreaIn,
  safeRectIn,
  sectionHeading,
  serialiseManuscript,
  SPREAD_LAYOUTS,
  trimBoxIn,
  type PictureBookDoc,
  type Section,
  type Spread,
} from '../src/index.ts';
import { loadBookTemplate, loadKdpRules } from '../src/node/index.ts';

const rules = loadKdpRules();
const trim = { widthIn: 8.5, heightIn: 8.5 };
const bleedRule = getRule(rules, 'print.bleed').values as { addWidthIn: number; addHeightIn: number };
const margins = getRule(rules, 'paperback.interiorMargins').values as {
  insideByPageCount: { pages: { min: number; max: number }; insideIn: number }[];
  outsideMinWithBleedIn: number;
};
const premium = (
  getRule(rules, 'paperback.trimAndPages.colour').values as { premiumColourByTrim: { widthIn: number; heightIn: number; minPages: number; maxPages: number }[] }
).premiumColourByTrim;

const page = (id: string, kind: Section['kind'] = 'front'): Section => ({ id, kind, subtype: 'other', title: id, blocks: [{ type: 'paragraph', text: id }] });
const spread = (n: number, over: Partial<Spread> = {}): Spread => ({
  n,
  text: 'Mabel and Hedge walked slowly along the garden path under the bright and gentle moon.',
  imageKey: `spread-${n}`,
  layout: SPREAD_LAYOUTS[n % 4] ?? 'text-left',
  sceneSummary: `scene ${n}`,
  ...over,
});
const book = (spreads: number, front = 3, back = 1): PictureBookDoc => ({
  meta: { title: 'T', author: 'A', language: 'en-GB' },
  front: Array.from({ length: front }, (_, k) => page(`f${k + 1}`)),
  spreads: Array.from({ length: spreads }, (_, k) => spread(k + 1)),
  back: Array.from({ length: back }, (_, k) => page(`b${k + 1}`, 'back')),
});

describe('bleed and safe area from the rules', () => {
  it('adds the bleed to the trim: width on the outside edge, height split top and bottom', () => {
    const size = bleedPageSizeIn(rules, trim);
    expect(size.value).toEqual({ widthIn: trim.widthIn + bleedRule.addWidthIn, heightIn: trim.heightIn + bleedRule.addHeightIn });
    expect(size.ruleIds).toEqual(['print.bleed']);
    expect(size.warnings).toEqual([]);
    expect(bleedEdgesIn(rules)).toEqual({ outsideIn: bleedRule.addWidthIn, topIn: bleedRule.addHeightIn / 2, bottomIn: bleedRule.addHeightIn / 2 });
  });

  it('takes the inside margin from the page-count band and the rest from the with-bleed minimum', () => {
    const band = margins.insideByPageCount[0];
    if (!band) throw new Error('no band');
    const s = safeAreaIn(rules, trim, band.pages.min);
    const o = margins.outsideMinWithBleedIn;
    expect(s.value).toEqual({ topIn: o, bottomIn: o, outsideIn: o, insideIn: band.insideIn });
    expect(s.ruleIds).toEqual(['paperback.interiorMargins']);
    const big = margins.insideByPageCount[1];
    if (big) expect(safeAreaIn(rules, trim, big.pages.min).value.insideIn).toBe(big.insideIn);
  });

  it('uses the nearest band with a warning for a draft too short to print', () => {
    const s = safeAreaIn(rules, trim, 12);
    expect(s.value.insideIn).toBe(margins.insideByPageCount[0]?.insideIn);
    expect(s.warnings.join(' ')).toMatch(/12 pages is outside the inside-margin bands/);
  });

  it('places the trim box and safe area by page side (bleed on the outside edge)', () => {
    const g = pictureBookGeometry(rules, trim, 24);
    const b = bleedEdgesIn(rules);
    expect(trimBoxIn(g, 'right')).toEqual({ xIn: 0, yIn: b.topIn, widthIn: 8.5, heightIn: 8.5 });
    expect(trimBoxIn(g, 'left')).toEqual({ xIn: b.outsideIn, yIn: b.topIn, widthIn: 8.5, heightIn: 8.5 });
    const right = safeRectIn(g, 'right');
    const left = safeRectIn(g, 'left');
    expect(right.xIn).toBe(g.safe.insideIn); // gutter on the left of a right-hand page
    expect(left.xIn).toBe(b.outsideIn + g.safe.outsideIn);
    expect(left.xIn + left.widthIn).toBeCloseTo(b.outsideIn + 8.5 - g.safe.insideIn, 10); // gutter on the right
    expect(right.yIn).toBe(b.topIn + g.safe.topIn);
    expect(right.heightIn).toBeCloseTo(8.5 - g.safe.topIn - g.safe.bottomIn, 10);
  });

  it('finds text boxes outside the safe area and ignores rounding under half a point', () => {
    const g = pictureBookGeometry(rules, trim, 24);
    const safe = safeRectIn(g, 'left');
    expect(checkTextInSafeArea(g, [{ page: 4, label: 'spread 1', rect: { ...safe, xIn: safe.xIn - 0.003 } }])).toEqual([]);
    const out = checkTextInSafeArea(g, [
      { page: 4, label: 'spread 1', rect: { ...safe, xIn: safe.xIn - 0.1 } },
      { page: 5, label: 'spread 1b', rect: { ...safeRectIn(g, 'right'), heightIn: 9 } },
    ]);
    expect(out.map((f) => f.label)).toEqual(['spread 1', 'spread 1b']);
    expect(out[0]?.overflow.left).toBeCloseTo(0.1, 6);
    expect(out[0]?.message).toMatch(/outside the safe area by 0\.100 in \(left\)/);
    expect(out[1]?.overflow.bottom).toBeGreaterThan(0);
  });
});

describe('colour page range and printing cost', () => {
  it('reads the colour page range for the trim and ink, with the partial paper rule as a warning', () => {
    const row = premium.find((t) => t.widthIn === 8.5 && t.heightIn === 8.5);
    const r = colourPageRange(rules, trim, 'premium');
    expect(r.value).toEqual({ min: row?.minPages, max: row?.maxPages });
    expect(r.warnings.join(' ')).toMatch(/paperback\.colour\.paper is partial/);
    expect(colourPageRange(rules, trim, 'standard').value.min).toBeGreaterThan(r.value.min);
    expect(() => colourPageRange(rules, { widthIn: 4, heightIn: 4 }, 'premium')).toThrow(/No premium colour page range/);
  });

  it('prices premium colour on the large-trim bands for 8.5 x 8.5 in, and standard colour per page', () => {
    const p = getRule(rules, 'paperback.printingCost.uk.premiumColour').values as {
      largeTrim: { flat?: number; fixed?: number; perPage?: number }[];
      regularTrim: { fixed?: number; perPage?: number }[];
    };
    expect(colourPrintingCost(rules, { ink: 'premium', trim, pages: 24 }).value).toBe(p.largeTrim[0]?.flat);
    const band = p.largeTrim[1];
    expect(colourPrintingCost(rules, { ink: 'premium', trim, pages: 48 }).value).toBeCloseTo((band?.fixed ?? 0) + 48 * (band?.perPage ?? 0), 4);
    const six = colourPrintingCost(rules, { ink: 'premium', trim: { widthIn: 6, heightIn: 9 }, pages: 48 });
    expect(six.value).toBeCloseTo((p.regularTrim[1]?.fixed ?? 0) + 48 * (p.regularTrim[1]?.perPage ?? 0), 4);
    expect(six.ruleIds).toContain('paperback.printingCost.uk.premiumColour');
    expect(() => colourPrintingCost(rules, { ink: 'standard', trim, pages: 24 })).toThrow(/No standard colour printing cost band for 24 pages/);
  });
});

describe('page plan', () => {
  it('defaults to 24 pages = 10 spreads + 4 matter pages for premium colour on 8.5 x 8.5 in', () => {
    const plan = defaultPictureBookPlan(rules, trim, 'premium');
    expect(plan).toMatchObject({ pages: 24, spreads: 10, frontPages: 3, backPages: 1, warnings: [expect.stringMatching(/partial/)] });
    expect(pictureBookPages(book(plan.spreads))).toHaveLength(plan.pages);
  });

  it('starts every spread on a left-hand (even) page, adding a blank page when needed, and ends on an even count', () => {
    const odd = pictureBookPages(book(2, 3, 1));
    expect(odd.map((p) => `${p.kind}${p.kind === 'spread' ? p.n : ''}:${p.side}`)).toEqual([
      'matter:right',
      'matter:left',
      'matter:right',
      'spread1:left',
      'spread1:right',
      'spread2:left',
      'spread2:right',
      'matter:left',
    ]);
    const even = pictureBookPages(book(1, 2, 0));
    expect(even.map((p) => p.kind)).toEqual(['matter', 'matter', 'blank', 'spread', 'spread', 'blank']);
    const disabled = book(1, 3, 0);
    if (disabled.front[2]) disabled.front[2].enabled = false;
    expect(pictureBookPages(disabled).map((p) => p.kind)).toEqual(['matter', 'matter', 'blank', 'spread', 'spread', 'blank']);
  });
});

describe('checks and conversion', () => {
  const template = pictureBookRulesFromTemplate(loadBookTemplate('picture-book'));

  it('passes a complete 24-page book and reads the template ranges', () => {
    expect(template.wordsPerSpread).toEqual({ min: 15, max: 80 });
    expect(checkPictureBook(book(10), { rules, trim, ink: 'premium', template })).toEqual([]);
  });

  it('flags a missing picture, empty text, bad numbering, word count and page count', () => {
    const b = book(10);
    b.spreads[1] = spread(2, { imageKey: null });
    b.spreads[2] = spread(3, { text: '  ' });
    b.spreads[3] = spread(7);
    b.spreads[4] = spread(5, { text: 'Too short.' });
    const codes = checkPictureBook(b, { rules, trim, ink: 'premium', template }).map((f) => `${f.code}:${f.severity}`);
    expect(codes).toEqual(['picture.spread-image:block', 'picture.spread-text:block', 'picture.spread-numbering:warn', 'picture.words-per-spread:warn']);
    expect(checkPictureBook(book(10), { rules, trim, ink: 'standard' }).map((f) => f.code)).toEqual(['picture.page-count']);
    expect(checkPictureBook(book(0), { rules, trim, ink: 'premium' }).map((f) => f.code)).toEqual(['picture.no-spreads', 'picture.page-count']);
  });

  it('parses with the zod schema and becomes a BookDoc with one chapter per spread', () => {
    const b = book(2);
    b.spreads[0] = spread(1, { text: 'First paragraph\nwraps here.\n\nSecond paragraph.' });
    expect(pictureBookDocSchema.parse(b)).toEqual(b);
    expect(() => pictureBookDocSchema.parse({ ...b, spreads: [{ ...b.spreads[0], layout: 'text-middle' }] })).toThrow();
    const doc = pictureBookToBookDoc(b);
    expect(doc.sections.map((s) => s.id)).toEqual(['f1', 'f2', 'f3', 'spread-1', 'spread-2', 'b1']);
    expect(doc.sections[3]?.blocks).toEqual([
      { type: 'paragraph', text: 'First paragraph wraps here.' },
      { type: 'paragraph', text: 'Second paragraph.' },
    ]);
  });
});

describe('P6-2 follow-ups', () => {
  it('parses "# Chapter 1" with no title as a chapter and writes it back unchanged', () => {
    const md = '# Chapter 1\n\nIt was raining.\n\n# Chapter 2: The Storm\n\nIt was still raining.\n';
    const doc = parseManuscript(md);
    expect(doc.sections.map((s) => [s.kind, s.subtype, s.kicker, s.number, s.title])).toEqual([
      ['chapter', 'chapter', 'Chapter 1', 1, ''],
      ['chapter', 'chapter', 'Chapter 2', 2, 'The Storm'],
    ]);
    expect(doc.sections.map(sectionHeading)).toEqual(['Chapter 1', 'Chapter 2: The Storm']);
    expect(serialiseManuscript(doc)).toBe(md);
  });

  it('reads the contents entries from the template: fiction lists chapters and parts only', () => {
    expect(contentsEntriesFromTemplate(loadBookTemplate('fiction'))).toBe('chapters');
    expect(contentsEntriesFromTemplate(loadBookTemplate('nonfiction'))).toBe('all');
    expect(contentsEntriesFromTemplate(undefined)).toBe('all');
    const doc = parseManuscript('# Chapter 1\n\nText.\n\n# About the Author\n\nBio.\n');
    const about = doc.sections[1];
    if (!about) throw new Error('no section');
    expect(inContents(doc, about)).toBe(true);
    doc.meta.contentsEntries = 'chapters';
    expect(inContents(doc, about)).toBe(false);
    expect(doc.sections[0] && inContents(doc, doc.sections[0])).toBe(true);
  });
});

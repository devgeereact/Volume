/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import {
  barcodeArea,
  checkListing,
  ebookCoverSpec,
  ebookRoyaltyGBP,
  insideMarginMinIn,
  isValidIsbn13,
  minimumListPriceGBP,
  paperbackRoyaltyGBP,
  paperbackRoyaltyRate,
  printingCostGBP,
  rulesAge,
  spineTextAllowed,
  spineWidthIn,
  trimPageRange,
  trimClassFor,
  wrapSizeIn,
} from '../src/index.ts';
import { loadKdpRules } from '../src/node/index.ts';

const rules = loadKdpRules();
const sixByNine = { widthIn: 6, heightIn: 9 };

describe('spine and wrap (FACTS 3.8, 3.9, export spec table)', () => {
  it.each([
    [120, 'white', 0.2702, 12.5202],
    [200, 'white', 0.4504, 12.7004],
    [200, 'cream', 0.5, 12.75],
    [300, 'cream', 0.75, 13.0],
  ] as const)('%i pages on %s paper', (pages, paper, spine, width) => {
    expect(spineWidthIn(rules, pages, paper)).toBeCloseTo(spine, 4);
    const wrap = wrapSizeIn(rules, { trim: sixByNine, pages, paper });
    expect(wrap.widthIn).toBeCloseTo(width, 4);
    expect(wrap.heightIn).toBeCloseTo(9.25, 6);
    expect(wrap.bleedIn).toBe(0.125);
  });

  it('allows spine text from 80 pages (FACTS 3.10)', () => {
    expect(spineTextAllowed(rules, 79)).toBe(false);
    expect(spineTextAllowed(rules, 80)).toBe(true);
  });
});

describe('printing cost and paperback royalties (FACTS 3.1 to 3.4)', () => {
  it('KDP example: 55 pages costs GBP 1.93', () => {
    expect(printingCostGBP(rules, { pages: 55 }).value).toBe(1.93);
  });
  it('200 pages regular trim costs GBP 2.85', () => {
    expect(printingCostGBP(rules, { pages: 200 }).value).toBeCloseTo(2.85, 6);
  });
  it('warns at the 110-page overlap and for large trims', () => {
    expect(printingCostGBP(rules, { pages: 110 }).warnings.length).toBe(1);
    const large = printingCostGBP(rules, { pages: 200, trimClass: 'large' });
    expect(large.value).toBeCloseTo(0.85 + 200 * 0.012, 6);
    expect(large.warnings.join(' ')).toMatch(/Large-trim/);
  });
  it('uses 50% up to 7.98 and 60% from 7.99', () => {
    expect(paperbackRoyaltyRate(rules, 7.98)).toBe(0.5);
    expect(paperbackRoyaltyRate(rules, 7.99)).toBe(0.6);
    expect(paperbackRoyaltyGBP(rules, { listPrice: 9.99, printingCost: 2.85 }).value).toBeCloseTo(0.6 * 9.99 - 2.85, 6);
    expect(paperbackRoyaltyGBP(rules, { listPrice: 9.99, printingCost: 2.85, expandedDistribution: true }).value).toBeCloseTo(0.4 * 9.99 - 2.85, 6);
  });
  it('minimum list price is printing cost / rate in the tier it falls in', () => {
    expect(minimumListPriceGBP(rules, 2.85).value).toBe(5.7);
    // 4.50 / 0.6 = 7.50 falls in the 50% tier, where it would need 9.00, so the 60% tier's floor (7.99) wins
    expect(minimumListPriceGBP(rules, 4.5).value).toBe(7.99);
  });
});

describe('eBook royalties (FACTS 10.1, 2.2 to 2.5)', () => {
  it('GBP 2.99, 2 MB, 70% earns GBP 1.953 (shown as 1.95)', () => {
    const r = ebookRoyaltyGBP(rules, { listPrice: 2.99, fileSizeMB: 2, rate: 0.7 });
    expect(r.value.royalty).toBeCloseTo(1.953, 6);
    expect(r.value.royaltyRounded).toBe(1.95);
    expect(r.value.deliveryCost).toBeCloseTo(0.2, 6);
    expect(r.value.priceInBand).toBe(true);
  });
  it('35% has no delivery cost and checks the file-size band', () => {
    const r = ebookRoyaltyGBP(rules, { listPrice: 0.99, fileSizeMB: 4, rate: 0.35 });
    expect(r.value.deliveryCost).toBe(0);
    expect(r.value.priceInBand).toBe(false);
    expect(r.warnings).toHaveLength(1);
    expect(ebookRoyaltyGBP(rules, { listPrice: 0.99, fileSizeMB: 2, rate: 0.35 }).value.priceInBand).toBe(true);
  });
  it('70% outside 1.77 to 12.99 is flagged', () => {
    expect(ebookRoyaltyGBP(rules, { listPrice: 14.99, fileSizeMB: 1, rate: 0.7 }).value.priceInBand).toBe(false);
  });
});

describe('trim, margins, covers and listing', () => {
  it('page limits follow the selected trim and paper', () => {
    expect(trimPageRange(rules, sixByNine).value).toEqual({ min: 24, max: 828 });
    const r = trimPageRange(rules, { widthIn: 5, heightIn: 8 });
    expect(r.value).toEqual({ min: 24, max: 828 });
    expect(r.warnings).toEqual([]);
    expect(trimPageRange(rules, sixByNine, 'cream').value.max).toBe(776);
    expect(trimPageRange(rules, { widthIn: 8.5, heightIn: 11 }, 'cream').value.max).toBe(550);
    expect(trimClassFor(rules, sixByNine)).toBe('regular');
    expect(trimClassFor(rules, { widthIn: 7, heightIn: 10 })).toBe('large');
  });
  it('verified margins are clear and partial barcode placement carries a warning', () => {
    expect(insideMarginMinIn(rules, 200).value).toBe(0.5);
    expect(insideMarginMinIn(rules, 200).warnings).toEqual([]);
    expect(barcodeArea(rules).warnings[0]).toMatch(/partial/);
    expect(barcodeArea(rules).value.insetFromTrimIn).toBe(0.25);
  });
  it('eBook cover spec is 1600 x 2560 JPEG', () => {
    expect(ebookCoverSpec(rules)).toMatchObject({ widthPx: 1600, heightPx: 2560, minRatio: 1.6 });
  });
  it('title check: 199 characters pass, 200 fail (FACTS 5.4); description counts tags; counts keywords and categories', () => {
    const base = { description: '<p>Hello</p>', keywords: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], categories: ['x', 'y', 'z'] };
    const at = (n: number) =>
      checkListing(rules, { title: 'a'.repeat(n - 10), subtitle: 'b'.repeat(10), ...base }).find((i) => i.id === 'listing.title-length')?.level;
    expect(at(199)).toBe('pass');
    expect(at(200)).toBe('fail');
    const long = checkListing(rules, { title: 'T', ...base, description: `<p>${'x'.repeat(3994)}</p>` });
    expect(long.find((i) => i.id === 'listing.description-length')?.level).toBe('fail');
    const ok = checkListing(rules, { title: 'T', ...base, description: `<p>${'x'.repeat(3993)}</p>` });
    expect(ok.find((i) => i.id === 'listing.description-length')?.level).toBe('pass');
    const bad = checkListing(rules, { title: 'T', description: '<div>x</div>', keywords: ['a'], categories: [] });
    expect(
      bad
        .filter((i) => i.level === 'fail')
        .map((i) => i.id)
        .sort(),
    ).toEqual(['listing.categories', 'listing.description-tags', 'listing.keywords']);
  });
  it('ISBN-13 checksum validation', () => {
    expect(isValidIsbn13('978-0-306-40615-7')).toBe(true);
    expect(isValidIsbn13('978-0-306-40615-8')).toBe(false);
  });
  it('rules age and re-check', () => {
    expect(rulesAge(rules, new Date('2026-10-04T12:00:00Z'))).toEqual({ days: 1, stale: false });
    expect(rulesAge(rules, new Date('2027-01-05T00:00:00Z')).stale).toBe(true);
  });
});

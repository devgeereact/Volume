// house-style:off (live run 3 text quoted as fixtures)
import { describe, expect, it } from 'vitest';
import type { BookDoc } from '@volume/core';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { runPreflight, type ClaimItem, type PreflightInput } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Preflight gaps found by live run 3 ("Small Offer, Real Customers", 5 October 2026).

const rules = loadKdpRules();
const houseStyle = loadHouseStyle();

function bookWith(blocks: BookDoc['sections'][number]['blocks']): BookDoc {
  const book = loadMiniBook();
  const chapter = book.sections.find((s) => s.subtype === 'chapter');
  if (!chapter) throw new Error('fixture has no chapter');
  chapter.blocks.push(...blocks);
  return book;
}

async function report(book: BookDoc, extra: Partial<PreflightInput> = {}) {
  return runPreflight({
    book,
    rules,
    houseStyle,
    trim: '6x9',
    paper: 'white',
    listing: { title: book.meta.title },
    now: new Date('2026-10-05T12:00:00Z'),
    ...extra,
  });
}
const item = (r: Awaited<ReturnType<typeof report>>, id: string) => r.items.find((i) => i.id === id);

describe('placeholders', () => {
  it('fails on the "- x: x" resource line and other template junk', async () => {
    const r = await report(
      bookWith([
        { type: 'list', ordered: false, items: ['Side Hustle School: a guide to AI side hustles.', 'x: x'] },
        { type: 'paragraph', text: 'Prices: TBD.' },
      ]),
    );
    expect(item(r, 'front.placeholders')?.level).toBe('fail');
    expect(item(r, 'front.placeholders')?.detail).toContain('"- x: x"');
    expect(item(r, 'front.placeholders')?.detail).toContain('"TBD"');
  });

  it('passes the clean fixture', async () => {
    expect(item(await report(loadMiniBook()), 'front.placeholders')?.level).toBe('pass');
  });
});

describe('covers for the pack', () => {
  it('fails the pack check with no eBook cover and no wrap, and is silent for single files', async () => {
    const book = loadMiniBook();
    expect(item(await report(book, { pack: true }), 'cover.files')?.level).toBe('fail');
    expect(item(await report(book), 'cover.files')).toBeUndefined();
  });
});

describe('claims', () => {
  it('warns per personal claim and blocks per open named-firm regulatory claim', async () => {
    const claims: ClaimItem[] = [
      {
        chapter: 'Chapter 3',
        sentence: "I'll admit I used to read those as rejections, which cost me follow-ups I never made.",
        category: 'personal',
        check: '',
        status: 'open',
      },
      {
        chapter: 'Chapter 3',
        sentence: 'A platform called Quantum AI is one name that has appeared on it.',
        category: 'regulatory',
        check: '',
        status: 'open',
      },
      { chapter: 'Chapter 3', sentence: 'A verified line.', category: 'regulatory', check: '', status: 'verified' },
    ];
    const r = await report(loadMiniBook(), { claims });
    expect(r.items.filter((i) => i.id.startsWith('claims.personal.')).map((i) => i.level)).toEqual(['warn']);
    expect(r.items.filter((i) => i.id.startsWith('claims.regulatory.')).map((i) => i.level)).toEqual(['fail']);
    expect(r.ok).toBe(false);
  });
});

describe('dated prices', () => {
  const how = { type: 'paragraph' as const, text: 'Wherever I mention a price, it carries the month it was checked.' };
  it('fails when the book promises dated prices and a price has no month', async () => {
    const r = await report(bookWith([how, { type: 'paragraph', text: 'It would be £60 a month.' }]), { datedPrices: true });
    expect(item(r, 'style.dated-prices')?.level).toBe('fail');
  });
  it('warns without the promise, passes when every price is dated, and is skipped for other book types', async () => {
    expect(item(await report(bookWith([{ type: 'paragraph', text: 'It would be £60 a month.' }]), { datedPrices: true }), 'style.dated-prices')?.level).toBe(
      'warn',
    );
    expect(
      item(
        await report(bookWith([how, { type: 'paragraph', text: 'It costs £15 a month (checked October 2026).' }]), { datedPrices: true }),
        'style.dated-prices',
      )?.level,
    ).toBe('pass');
    expect(item(await report(bookWith([how])), 'style.dated-prices')).toBeUndefined();
  });
});

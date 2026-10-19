// house-style:off (symbols quoted as fixtures)
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_COVER_STYLE, DEFAULT_INTERIOR_THEME, type BookDoc } from '@volume/core';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import {
  acquireBrowser,
  buildPrintHtml,
  exportPaperbackWrap,
  exportPrintPdf,
  inspectPdf,
  loadFontLibrary,
  normaliseBookGlyphs,
  normalisePrintText,
  releaseBrowser,
  runPreflight,
  SYMBOL_FALLBACK_FAMILY,
  withSymbolFallback,
} from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Live acceptance 18 October 2026, defect 5: one "→" printed as a Type 3 LucidaGrande font and blocked the pack.

describe('normalisePrintText', () => {
  it('turns arrows into words with single spaces', () => {
    expect(normalisePrintText('Idea → plan')).toBe('Idea to plan');
    expect(normalisePrintText('Idea→plan')).toBe('Idea to plan');
    expect(normalisePrintText('→ Next: list three ideas.')).toBe('Next: list three ideas.');
    expect(normalisePrintText('Costs ↑')).toBe('Costs up');
    expect(normalisePrintText('(→ page 3)')).toBe('(to page 3)');
    expect(normalisePrintText('Cost ⇒ price')).toBe('Cost -> price');
    expect(normalisePrintText('UK ↔ US')).toBe('UK <-> US');
    expect(normalisePrintText('Input ← output')).toBe('Input <- output');
  });

  it('replaces ticks, crosses, boxes, bullets and emoji, and counts each', () => {
    const seen = new Map();
    expect(normalisePrintText('✓ Budget set ✗ No receipts ☐ Ask ● Note 🚀', seen)).toBe('[x] Budget set × No receipts [ ] Ask • Note');
    expect([...seen.keys()]).toEqual(['✓', '✗', '☐', '●', '🚀']);
    expect(normalisePrintText('Done ✅ and ☀ sunny ❤ ⭐')).toBe('Done [x] and sunny');
  });

  it('leaves smart quotes, the pound sign and ordinary text alone', () => {
    const s = '‘Single’ and “double” quotes cost £5… that’s fine.';
    expect(normalisePrintText(s)).toBe(s);
  });

  it('copies the book and keeps ids', () => {
    const book = loadMiniBook();
    const ch = book.sections.find((s) => s.subtype === 'chapter');
    if (!ch) throw new Error('no chapter');
    ch.blocks.push({ type: 'paragraph', text: 'Plan → launch' });
    const { book: out, replaced } = normaliseBookGlyphs(book);
    expect(JSON.stringify(out)).not.toContain('→');
    expect(JSON.stringify(book)).toContain('→');
    expect(out.sections.map((s) => s.id)).toEqual(book.sections.map((s) => s.id));
    expect(replaced).toEqual([{ from: '→', to: 'to', count: 1 }]);
  });
});

describe('withSymbolFallback', () => {
  it('adds the maths fallback to rules but not to @font-face', () => {
    const css = "@font-face { font-family: 'Lora'; src: url('x'); }\nbody { font-family: 'Lora'; }";
    expect(withSymbolFallback(css)).toBe(`@font-face { font-family: 'Lora'; src: url('x'); }\nbody { font-family: 'Lora', '${SYMBOL_FALLBACK_FAMILY}'; }`);
  });

  it('is in the print HTML, with the fallback faces', () => {
    const r = buildPrintHtml(loadMiniBook(), DEFAULT_INTERIOR_THEME, loadFontLibrary(), { trim: '6x9' });
    expect(r.html).toContain(`font-family: '${SYMBOL_FALLBACK_FAMILY}'; font-weight: 400`);
    expect(r.html).toMatch(/body \{ margin: 0; font-family: '[^']+', 'Volume Symbols';/);
  });
});

describe('print PDF with arrows, ticks, smart quotes and maths', () => {
  let browser: Browser;
  beforeAll(async () => {
    browser = await acquireBrowser();
  });
  afterAll(async () => {
    await releaseBrowser();
  });

  function symbolBook(): BookDoc {
    const book = loadMiniBook();
    const ch = book.sections.find((s) => s.subtype === 'chapter');
    if (!ch) throw new Error('no chapter');
    ch.blocks.push(
      { type: 'heading2', text: 'Idea → plan → launch' },
      { type: 'paragraph', text: '‘Start small,’ she said. “Spend ≤ £10 a month, ≥ 2 hours a week, ≈ 5% of income.” Costs ↑, stress ↓ ⇒ progress.' },
      { type: 'list', ordered: false, items: ['✓ Budget set', '✔ Account open', '✗ No receipts yet', '☐ Ask a friend', '★★★ rating', 'Launch 🚀'] },
    );
    return book;
  }

  it('has no Type 3 fonts, so preflight passes interior.fonts', async () => {
    const r = await exportPrintPdf(symbolBook(), DEFAULT_INTERIOR_THEME, { browser, creationDate: new Date('2026-10-19T00:00:00Z') });
    expect(r.warnings.join(' ')).toContain('"→" to "to"');
    const info = await inspectPdf(r.buffer);
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
    const text = info.pageText.join(' ');
    expect(text).toContain('Idea to plan to launch');
    expect(text).toContain('≤');
    const report = await runPreflight({
      book: symbolBook(),
      rules: loadKdpRules(),
      houseStyle: loadHouseStyle(),
      trim: '6x9',
      paper: 'white',
      listing: { title: 'Mini' },
      interiorPdf: r.buffer,
      now: new Date('2026-10-19T12:00:00Z'),
    });
    expect(report.items.find((i) => i.id === 'interior.fonts')?.level).toBe('pass');
  }, 120_000);

  it('keeps the paperback wrap free of Type 3 fonts with symbols in the title and blurb', async () => {
    const meta = { ...loadMiniBook().meta, title: 'Spend ≤ £10 → Save', subtitle: '✓ Plan ⇒ launch' };
    const r = await exportPaperbackWrap(meta, DEFAULT_COVER_STYLE, { rules: loadKdpRules(), pages: 120, paper: 'white', browser, blurb: 'Costs ↑ ≈ 5% ✅' });
    const info = await inspectPdf(r.pdf);
    expect(info.fonts.filter((f) => !f.embedded || f.type3)).toEqual([]);
    expect(info.pageText.join(' ')).toContain('≤');
  }, 120_000);
});

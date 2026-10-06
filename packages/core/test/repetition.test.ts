/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  checkBookStyle,
  compileHouseStyle,
  findBookRepetitions,
  findRepetitions,
  parseManuscript,
  type RepetitionFinding,
  type RepetitionUnit,
} from '../src/index.ts';
import { loadHouseStyleConfig } from '../src/node/index.ts';

const live = JSON.parse(readFileSync(new URL('./fixtures/live-book-2-sections.json', import.meta.url), 'utf8')) as { sections: RepetitionUnit[] };
const units = live.sections;
const unitText = (id: string) => units.find((u) => u.sectionId === id)?.text ?? '';
const sectionsOf = (f: RepetitionFinding) => new Set(f.occurrences.map((o) => o.sectionId));

describe('repetition checker on the live book', () => {
  const findings = findRepetitions(units);

  it('finds the repeated "chat assistant" definition in four sections', () => {
    const f = findings.find((x) => x.kind === 'definition' && x.key === 'chat assistant');
    expect(f).toBeDefined();
    expect(f?.severity).toBe('warn');
    expect([...(f ? sectionsOf(f) : [])]).toEqual(['introduction', 'chapter-1', 'chapter-2', 'chapter-3']);
    expect(f?.occurrences[0]?.text).toContain('A chat assistant is a program you type questions to and it writes back.');
    expect(f?.occurrences.map((o) => o.text)).toContain('(the program you type to, and it writes back)');
    expect(f?.message).toContain('defined 4 times');
  });

  it('finds the employment contract warning repeated across four sections', () => {
    const f = findings.find((x) => x.kind === 'advice' && x.occurrences.some((o) => o.text.includes('read your employment contract first')));
    expect(f).toBeDefined();
    expect([...(f ? sectionsOf(f) : [])]).toEqual(['chapter-1', 'chapter-2', 'chapter-3', 'conclusion']);
    expect(f?.occurrences.filter((o) => /contract/i.test(o.text)).length).toBeGreaterThanOrEqual(4);
    expect(f?.occurrences.every((o) => /contract/i.test(o.text))).toBe(true);
  });

  it('finds "before you take a penny" in chapters 2 and 3', () => {
    const f = findings.find((x) => x.occurrences.filter((o) => o.text.includes('before you take a penny')).length >= 2);
    expect(f).toBeDefined();
    expect([...(f ? sectionsOf(f) : [])]).toEqual(['chapter-2', 'chapter-3']);
    // A full stop inside GOV.UK does not end the sentence.
    expect(f?.occurrences[0]?.text).toMatch(/^If anyone offers to pay or pre-order.*GOV\.UK or with Citizens Advice before you take a penny\.$/);
  });

  it('also finds the repeated definition of "prompt"', () => {
    const f = findings.find((x) => x.kind === 'definition' && x.key === 'prompt');
    expect([...(f ? sectionsOf(f) : [])]).toEqual(['chapter-1', 'chapter-2']);
  });

  it('gives offsets that point at the repeated text in each section body', () => {
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings)
      for (const o of f.occurrences) {
        expect(unitText(o.sectionId).slice(o.start, o.end), f.id).toBe(o.text);
        expect(o.blockIndex).toBeUndefined();
      }
  });

  it('reports only repeats that span two or more sections, in reading order, once each', () => {
    const order = units.map((u) => u.sectionId);
    let last = -1;
    for (const f of findings) {
      expect(sectionsOf(f).size, f.id).toBeGreaterThanOrEqual(2);
      const first = f.occurrences[0];
      const at = order.indexOf(first?.sectionId ?? '') * 1e6 + (first?.start ?? 0);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
    expect(new Set(findings.map((f) => f.id)).size).toBe(findings.length);
    // The definition is not reported again as a sentence group or a phrase.
    const chat = findings.filter((f) => f.occurrences.some((o) => o.text.includes('program you type')));
    expect(chat.map((f) => f.kind)).toEqual(['definition']);
  });

  it('is deterministic and quick', () => {
    const t0 = performance.now();
    const again = findRepetitions(units);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(again).toEqual(findings);
  });

  it('finds nothing in a single section or in unrelated sections', () => {
    expect(findRepetitions([{ sectionId: 'only', text: unitText('chapter-1') }])).toEqual([]);
    expect(
      findRepetitions([
        { sectionId: 'a', text: 'Basil likes a warm, bright sill. Water it when the top of the soil is dry.' },
        { sectionId: 'b', text: 'Mint spreads fast, so give it a pot of its own. Cut it back often.' },
      ]),
    ).toEqual([]);
  });

  it('reads the dialect: headings, fences and list markers are not sentences', () => {
    const text = (n: number) => `## Key Takeaways ${n}\n\n::: takeaways\n- Check your employment contract before you sell anything to anyone.\n:::\n`;
    const f = findRepetitions([
      { sectionId: 'a', text: text(1) },
      { sectionId: 'b', text: text(2) },
    ]);
    expect(f).toHaveLength(1);
    expect(f[0]?.kind).toBe('sentence');
    expect(f[0]?.occurrences.map((o) => o.text)).toEqual([
      'Check your employment contract before you sell anything to anyone.',
      'Check your employment contract before you sell anything to anyone.',
    ]);
  });
});

describe('findBookRepetitions', () => {
  it('works on a BookDoc with block indexes', () => {
    const md = units.map((u) => `# ${u.title ?? u.sectionId}\n\n${u.text}`).join('\n\n');
    const book = parseManuscript(md);
    const f = findBookRepetitions(book).find((x) => x.kind === 'definition' && x.key === 'chat assistant');
    expect(f?.occurrences).toHaveLength(4);
    for (const o of f?.occurrences ?? []) {
      const s = book.sections.find((x) => x.id === o.sectionId);
      const b = s?.blocks[o.blockIndex ?? -1];
      expect(b?.type).toBe('paragraph');
      expect(b && b.type === 'paragraph' ? b.text.slice(o.start, o.end) : '').toBe(o.text);
    }
  });

  it('flags the live book habits through checkBookStyle as warnings', () => {
    const style = compileHouseStyle(loadHouseStyleConfig());
    const md = units.map((u) => `# ${u.title ?? u.sectionId}\n\n${u.text}`).join('\n\n');
    const habits = checkBookStyle(parseManuscript(md), style, { titleCase: false }).filter((x) => x.rule === 'habit');
    expect(habits.every((h) => h.severity === 'warn')).toBe(true);
    expect(habits.filter((h) => /illustrative/i.test(h.match)).length).toBeGreaterThan(2);
    expect(habits.some((h) => h.sectionId.startsWith('chapter-1') && /^Here/.test(h.match))).toBe(true);
  });
});

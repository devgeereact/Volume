/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkBookStyle, checkDisclaimers, checkText, compileHouseStyle, fixDashes, parseManuscript, toTitleCase, wordCountReport } from '../src/index.ts';
import { loadBookTemplate, loadHouseStyleConfig } from '../src/node/index.ts';

const config = loadHouseStyleConfig() as { bannedPhrases: string[]; usToUkSpelling: Record<string, string> };
const style = compileHouseStyle(config);
const golden = readFileSync(new URL('./fixtures/windowsill-herbs-manuscript.md', import.meta.url), 'utf8');

describe('dashes', () => {
  it('finds em and en dashes with offsets', () => {
    const t = 'One \u2014 two.\nPages 10\u201320.';
    const f = checkText(t, style);
    expect(f.map((x) => [x.rule, x.start, x.line, x.col])).toEqual([
      ['emdash', 4, 1, 5],
      ['endash', 19, 2, 9],
    ]);
  });
  it('fixes them', () => {
    expect(fixDashes('One \u2014 two. Pages 10\u201320.', style)).toBe('One, two. Pages 10 to 20.');
  });
});

describe('banned phrases', () => {
  it('catches every banned phrase', () => {
    for (const p of config.bannedPhrases) {
      const hits = checkText(`Before ${p} after.`, style, { rules: ['banned'] });
      expect(hits.length, p).toBeGreaterThan(0);
    }
  });
  it('matches inflections and curly apostrophes, not substrings', () => {
    expect(checkText('We are ensuring it, and it ensured that.', style, { rules: ['banned'] })).toHaveLength(2);
    expect(checkText('It’s worth noting that.', style, { rules: ['banned'] }).map((f) => f.id)).toContain("it's worth noting");
    expect(checkText('A diver and a divan.', style, { rules: ['banned'] })).toHaveLength(0);
  });
});

describe('spelling', () => {
  it('fixes every US spelling with case kept', () => {
    for (const [us, uk] of Object.entries(config.usToUkSpelling)) {
      const cap = us.charAt(0).toUpperCase() + us.slice(1);
      const hits = checkText(`${cap} here.`, style, { rules: ['spelling'] });
      const hit = hits.find((h) => h.id === us);
      expect(hit?.suggestion, us).toBe(uk.charAt(0).toUpperCase() + uk.slice(1));
    }
  });
});

describe('guardrails', () => {
  it('catches ISBN-like numbers, percentages, studies, attributions and URLs', () => {
    const t = 'ISBN 978-0-306-40615-7. About 40% of people agree. Studies show it works. According to Bob, see www.example.com.';
    const ids = new Set(checkText(t, style, { rules: ['guardrail'] }).map((f) => f.id));
    for (const id of ['isbn', 'percent-of', 'studies-show', 'according-to', 'url-in-prose']) expect(ids.has(id), id).toBe(true);
  });
  it('honours ignore markers', () => {
    expect(checkText('Fine.\nA \u2014 here. house-style: ignore\nFine.', style)).toHaveLength(0);
  });
});

describe('book checks', () => {
  const book = parseManuscript(golden);
  it('finds no dashes, banned phrases or US spellings in the golden chapters', () => {
    const errors = checkBookStyle(book, style, { titleCase: false }).filter((f) => ['emdash', 'endash', 'banned', 'spelling'].includes(f.rule));
    expect(errors.map((e) => `${e.sectionId}: ${e.match}`)).toEqual([]);
  });
  it('flags sentence-case chapter titles under the house title case', () => {
    const tc = checkBookStyle(book, style).filter((f) => f.rule === 'titlecase');
    expect(tc.length).toBeGreaterThan(5);
    expect(toTitleCase('read your windows before you buy a plant')).toBe('Read Your Windows Before You Buy A Plant');
    expect(toTitleCase('the art of verbal de-escalation at the NHS')).toBe('The Art Of Verbal De-escalation At The NHS');
  });
  it('reports word counts against the non-fiction template', () => {
    const report = wordCountReport(book, loadBookTemplate('nonfiction') as Parameters<typeof wordCountReport>[1]);
    const ch1 = report.items.find((i) => i.sectionId.startsWith('chapter-1'));
    expect(ch1?.target).toBe(3000);
    expect(ch1?.status).toBe('under');
    expect(report.total.words).toBeGreaterThan(4500);
  });
});

describe('false positives from the live book', () => {
  const ids = (t: string) => checkText(t, style, { rules: ['guardrail'] }).map((f) => f.id);

  it('allows negated guarantees and still blocks real promises', () => {
    for (const t of [
      'It is not a guarantee of what anyone will pay.',
      "There's no guarantee it will sell.",
      'Results are never guaranteed.',
      "I can't guarantee you a single sale.",
      'No one can guarantee you a buyer.',
      'Nothing is guaranteed.',
    ])
      expect(ids(t), t).not.toContain('guarantee');
    for (const t of ['We guarantee results.', 'This method is guaranteed to work.', 'Guaranteed income in a week.', 'It is proven to work.'])
      expect(ids(t), t).toContain('guarantee');
  });

  it('does not treat GOV.UK and similar names as links, but flags real URLs', () => {
    for (const t of [
      'Check the rules on refunds and distance selling on GOV.UK or with Citizens Advice before you take a penny.',
      "Look at GOV.UK's guidance on declaring any income you do start to earn.",
      'Gov.uk and NHS.uk both explain it.',
    ])
      expect(ids(t), t).not.toContain('url-in-prose');
    for (const t of [
      'See https://www.example.org/page.',
      'Visit www.example.com today.',
      'Go to gov.uk/universal-credit for details.',
      'See example.com/page.',
    ])
      expect(ids(t), t).toContain('url-in-prose');
  });

  it('keeps "treat" for clinical contexts only', () => {
    expect(ids('Treat it like a keen assistant on their first day: useful for drafts and lists, no use for judgement.')).not.toContain('clinical');
    expect(ids('Treat your first price as a starting point, not a promise.')).not.toContain('clinical');
    for (const t of ['It is used to treat anxiety.', 'She was treated for burns.', 'Doctors treat the symptoms first.', 'The treatment helped.'])
      expect(ids(t), t).toContain('clinical');
  });
});

describe('AI habits', () => {
  const book = (body: string) =>
    parseManuscript(
      `::: copyright\nThe stories in this book are illustrative.\n:::\n\n# Chapter 1: One\n\n${body}\n\n# Chapter 2: Two\n\nHere's the honest version.\n`,
    );
  const habits = (body: string) => checkBookStyle(book(body), style, { titleCase: false }).filter((f) => f.rule === 'habit');

  it('warns on scaffolding openers only when a section has more than two', () => {
    const two = "Here's the trap.\n\nPlain paragraph.\n\nLet's look at the numbers.";
    expect(habits(two)).toEqual([]);
    const four = `${two}\n\nHere's how it goes.\n\n**In this chapter, we will** price the result.`;
    const f = habits(four);
    expect(f.map((x) => x.match)).toEqual(["Here's the", "Let's", "Here's how", 'In this chapter, we will']);
    expect(f.every((x) => x.severity === 'warn' && x.sectionId === 'chapter-1-one')).toBe(true);
    expect(f[0]?.message).toContain('4 in this section');
    // Chapter 2 has one opener of its own and is not flagged.
    expect(f.some((x) => x.sectionId !== 'chapter-1-one')).toBe(false);
  });

  it('warns on scaffolding openers in a section body passed to checkText (the server path)', () => {
    const md = "## Pricing\n\nHere's the method.\n\n- Let's not count list items.\n\nHere's how it works.\n\nLet me show you an example.";
    const f = checkText(md, style).filter((x) => x.rule === 'habit');
    expect(f.map((x) => md.slice(x.start, x.end))).toEqual(["Here's the", "Here's how", 'Let me show']);
    expect(checkText("Here's the method.", style).filter((x) => x.rule === 'habit')).toEqual([]);
  });

  it('counts illustrative disclaimers per book, not on the copyright page', () => {
    const live = [
      '(This scene is illustrative, but you may know it well.)',
      'Let me show you how this tends to go, with a composite I will call Funmi. This is illustrative, not a record of a particular person.',
      'Take another illustrative composite, a man I will call Dan.',
    ];
    expect(habits(live.slice(0, 2).join('\n\n'))).toEqual([]);
    const f = habits(live.join('\n\n'));
    expect(f).toHaveLength(3);
    expect(f[0]?.message).toContain('3 in the book');
    expect(f.map((x) => x.match.toLowerCase())).toEqual(['illustrative', 'a composite', 'illustrative']);
  });

  it('checkDisclaimers works on raw section bodies with offsets into each body', () => {
    const units = ['A plain start. This is illustrative.', 'Another illustrative case.\n\nAnd a composite.', 'For illustration only.'].map((text, i) => ({
      sectionId: `s${i}`,
      text,
    }));
    const f = checkDisclaimers(units, style);
    expect(f).toHaveLength(4);
    for (const x of f) expect(units.find((u) => u.sectionId === x.sectionId)?.text.slice(x.start, x.end)).toBe(x.match);
  });
});

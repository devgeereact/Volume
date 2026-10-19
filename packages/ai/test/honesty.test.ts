// house-style:off (live acceptance text quoted as fixtures)
// Honesty fixes after the live acceptance run of 18 October 2026: the nonfiction stamped invented prices
// "(checked October 2026)", narrated "the author" as a character and shipped a blurb that described itself.
// Every test here uses the mock provider; no network.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PromptLoader, TASKS, authorAnecdoteApplies, checkText, createAiService, formatPatternHits, loadHouseStyle, type AiService } from '../src/index.ts';
import { CONFIG_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

const hs = loadHouseStyle(CONFIG_DIR);
const loader = new PromptLoader(PROMPTS_DIR);
const sources = [{ id: 'S1', url: 'https://www.example.org/pricing', title: 'Pricing', snippet: '' }];
const FACTS = 'Name on the book: Gideon Akinlotan\nApproved bio (third person):\nGideon runs a web design studio in London and writes practical guides.';

function hitsOf(text: string, rule: string, ctx = {}) {
  return checkText(text, hs, ctx).filter((h) => h.rule === rule);
}

describe('checked-stamp-unsourced', () => {
  it('sends a "(checked <Month> <Year>)" stamp with no source marker to the claims report', () => {
    const text = 'One charges £12 a month (checked October 2026) and does not align to UK mark schemes. The rest is free.';
    const hits = hitsOf(text, 'checked-stamp-unsourced', { sources });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.severity).toBe('claims');
    expect(hits[0]?.match).toBe('One charges £12 a month (checked October 2026) and does not align to UK mark schemes.');
    expect(hits[0]?.index).toBe(0);
  });

  it('catches every stamp in the forms the live run wrote', () => {
    const text = [
      'At £0.002 per thousand tokens (checked October 2026), that is £0.004 per quiz.',
      'A Figma plugin costs $8 a month (Checked Oct 2026).',
      'Hosting is £5 (checked in October 2026).',
    ].join(' ');
    expect(hitsOf(text, 'checked-stamp-unsourced')).toHaveLength(3);
  });

  it('lets a stamp through when its sentence carries a known research source marker, before or after the full stop', () => {
    expect(hitsOf('The plan costs £12 a month (checked October 2026) [[S1]].', 'checked-stamp-unsourced', { sources })).toHaveLength(0);
    expect(hitsOf('The plan costs £12 a month (checked October 2026). [[S1]]', 'checked-stamp-unsourced', { sources })).toHaveLength(0);
  });

  it('does not accept a marker from another sentence or one that matches no source', () => {
    const other = 'The free tier is generous [[S1]]. The paid plan costs £12 a month (checked October 2026).';
    expect(hitsOf(other, 'checked-stamp-unsourced', { sources })).toHaveLength(1);
    expect(hitsOf('It costs £3 (checked October 2026) [[S9]].', 'checked-stamp-unsourced', { sources })).toHaveLength(1);
  });

  it('ignores prices without a stamp and the word "checked" in ordinary prose', () => {
    expect(hitsOf('Say you set yourself a limit of £10 a month.', 'checked-stamp-unsourced')).toHaveLength(0);
    expect(hitsOf('I checked the settings twice (on a Monday).', 'checked-stamp-unsourced')).toHaveLength(0);
  });

  it('feeds the claims prompt through formatPatternHits', () => {
    expect(formatPatternHits('It costs £5 (checked October 2026).', hs, { sources })).toContain('checked-stamp-unsourced');
  });
});

describe('author-anecdote', () => {
  const ctx = { authorFacts: FACTS };

  it('flags the author narrated as a character, as the live run wrote it', () => {
    const text = [
      'The author set a personal ceiling of £8 a month.',
      'Midweek, the author glances at a bank notification and frowns.',
      'A Saturday morning, the author spreads printed wireframes across the living room floor.',
    ].join(' ');
    const hits = hitsOf(text, 'author-anecdote', ctx);
    expect(hits.map((h) => h.match)).toEqual([
      'The author set a personal ceiling of £8 a month.',
      'Midweek, the author glances at a bank notification and frowns.',
      'A Saturday morning, the author spreads printed wireframes across the living room floor.',
    ]);
    expect(hits.every((h) => h.severity === 'claims')).toBe(true);
  });

  it('flags a first-person past experience the facts do not hold', () => {
    const hits = hitsOf('Last spring I spent £300 on a weekend course. In my experience, nobody reads the small print.', 'author-anecdote', ctx);
    expect(hits).toHaveLength(2);
  });

  it('keeps an experience the profile facts or the brief state', () => {
    expect(hitsOf('When I started my web design studio in London, I wrote practical guides for clients.', 'author-anecdote', ctx)).toHaveLength(0);
  });

  it('leaves guidance, hypothetical "you" examples and the legal lines alone', () => {
    const text = [
      'I suggest you start with a free plan.',
      'Say you have a free Saturday morning and a printed sketch of the page.',
      'No part of this book may be reproduced without the prior written permission of the author, except for brief quotations.',
      'The author and publisher are not responsible for any loss.',
      'The author is not a financial adviser.',
    ].join(' ');
    expect(hitsOf(text, 'author-anecdote', ctx)).toHaveLength(0);
  });

  it('reports one hit per sentence even when two patterns match it', () => {
    expect(hitsOf('In my experience, I spent too long on logos.', 'author-anecdote', ctx)).toHaveLength(1);
  });

  it('runs only when the caller gives the author facts, and never on fiction or picture books', () => {
    expect(hitsOf('The author set a ceiling of £8.', 'author-anecdote')).toHaveLength(0);
    expect(hitsOf('I remember the night the harbour froze.', 'author-anecdote', { ...ctx, skipRules: ['author-anecdote'] })).toHaveLength(0);
    for (const task of ['writing.chapter-fiction', 'writing.extend-section-fiction', 'children.picture-book-story'] as const) {
      expect(TASKS[task].skipRules, task).toContain('author-anecdote');
    }
    expect(TASKS['writing.chapter'].skipRules ?? []).not.toContain('author-anecdote');
  });
});

function serviceWith(fixtures: Record<string, unknown>): AiService {
  const dir = mkdtempSync(join(tmpdir(), 'volume-honesty-'));
  for (const [name, content] of Object.entries(fixtures)) writeFileSync(join(dir, `${name}.json`), JSON.stringify({ content }));
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [dir], chunkDelayMs: 0 } });
}

describe('writing.chapter guardrails on a mock answer', () => {
  it('lists unsourced stamps and invented author scenes in the claims, and keeps the profile-backed lines', async () => {
    const chapter = [
      'The ward lights dim at eleven. The author set a personal ceiling of £8 a month for apps.',
      '',
      '## The Hours Nobody Warns You About',
      '',
      'One rota app costs £4 a month (checked October 2026). Another costs £6 a month (checked October 2026) [[S1]].',
      '',
      'I have worked nights in London hospitals for twenty years, and the quiet hours still surprise me.',
    ].join('\n');
    const r = await serviceWith({ 'writing.chapter': chapter }).runStage('writing.chapter', FULL_INPUT);
    const claims = r.guardrails.claims.map((h) => `${h.rule}: ${h.match}`);
    expect(claims).toContain('checked-stamp-unsourced: One rota app costs £4 a month (checked October 2026).');
    expect(claims.filter((c) => c.startsWith('checked-stamp-unsourced'))).toHaveLength(1);
    expect(claims).toContain('author-anecdote: The author set a personal ceiling of £8 a month for apps.');
    expect(claims.filter((c) => c.startsWith('author-anecdote'))).toHaveLength(1);
    expect(r.guardrails.passed).toBe(true);
  });

  it('skips the author-anecdote check for poetry and memoir or biography (review: medium)', async () => {
    const chapter = 'The ward lights dim at eleven. The author set a personal ceiling of £8 a month for apps.';
    const svc = serviceWith({ 'writing.chapter': chapter });
    for (const book of [{ type: 'memoir-biography' }, { type: 'poetry' }, { template: 'poetry' }]) {
      const r = await svc.runStage('writing.chapter', { ...FULL_INPUT, book: { ...FULL_INPUT.book, ...book } });
      expect(
        r.guardrails.claims.filter((h) => h.rule === 'author-anecdote'),
        JSON.stringify(book),
      ).toHaveLength(0);
    }
    expect(authorAnecdoteApplies({ template: 'nonfiction', type: 'self-help' })).toBe(true);
    expect(authorAnecdoteApplies({ template: 'fiction' })).toBe(false);
  });
});

describe('honesty prompt versions', () => {
  const pricedWriting = ['writing.chapter', 'writing.chapter-workbook', 'writing.introduction', 'writing.extend-section', 'writing.back-matter'];
  const unpricedWriting = ['writing.conclusion', 'writing.front-matter'];

  it('no latest writing prompt asks for a stamp on every currency amount any more', () => {
    for (const id of [...pricedWriting, ...unpricedWriting]) {
      const f = loader.load(id);
      expect(f.system, id).not.toMatch(/every (?:price or cost written with a currency amount|currency amount) carries/);
      expect(f.system, id).toContain('Never make "the author" a character in a scene');
      expect(f.system, id).toContain('{{book.datedPrices}}');
      expect(f.system, id).toContain('{{book.checkedMonth}}');
    }
    for (const id of pricedWriting) expect(loader.load(id).system, id).toContain('Never put "(checked ...)" after an amount that has no source marker');
    for (const id of unpricedWriting) expect(loader.load(id).system, id).toContain('this part has no research sources');
  });

  it('keeps every input of the version before, so the server needs no change', () => {
    const pairs: [string, number][] = [
      ['writing.chapter', 5],
      ['writing.chapter-workbook', 1],
      ['writing.introduction', 5],
      ['writing.extend-section', 3],
      ['writing.back-matter', 5],
      ['writing.conclusion', 5],
      ['writing.front-matter', 5],
      ['matter.back-cover', 6],
      ['matter.amazon-description', 5],
      ['blueprint.blueprint', 5],
      ['blueprint.blueprint-workbook', 1],
    ];
    for (const [id, previous] of pairs) {
      const latest = loader.load(id);
      const before = loader.load(id, previous);
      expect(latest.meta.version, id).toBe(previous + 1);
      expect(latest.meta.inputs, id).toEqual(before.meta.inputs);
      expect(new Set(latest.variables), id).toEqual(new Set(before.variables));
    }
  });

  it('the blurb and description sell the book and never describe the text itself', () => {
    const cover = loader.load('matter.back-cover');
    expect(cover.meta.version).toBe(7);
    expect(cover.system).toContain('120 to 200 words of body text that sells the book');
    expect(cover.system).toContain('Never describe the text itself');
    expect(cover.system).toContain('the promise');
    expect(cover.system).toMatch(/No praise, review quotes, ratings, rankings, sales figures, awards/);
    const listing = loader.load('matter.amazon-description');
    expect(listing.system).toContain('Never describe the text itself');
    for (const id of ['blueprint.blueprint', 'blueprint.blueprint-workbook']) {
      expect(loader.load(id).system, id).toContain('backCoverBlurb and amazonDescriptionDraft sell the book to the reader');
    }
  });
});

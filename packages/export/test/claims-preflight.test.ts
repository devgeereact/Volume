import { describe, expect, it } from 'vitest';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { claimsCsv, runPreflight } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Softened and author-experience claims are settled: only open ones keep the claims warning (live, 21 October 2026).

type Status = 'open' | 'verified' | 'softened' | 'author_experience' | 'removed';
const claim = (status: Status, needsCheck?: boolean) => ({
  chapter: 'One',
  sentence: `S ${status}.`,
  category: 'medical',
  check: 'x',
  status,
  ...(needsCheck === undefined ? {} : { needsCheck }),
});

async function claimsItem(statuses: Status[], extra: ReturnType<typeof claim>[] = []) {
  const book = loadMiniBook();
  const report = await runPreflight({
    book,
    rules: loadKdpRules(),
    houseStyle: loadHouseStyle(),
    trim: '6x9',
    paper: 'white',
    listing: { title: book.meta.title },
    claims: [...statuses.map((s) => claim(s)), ...extra],
    now: new Date('2026-10-21T12:00:00Z'),
  });
  return report.items.find((i) => i.id === 'claims.open');
}

describe('preflight claims count', () => {
  it('passes when every claim is verified, softened, author experience or removed', async () => {
    expect((await claimsItem(['verified', 'softened', 'author_experience', 'removed']))?.level).toBe('pass');
  });
  it('counts only the open ones', async () => {
    const item = await claimsItem(['open', 'softened', 'softened', 'open']);
    expect(item?.level).toBe('warn');
    expect(item?.detail).toContain('2 open claim(s) need your check; 0 more are listed for the record');
  });
  it('counts only open claims that need a check (claim tiers)', async () => {
    const item = await claimsItem([], [claim('open', true), claim('open', false), claim('open', false), claim('verified', true)]);
    expect(item?.level).toBe('warn');
    expect(item?.detail).toBe('1 open claim(s) need your check; 2 more are listed for the record in the claims report.');
  });
  it('passes when every open claim is listed for the record', async () => {
    const item = await claimsItem([], [claim('open', false), claim('open', false)]);
    expect(item?.level).toBe('pass');
    expect(item?.detail).toBe('0 open claim(s) need your check; 2 more are listed for the record in the claims report.');
  });
});

describe('claims to verify CSV', () => {
  it('says which claims need a check and which are for the record', () => {
    const csv = claimsCsv([claim('open', true), claim('open', false), claim('verified')]);
    expect(csv.split('\n')).toEqual([
      'chapter,sentence,category,check needed,status,needs check',
      'One,S open.,medical,x,open,yes',
      'One,S open.,medical,x,open,no',
      'One,S verified.,medical,x,verified,yes',
      '',
    ]);
  });
});

describe('About the author with typeset quotes', () => {
  it('matches the profile bio when the book sets curly apostrophes and the bio has straight ones', async () => {
    const book = loadMiniBook();
    const about = book.sections.find((s) => s.subtype === 'about_the_author');
    if (!about) throw new Error('fixture has no about the author section');
    about.blocks = [{ type: 'paragraph', text: 'Sam’s books are about “quiet” mornings.' }];
    const report = await runPreflight({
      book,
      rules: loadKdpRules(),
      houseStyle: loadHouseStyle(),
      trim: '6x9',
      paper: 'white',
      listing: { title: book.meta.title },
      profileBio: 'Sam\'s books are about "quiet" mornings.',
      now: new Date('2026-10-21T12:00:00Z'),
    });
    expect(report.items.find((i) => i.id === 'honesty.about-author')?.level).toBe('pass');
  });
});

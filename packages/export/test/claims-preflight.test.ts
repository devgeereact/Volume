import { describe, expect, it } from 'vitest';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { runPreflight } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Softened and author-experience claims are settled: only open ones keep the claims warning (live, 21 October 2026).

const claim = (status: 'open' | 'verified' | 'softened' | 'author_experience' | 'removed') => ({
  chapter: 'One',
  sentence: `S ${status}.`,
  category: 'medical',
  check: 'x',
  status,
});

async function claimsItem(statuses: Parameters<typeof claim>[0][]) {
  const book = loadMiniBook();
  const report = await runPreflight({
    book,
    rules: loadKdpRules(),
    houseStyle: loadHouseStyle(),
    trim: '6x9',
    paper: 'white',
    listing: { title: book.meta.title },
    claims: statuses.map(claim),
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
    expect(item?.detail).toContain('2 open claim(s)');
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

import { describe, expect, it } from 'vitest';
import { loadHouseStyle, loadKdpRules } from '@volume/core/node';
import { runPreflight } from '../src/index.ts';
import { loadMiniBook } from './helpers.ts';

// Live run, 24 October 2026: house-style findings that blocked a correct pack.

async function preflight(opts: { about?: string; bio?: string; sectionsOff?: string[]; dropAbout?: boolean; paragraph?: string }) {
  const book = loadMiniBook();
  if (opts.dropAbout) book.sections = book.sections.filter((s) => s.subtype !== 'about_the_author');
  const about = book.sections.find((s) => s.subtype === 'about_the_author');
  if (about && opts.about !== undefined) about.blocks = [{ type: 'paragraph', text: opts.about }];
  if (opts.paragraph) {
    const chapter = book.sections.find((s) => s.kind === 'chapter');
    chapter?.blocks.push({ type: 'paragraph', text: opts.paragraph });
  }
  return runPreflight({
    book,
    rules: loadKdpRules(),
    houseStyle: loadHouseStyle(),
    trim: '6x9',
    paper: 'white',
    listing: { title: book.meta.title },
    ...(opts.bio !== undefined ? { profileBio: opts.bio } : {}),
    ...(opts.sectionsOff ? { sectionsOff: opts.sectionsOff } : {}),
    now: new Date('2026-10-21T12:00:00Z'),
  });
}
const item = (r: Awaited<ReturnType<typeof preflight>>, id: string) => r.items.find((i) => i.id === id);

describe('About the author and the house style', () => {
  const bio = 'Sam is a nurse who loves discovering new ways to rest. Sam delves into sleep.';

  it('does not flag banned words inside a bio that equals the profile bio', async () => {
    const r = await preflight({ about: bio, bio });
    expect(item(r, 'honesty.about-author')?.level).toBe('pass');
    expect(item(r, 'style.house')?.level).toBe('pass');
  });

  it('still flags the same words when the page differs from the bio', async () => {
    const r = await preflight({ about: `${bio} More.`, bio });
    expect(item(r, 'honesty.about-author')?.level).toBe('fail');
    expect(item(r, 'style.house')?.level).toBe('fail');
  });

  it('still flags banned words in the chapters', async () => {
    const r = await preflight({ about: bio, bio, paragraph: 'Let us delve into this.' });
    expect(item(r, 'style.house')?.level).toBe('fail');
  });
});

describe('About the author switched off', () => {
  it('is not applicable when the section is off for this book', async () => {
    const r = await preflight({ dropAbout: true, bio: 'Sam writes.', sectionsOff: ['about-the-author'] });
    const a = item(r, 'honesty.about-author');
    expect(a?.level).toBe('pass');
    expect(a?.detail).toContain('Not applicable');
  });

  it('still fails when the section is missing and not switched off', async () => {
    const r = await preflight({ dropAbout: true, bio: 'Sam writes.' });
    expect(item(r, 'honesty.about-author')?.level).toBe('fail');
  });
});

describe('proper names and spelling', () => {
  it('does not flag "World Health Organization" but flags a US spelling elsewhere', async () => {
    const ok = await preflight({ paragraph: 'The World Health Organization publishes guidance.' });
    expect(item(ok, 'style.house')?.level).toBe('pass');
    const bad = await preflight({ paragraph: 'We organize the World Health Organization notes.' });
    expect(item(bad, 'style.house')?.level).toBe('fail');
  });
});

describe('invented-content check', () => {
  it('lets denials and advice through, and blocks real invented reviews and guarantees', async () => {
    for (const p of ['You have no testimonials yet.', 'Contracts that do not guarantee a result are common.', 'Ask clients for a testimonial.']) {
      expect(item(await preflight({ paragraph: p }), 'style.invented-content')?.level, p).toBe('pass');
    }
    for (const p of ['A glowing testimonial from Sam: it changed my life.', 'We guarantee results in a week.']) {
      expect(item(await preflight({ paragraph: p }), 'style.invented-content')?.level, p).toBe('fail');
    }
  });
});

describe('contents page', () => {
  it('is not a warning for a template with no contents section', async () => {
    const book = loadMiniBook();
    book.sections = book.sections.filter((s) => s.subtype !== 'contents');
    const r = await runPreflight({
      book,
      rules: loadKdpRules(),
      houseStyle: loadHouseStyle(),
      trim: '6x9',
      paper: 'white',
      listing: { title: book.meta.title },
      template: { sections: [{ id: 'copyright', required: true, defaultOn: true }] },
      now: new Date('2026-10-21T12:00:00Z'),
    });
    expect(item(r, 'structure.contents')?.level).toBe('pass');
  });
});

import { describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { createRepos } from '../src/repos/index.js';
import { memoryDb } from './helpers.js';

// Research links are shown as <a href>; only web addresses are stored (audit L9, 1 November 2026).
describe('research source links', () => {
  it('keeps http and https sources and drops any other kind of link', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const repos = createRepos(handle.db);
    const profile = await repos.profiles.create(ctx, { penName: 'Pen' });
    const book = await repos.books.create(ctx, { profileId: profile.id, idea: 'Idea' }, { budgetUsd: 15, illustrativeLine: profile.illustrativeLineDefault });
    const run = await repos.planning.createRun(ctx, book.id, {}, null);
    const src = (url: string) => ({ url, title: 't', excerpt: null, startIndex: null, endIndex: null });
    await repos.planning.completeRun(
      ctx,
      run.id,
      {},
      [
        src('https://example.com/a'),
        src('http://example.org/b'),
        src('javascript:alert(1)'),
        src('data:text/html,x'),
        src(' JAVASCRIPT:alert(2)'),
        src('ftp://x/y'),
      ],
      null,
    );
    const urls = (await repos.planning.listSources(ctx, { runId: run.id })).map((s) => s.url).sort();
    expect(urls).toEqual(['http://example.org/b', 'https://example.com/a']);
    await handle.close();
  });
});

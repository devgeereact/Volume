import { describe, expect, it } from 'vitest';
import { ensureOwner, type RequestCtx } from '../src/auth/context.js';
import { createRepos } from '../src/repos/index.js';
import { memoryDb } from './helpers.js';

describe('repositories', () => {
  it('do CRUD and keep each workspace to its own rows', async () => {
    const handle = await memoryDb();
    const repos = createRepos(handle.db);
    const a: RequestCtx = await ensureOwner(handle.db, 'a', 'Workspace A');
    const b: RequestCtx = await ensureOwner(handle.db, 'b', 'Workspace B');

    const profile = await repos.profiles.create(a, {
      penName: 'Ada Pen',
      bioThirdPerson: 'Ada writes.',
      voice: { tone: ['warm'] },
      links: [{ label: 'Site', value: 'example.org' }],
    });
    expect(profile.voice).toEqual({ tone: ['warm'] });
    expect(profile.bioHash).toHaveLength(64);
    const updated = await repos.profiles.update(a, profile.id, { shortBio: 'Short.', isRealPerson: true });
    expect(updated.isRealPerson).toBe(true);
    expect(updated.illustrativeLineDefault).toBe(true);

    const book = await repos.books.create(
      a,
      { profileId: profile.id, idea: 'Sleep better', bookTypeId: 'self-help' },
      { budgetUsd: 15, illustrativeLine: true },
    );
    expect(book.stage).toBe('idea');
    expect(book.status).toBe('active');
    expect(book.aiDisclosure.text).toBe('none');
    const sections = await repos.manuscript.addSections(a, book.id, [{ kind: 'chapter', area: 'body', title: 'One', number: 1 }]);
    const v1 = await repos.manuscript.saveVersion(a, sections[0]!.id, { bodyMd: '# One\n\nHello there world.', source: 'human' });
    expect(v1.version).toBe(1);
    expect(v1.wordCount).toBe(4);

    // Workspace B sees nothing of A.
    expect(await repos.profiles.get(b, profile.id)).toBeNull();
    expect(await repos.books.get(b, book.id)).toBeNull();
    expect(await repos.books.list(b, { limit: 100, offset: 0 })).toHaveLength(0);
    expect(await repos.profiles.list(b)).toHaveLength(0);
    expect(await repos.manuscript.getSection(b, sections[0]!.id)).toBeNull();
    expect(await repos.manuscript.getVersion(b, v1.id)).toBeNull();
    await expect(repos.books.update(b, book.id, { title: 'Stolen' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(repos.manuscript.saveVersion(b, sections[0]!.id, { bodyMd: 'x', source: 'human' })).rejects.toMatchObject({ code: 'not_found' });
    await expect(repos.profiles.setStatus(b, profile.id, 'archived')).rejects.toMatchObject({ code: 'not_found' });
    expect((await repos.books.require(a, book.id)).title).toBeNull();

    // Settings are per workspace too.
    await repos.settings.set(a, { 'budget.book_default_usd': 20 });
    expect(await repos.settings.get(a, 'budget.book_default_usd')).toBe(20);
    expect(await repos.settings.get(b, 'budget.book_default_usd')).toBeUndefined();

    // Archive and list filters.
    await repos.books.setStatus(a, book.id, 'archive');
    expect(await repos.books.list(a, { limit: 100, offset: 0 })).toHaveLength(0);
    expect(await repos.books.list(a, { status: 'archived', limit: 100, offset: 0 })).toHaveLength(1);
    await handle.close();
  });

  it('rejects an ISBN with a bad checksum and accepts a good one', async () => {
    const handle = await memoryDb();
    const repos = createRepos(handle.db);
    const ctx = await ensureOwner(handle.db);
    const p = await repos.profiles.create(ctx, { penName: 'P' });
    await expect(repos.books.create(ctx, { profileId: p.id, isbnPaperback: '9780000000001' }, { budgetUsd: 1, illustrativeLine: false })).rejects.toMatchObject(
      { code: 'validation_failed' },
    );
    const ok = await repos.books.create(ctx, { profileId: p.id, isbnPaperback: '978-0-306-40615-7' }, { budgetUsd: 1, illustrativeLine: false });
    expect(ok.isbnPaperback).toBe('978-0-306-40615-7');
    await handle.close();
  });
});

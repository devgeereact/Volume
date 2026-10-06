import { afterEach, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from './helpers.js';

let app: TestApp | undefined;
afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('Markdown manuscript import', () => {
  it('creates editable imported versions without calling AI', async () => {
    app = await testApp();
    const profile = await app.services.repos.profiles.create(app.owner, { penName: 'Imported Author' });
    const result = await app.call<{ bookId: string; sections: number }>('POST', '/api/v1/books/import-manuscript', {
      profileId: profile.id,
      markdown:
        '::: titlepage\nSmall Book\nA Subtitle\nImported Author\n:::\n\n# Chapter 1: First Steps\n\nA **bold** paragraph.\n\n# About the Author\n\nImported Author writes books.\n',
    });
    expect(result.status).toBe(201);
    const book = await app.services.repos.books.require(app.owner, result.body.bookId);
    expect(book).toMatchObject({ title: 'Small Book', stage: 'editor', profileId: profile.id });
    const versions = await app.handle.db.selectFrom('sectionVersions').selectAll().where('projectId', '=', book.id).execute();
    expect(versions.length).toBeGreaterThan(0);
    expect(versions.every((version) => version.source === 'import')).toBe(true);
    expect(versions.some((version) => version.bodyMd.includes('A **bold** paragraph.'))).toBe(true);
    expect(await app.handle.db.selectFrom('promptRuns').selectAll().execute()).toHaveLength(0);
  });

  it('rejects an unknown profile without creating a book', async () => {
    app = await testApp();
    const result = await app.call('POST', '/api/v1/books/import-manuscript', { profileId: 'missing', markdown: '# Chapter 1: One\n\nText.' });
    expect(result.status).toBe(404);
    expect(await app.handle.db.selectFrom('projects').selectAll().execute()).toHaveLength(0);
  });
});

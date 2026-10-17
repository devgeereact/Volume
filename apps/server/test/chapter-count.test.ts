import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookChapterCount } from '../src/jobs/book-data.js';
import { str, testApp, type TestApp } from './helpers.js';

/**
 * The new-book wizard saves the owner's chapter count in book settings `chapters`. The blueprint uses it when the
 * request names no count (a fiction book asked for 12 chapters was planned with the mock default of 3), and a count in
 * the request still wins.
 */

type Obj = Record<string, unknown>;

describe('chapter count from the new-book wizard', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await testApp();
  });
  afterAll(async () => t.close());

  async function fictionBook(settings: Obj): Promise<string> {
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'A lighthouse mystery', template: 'fiction', settings });
    return str(b.body['id']);
  }

  async function plannedChapters(bookId: string, body: Obj): Promise<number> {
    expect((await t.call('POST', `/api/v1/books/${bookId}/blueprints`, body)).status).toBe(202);
    await t.services.runner.runUntilIdle();
    const bp = await t.call<{ blueprint: { data: { chapters: unknown[] } } }>('GET', `/api/v1/books/${bookId}/blueprint`);
    return bp.body.blueprint.data.chapters.length;
  }

  it('plans the number of chapters chosen in the wizard', async () => {
    expect(await plannedChapters(await fictionBook({ chapters: 12 }), {})).toBe(12);
  });

  it('lets a count in the request win over the book setting', async () => {
    expect(await plannedChapters(await fictionBook({ chapters: 12 }), { chapterCount: 4 })).toBe(4);
  });

  it('reads numbers and numeric strings, and ignores anything else', () => {
    expect(bookChapterCount({ chapters: 12 })).toBe(12);
    expect(bookChapterCount({ chapters: '9' })).toBe(9);
    expect(bookChapterCount({ chapters: 0 })).toBeNull();
    expect(bookChapterCount({ chapters: 61 })).toBeNull();
    expect(bookChapterCount({ chapters: 'many' })).toBeNull();
    expect(bookChapterCount({})).toBeNull();
  });
});

// house-style:off (test data quotes claims on purpose)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from './helpers.js';

// Claims for sentences that left the text (a section was rewritten) are retired, not left open beside the new ones.
type Obj = Record<string, unknown>;

let t: TestApp;
let bookId: string;
let chapterId: string;
let versionId: string;

beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm shifts', title: 'Calm Shifts', template: 'nonfiction' });
  bookId = b.body['id'] as string;
  await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await t.services.runner.runUntilIdle();
  await t.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await t.call('POST', `/api/v1/books/${bookId}/write`, {});
  await t.services.runner.runUntilIdle();
  const tree = await t.call<{ body: Obj[] }>('GET', `/api/v1/books/${bookId}/sections`);
  chapterId = tree.body.body.find((x) => x['kind'] === 'chapter')!['id'] as string;
  const body = 'Walk on your break. Drink water on shift. Ask when you are unsure.';
  const saved = await t.call<Obj>('POST', `/api/v1/sections/${chapterId}/versions`, { bodyMd: body });
  versionId = (saved.body['id'] ?? (saved.body['version'] as Obj | undefined)?.['id']) as string;
});
afterAll(async () => {
  await t.close();
});

const claim = (sentence: string) => ({ sentence, category: 'medical', checkNeeded: 'x', start: null, end: null, risk: 'high' as const, harmIfWrong: true });

describe('claims for sentences that are gone', () => {
  it("retireGoneClaims removes only the open claims whose sentence left the text, and never the new version's own", async () => {
    const m = t.services.repos.manuscript;
    const section = await m.requireSection(t.owner, chapterId);
    const cur = section.currentVersionId!;
    await m.addClaims(t.owner, bookId, chapterId, cur, [claim('Walk on your break.'), claim('An old sentence that was rewritten away.')]);
    const retired = await m.retireGoneClaims(t.owner, chapterId, 'Walk on your break. Drink water on shift.', 'some-newer-version');
    expect(retired).toBeGreaterThanOrEqual(1);
    const claims = await m.listClaims(t.owner, { sectionId: chapterId });
    expect(claims.find((c) => c.sentence === 'An old sentence that was rewritten away.')!.status).toBe('removed');
    expect(claims.find((c) => c.sentence === 'Walk on your break.')!.status).toBe('open');
    expect(versionId).toBeTruthy();
  });

  it('POST /claims/clear-gone clears the rest and leaves claims that are still in the text', async () => {
    const m = t.services.repos.manuscript;
    const cur = (await m.requireSection(t.owner, chapterId)).currentVersionId!;
    await m.addClaims(t.owner, bookId, chapterId, cur, [claim('Another sentence that no longer exists anywhere.')]);
    const r = await t.call<{ cleared: number }>('POST', `/api/v1/books/${bookId}/claims/clear-gone`);
    expect(r.status).toBe(200);
    expect(r.body.cleared).toBeGreaterThanOrEqual(1);
    const open = (await m.listClaims(t.owner, { sectionId: chapterId, status: 'open' })).map((c) => c.sentence);
    expect(open).toContain('Walk on your break.');
    expect(open).not.toContain('Another sentence that no longer exists anywhere.');
    const again = await t.call<{ cleared: number }>('POST', `/api/v1/books/${bookId}/claims/clear-gone`);
    expect(again.body.cleared).toBeLessThan(r.body.cleared + 1);
  });
});

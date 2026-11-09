import { afterEach, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from './helpers.js';

// A claim fix must say what really happened. Reported on 8 November 2026: the editor showed a claim as softened, and
// after a refresh the sentence was still in the book. Cause: soften marked the claim resolved even when its sentence
// was no longer in the section, so the softer wording went nowhere. Remove on a sentence that is already gone is
// correct (nothing left to remove) as long as the reply says no text changed. Mock AI and mock exporter; no network.

interface Obj {
  [k: string]: unknown;
}
interface ClaimRow {
  id: string;
  sentence: string;
  sectionId: string;
  status: string;
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function writtenBook(app: TestApp): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const bookId = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  await app.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await app.call('POST', `/api/v1/books/${bookId}/write`, {});
  await app.services.runner.runUntilIdle();
  return bookId;
}

async function claimsOf(app: TestApp, bookId: string): Promise<ClaimRow[]> {
  return (await app.call<{ items: ClaimRow[] }>('GET', `/api/v1/books/${bookId}/claims`)).body.items;
}

async function versionCount(app: TestApp, sectionId: string): Promise<number> {
  return (await app.call<{ items: unknown[] }>('GET', `/api/v1/sections/${sectionId}/versions`)).body.items.length;
}

/** Edits the section the way a person would: saves a new version without the claim's sentence. */
async function editSentenceAway(app: TestApp, claim: ClaimRow): Promise<void> {
  const cur = (await app.call<{ current: { id: string; bodyMd: string } }>('GET', `/api/v1/sections/${claim.sectionId}`)).body.current;
  expect(cur.bodyMd).toContain(claim.sentence);
  const saved = await app.call('POST', `/api/v1/sections/${claim.sectionId}/versions`, {
    bodyMd: cur.bodyMd.replace(claim.sentence, 'A different sentence the author wrote.'),
    baseVersionId: cur.id,
  });
  expect(saved.status).toBe(201);
}

describe('soften and remove when the sentence is no longer in the section', () => {
  it('refuses to soften, saves nothing and leaves the claim open', async () => {
    t = await testApp();
    const bookId = await writtenBook(t);
    const claim = (await claimsOf(t, bookId))[0]!;
    await editSentenceAway(t, claim);
    const before = await versionCount(t, claim.sectionId);

    const res = await t.call<{ error: { code: string; message: string } }>('POST', `/api/v1/claims/${claim.id}/soften`, {
      replacement: 'Some people find this helps.',
    });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('invalid_state');
    expect(res.body.error.message).toMatch(/no longer in this section/i);
    expect(await versionCount(t, claim.sectionId)).toBe(before);
    expect((await claimsOf(t, bookId)).find((c) => c.id === claim.id)?.status).toBe('open');
  });

  it('removes a claim whose sentence is already gone, and says plainly that no text changed', async () => {
    t = await testApp();
    const bookId = await writtenBook(t);
    const claim = (await claimsOf(t, bookId))[0]!;
    await editSentenceAway(t, claim);
    const before = await versionCount(t, claim.sectionId);

    const res = await t.call<{ claim: { status: string }; textChanged: boolean }>('POST', `/api/v1/claims/${claim.id}/remove`, {});

    // The sentence is not in the text, which is what removing it means, so closing the claim is right. "Fix everything"
    // relies on this for claims whose sentence was edited away. The reply must not claim a change that did not happen.
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ claim: { status: 'removed' }, textChanged: false });
    expect(await versionCount(t, claim.sectionId)).toBe(before);
  });

  it('still lets the owner retire that claim with clear-gone, which says plainly that no text changed', async () => {
    t = await testApp();
    const bookId = await writtenBook(t);
    const claim = (await claimsOf(t, bookId))[0]!;
    await editSentenceAway(t, claim);
    await t.call('POST', `/api/v1/claims/${claim.id}/soften`, {});

    const cleared = await t.call<Obj>('POST', `/api/v1/books/${bookId}/claims/clear-gone`, {});

    expect(cleared.status).toBe(200);
    expect((await claimsOf(t, bookId)).find((c) => c.id === claim.id)?.status).not.toBe('open');
  });

  it('still softens a claim whose sentence is there, and reports that the text changed', async () => {
    t = await testApp();
    const bookId = await writtenBook(t);
    const claim = (await claimsOf(t, bookId))[0]!;

    const res = await t.call<{ claim: { status: string }; textChanged: boolean }>('POST', `/api/v1/claims/${claim.id}/soften`, {});

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ claim: { status: 'softened' }, textChanged: true });
  });
});

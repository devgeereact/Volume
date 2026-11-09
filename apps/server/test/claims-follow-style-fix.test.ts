import { afterEach, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from './helpers.js';

// Reported on 8 November 2026: after "Fix everything", claims were shown as cleared and then came back after a refresh.
// Cause: the house-style fix rewrites dashes inside the sentences claims are filed against, so the open claim no longer
// matched the text. The checks job that follows retired that claim as "gone" and filed the fixed sentence as a NEW
// claim. A claim must follow the style fix, so it stays one claim. Mock AI and mock exporter; no network.

interface Obj {
  [k: string]: unknown;
}
interface ClaimRow {
  id: string;
  sentence: string;
  sectionId: string;
  status: string;
}

const EM = String.fromCharCode(0x2014);
const WITH_DASH = `Night shifts ${EM} especially long ones ${EM} shorten sleep by about 70% for most people.`;

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function bookWithDashClaim(app: TestApp): Promise<{ bookId: string; chapterId: string; claimId: string }> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const bookId = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  await app.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await app.call('POST', `/api/v1/books/${bookId}/write`, {});
  await app.services.runner.runUntilIdle();
  const tree = await app.call<{ body: Obj[] }>('GET', `/api/v1/books/${bookId}/sections`);
  const chapterId = tree.body.body.find((x) => x['kind'] === 'chapter')!['id'] as string;
  const cur = (await app.call<{ current: { id: string; bodyMd: string } }>('GET', `/api/v1/sections/${chapterId}`)).body.current;
  const saved = await app.call<{ id: string }>('POST', `/api/v1/sections/${chapterId}/versions`, {
    bodyMd: `${cur.bodyMd}\n\n${WITH_DASH}`,
    baseVersionId: cur.id,
  });
  expect(saved.status).toBe(201);
  const [claim] = await app.services.repos.manuscript.addClaims(app.owner, bookId, chapterId, saved.body.id, [
    { sentence: WITH_DASH, category: 'statistical', checkNeeded: 'x', start: null, end: null },
  ]);
  return { bookId, chapterId, claimId: claim!.id };
}

async function claimsOf(app: TestApp, bookId: string): Promise<ClaimRow[]> {
  return (await app.call<{ items: ClaimRow[] }>('GET', `/api/v1/books/${bookId}/claims`)).body.items;
}

describe('a claim follows the house-style fix', () => {
  it('keeps the same claim, now on the fixed sentence, instead of leaving it behind', async () => {
    t = await testApp();
    const { bookId, chapterId, claimId } = await bookWithDashClaim(t);

    const res = await t.call('POST', `/api/v1/books/${bookId}/fix-house-style`, {});
    expect(res.status).toBe(200);

    const text = (await t.call<{ current: { bodyMd: string } }>('GET', `/api/v1/sections/${chapterId}`)).body.current.bodyMd;
    const claim = (await claimsOf(t, bookId)).find((c) => c.id === claimId)!;
    expect(text).not.toContain(EM);
    expect(claim.status).toBe('open');
    expect(claim.sentence).not.toContain(EM);
    expect(text).toContain(claim.sentence);
  });

  it('is not retired as gone when the checks run on the new text, so it is not filed again', async () => {
    t = await testApp();
    const { bookId, chapterId, claimId } = await bookWithDashClaim(t);
    await t.call('POST', `/api/v1/books/${bookId}/fix-house-style`, {});
    const cur = (await t.call<{ current: { id: string; bodyMd: string } }>('GET', `/api/v1/sections/${chapterId}`)).body.current;

    // What the checks job does when it finishes on the new version.
    const retired = await t.services.repos.manuscript.retireGoneClaims(t.owner, chapterId, cur.bodyMd, 'a-newer-version');

    expect(retired).toBe(0);
    expect((await claimsOf(t, bookId)).find((c) => c.id === claimId)?.status).toBe('open');
  });

  it('can still be softened afterwards, and the text really changes', async () => {
    t = await testApp();
    const { bookId, chapterId, claimId } = await bookWithDashClaim(t);
    await t.call('POST', `/api/v1/books/${bookId}/fix-house-style`, {});

    const res = await t.call<{ claim: { status: string }; textChanged: boolean }>('POST', `/api/v1/claims/${claimId}/soften`, {
      replacement: 'Night shifts can shorten sleep.',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ claim: { status: 'softened' }, textChanged: true });
    const text = (await t.call<{ current: { bodyMd: string } }>('GET', `/api/v1/sections/${chapterId}`)).body.current.bodyMd;
    expect(text).toContain('Night shifts can shorten sleep.');
  });

  it('leaves a claim alone when its sentence needed no style fix', async () => {
    t = await testApp();
    const { bookId, claimId } = await bookWithDashClaim(t);
    const before = (await claimsOf(t, bookId)).find((c) => c.id === claimId)!;
    // A second run has nothing left to fix.
    await t.call('POST', `/api/v1/books/${bookId}/fix-house-style`, {});
    const once = (await claimsOf(t, bookId)).find((c) => c.id === claimId)!;
    await t.call('POST', `/api/v1/books/${bookId}/fix-house-style`, {});
    const twice = (await claimsOf(t, bookId)).find((c) => c.id === claimId)!;
    expect(before.sentence).toContain(EM);
    expect(twice.sentence).toBe(once.sentence);
    expect(twice.status).toBe('open');
  });
});

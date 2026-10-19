// house-style:off (fixtures hold the non-breaking hyphens the fix removes)
// Second live acceptance run, 19 October 2026: approving an edited blueprint put the title's U+2011 hyphens back.
// Mock AI only, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { str, testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
const NB = '‑';
const DIRTY_TITLE = `My 30${NB}Day Side${NB}Project Plan`;
const CLEAN_TITLE = 'My 30-Day Side-Project Plan';

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function bookWithBlueprint(app: TestApp): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Side projects', title: CLEAN_TITLE });
  expect(b.status).toBe(201);
  const id = str(b.body['id']);
  expect((await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 })).status).toBe(202);
  await app.services.runner.runUntilIdle();
  return id;
}

describe('3. blueprint title cleanup on save and approve', () => {
  it('PATCH /books/:id/blueprint saves the title and subtitle without odd hyphens, and approval keeps the book title clean', async () => {
    t = await testApp();
    const id = await bookWithBlueprint(t);
    const res = await t.call<{ data: Obj }>('PATCH', `/api/v1/books/${id}/blueprint`, {
      parts: { title: DIRTY_TITLE, subtitle: `A Step${NB}by${NB}Step Plan` },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data['title']).toBe(CLEAN_TITLE);
    expect(res.body.data['subtitle']).toBe('A Step-by-Step Plan');

    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    const book = await t.call<Obj>('GET', `/api/v1/books/${id}`);
    expect(book.body['title']).toBe(CLEAN_TITLE);
    expect(book.body['subtitle']).toBe('A Step-by-Step Plan');
  });

  it('approving a blueprint saved before the fix still sets a clean book title', async () => {
    t = await testApp();
    const id = await bookWithBlueprint(t);
    const latest = await t.services.repos.planning.latestBlueprint(t.owner, id);
    if (!latest) throw new Error('no blueprint');
    await t.services.repos.planning.addBlueprintVersion(t.owner, id, { ...latest.data, title: DIRTY_TITLE }, { source: 'human', parentVersionId: latest.id });

    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    const book = await t.call<Obj>('GET', `/api/v1/books/${id}`);
    expect(book.body['title']).toBe(CLEAN_TITLE);
    expect(String(book.body['title'])).not.toContain(NB);
  });

  it('owner edits keep their wording and spelling: only look-alike hyphens and spaces are tidied', async () => {
    t = await testApp();
    const id = await bookWithBlueprint(t);
    const res = await t.call<{ data: Obj }>('PATCH', `/api/v1/books/${id}/blueprint`, { parts: { title: `Intrigue:  The Color${NB}Plan ` } });
    expect(res.status).toBe(200);
    expect(res.body.data['title']).toBe('Intrigue: The Color-Plan');
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    expect((await t.call<Obj>('GET', `/api/v1/books/${id}`)).body['title']).toBe('Intrigue: The Color-Plan');
  });
});

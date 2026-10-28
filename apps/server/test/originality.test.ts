// Originality (owner, 27 October 2026): a section that copies a passage word for word from the pen name's voice sample
// warns in preflight (never blocks); quoting it inside quotation marks does not. Mock AI only, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
type Item = { id: string; severity: string; message: string };
const SAMPLE = 'Most of us learn to cook by watching someone we love stand at the stove and make it look easy. Then we try it alone.';

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function bookWithSample(app: TestApp): Promise<{ id: string; chapterId: string }> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  expect((await app.call('POST', `/api/v1/profiles/${p.body['id'] as string}/samples`, { kind: 'sounds_like', text: SAMPLE })).status).toBe(201);
  const b = await app.call<Obj>('POST', '/api/v1/books', {
    profileId: p.body['id'],
    idea: 'Cooking for one',
    title: 'Cooking For One',
    bookTypeId: 'ai-tech-howto',
  });
  const id = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  const tree = await app.call<{ body: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
  const ch1 = tree.body.body.find((x) => x['kind'] === 'chapter' && x['number'] === 1);
  return { id, chapterId: ch1?.['id'] as string };
}

const originality = async (app: TestApp, bookId: string): Promise<Item[]> =>
  (await app.call<{ items: Item[] }>('GET', `/api/v1/books/${bookId}/preflight`)).body.items.filter((i) => i.id.includes('.originality.'));

describe('originality in preflight', () => {
  it('warns for a section that copies the voice sample, and not once it is quoted instead', async () => {
    t = await testApp();
    const book = await bookWithSample(t);
    const copied = `A plain start. ${SAMPLE} A plain end.`;
    expect((await t.call('POST', `/api/v1/sections/${book.chapterId}/versions`, { bodyMd: copied })).status).toBe(201);
    const warns = await originality(t, book.id);
    expect(warns).toHaveLength(1);
    expect(warns[0]?.severity).toBe('warn');
    expect(warns[0]?.message).toContain('One passage repeats your voice sample word for word, starting "Most of us learn to cook');

    const quoted = `A plain start. As I once wrote, “${SAMPLE}” A plain end.`;
    expect((await t.call('POST', `/api/v1/sections/${book.chapterId}/versions`, { bodyMd: quoted })).status).toBe(201);
    expect(await originality(t, book.id)).toEqual([]);
  });
});

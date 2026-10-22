// Whole-book rebuild from a new title (owner, 22 October 2026). Mock AI only, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { str, testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
interface Sec {
  id: string;
  kind: string;
  number: number | null;
  title: string | null;
  enabled: boolean;
  currentVersionId: string | null;
}
interface Tree {
  front: Sec[];
  body: Sec[];
  back: Sec[];
}
interface Version {
  id: string;
  version: number;
  source: string;
  note: string | null;
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

/** A book written in full from a three-chapter blueprint. */
async function writtenBook(app: TestApp): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm night shifts', title: 'Old Night Title' });
  const id = str(b.body['id']);
  expect((await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 3 })).status).toBe(202);
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  expect((await app.call('POST', `/api/v1/books/${id}/write`, {})).status).toBe(202);
  await app.services.runner.runUntilIdle();
  return id;
}

const all = (tree: Tree): Sec[] => [...tree.front, ...tree.body, ...tree.back];

describe('rebuild the whole book', () => {
  it('builds a new blueprint for the new title, rewrites every AI section with a named version, and undo puts the book back', async () => {
    t = await testApp();
    const id = await writtenBook(t);
    const before = (await t.call<Tree>('GET', `/api/v1/books/${id}/sections`)).body;
    const chapter3 = before.body.find((x) => x.kind === 'chapter' && x.number === 3);
    expect(chapter3?.currentVersionId).toBeTruthy();
    const oldVersions = new Map(all(before).map((x) => [x.id, x.currentVersionId]));
    // The new plan has two chapters, so chapter 3 must be switched off, not deleted.
    await t.services.repos.books.setSetting(t.owner, id, 'chapters', 2);

    const res = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuild`, { title: 'New Calm Title' });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    expect(res.body['note']).toBe('Rebuild 1 from new title: New Calm Title');
    await t.services.runner.runUntilIdle();
    const job = await t.call<{ status: string; children: { kind: string; status: string }[] }>('GET', `/api/v1/jobs/${str(res.body['jobId'])}`);
    expect(job.body.status).toBe('succeeded');
    expect(job.body.children.some((c) => c.kind === 'listing')).toBe(true);

    const book = await t.call<Obj>('GET', `/api/v1/books/${id}`);
    expect(book.body['title']).toBe('New Calm Title');
    const bp = await t.call<{ blueprint: { data: Obj; note: string | null } }>('GET', `/api/v1/books/${id}/blueprint`);
    expect(bp.body.blueprint.data['title']).toBe('New Calm Title');
    expect(bp.body.blueprint.note).toBe('Rebuild 1 from new title: New Calm Title');

    const after = (await t.call<Tree>('GET', `/api/v1/books/${id}/sections`)).body;
    const chapters = after.body.filter((x) => x.kind === 'chapter');
    expect(chapters.filter((x) => x.enabled).map((x) => x.number)).toEqual([1, 2]);
    expect(chapters.find((x) => x.number === 3)?.enabled).toBe(false);
    // Every section the AI wrote before has a new version named after the rebuild; the old one is still there.
    const rewritten = all(after).filter((x) => x.enabled && oldVersions.get(x.id) && x.currentVersionId !== oldVersions.get(x.id));
    expect(rewritten.length).toBeGreaterThanOrEqual(2);
    for (const sec of rewritten) {
      const v = await t.call<{ items: Version[] }>('GET', `/api/v1/sections/${sec.id}/versions`);
      // Owner placeholders (resources with no ticked source) keep their own note saying what to add.
      if (v.body.items[0]!.source === 'app:placeholder') continue;
      expect(v.body.items[0]!.note).toBe('Rebuild 1 from new title: New Calm Title');
      expect(v.body.items.some((x) => x.id === oldVersions.get(sec.id))).toBe(true);
    }

    const list = await t.call<{ rebuilds: Obj[] }>('GET', `/api/v1/books/${id}/rebuilds`);
    expect(list.body.rebuilds).toHaveLength(1);
    expect(list.body.rebuilds[0]).toMatchObject({ number: 1, fromTitle: 'Old Night Title', toTitle: 'New Calm Title', undoneAt: null });

    const undo = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuilds/${str(res.body['jobId'])}/undo`, {});
    expect(undo.status, JSON.stringify(undo.body)).toBe(200);
    expect(undo.body['note']).toBe('Back to before rebuild 1');
    expect((await t.call<Obj>('GET', `/api/v1/books/${id}`)).body['title']).toBe('Old Night Title');
    const back = (await t.call<Tree>('GET', `/api/v1/books/${id}/sections`)).body;
    expect(back.body.filter((x) => x.kind === 'chapter' && x.enabled).map((x) => x.number)).toEqual([1, 2, 3]);
    for (const sec of rewritten) {
      const v = await t.call<{ items: (Version & { bodyMd?: string })[] }>('GET', `/api/v1/sections/${sec.id}/versions`);
      expect(v.body.items[0]!.note).toBe('Back to before rebuild 1');
      expect(v.body.items[0]!.source).toBe('restore');
    }
    const relisted = await t.call<{ rebuilds: Obj[] }>('GET', `/api/v1/books/${id}/rebuilds`);
    expect(relisted.body.rebuilds[0]!['undoneAt']).toEqual(expect.any(Number));
  });

  it('a rebuild with no new title is named as a fresh start, and a second rebuild waits while one runs', async () => {
    t = await testApp();
    const id = await writtenBook(t);
    const first = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuild`, {});
    expect(first.status).toBe(202);
    expect(first.body['note']).toBe('Rebuild 1: whole book from the start');
    const second = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuild`, { title: 'Another' });
    expect(second.status).toBe(409);
    await t.services.runner.runUntilIdle();
    // A title chosen on Titles is saved at once; the next rebuild still names it as a new title.
    await t.call('PATCH', `/api/v1/books/${id}`, { title: 'Chosen On Titles' });
    const list = await t.call<{ planTitle: string | null; hasText: boolean }>('GET', `/api/v1/books/${id}/rebuilds`);
    expect(list.body).toMatchObject({ planTitle: 'Old Night Title', hasText: true });
    const third = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuild`, {});
    expect(third.body['note']).toBe('Rebuild 2 from new title: Chosen On Titles');
    await t.services.runner.runUntilIdle();
    expect((await t.call<Obj>('GET', `/api/v1/books/${id}`)).body['title']).toBe('Chosen On Titles');
  });
});

import { fileURLToPath } from 'node:url';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { testApp, type TestApp } from './helpers.js';

// Reported on 8 November 2026: "Fix house style" said it had fixed the book, and after a refresh the preflight still
// blocked on house style. The fix handles dashes and US spellings; preflight also blocks on banned phrases, which are
// not safe to rewrite by find and replace. The answer to the owner must say what is left, from the same check
// preflight uses, so "fixed" can never contradict the pack check. Real exporter preflight (no browser), mock AI.

interface Obj {
  [k: string]: unknown;
}
interface Item {
  id: string;
  severity: string;
  message: string;
}
interface FixReply {
  sections: number;
  dashes: number;
  spellings: number;
  styleAfter: { severity: string; message: string } | null;
}

const EM = String.fromCharCode(0x2014);
const exporter = new VolumeExportAdapter({ root: fileURLToPath(new URL('../../../', import.meta.url)) });
let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});
afterAll(async () => {
  await exporter.close();
});

async function writtenBook(app: TestApp): Promise<{ bookId: string; chapterId: string }> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const bookId = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  await app.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await app.call('POST', `/api/v1/books/${bookId}/write`, {});
  await app.services.runner.runUntilIdle();
  const tree = await app.call<{ body: Obj[] }>('GET', `/api/v1/books/${bookId}/sections`);
  return { bookId, chapterId: tree.body.body.find((x) => x['kind'] === 'chapter')!['id'] as string };
}

/** Appends text to the chapter the way a person would, by saving a new version. */
async function addToChapter(app: TestApp, chapterId: string, extra: string): Promise<void> {
  const cur = (await app.call<{ current: { id: string; bodyMd: string } }>('GET', `/api/v1/sections/${chapterId}`)).body.current;
  const saved = await app.call('POST', `/api/v1/sections/${chapterId}/versions`, { bodyMd: `${cur.bodyMd}\n\n${extra}`, baseVersionId: cur.id });
  expect(saved.status).toBe(201);
}

async function houseStyleItem(app: TestApp, bookId: string): Promise<Item | undefined> {
  const r = await app.call<{ items: Item[] }>('GET', `/api/v1/books/${bookId}/preflight`);
  return r.body.items.find((i) => i.id === 'style.house');
}

describe('fix house style tells the truth about what is left', () => {
  it('fixes dashes and spellings, and reports that preflight now passes', async () => {
    t = await testApp({ exporter });
    const { bookId, chapterId } = await writtenBook(t);
    await addToChapter(t, chapterId, `The morning routine ${EM} simple and calm ${EM} works. The color of the light matters.`);
    expect((await houseStyleItem(t, bookId))?.severity).toBe('block');

    const res = await t.call<FixReply>('POST', `/api/v1/books/${bookId}/fix-house-style`, {});

    expect(res.status).toBe(200);
    expect(res.body.dashes).toBeGreaterThan(0);
    expect(res.body.spellings).toBeGreaterThan(0);
    expect(res.body.styleAfter?.severity).toBe('pass');
    expect((await houseStyleItem(t, bookId))?.severity).toBe('pass');
  });

  it('reports a banned phrase it cannot rewrite, and agrees with what preflight says after a refresh', async () => {
    t = await testApp({ exporter });
    const { bookId, chapterId } = await writtenBook(t);
    await addToChapter(t, chapterId, `Mornings are a rich tapestry of small habits ${EM} and the color of the light helps.`);

    const res = await t.call<FixReply>('POST', `/api/v1/books/${bookId}/fix-house-style`, {});

    expect(res.status).toBe(200);
    // The dash and spelling were fixed...
    expect(res.body.dashes).toBeGreaterThan(0);
    // ...but the banned phrase is still there, and the reply must say so instead of leaving the owner to find out.
    expect(res.body.styleAfter?.severity).toBe('block');
    expect(res.body.styleAfter?.message).toMatch(/rich tapestry/i);
    const afterRefresh = await houseStyleItem(t, bookId);
    expect(afterRefresh?.severity).toBe('block');
    expect(res.body.styleAfter?.message).toBe(afterRefresh?.message);
  });
});

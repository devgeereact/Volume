// A book with parts: each part divider must sit directly before its own chapters in every export. Approving a
// blueprint stores all the parts first and the chapters after them, so a flat walk of the positions printed
// "Part I" and "Part II" back to back above Chapter 1 (found by a whole-pack check, 25 October 2026).
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportMarkdown } from '@volume/export';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { exportTemplate, toBookDoc } from '../src/adapters/volume-export.js';
import { buildExportBook, orderPartsWithChapters } from '../src/jobs/book-data.js';
import { testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = join(ROOT, 'config');

const sec = (id: string, kind: string, partId: string | null = null, area = 'body') => ({ id, kind, area, partId });

describe('orderPartsWithChapters', () => {
  it('puts each part before its own chapters and leaves part-less chapters where they were', () => {
    const input = [
      sec('intro', 'introduction', null, 'front'),
      sec('p1', 'part'),
      sec('p2', 'part'),
      sec('c1', 'chapter', 'p1'),
      sec('c2', 'chapter', 'p1'),
      sec('c3', 'chapter', 'p2'),
      sec('c4', 'chapter', null),
      sec('end', 'conclusion', null, 'back'),
    ];
    expect(orderPartsWithChapters(input).map((s) => s.id)).toEqual(['intro', 'p1', 'c1', 'c2', 'p2', 'c3', 'c4', 'end']);
  });

  it('returns books without parts unchanged', () => {
    const input = [sec('a', 'chapter'), sec('b', 'chapter')];
    expect(orderPartsWithChapters(input)).toEqual(input);
  });

  it('keeps a chapter whose part is switched off (not in the list) in place', () => {
    const input = [sec('p1', 'part'), sec('c1', 'chapter', 'p9'), sec('c2', 'chapter', 'p1')];
    expect(orderPartsWithChapters(input).map((s) => s.id)).toEqual(['p1', 'c2', 'c1']);
  });
});

describe('a book with two parts', () => {
  let t: TestApp;
  beforeAll(async () => {
    t = await testApp();
  });
  afterAll(async () => t.close());

  it('exports Part I, its chapters, Part II, its chapters in that order', async () => {
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', { penName: 'Part Author', bioThirdPerson: 'Part Author writes plain books.' });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', {
      profileId: p.body.id,
      idea: 'Calm mornings',
      title: 'Calm Mornings',
      bookTypeId: 'self-help',
      settings: { acknowledgements: 'Sam' },
    });
    const id = b.body.id;
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 4 });
    await t.services.runner.runUntilIdle();
    const bp = await t.call<{ blueprint: { data: { chapters: Record<string, unknown>[] } } }>('GET', `/api/v1/books/${id}/blueprint`);
    const chapters = bp.body.blueprint.data.chapters.map((c, i) => ({ ...c, part: i < 2 ? 1 : 2 }));
    const patched = await t.call('PATCH', `/api/v1/books/${id}/blueprint`, {
      parts: {
        parts: [
          { number: 1, title: 'Foundations' },
          { number: 2, title: 'Putting it to work' },
        ],
        chapters,
      },
    });
    expect(patched.status).toBe(200);
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    const eb = await buildExportBook(t.services.repos, t.owner, id, CONFIG);
    const order = eb.sections.filter((s) => s.kind === 'part' || s.kind === 'chapter').map((s) => `${s.kind}:${s.number}`);
    expect(order).toEqual(['part:1', 'chapter:1', 'chapter:2', 'part:2', 'chapter:3', 'chapter:4']);

    const md = exportMarkdown(toBookDoc(eb, exportTemplate(ROOT, eb))).toString('utf8');
    const at = (needle: string): number => md.indexOf(needle);
    expect(at('Part I\nFoundations')).toBeGreaterThan(-1);
    expect(at('Part I\nFoundations')).toBeLessThan(at('# Chapter 1:'));
    expect(at('# Chapter 2:')).toBeLessThan(at('Part II\nPutting it to work'));
    expect(at('Part II\nPutting it to work')).toBeLessThan(at('# Chapter 3:'));
  });

  async function partsBook(): Promise<string> {
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', {
      penName: `Order Author ${Math.random()}`,
      bioThirdPerson: 'Order Author writes plain books.',
    });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', {
      profileId: p.body.id,
      idea: 'Calm mornings',
      title: 'Calm Mornings',
      bookTypeId: 'self-help',
      settings: { acknowledgements: 'Sam' },
    });
    const id = b.body.id;
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 4 });
    await t.services.runner.runUntilIdle();
    const bp = await t.call<{ blueprint: { data: { chapters: Record<string, unknown>[] } } }>('GET', `/api/v1/books/${id}/blueprint`);
    const chapters = bp.body.blueprint.data.chapters.map((c, i) => ({ ...c, part: i < 2 ? 1 : 2 }));
    await t.call('PATCH', `/api/v1/books/${id}/blueprint`, {
      parts: {
        parts: [
          { number: 1, title: 'Foundations' },
          { number: 2, title: 'Putting it to work' },
        ],
        chapters,
      },
    });
    await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {});
    return id;
  }
  const bodyOrder = async (id: string): Promise<string[]> =>
    (await t.services.repos.manuscript.listSections(t.owner, id)).filter((s) => s.area === 'body').map((s) => `${s.kind}:${s.number}`);

  it('stores a new book in reading order: each part right before its chapters', async () => {
    const id = await partsBook();
    const rows = await t.services.db
      .selectFrom('sections')
      .select(['kind', 'number', 'position', 'area'])
      .where('projectId', '=', id)
      .orderBy('position')
      .execute();
    expect(rows.filter((r) => r.area === 'body').map((r) => `${r.kind}:${r.number}`)).toEqual([
      'part:1',
      'chapter:1',
      'chapter:2',
      'part:2',
      'chapter:3',
      'chapter:4',
    ]);
  });

  it('reads an older book (parts stored first) in reading order everywhere: sections, tree, writing queue and export', async () => {
    const id = await partsBook();
    // Make it look like the books saved before the fix: every part first, then the chapters.
    const all = await t.services.repos.manuscript.listSections(t.owner, id);
    const parts = all.filter((s) => s.kind === 'part');
    const chapters = all.filter((s) => s.kind === 'chapter');
    let pos = 5000;
    for (const x of [...parts, ...chapters]) {
      await t.services.db.updateTable('sections').set({ position: pos }).where('id', '=', x.id).execute();
      pos += 1000;
    }
    const expected = ['part:1', 'chapter:1', 'chapter:2', 'part:2', 'chapter:3', 'chapter:4'];
    expect(await bodyOrder(id)).toEqual(expected);

    const tree = (await t.call<{ body: { kind: string; number: number; children: { number: number }[] }[] }>('GET', `/api/v1/books/${id}/sections`)).body;
    expect(tree.body.map((b) => `${b.kind}:${b.number}:${b.children.map((c) => c.number).join(',')}`)).toEqual(['part:1:1,2', 'part:2:3,4']);

    // Writing order: the write jobs chain chapter 1, 2, 3, 4, each depending on the one before.
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const jobs = await t.services.queue.list(t.owner, { projectId: id, kind: 'write_section', limit: 100 });
    const byId = new Map(jobs.map((j) => [j.id, j]));
    const chain = jobs.filter((j) => j.dependsOnJobId === null || byId.has(j.dependsOnJobId));
    const order: string[] = [];
    let cur = chain.find((j) => j.dependsOnJobId === null);
    while (cur) {
      const sec = all.find((x) => x.id === cur?.payload['sectionId']);
      order.push(`${sec?.kind}:${sec?.number}`);
      const at: string = cur.id;
      cur = chain.find((j) => j.dependsOnJobId === at);
    }
    expect(order.filter((o) => o.startsWith('chapter'))).toEqual(['chapter:1', 'chapter:2', 'chapter:3', 'chapter:4']);

    const eb = await buildExportBook(t.services.repos, t.owner, id, CONFIG);
    expect(eb.sections.filter((s) => s.kind === 'part' || s.kind === 'chapter').map((s) => `${s.kind}:${s.number}`)).toEqual(expected);
  });

  it('gives a book without parts the positions it stored (pack fingerprints do not change)', async () => {
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', { penName: 'Plain Author', bioThirdPerson: 'Plain Author writes plain books.' });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', {
      profileId: p.body.id,
      idea: 'x',
      title: 'Plain',
      bookTypeId: 'self-help',
      settings: { acknowledgements: 'Sam' },
    });
    await t.call('POST', `/api/v1/books/${b.body.id}/blueprints`, { chapterCount: 3 });
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${b.body.id}/blueprint/approve`, {});
    const stored = await t.services.db.selectFrom('sections').select(['id', 'position']).where('projectId', '=', b.body.id).orderBy('position').execute();
    const eb = await buildExportBook(t.services.repos, t.owner, b.body.id, CONFIG);
    const want = new Map(stored.map((r) => [r.id, r.position]));
    expect(eb.sections.map((s) => s.position)).toEqual(eb.sections.map((s) => want.get(s.id)));
    expect(eb.sections.map((s) => s.position)).toEqual([...eb.sections.map((s) => s.position)].sort((a, b) => a - b));
  });
});

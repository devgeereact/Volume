// The part-order change (parts stored in reading order, listSections and the tree putting each part before its own
// chapters) was only read, not tested, on five paths: the owner's move, the summaries and ledger fed to later writing
// calls, the write_section chain, switching a part or chapter off, and rebuild with undo. Each runs here on a new book
// (parts stored in reading order) and on an older one (every part stored first). Mock AI only, no network.
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import { writtenSections } from '../src/jobs/book-checks.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { str, testApp, type TestApp } from './helpers.js';

const CONFIG = new URL('../../../config', import.meta.url).pathname;

type Obj = Record<string, unknown>;
interface Sec {
  id: string;
  kind: string;
  number: number | null;
  title: string | null;
  enabled: boolean;
  position: number;
  partId: string | null;
  currentVersionId: string | null;
  children: Sec[];
}
interface Tree {
  front: Sec[];
  body: Sec[];
  back: Sec[];
}

class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly calls: { stage: AiStage; input: AiStageInput }[] = [];
  private readonly inner = new MockAiAdapter();
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    this.calls.push({ stage, input });
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
  /** The first writing call made for chapter n (later ones may be extend passes). */
  writing(n: number): Obj {
    const hit = this.calls.filter(
      (c) => c.stage === 'writing' && (c.input.variables['section'] as Obj)['kind'] === 'chapter' && (c.input.variables['section'] as Obj)['number'] === n,
    );
    const last = hit[0];
    if (!last) throw new Error(`No writing call for chapter ${n}.`);
    return last.input.variables;
  }
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

const titles = (v: Obj): string[] => (v['previousSummaries'] as { title: string }[]).map((s) => s.title);
const label = (s: { kind: string; number: number | null }): string => `${s.kind}:${s.number}`;

/** A four-chapter book in two parts (chapters 1 and 2, then 3 and 4), blueprint approved, not yet written. */
async function partsBook(app: TestApp, partsFirst: boolean): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: `Order Author ${Math.random()}`, bioThirdPerson: 'Order Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', {
    profileId: p.body['id'],
    idea: 'Calm mornings',
    title: 'Calm Mornings',
    bookTypeId: 'self-help',
    settings: { acknowledgements: 'Sam' },
  });
  const id = str(b.body['id']);
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 4 });
  await app.services.runner.runUntilIdle();
  const bp = await app.call<{ blueprint: { data: { chapters: Obj[] } } }>('GET', `/api/v1/books/${id}/blueprint`);
  const chapters = bp.body.blueprint.data.chapters.map((c, i) => ({ ...c, part: i < 2 ? 1 : 2 }));
  await app.call('PATCH', `/api/v1/books/${id}/blueprint`, {
    parts: {
      parts: [
        { number: 1, title: 'Foundations' },
        { number: 2, title: 'Putting it to work' },
      ],
      chapters,
    },
  });
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  if (partsFirst) {
    // The way books saved before the part-order change are stored: every part first, then the chapters.
    const all = await app.services.repos.manuscript.listSections(app.owner, id);
    let pos = 5000;
    for (const x of [...all.filter((s) => s.kind === 'part'), ...all.filter((s) => s.kind === 'chapter')]) {
      await app.services.db.updateTable('sections').set({ position: pos }).where('id', '=', x.id).execute();
      pos += 1000;
    }
  }
  return id;
}

const treeOf = async (app: TestApp, id: string): Promise<Tree> => (await app.call<Tree>('GET', `/api/v1/books/${id}/sections`)).body;
const chapterId = (tree: Tree, n: number): string => {
  const found = tree.body.flatMap((b) => (b.kind === 'part' ? b.children : [b])).find((x) => x.kind === 'chapter' && x.number === n);
  if (!found) throw new Error(`No chapter ${n}.`);
  return found.id;
};
const partId = (tree: Tree, n: number): string => {
  const found = tree.body.find((x) => x.kind === 'part' && x.number === n);
  if (!found) throw new Error(`No part ${n}.`);
  return found.id;
};
/** The body as the book reads, flat: parts and chapters in the order the tree shows them. */
const reading = (tree: Tree): string[] => tree.body.flatMap((b) => [label(b), ...b.children.map(label)]);
const flatReading = async (app: TestApp, id: string): Promise<string[]> =>
  (await app.services.repos.manuscript.listSections(app.owner, id)).filter((s) => s.area === 'body').map(label);
const READS = ['part:1', 'chapter:1', 'chapter:2', 'part:2', 'chapter:3', 'chapter:4'];

describe.each([
  ['a new book (parts stored in reading order)', false],
  ['an older book (every part stored first)', true],
])('part order on %s', (_name, partsFirst) => {
  it("(a) the owner's move: a position inside a part reorders that part, a part moves with its chapters, a bad position is refused", async () => {
    t = await testApp();
    const id = await partsBook(t, partsFirst);
    let tree = await treeOf(t, id);
    expect(reading(tree)).toEqual(READS);

    // Chapter 2 moved before chapter 1, inside Part I.
    const c1 = tree.body[0]!.children[0]!;
    const moved = await t.call<Sec>('PATCH', `/api/v1/sections/${chapterId(tree, 2)}`, { position: c1.position - 1 });
    expect(moved.status).toBe(200);
    tree = await treeOf(t, id);
    expect(reading(tree)).toEqual(['part:1', 'chapter:2', 'chapter:1', 'part:2', 'chapter:3', 'chapter:4']);
    expect(await flatReading(t, id)).toEqual(reading(tree));

    // Part II moved before Part I by position: it takes its chapters with it, and no part ends up back to back.
    const p1 = tree.body.find((x) => x.kind === 'part' && x.number === 1)!;
    const lowest = Math.min(p1.position, ...p1.children.map((c) => c.position));
    expect((await t.call('PATCH', `/api/v1/sections/${partId(tree, 2)}`, { position: lowest - 1 })).status).toBe(200);
    tree = await treeOf(t, id);
    expect(reading(tree)).toEqual(['part:2', 'chapter:3', 'chapter:4', 'part:1', 'chapter:2', 'chapter:1']);
    expect(await flatReading(t, id)).toEqual(reading(tree));

    // A chapter's part does not change with its position: chapter 4 moved to the very front still reads in Part II.
    expect((await t.call('PATCH', `/api/v1/sections/${chapterId(tree, 4)}`, { position: 1 })).status).toBe(200);
    tree = await treeOf(t, id);
    expect(tree.body.find((x) => x.number === 2)?.children.map((c) => c.number)).toEqual([4, 3]);
    expect(await flatReading(t, id)).toEqual(reading(tree));

    expect((await t.call('PATCH', `/api/v1/sections/${chapterId(tree, 1)}`, { position: -5 })).status).toBe(400);
    expect((await t.call('PATCH', `/api/v1/sections/${chapterId(tree, 1)}`, { position: 1.5 })).status).toBe(400);
  });

  it('(b) summaries and the next chapter reach later writing calls in reading order, also after a move across the part edge', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await partsBook(t, partsFirst);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    const w3 = ai.writing(3);
    const before3 = titles(w3);
    const tree0 = await treeOf(t, id);
    const name = (n: number): string => tree0.body.flatMap((b) => b.children).find((c) => c.number === n)?.title ?? '';
    expect(before3.slice(-2)).toEqual([name(1), name(2)]);
    expect(before3).not.toContain(name(3));
    expect(titles(ai.writing(4)).slice(-3)).toEqual([name(1), name(2), name(3)]);
    expect((ai.writing(2)['nextChapter'] as Obj)['title']).toBe(name(3));
    expect((ai.writing(3)['section'] as Obj)['isLast']).toBe(false);
    expect((ai.writing(4)['section'] as Obj)['isLast']).toBe(true);
    expect((ai.writing(3)['section'] as Obj)['partTitle']).toBe('Putting it to work');

    // Chapter 3 is moved by position in front of chapter 1. It still reads in Part II, so the writer must not be told
    // it comes first: chapter 4 is rewritten and still sees chapters 1, 2, 3 in that order.
    expect((await t.call('PATCH', `/api/v1/sections/${chapterId(tree0, 3)}`, { position: 1 })).status).toBe(200);
    expect(reading(await treeOf(t, id))).toEqual(READS);
    ai.calls.length = 0;
    await t.call('POST', `/api/v1/sections/${chapterId(tree0, 4)}/write`, {});
    await t.services.runner.runUntilIdle();
    expect(titles(ai.writing(4)).slice(-3)).toEqual([name(1), name(2), name(3)]);
    // The book-wide checks (repetition, dated prices, bio reuse) walk the written sections in reading order too.
    const written = (await writtenSections(t.services.repos, t.owner, id)).filter((w) => w.kind === 'chapter').map((w) => w.number);
    expect(written).toEqual([1, 2, 3, 4]);
    // Chapter 1 does not see chapter 3 as something already written before it.
    ai.calls.length = 0;
    await t.call('POST', `/api/v1/sections/${chapterId(tree0, 1)}/write`, {});
    await t.services.runner.runUntilIdle();
    expect(titles(ai.writing(1))).not.toContain(name(3));
    expect((ai.writing(1)['nextChapter'] as Obj)['title']).toBe(name(2));
  });

  it('(b) the story ledger reaches later calls in the order it was written, and the glossary and checks use reading order', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await partsBook(t, partsFirst);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const ledger = await t.call<{ items: { sectionId: string | null; key: string }[] }>('GET', `/api/v1/books/${id}/story-ledger`);
    expect(ledger.status).toBe(200);
    const tree = await treeOf(t, id);
    // Entries come back oldest first: the section that first raised an entry is one the book wrote before the later ones.
    const readingIds = tree.body.flatMap((b) => [b.id, ...b.children.map((c) => c.id)]);
    const firstSection = ledger.body.items.map((i) => i.sectionId).filter((s): s is string => s !== null);
    const positions = firstSection.map((s) => readingIds.indexOf(s)).filter((n) => n >= 0);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    // The later summaries call (chapter 4) was given the ledger the earlier chapters raised.
    const sums = ai.calls.filter(
      (c) => c.stage === 'summarise' && (c.input.variables['section'] as Obj)['number'] === 4 && (c.input.variables['section'] as Obj)['kind'] === 'chapter',
    );
    expect(sums.length).toBeGreaterThan(0);
    expect(Array.isArray(sums[0]!.input.variables['ledger'])).toBe(true);
  });

  it('(c) the write_section chain runs chapter 1, 2, 3, 4 each after the one before, and a moved chapter does not break it', async () => {
    t = await testApp();
    const id = await partsBook(t, partsFirst);
    const tree = await treeOf(t, id);
    // Move chapter 3 in front of everything by position before writing: the chain still follows the book's reading order.
    await t.call('PATCH', `/api/v1/sections/${chapterId(tree, 3)}`, { position: 1 });
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    // The first run is the write_book job, which queues the chain; stop before the chain itself runs.
    await t.services.runner.runUntilIdle(1);
    const jobs = await t.services.queue.list(t.owner, { projectId: id, kind: 'write_section', limit: 100 });
    const secs = await t.services.repos.manuscript.listSections(t.owner, id);
    const byJob = new Map(jobs.map((j) => [j.id, j]));
    const order: string[] = [];
    let cur = jobs.find((j) => j.dependsOnJobId === null);
    while (cur) {
      const sec = secs.find((x) => x.id === cur?.payload['sectionId']);
      if (sec?.kind === 'chapter') order.push(label(sec));
      const at: string = cur.id;
      cur = jobs.find((j) => j.dependsOnJobId === at);
    }
    expect(byJob.size).toBe(jobs.length);
    expect(order).toEqual(['chapter:1', 'chapter:2', 'chapter:3', 'chapter:4']);
    await t.services.runner.runUntilIdle();
    const done = await treeOf(t, id);
    expect(done.body.flatMap((b) => b.children).every((c) => c.currentVersionId !== null)).toBe(true);
  });

  it('(d) a part or a chapter switched off: it leaves the export, the writer and the next chapter, and nothing is deleted', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await partsBook(t, partsFirst);
    let tree = await treeOf(t, id);
    // There is no delete route for a section: switching off is the only removal.
    expect((await t.call('DELETE', `/api/v1/sections/${partId(tree, 2)}`)).status).toBeGreaterThanOrEqual(400);

    expect((await t.call('PATCH', `/api/v1/sections/${partId(tree, 2)}`, { enabled: false })).status).toBe(200);
    tree = await treeOf(t, id);
    // The disabled part and its chapters stay in the tree, in place.
    expect(reading(tree)).toEqual(READS);
    expect(tree.body.find((x) => x.number === 2)?.enabled).toBe(false);
    const eb = await buildExportBook(t.services.repos, t.owner, id, CONFIG);
    expect(eb.sections.filter((s) => s.kind === 'part' || s.kind === 'chapter').map(label)).toEqual([
      'part:1',
      'chapter:1',
      'chapter:2',
      'chapter:3',
      'chapter:4',
    ]);

    // Writing: no job for the part divider, and the chain still covers every chapter.
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const secs = await t.services.repos.manuscript.listSections(t.owner, id);
    expect(secs.find((s) => s.kind === 'part' && s.number === 2)?.currentVersionId).toBeNull();
    expect(secs.filter((s) => s.kind === 'chapter').every((s) => s.currentVersionId !== null)).toBe(true);

    // Switching a chapter off: the one before it becomes the last chapter, and the part switches back on cleanly.
    expect((await t.call('PATCH', `/api/v1/sections/${chapterId(tree, 4)}`, { enabled: false })).status).toBe(200);
    expect((await t.call('PATCH', `/api/v1/sections/${partId(tree, 2)}`, { enabled: true })).status).toBe(200);
    ai.calls.length = 0;
    await t.call('POST', `/api/v1/sections/${chapterId(tree, 3)}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((ai.writing(3)['section'] as Obj)['isLast']).toBe(true);
    expect(titles(ai.writing(3))).not.toContain(tree.body.flatMap((b) => b.children).find((c) => c.number === 4)?.title);
    const after = await treeOf(t, id);
    expect(reading(after)).toEqual(READS);
    expect(after.body.flatMap((b) => b.children).find((c) => c.number === 4)?.currentVersionId).not.toBeNull();
  });

  it('(e) rebuild for a new title and its undo keep reading order, text, parts and on/off state', async () => {
    t = await testApp();
    const id = await partsBook(t, partsFirst);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const before = await treeOf(t, id);
    const snapshot = (tr: Tree): string[] =>
      tr.body.flatMap((b) => [
        `${label(b)}:${b.enabled}:${b.currentVersionId}`,
        ...b.children.map((c) => `${label(c)}:${c.enabled}:${c.currentVersionId}:${c.partId === b.id}`),
      ]);
    expect(reading(before)).toEqual(READS);

    const res = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuild`, { title: 'A Calmer Title' });
    expect(res.status, JSON.stringify(res.body)).toBe(202);
    await t.services.runner.runUntilIdle();
    const job = await t.call<{ status: string }>('GET', `/api/v1/jobs/${str(res.body['jobId'])}`);
    expect(job.body.status).toBe('succeeded');

    // After the rebuild every body section is in one reading order and none is lost: switched off, not deleted.
    const mid = await treeOf(t, id);
    const midFlat = await flatReading(t, id);
    expect(midFlat).toEqual(reading(mid));
    for (const l of READS.filter((x) => x.startsWith('chapter'))) expect(midFlat).toContain(l);
    // Stored positions increase in reading order.
    const stored = await t.services.db.selectFrom('sections').select(['id', 'position']).where('projectId', '=', id).orderBy('position').execute();
    const inReading = (await t.services.repos.manuscript.listSections(t.owner, id)).map((s) => s.id);
    expect(stored.map((s) => s.id)).toEqual(inReading);
    // No two parts back to back before a chapter.
    const enabledBody = mid.body.filter((x) => x.enabled);
    for (let i = 0; i + 1 < enabledBody.length; i++)
      if (enabledBody[i]!.kind === 'part' && enabledBody[i + 1]!.kind === 'part') expect(enabledBody[i]!.children.some((c) => c.enabled)).toBe(false);

    const rebuilds = await t.call<{ rebuilds: { jobId: string }[] }>('GET', `/api/v1/books/${id}/rebuilds`);
    const undo = await t.call<Obj>('POST', `/api/v1/books/${id}/rebuilds/${str(rebuilds.body.rebuilds[0]!.jobId)}/undo`);
    expect(undo.status, JSON.stringify(undo.body)).toBe(200);
    const after = await treeOf(t, id);
    expect(reading(after)).toEqual(READS);
    expect(after.body.map((b) => `${label(b)}:${b.enabled}`)).toEqual(before.body.map((b) => `${label(b)}:${b.enabled}`));
    expect(
      after.body
        .flatMap((b) => b.children)
        .map((c) => `${label(c)}:${c.enabled}:${c.partId === after.body.find((b) => b.children.some((x) => x.id === c.id))?.id}`),
    ).toEqual(before.body.flatMap((b) => b.children).map((c) => `${label(c)}:${c.enabled}:true`));
    expect((await t.call<Obj>('GET', `/api/v1/books/${id}`)).body['title']).toBe('Calm Mornings');
    // The text is back: each chapter's current version holds the same words as before the rebuild.
    for (const n of [1, 2, 3, 4]) {
      const was = before.body.flatMap((b) => b.children).find((c) => c.number === n)!;
      const now = after.body.flatMap((b) => b.children).find((c) => c.number === n)!;
      const a = await t.call<{ current: { bodyMd: string } | null }>('GET', `/api/v1/sections/${was.id}`);
      const b = await t.call<{ current: { bodyMd: string } | null }>('GET', `/api/v1/sections/${now.id}`);
      expect(b.body.current?.bodyMd).toBe(a.body.current?.bodyMd);
    }
    void snapshot;
  });
});

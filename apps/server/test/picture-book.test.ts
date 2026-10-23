import { fileURLToPath } from 'node:url';
import { bleedPageSizeIn, parseTrimKey, wrapSizeIn } from '@volume/core';
import { loadKdpRules } from '@volume/core/node';
import { inspectPdf } from '@volume/export';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { buildApp } from '../src/app.js';
import { ensureOwner, type RequestCtx } from '../src/auth/context.js';
import type { PictureBookView, SpreadView } from '../src/jobs/picture-book.js';
import { readZip } from '../src/lib/zip.js';
import type { AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { buildCovers, HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

/**
 * Picture books (P7-5, D-044, D-045) with the mock AI: story and scene prompts, one reference picture per main
 * character, one picture per spread with the references and the book's seed, edits, one-spread regeneration, the
 * budget stop, a failed safety check, workspace isolation and roles, and resume after a restart. The acceptance test
 * at the end builds the real full-bleed PDF and pack with @volume/export (one shared Chromium).
 */

type Obj = Record<string, unknown>;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const BIO = 'Nell Ashby writes gentle bedtime stories about small animals and big feelings. She lives by the sea with a sleepy cat.';

async function pictureBook(t: TestApp, over: Obj = {}): Promise<string> {
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Nell Ashby', bioThirdPerson: BIO });
  const b = await t.call<Obj>('POST', '/api/v1/books', {
    profileId: str(p.body['id']),
    idea: 'A small rabbit learns to be brave on a walk at dusk',
    title: 'Pip and the Quiet Meadow',
    bookTypeId: 'picture-book',
    ...over,
  });
  expect(b.status).toBe(201);
  return str(b.body['id']);
}

async function view(t: TestApp, bookId: string): Promise<PictureBookView> {
  const r = await t.call<PictureBookView>('GET', `/api/v1/books/${bookId}/spreads`);
  expect(r.status).toBe(200);
  return r.body;
}

async function promptRuns(t: TestApp, bookId: string, stage: string): Promise<number> {
  const rows = await t.handle.db.selectFrom('promptRuns').select('id').where('projectId', '=', bookId).where('stage', '=', stage).execute();
  return rows.length;
}

describe('picture-book pipeline (mock AI, mock exporter)', () => {
  let t: TestApp;
  let bookId: string;
  const imageCalls: { purpose: string | undefined; refs: number; seed: number | undefined }[] = [];

  beforeAll(async () => {
    class Recording extends MockAiAdapter {
      override generateImage(prompt: string, opts: Parameters<MockAiAdapter['generateImage']>[1] = {}) {
        imageCalls.push({ purpose: opts.purpose, refs: opts.inputReferences?.length ?? 0, seed: opts.seed });
        return super.generateImage(prompt, opts);
      }
    }
    t = await testApp({ ai: new Recording() });
    bookId = await pictureBook(t);
  });
  afterAll(async () => t.close());

  it('refuses a book that is not a picture book', async () => {
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Other', bioThirdPerson: 'Other writes.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Calm mornings' });
    const id = str(b.body['id']);
    expect((await t.call('POST', `/api/v1/books/${id}/picture-book`, {})).status).toBe(409);
    expect((await t.call('GET', `/api/v1/books/${id}/spreads`)).status).toBe(409);
  });

  it('validates the start body', async () => {
    const bad = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${bookId}/picture-book`, { spreads: 40 });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
    expect((await t.call('POST', `/api/v1/books/${bookId}/picture-book`, { story: { villain: 'no' } })).status).toBe(400);
  });

  it('makes the story, scene prompts, character references and one picture per spread', async () => {
    const start = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/picture-book`, { story: { newWord: 'Brave', theme: 'courage' } });
    expect(start.status).toBe(202);
    // A second start while the first runs is refused.
    expect((await t.call('POST', `/api/v1/books/${bookId}/picture-book`, {})).status).toBe(409);
    await t.services.runner.runUntilIdle();
    const job = await t.call<Obj>('GET', `/api/v1/jobs/${start.body.jobId}`);
    expect(job.body['status']).toBe('succeeded');

    const v = await view(t, bookId);
    expect(v).toMatchObject({ trim: '8.5x8.5', ink: 'premium', pageCount: 24, plan: { pages: 24, spreads: 10, frontPages: 3, backPages: 1 } });
    const want = bleedPageSizeIn(loadKdpRules(ROOT), parseTrimKey('8.5x8.5')).value;
    expect(v.pageSizeIn).toEqual({ widthIn: want.widthIn, heightIn: want.heightIn });
    expect(v.story).toMatchObject({ newWord: 'Brave', theme: 'courage' });
    expect(v.safety).toEqual({ passed: true, notes: [] });
    expect(v.styleLine).toBeTruthy();
    expect(v.spreads.map((s) => s.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const s of v.spreads) {
      expect(s.text).toMatch(/Pip hops on/);
      expect(s.imageAssetId).toBeTruthy();
      expect(s.imageUrl).toBe(`/api/v1/assets/${s.imageAssetId ?? ''}/download?inline=1`);
      expect(s.imagePrompt).toBeTruthy();
      expect(s.characters).toEqual(['Pip']);
      expect(['text-left', 'text-right', 'text-top', 'text-bottom']).toContain(s.layout);
    }

    const chars = await t.call<{ characters: { name: string; main: boolean; referenceAssetId: string | null; referenceUrl: string | null }[] }>(
      'GET',
      `/api/v1/books/${bookId}/characters`,
    );
    expect(chars.body.characters).toHaveLength(1);
    expect(chars.body.characters[0]).toMatchObject({ name: 'Pip', main: true });
    const refId = str(chars.body.characters[0]?.referenceAssetId);
    const ref = await t.call<Obj>('GET', `/api/v1/assets/${refId}`);
    expect(ref.body).toMatchObject({ kind: 'character_reference', aiGenerated: true, projectId: bookId });

    // D-045: one reference picture first, then every spread with that reference and the same seed.
    expect(imageCalls[0]).toMatchObject({ purpose: 'character-reference', refs: 0 });
    const spreadCalls = imageCalls.filter((c) => c.purpose === 'spread');
    expect(spreadCalls).toHaveLength(10);
    expect(spreadCalls.every((c) => c.refs === 1)).toBe(true);
    expect(new Set(imageCalls.map((c) => c.seed)).size).toBe(1);
    expect(typeof imageCalls[0]?.seed).toBe('number');

    // KDP disclosure: AI wrote the text and made the pictures.
    const book = await t.call<{ aiDisclosure: Obj }>('GET', `/api/v1/books/${bookId}`);
    expect(book.body.aiDisclosure).toMatchObject({ text: 'ai_generated', images: 'ai_generated' });

    // Today's new word page comes from the story; Also by stays off (it would add a page).
    const tree = await t.call<{ front: { kind: string; enabled: boolean }[]; back: { kind: string; enabled: boolean }[] }>(
      'GET',
      `/api/v1/books/${bookId}/sections`,
    );
    expect(tree.body.front.filter((s) => s.enabled).map((s) => s.kind)).toEqual(['title_page', 'copyright', 'word_of_the_day']);
    expect(tree.body.back.filter((s) => s.enabled).map((s) => s.kind)).toEqual(['about_author']);
  });

  it('a second run resumes: nothing that exists is made again', async () => {
    const before = { story: await promptRuns(t, bookId, 'picture_story'), images: imageCalls.length };
    await t.call('POST', `/api/v1/books/${bookId}/picture-book`, {});
    await t.services.runner.runUntilIdle();
    expect(await promptRuns(t, bookId, 'picture_story')).toBe(before.story);
    expect(imageCalls.length).toBe(before.images);
  });

  it('edits a spread and refuses bad edits', async () => {
    const v = await view(t, bookId);
    const sp = v.spreads[2] as SpreadView;
    const r = await t.call<{ spread: SpreadView }>('PATCH', `/api/v1/spreads/${sp.sectionId}`, {
      text: 'Pip stood still and listened to the soft night.',
      layout: 'text-top',
      baseVersionId: sp.versionId,
    });
    expect(r.status).toBe(200);
    expect(r.body.spread).toMatchObject({ n: 3, text: 'Pip stood still and listened to the soft night.', layout: 'text-top' });
    // An edit from an old version is a conflict, never a silent overwrite.
    expect((await t.call('PATCH', `/api/v1/spreads/${sp.sectionId}`, { text: 'Old', baseVersionId: sp.versionId })).status).toBe(409);
    expect((await t.call('PATCH', `/api/v1/spreads/${sp.sectionId}`, { layout: 'diagonal' })).status).toBe(400);
    expect((await t.call('PATCH', `/api/v1/spreads/${sp.sectionId}`, {})).status).toBe(400);
    // A section that is not a spread is not found on these routes.
    const tree = await t.call<{ front: { id: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
    expect((await t.call('PATCH', `/api/v1/spreads/${str(tree.body.front[0]?.id)}`, { layout: 'text-top' })).status).toBe(404);
  });

  it('paints one spread again and leaves the others alone', async () => {
    const v = await view(t, bookId);
    const target = v.spreads[4] as SpreadView;
    const r = await t.call<{ jobId: string }>('POST', `/api/v1/spreads/${target.sectionId}/image`, {});
    expect(r.status).toBe(202);
    expect((await t.call('POST', `/api/v1/spreads/${target.sectionId}/image`, {})).status).toBe(409);
    await t.services.runner.runUntilIdle();
    const after = await view(t, bookId);
    expect(after.spreads[4]?.imageAssetId).not.toBe(target.imageAssetId);
    expect(after.spreads.filter((s, i) => i !== 4).map((s) => s.imageAssetId)).toEqual(v.spreads.filter((s, i) => i !== 4).map((s) => s.imageAssetId));
  });

  it('accepts a new picture whatever the book budget says (D-057)', async () => {
    const book = await t.call<{ costToDateUsd: number }>('GET', `/api/v1/books/${bookId}`);
    await t.call('PATCH', `/api/v1/books/${bookId}`, { budgetUsd: book.body.costToDateUsd + 0.01 });
    const v = await view(t, bookId);
    const r = await t.call('POST', `/api/v1/spreads/${str(v.spreads[0]?.sectionId)}/image`, {});
    expect(r.status).toBe(202);
    await t.services.runner.runUntilIdle();
    await t.call('PATCH', `/api/v1/books/${bookId}`, { budgetUsd: 50 });
  });

  it('exports with the mock exporter: PDF and pack recorded', async () => {
    const r = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/picture-book/export`, {});
    expect(r.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const job = await t.call<{ status: string; result: Obj }>('GET', `/api/v1/jobs/${r.body.jobId}`);
    expect(job.body.status).toBe('succeeded');
    expect(job.body.result).toMatchObject({ pageCount: 24, missingImages: [] });
    const exps = await t.call<{ items: { kind: string; status: string; trim: string }[] }>('GET', `/api/v1/books/${bookId}/exports`);
    expect(exps.body.items.filter((e) => e.status === 'done').map((e) => e.kind)).toEqual(expect.arrayContaining(['pdf_print', 'pack']));
    expect(exps.body.items.every((e) => e.trim === '8.5x8.5')).toBe(true);
  });
});

describe('a failed safety check', () => {
  it('stops at needs_attention and saves no pages or pictures', async () => {
    class Unsafe extends MockAiAdapter {
      override async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
        const r = await super.runStage(stage, input, opts);
        if (stage === 'picture_story') return { ...r, output: { ...r.output, safetyCheck: { passed: false, notes: ['A dark forest.'] } } };
        return r;
      }
    }
    const t = await testApp({ ai: new Unsafe() });
    try {
      const bookId = await pictureBook(t);
      const start = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/picture-book`, {});
      await t.services.runner.runUntilIdle();
      const job = await t.call<Obj>('GET', `/api/v1/jobs/${start.body.jobId}`);
      expect(job.body['status']).toBe('needs_attention');
      const v = await view(t, bookId);
      expect(v.safety).toEqual({ passed: false, notes: ['A dark forest.'] });
      expect(v.spreads).toEqual([]);
      expect(await promptRuns(t, bookId, 'cover_image')).toBe(0);
    } finally {
      await t.close();
    }
  });
});

describe('restart resume', () => {
  it('re-queues a spread left running by a crash and finishes the book without repeating finished steps', async () => {
    const t = await testApp();
    try {
      const bookId = await pictureBook(t);
      const start = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/picture-book`, {});
      // Parent, story and characters run; the spread jobs are now queued.
      await t.services.runner.runUntilIdle(3);
      // A crash in the middle of one spread: claimed (running, locked), never finished.
      const claimed = await t.services.queue.claim(['spread_image'], Date.now());
      expect(claimed?.kind).toBe('spread_image');
      expect(await t.services.queue.recoverStale(60_000, Date.now())).toBe(0);
      // After the restart its heartbeat is stale: the runner re-queues it and carries on.
      expect(await t.services.queue.recoverStale(1, Date.now() + 10)).toBe(1);
      await t.services.runner.runUntilIdle();
      const job = await t.call<Obj>('GET', `/api/v1/jobs/${start.body.jobId}`);
      expect(job.body['status']).toBe('succeeded');
      const v = await view(t, bookId);
      expect(v.spreads).toHaveLength(10);
      expect(v.spreads.every((s) => s.imageAssetId)).toBe(true);
      expect(await promptRuns(t, bookId, 'picture_story')).toBe(1);
      expect(await promptRuns(t, bookId, 'scene_prompts')).toBe(1);
      // One reference and ten spreads: 11 pictures, none painted twice.
      expect(await promptRuns(t, bookId, 'cover_image')).toBe(11);
    } finally {
      await t.close();
    }
  });

  it('a retried story step does not start the next step twice', async () => {
    const t = await testApp();
    try {
      const bookId = await pictureBook(t);
      await t.call('POST', `/api/v1/books/${bookId}/picture-book`, {});
      await t.services.runner.runUntilIdle(2); // parent, story
      const story = (await t.services.queue.list(t.owner, { projectId: bookId })).find((j) => j.kind === 'picture_story');
      // The story job runs again (as after a crash just before it was marked done).
      await t.handle.db.updateTable('jobs').set({ status: 'queued', lockToken: null }).where('id', '=', str(story?.id)).execute();
      await t.services.runner.runUntilIdle();
      const jobs = await t.services.queue.list(t.owner, { projectId: bookId, limit: 500 });
      expect(jobs.filter((j) => j.kind === 'picture_characters')).toHaveLength(1);
      expect(jobs.filter((j) => j.kind === 'spread_image')).toHaveLength(10);
      expect(await promptRuns(t, bookId, 'picture_story')).toBe(1);
    } finally {
      await t.close();
    }
  });
});

describe('isolation and roles', () => {
  let t: TestApp;
  let bookId: string;
  let sectionId: string;

  /** Calls as `ctx`; for another workspace (`foreign`), a successful answer must not hold the book's text. */
  async function as(
    ctx: RequestCtx,
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    body?: unknown,
    foreign = ctx.workspaceId !== t.owner.workspaceId,
  ): Promise<number> {
    const built = await buildApp({
      config: t.services.config,
      handle: t.handle,
      startJobs: false,
      logger: false,
      auth: () => ({ resolve: () => Promise.resolve(ctx) }),
    });
    await built.app.ready();
    try {
      const res = await built.app.inject({
        method,
        url,
        headers: body === undefined ? { host: HOST } : { host: HOST, 'content-type': 'application/json', origin: ORIGIN },
        ...(body === undefined ? {} : { payload: JSON.stringify(body) }),
      });
      if (foreign && res.statusCode < 400) expect(res.body).not.toContain('Pip hops on');
      return res.statusCode;
    } finally {
      await built.app.close();
    }
  }

  beforeAll(async () => {
    t = await testApp();
    bookId = await pictureBook(t);
    await t.call('POST', `/api/v1/books/${bookId}/picture-book`, {});
    await t.services.runner.runUntilIdle();
    sectionId = str((await view(t, bookId)).spreads[0]?.sectionId);
  });
  afterAll(async () => t.close());

  it("keeps another workspace out of a picture book's spreads, characters and jobs", async () => {
    const b = await ensureOwner(t.handle.db, 'publisher-b', 'Publisher B');
    expect(await as(b, 'GET', `/api/v1/books/${bookId}/spreads`)).toBe(404);
    expect(await as(b, 'GET', `/api/v1/books/${bookId}/characters`)).toBe(404);
    expect(await as(b, 'POST', `/api/v1/books/${bookId}/picture-book`, {})).toBe(404);
    expect(await as(b, 'POST', `/api/v1/books/${bookId}/picture-book/export`, {})).toBe(404);
    expect(await as(b, 'PATCH', `/api/v1/spreads/${sectionId}`, { text: 'Taken over' })).toBe(404);
    expect(await as(b, 'POST', `/api/v1/spreads/${sectionId}/image`, {})).toBe(404);
    expect((await view(t, bookId)).spreads[0]?.text).toMatch(/Pip hops on/);
  });

  it('lets a viewer read but not change, and an editor change', async () => {
    const viewer: RequestCtx = { ...t.owner, role: 'viewer' };
    const editor: RequestCtx = { ...t.owner, role: 'editor' };
    const read = async (ctx: RequestCtx) => {
      const built = await buildApp({
        config: t.services.config,
        handle: t.handle,
        startJobs: false,
        logger: false,
        auth: () => ({ resolve: () => Promise.resolve(ctx) }),
      });
      await built.app.ready();
      const res = await built.app.inject({ method: 'GET', url: `/api/v1/books/${bookId}/spreads`, headers: { host: HOST } });
      await built.app.close();
      return res.statusCode;
    };
    expect(await read(viewer)).toBe(200);
    expect(await as(viewer, 'PATCH', `/api/v1/spreads/${sectionId}`, { layout: 'text-right' })).toBe(403);
    expect(await as(viewer, 'POST', `/api/v1/spreads/${sectionId}/image`, {})).toBe(403);
    expect(await as(viewer, 'POST', `/api/v1/books/${bookId}/picture-book`, {})).toBe(403);
    expect(await as(viewer, 'POST', `/api/v1/books/${bookId}/picture-book/export`, {})).toBe(403);
    expect(await as(editor, 'PATCH', `/api/v1/spreads/${sectionId}`, { layout: 'text-right' })).toBe(200);
  });
});

describe('acceptance: a 24-page picture book with the real exporter', () => {
  let t: TestApp;
  const exporter = new VolumeExportAdapter({ root: ROOT, now: () => new Date(Date.UTC(2026, 9, 17, 12)) });

  beforeAll(async () => {
    t = await testApp({ exporter });
  });
  afterAll(async () => {
    await t.close();
  });

  it('exports with the bleed size from the rules, a picture on every spread, text in the safe area and images disclosed', async () => {
    const bookId = await pictureBook(t);
    await t.call('POST', `/api/v1/books/${bookId}/picture-book`, {});
    await t.services.runner.runUntilIdle();
    // No seeding: the picture_story step writes the listing through blueprint_part (part listing), as for other templates.
    const bp = await t.services.repos.planning.latestBlueprint(t.owner, bookId);
    expect((bp?.data['keywords'] as unknown[] | undefined)?.length).toBe(7);
    expect(bp?.data['description_draft']).toEqual(expect.any(String));
    expect(bp?.data['description_draft']).not.toBe('');
    await buildCovers(t, bookId);

    const r = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/picture-book/export`, {});
    await t.services.runner.runUntilIdle();
    const job = await t.call<{ status: string; error: string | null; result: Obj & { preflight: Obj } }>('GET', `/api/v1/jobs/${r.body.jobId}`);
    const blocks = ((job.body.result?.preflight as { items?: { severity: string; message: string }[] } | undefined)?.items ?? []).filter(
      (i) => i.severity === 'block',
    );
    expect(blocks.map((i) => i.message)).toEqual([]);
    expect(job.body.error).toBeNull();
    expect(job.body.status).toBe('succeeded');
    expect(job.body.result).toMatchObject({ pageCount: 24, missingImages: [], safeAreaFindings: [] });

    const exps = await t.call<{
      items: { kind: string; status: string; assetId: string; preflight: { items: { id: string; severity: string; message: string }[] } }[];
    }>('GET', `/api/v1/books/${bookId}/exports`);
    const pdf = exps.body.items.find((e) => e.kind === 'pdf_print' && e.status === 'done');
    const pack = exps.body.items.find((e) => e.kind === 'pack' && e.status === 'done');
    expect(pdf && pack).toBeTruthy();

    // The PDF: 24 pages, each exactly trim plus bleed from config/kdp-rules (rule print.bleed).
    const { data } = await t.services.blobs.read(t.owner, str(pdf?.assetId));
    const info = await inspectPdf(data, { text: false });
    const want = bleedPageSizeIn(loadKdpRules(ROOT), parseTrimKey('8.5x8.5')).value;
    expect(info.pageCount).toBe(24);
    expect(info.pageSizes).toHaveLength(1);
    expect(info.pageSizes[0]?.widthPt).toBeCloseTo(want.widthIn * 72, 1);
    expect(info.pageSizes[0]?.heightPt).toBeCloseTo(want.heightIn * 72, 1);

    const items = Object.fromEntries((pdf?.preflight.items ?? []).map((i) => [i.id, i]));
    for (const id of ['interior.bleed', 'picture.spread-images', 'picture.safe-area', 'kdp.ai-disclosure'])
      expect(items[id]?.severity, `${id}: ${items[id]?.message ?? 'missing'}`).toBe('pass');
    // The wrap spine uses the premium colour rule (paperback.spine.widthPerPage.colour), not the white-paper one.
    expect(items['wrap.size']?.severity, items['wrap.size']?.message).toBe('pass');
    expect(items['wrap.size']?.message).toMatch(/premium colour/);
    const cover = await t.services.repos.production.getCover(t.owner, bookId);
    expect(cover?.wrapSpec).toMatchObject({ pages: 24, ink: 'premium' });
    const wrapInfo = await inspectPdf((await t.services.blobs.read(t.owner, str(cover?.wrapAssetId))).data, { text: false });
    const rules = loadKdpRules(ROOT);
    const colourWrap = wrapSizeIn(rules, { trim: parseTrimKey('8.5x8.5'), pages: 24, paper: 'white', ink: 'premium' });
    const whiteWrap = wrapSizeIn(rules, { trim: parseTrimKey('8.5x8.5'), pages: 24, paper: 'white' });
    expect(wrapInfo.pageSizes[0]?.widthPt).toBeCloseTo(colourWrap.widthIn * 72, 1);
    expect(Math.abs((wrapInfo.pageSizes[0]?.widthPt ?? 0) - whiteWrap.widthIn * 72)).toBeGreaterThan(0.1);

    // In range; it warns while the colour paper rule is only partly verified (config/kdp-rules), never blocks.
    expect(items['picture.page-count']?.severity).not.toBe('block');
    expect(items['picture.page-count']?.message).toMatch(/24 pages/);

    // The pack: print PDF only (no EPUB or DOCX), and the disclosure note covers the spread pictures.
    const zip = readZip((await t.services.blobs.read(t.owner, str(pack?.assetId))).data);
    const names = zip.map((e) => e.name);
    expect(names.some((n) => n.endsWith('.pdf') && n.includes('interior'))).toBe(true);
    expect(names.some((n) => n.endsWith('.epub') || n.endsWith('.docx'))).toBe(false);
    const note = Buffer.from(zip.find((e) => e.name === 'listing/ai-disclosure.txt')?.data ?? new Uint8Array()).toString('utf8');
    expect(note).toMatch(/spread pictures/i);
  }, 180_000);
});

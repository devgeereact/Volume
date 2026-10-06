import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { anyBoolean, anyString, HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

interface Obj {
  [k: string]: unknown;
}

let t: TestApp;
beforeEach(async () => {
  t = await testApp();
});
afterEach(async () => {
  await t.close();
});

async function makeBook(): Promise<{ profileId: string; bookId: string }> {
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  expect(p.status).toBe(201);
  const b = await t.call<Obj>('POST', '/api/v1/books', {
    profileId: p.body['id'],
    idea: 'Calm mornings',
    title: 'Calm Mornings',
    settings: { acknowledgements: 'Sam' },
  });
  expect(b.status).toBe(201);
  return { profileId: p.body['id'] as string, bookId: b.body['id'] as string };
}

async function blueprintApproved(bookId: string): Promise<void> {
  const job = await t.call<Obj>('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  expect(job.status).toBe(202);
  await t.services.runner.runUntilIdle();
  const done = await t.call<Obj>('GET', `/api/v1/jobs/${str(job.body['jobId'])}`);
  expect(done.body['status']).toBe('succeeded');
  const approve = await t.call<Obj>('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  expect(approve.status).toBe(200);
}

describe('API guards and shape', () => {
  it('serves health and refuses other hosts and foreign origins', async () => {
    const h = await t.call<Obj>('GET', '/api/v1/health');
    expect(h.status).toBe(200);
    expect(h.body['status']).toBe('ok');
    expect(h.headers['access-control-allow-origin']).toBeUndefined();

    const badHost = await t.app.inject({ method: 'GET', url: '/api/v1/health', headers: { host: 'evil.example:5181' } });
    expect(badHost.statusCode).toBe(421);
    expect(JSON.parse(badHost.body)).toEqual({ error: { code: 'bad_host', message: anyString } });

    const badOrigin = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'X' }, { origin: 'https://evil.example' });
    expect(badOrigin.status).toBe(403);
    expect((badOrigin.body['error'] as Obj)['code']).toBe('bad_origin');

    const form = await t.app.inject({
      method: 'POST',
      url: '/api/v1/profiles',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'text/plain' },
      payload: 'penName=X',
    });
    expect(form.statusCode).toBe(415);

    const missing = await t.call<Obj>('GET', '/api/v1/books/NOPE');
    expect(missing.status).toBe(404);
    expect((missing.body['error'] as Obj)['code']).toBe('not_found');

    const invalid = await t.call<Obj>('POST', '/api/v1/profiles', { penName: '' });
    expect(invalid.status).toBe(400);
    expect((invalid.body['error'] as Obj)['code']).toBe('validation_failed');
    expect(Array.isArray((invalid.body['error'] as Obj)['details'])).toBe(true);
  });

  it('reports key presence without the value, and model defaults', async () => {
    const s = await t.call<Obj>('GET', '/api/v1/settings');
    expect(s.status).toBe(200);
    expect(s.body['openRouterKey']).toEqual({ present: anyBoolean });
    expect(s.raw).not.toMatch(/sk-or-/);
    const m = await t.call<{ stages: { stage: string; effectiveModel: string }[] }>('GET', '/api/v1/settings/models');
    expect(m.body.stages.map((x) => x.stage)).toContain('writing');
    const put = await t.call<Obj>('PUT', '/api/v1/settings/models', { stages: { writing: { model: 'test/model' } } });
    expect(put.status).toBe(200);
    const m2 = await t.call<{ stages: { stage: string; effectiveModel: string }[] }>('GET', '/api/v1/settings/models');
    expect(m2.body.stages.find((x) => x.stage === 'writing')?.effectiveModel).toBe('test/model');
    const bt = await t.call<{ available: boolean; items: unknown[] }>('GET', '/api/v1/book-types');
    expect(bt.status).toBe(200);
    expect(typeof bt.body.available).toBe('boolean');
  });
});

describe('profiles and books', () => {
  it('runs profile CRUD with samples and memory', async () => {
    const created = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Ada', voice: { tone: ['warm'] }, isRealPerson: true });
    const id = created.body['id'] as string;
    expect(created.body['illustrativeLineDefault']).toBe(true);
    expect((await t.call<Obj>('PATCH', `/api/v1/profiles/${id}`, { shortBio: 'Ada writes.' })).body['shortBio']).toBe('Ada writes.');
    expect((await t.call<Obj>('POST', `/api/v1/profiles/${id}/samples`, { kind: 'sounds_like', text: 'One two three.' })).body['wordCount']).toBe(3);
    const mem = await t.call<Obj>('POST', `/api/v1/profiles/${id}/memory`, { kind: 'avoid_phrase', content: 'at the end of the day' });
    expect((await t.call<Obj>('PATCH', `/api/v1/profiles/${id}/memory/${str(mem.body['id'])}`, { active: false })).body['active']).toBe(false);
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/profiles')).body.items).toHaveLength(1);
    await t.call('POST', `/api/v1/profiles/${id}/archive`, {});
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/profiles')).body.items).toHaveLength(0);
    expect((await t.call<Obj>('POST', `/api/v1/profiles/${id}/restore`, {})).body['status']).toBe('active');
  });

  it('lists, filters, publishes, archives, restores and duplicates books', async () => {
    const { profileId, bookId } = await makeBook();
    expect((await t.call<Obj>('PATCH', `/api/v1/books/${bookId}`, { trim: '5x8', budgetUsd: 3 })).body['trim']).toBe('5x8');
    expect((await t.call<{ items: unknown[] }>('GET', `/api/v1/books?profileId=${profileId}`)).body.items).toHaveLength(1);
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/books?stage=idea')).body.items).toHaveLength(1);
    expect((await t.call<Obj>('POST', `/api/v1/books/${bookId}/publish`, {})).body['status']).toBe('published');
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/books?published=true')).body.items).toHaveLength(1);
    await t.call('POST', `/api/v1/books/${bookId}/archive`, {});
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/books')).body.items).toHaveLength(0);
    expect((await t.call<Obj>('POST', `/api/v1/books/${bookId}/restore`, {})).body['status']).toBe('published');
    const copy = await t.call<Obj>('POST', `/api/v1/books/${bookId}/duplicate`, {});
    expect(copy.status).toBe(201);
    expect(copy.body['title']).toBe('Copy of Calm Mornings');
    expect(copy.body['status']).toBe('active');
  });

  it('hides one workspace from another through the API', async () => {
    const other = await ensureOwner(t.handle.db, 'second', 'Second');
    const { bookId } = await makeBook();
    // A second app on the same database whose auth provider resolves to the second workspace.
    const { buildApp } = await import('../src/app.js');
    const { app } = await buildApp({
      config: t.services.config,
      handle: t.handle,
      startJobs: false,
      logger: false,
      auth: () => ({ resolve: () => Promise.resolve(other) }),
    });
    const res = await app.inject({ method: 'GET', url: `/api/v1/books/${bookId}`, headers: { host: HOST } });
    expect(res.statusCode).toBe(404);
    const list = await app.inject({ method: 'GET', url: '/api/v1/books', headers: { host: HOST } });
    expect((JSON.parse(list.body) as { items: unknown[] }).items).toHaveLength(0);
    await app.close();
  });
});

describe('book flow with the mock AI', () => {
  it('researches, picks a title, builds, edits, regenerates and approves the blueprint', async () => {
    const { bookId } = await makeBook();
    const r = await t.call<Obj>('POST', `/api/v1/books/${bookId}/research`, {});
    expect(r.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const research = await t.call<{ latest: { status: string; sources: { id: string }[] } }>('GET', `/api/v1/books/${bookId}/research`);
    expect(research.body.latest.status).toBe('done');
    expect(research.body.latest.sources.length).toBeGreaterThan(0);
    const src = research.body.latest.sources[0]!.id;
    expect((await t.call<Obj>('PATCH', `/api/v1/research-sources/${src}`, { useInBook: true })).body['useInBook']).toBe(true);

    await t.call('POST', `/api/v1/books/${bookId}/title-sets`, {});
    await t.services.runner.runUntilIdle();
    const sets = await t.call<{ items: { id: string; options: unknown[] }[] }>('GET', `/api/v1/books/${bookId}/title-sets`);
    expect(sets.body.items[0]!.options).toHaveLength(10);
    const chosen = await t.call<{ book: Obj }>('POST', `/api/v1/title-sets/${sets.body.items[0]!.id}/choose`, { index: 2 });
    expect(chosen.body.book['title']).toMatch(/Option 3/);

    await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    const bp = await t.call<{ blueprint: { version: number; data: Obj }; validation: { ok: boolean } }>('GET', `/api/v1/books/${bookId}/blueprint`);
    expect(bp.body.blueprint.version).toBe(1);
    expect(bp.body.validation.ok).toBe(true);

    const edited = await t.call<Obj>('PATCH', `/api/v1/books/${bookId}/blueprint`, { parts: { summary: 'Owner summary.' }, baseVersion: 1 });
    expect(edited.body['version']).toBe(2);
    const conflict = await t.call<Obj>('PATCH', `/api/v1/books/${bookId}/blueprint`, { parts: { summary: 'x' }, baseVersion: 1 });
    expect(conflict.status).toBe(409);

    const regen = await t.call<Obj>('POST', `/api/v1/books/${bookId}/blueprint/regenerate`, { part: 'chapter:2', instruction: 'Shorter' });
    expect(regen.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const versions = await t.call<{ items: { version: number; source: string }[] }>('GET', `/api/v1/books/${bookId}/blueprint/versions`);
    expect(versions.body.items.map((v) => v.version)).toEqual([3, 2, 1]);
    expect(versions.body.items[0]!.source).toBe('ai:blueprint_part');

    const approve = await t.call<{ blueprint: Obj; sections: { created: number }; book: Obj }>('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
    expect(approve.status).toBe(200);
    expect(approve.body.blueprint['status']).toBe('approved');
    expect(approve.body.sections.created).toBeGreaterThan(5);
    expect(approve.body.book['stage']).toBe('writing');
    const tree = await t.call<{ body: { kind: string }[]; front: unknown[]; back: unknown[] }>('GET', `/api/v1/books/${bookId}/sections`);
    expect(tree.body.body.filter((s) => s.kind === 'chapter')).toHaveLength(2);
  });

  it('saves section versions, detects conflicts, restores and diffs', async () => {
    const { bookId } = await makeBook();
    await blueprintApproved(bookId);
    const tree = await t.call<{ body: { id: string; kind: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
    const sectionId = tree.body.body.find((s) => s.kind === 'chapter')!.id;

    const v1 = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/versions`, { bodyMd: '# One\n\nFirst draft line.', baseVersionId: null });
    expect(v1.status).toBe(201);
    expect(v1.body['version']).toBe(1);
    expect(v1.body['source']).toBe('human');
    const v2 = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/versions`, {
      bodyMd: '# One\n\nSecond draft line.\n\nNew paragraph.',
      baseVersionId: v1.body['id'],
    });
    expect(v2.body['version']).toBe(2);
    const stale = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/versions`, { bodyMd: 'x', baseVersionId: v1.body['id'] });
    expect(stale.status).toBe(409);
    expect((stale.body['error'] as Obj)['code']).toBe('conflict');

    const list = await t.call<{ items: { version: number }[] }>('GET', `/api/v1/sections/${sectionId}/versions`);
    expect(list.body.items.map((v) => v.version)).toEqual([2, 1]);

    const diff = await t.call<{ lines: { op: string; text: string }[] }>('GET', `/api/v1/sections/${sectionId}/diff?from=${str(v1.body['id'])}`);
    expect(diff.body.lines.some((l) => l.op === 'add' && l.text === 'New paragraph.')).toBe(true);
    expect(diff.body.lines.some((l) => l.op === 'remove' && l.text === 'First draft line.')).toBe(true);

    const restored = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/versions/${str(v1.body['id'])}/restore`, {});
    expect(restored.status).toBe(201);
    expect(restored.body['version']).toBe(3);
    expect(restored.body['source']).toBe('restore');
    expect(restored.body['bodyMd']).toBe('# One\n\nFirst draft line.');
    const sec = await t.call<{ current: Obj }>('GET', `/api/v1/sections/${sectionId}`);
    expect(sec.body.current['id']).toBe(restored.body['id']);
  });

  it('weaves author notes into the text with the stub AI', async () => {
    const { bookId } = await makeBook();
    await blueprintApproved(bookId);
    const tree = await t.call<{ body: { id: string; kind: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
    const sectionId = tree.body.body.find((s) => s.kind === 'chapter')!.id;
    await t.call('POST', `/api/v1/sections/${sectionId}/versions`, { bodyMd: '# One\n\nPara one.\n\nPara two.' });
    const n1 = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/notes`, { note: 'Mention the walk by the canal.', position: 5 });
    expect(n1.status).toBe(201);
    expect(n1.body['status']).toBe('open');
    await t.call('POST', `/api/v1/sections/${sectionId}/notes`, { note: 'Add a gentle reminder to breathe.' });

    const weave = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/notes/weave`, {});
    expect(weave.status).toBe(202);
    expect((await t.call<{ items: { status: string }[] }>('GET', `/api/v1/sections/${sectionId}/notes`)).body.items.every((n) => n.status === 'queued')).toBe(
      true,
    );
    await t.services.runner.runUntilIdle();
    const job = await t.call<Obj>('GET', `/api/v1/jobs/${str(weave.body['jobId'])}`);
    expect(job.body['status']).toBe('succeeded');

    const sec = await t.call<{ current: { bodyMd: string; source: string; version: number } }>('GET', `/api/v1/sections/${sectionId}`);
    expect(sec.body.current.source).toBe('ai:weave');
    expect(sec.body.current.version).toBe(2);
    expect(sec.body.current.bodyMd).toContain('canal');
    expect(sec.body.current.bodyMd).toContain('breathe');
    const notes = await t.call<{ items: { status: string; wovenVersionId: string }[] }>('GET', `/api/v1/sections/${sectionId}/notes`);
    expect(notes.body.items.every((n) => n.status === 'woven' && n.wovenVersionId)).toBe(true);
    const book = await t.call<Obj>('GET', `/api/v1/books/${bookId}`);
    expect((book.body['aiDisclosure'] as Obj)['text']).toBe('ai_generated');
    expect(book.body['costToDateUsd']).toBeGreaterThan(0);
    const again = await t.call<Obj>('POST', `/api/v1/sections/${sectionId}/notes/weave`, {});
    expect(again.status).toBe(409);
  });

  it('writes the book, then handles suggestions, claims, covers, exports and marketing', async () => {
    const { bookId } = await makeBook();
    await blueprintApproved(bookId);
    const write = await t.call<Obj>('POST', `/api/v1/books/${bookId}/write`, {});
    expect(write.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const parent = await t.call<{ status: string; children: { status: string }[] }>('GET', `/api/v1/jobs/${str(write.body['jobId'])}`);
    expect(parent.body.status).toBe('succeeded');
    expect(parent.body.children.length).toBeGreaterThanOrEqual(4);
    const tree = await t.call<{ totals: { done: number; words: number }; body: { id: string; kind: string; status: string }[] }>(
      'GET',
      `/api/v1/books/${bookId}/sections`,
    );
    expect(tree.body.body.every((s) => s.status === 'done')).toBe(true);
    expect(tree.body.totals.words).toBeGreaterThan(0);
    const chapterId = tree.body.body[0]!.id;

    // Edit pass and suggestions
    await t.call('POST', `/api/v1/sections/${chapterId}/edit-pass`, { pass: 'line' });
    await t.services.runner.runUntilIdle();
    const all = await t.call<{ items: { id: string; pass: string }[] }>('GET', `/api/v1/sections/${chapterId}/suggestions?status=open`);
    // The line edit's suggestion; the book-level repetition check also suggests cuts where the mock text repeats.
    const sugs = { body: { items: all.body.items.filter((i) => i.pass === 'line') } };
    expect(sugs.body.items).toHaveLength(1);
    const acc = await t.call<{ suggestion: Obj; version: Obj; memory: Obj }>('POST', `/api/v1/suggestions/${sugs.body.items[0]!.id}/accept`, {
      remember: true,
    });
    expect(acc.status).toBe(200);
    expect(acc.body.suggestion['status']).toBe('accepted');
    expect(String(acc.body.version['bodyMd'])).toContain('(tightened)');
    expect(acc.body.memory['origin']).toBe('accepted_edit');

    // Claims
    const claims = await t.call<{ items: { id: string }[] }>('GET', `/api/v1/books/${bookId}/claims?status=open`);
    expect(claims.body.items.length).toBeGreaterThan(0);
    const [c1, c2] = claims.body.items;
    expect((await t.call<{ claim: Obj }>('POST', `/api/v1/claims/${c1!.id}/verify`, { sourceUrl: 'https://example.org/a' })).body.claim['status']).toBe(
      'verified',
    );
    if (c2)
      expect(
        (await t.call<{ claim: Obj }>('POST', `/api/v1/claims/${c2.id}/soften`, { replacement: 'Many people find this helps.' })).body.claim['status'],
      ).toBe('softened');

    // Covers
    const concepts = await t.call<Obj>('POST', `/api/v1/books/${bookId}/cover/concepts`, {});
    expect(concepts.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${bookId}/cover`);
    expect(cover.body.cover.concepts).toHaveLength(3);
    const assetId = cover.body.cover.concepts[0]!.assetId;
    const img = await t.app.inject({ method: 'GET', url: `/api/v1/assets/${assetId}/download`, headers: { host: HOST } });
    expect(img.statusCode).toBe(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect(img.headers['x-content-type-options']).toBe('nosniff');
    await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId });
    await t.call('POST', `/api/v1/books/${bookId}/cover/build`, {});
    await t.services.runner.runUntilIdle();
    const built = await t.call<{ cover: { status: string; ebookAssetId: string } }>('GET', `/api/v1/books/${bookId}/cover`);
    expect(built.body.cover.status).toBe('final');

    // Exports
    const pre = await t.call<{ ok: boolean; mock: boolean }>('GET', `/api/v1/books/${bookId}/preflight`);
    expect(pre.body.ok).toBe(true);
    expect(pre.body.mock).toBe(true);
    await t.call('POST', `/api/v1/books/${bookId}/exports`, {});
    await t.services.runner.runUntilIdle();
    const exps = await t.call<{ items: { id: string; kind: string; stale: boolean; mock: boolean }[] }>('GET', `/api/v1/books/${bookId}/exports`);
    expect(exps.body.items.map((e) => e.kind).sort()).toEqual(['docx', 'epub', 'md', 'pack', 'pdf_print', 'txt']);
    const md = exps.body.items.find((e) => e.kind === 'md')!;
    const dl = await t.app.inject({ method: 'GET', url: `/api/v1/exports/${md.id}/download`, headers: { host: HOST } });
    expect(dl.statusCode).toBe(200);
    expect(dl.body).toContain('MOCK EXPORT');
    expect(dl.body).toContain('Test Author writes plain books.'); // About the author is the bio verbatim

    // Marketing
    await t.call('POST', `/api/v1/books/${bookId}/marketing`, {});
    await t.services.runner.runUntilIdle();
    const mk = await t.call<{ items: { id: string; kind: string }[] }>('GET', `/api/v1/books/${bookId}/marketing`);
    expect(mk.body.items.map((i) => i.kind).sort()).toEqual(['instagram_caption', 'launch_email', 'tiktok_script']);
    expect((await t.call<Obj>('PATCH', `/api/v1/marketing/${mk.body.items[0]!.id}`, { status: 'used' })).body['status']).toBe('used');
    await t.call('POST', `/api/v1/marketing/${mk.body.items[0]!.id}/archive`, {});
    expect((await t.call<{ items: unknown[] }>('GET', `/api/v1/books/${bookId}/marketing`)).body.items).toHaveLength(2);

    // Jobs list and cost
    const jobs = await t.call<{ items: unknown[] }>('GET', `/api/v1/books/${bookId}/jobs`);
    expect(jobs.body.items.length).toBeGreaterThan(5);
    const costs = await t.call<{ costToDateUsd: number; runs: unknown[] }>('GET', `/api/v1/books/${bookId}/costs`);
    expect(costs.body.runs.length).toBeGreaterThan(0);
  });

  it('uploads and downloads a file through the API', async () => {
    const payload = Buffer.from('# Imported\n\nHello.\n');
    const up = await t.app.inject({
      method: 'POST',
      url: '/api/v1/assets?kind=import&filename=chapter.md',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'text/markdown' },
      payload,
    });
    expect(up.statusCode).toBe(201);
    const meta = JSON.parse(up.body) as { bytes: number; id: string };
    expect(meta.bytes).toBe(payload.length);
    const dl = await t.app.inject({ method: 'GET', url: `/api/v1/assets/${meta.id}/download`, headers: { host: HOST } });
    expect(dl.body).toBe(payload.toString());
    expect(dl.headers['content-disposition']).toMatch(/^attachment/);
    const bad = await t.app.inject({
      method: 'POST',
      url: '/api/v1/assets?kind=import&filename=x.exe',
      headers: { host: HOST, 'content-type': 'application/octet-stream' },
      payload: Buffer.from('x'),
    });
    expect(bad.statusCode).toBe(415);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { selectAiAdapter } from '../src/adapters/openrouter-ai.js';
import { parentFailure } from '../src/jobs/queue.js';
import { readZip, writeZip } from '../src/lib/zip.js';
import { AiModelUnavailableError, type AiPort, type AiStage, type AiStageInput, type AiStageResult, type RunStageOptions } from '../src/ports/ai.js';
import { anyNumber, anyString, HOST, ORIGIN, testApp, testConfig, type TestApp } from './helpers.js';

// Round 3: a stuck write job, live text restarts, the mock stream delay, writtenBy, estimates, title favourites,
// the running job on book rows, house style and KDP rules in settings, and moving a project. No network.

interface Obj {
  [k: string]: unknown;
}

/** The mock AI, failing the writing stage for chapter `failChapter` while it is set. */
class FlakyAi implements AiPort {
  readonly provider = 'mock' as const;
  failChapter: number | null = null;
  private readonly inner = new MockAiAdapter();
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    const sec = input.variables['section'] as Obj | undefined;
    if (stage === 'writing' && this.failChapter !== null && sec?.['kind'] === 'chapter' && sec['number'] === this.failChapter) {
      throw new AiModelUnavailableError('That model is gone.', 'gone/model');
    }
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (p, o) => this.inner.generateImage(p, o);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
}

let t: TestApp | null = null;
const extra: TestApp[] = [];
afterEach(async () => {
  await t?.close();
  t = null;
  for (const a of extra.splice(0)) await a.close();
});

async function approvedBook(app: TestApp, chapters = 3): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const id = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: chapters });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  return id;
}

interface JobView {
  status: string;
  error: string | null;
  errorCode: string | null;
  children: { id: string; status: string; error: string | null }[];
}

describe('1. a failed section no longer leaves the write job stuck', () => {
  it('cancels the sections after it, ends the parent with a plain summary, then a retry and "write the rest" finish the book', async () => {
    const ai = new FlakyAi();
    ai.failChapter = 1;
    t = await testApp({ ai });
    const id = await approvedBook(t, 3);
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const job = await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`);
    expect(job.body.status).toBe('failed');
    expect(job.body.errorCode).toBe('child_failed');
    const failed = job.body.children.filter((c) => c.status === 'failed');
    const cancelled = job.body.children.filter((c) => c.status === 'cancelled');
    expect(failed).toHaveLength(1);
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled.every((c) => c.error === 'Not started: an earlier section failed.')).toBe(true);
    expect(job.body.error).toBe(parentFailure('write_book', 1, cancelled.length, job.body.children.length));
    expect(job.body.error).toMatch(
      /^1 of \d+ sections failed\. \d+ sections? after it (was|were) not started\. Retry the failed section, then write the rest\.$/,
    );
    expect(job.body.children.some((c) => c.status === 'queued')).toBe(false);

    // Sections are not left showing as queued or writing.
    const tree = await t.call<{ body: { id: string; kind: string; number: number | null; status: string }[] }>('GET', `/api/v1/books/${id}/sections`);
    const ch1 = tree.body.body.find((x) => x.kind === 'chapter' && x.number === 1)!;
    expect(ch1.status).toBe('empty');
    expect(tree.body.body.some((x) => x.status === 'queued' || x.status === 'writing')).toBe(false);

    // Retry the failed section, then write the rest: only the sections not done are queued.
    ai.failChapter = null;
    const retry = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${ch1.id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call<JobView>('GET', `/api/v1/jobs/${retry.body.jobId}`)).body.status).toBe('succeeded');
    const rest = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const restJob = await t.call<JobView & { result: { sections: number } }>('GET', `/api/v1/jobs/${rest.body.jobId}`);
    expect(restJob.body.status).toBe('succeeded');
    expect(restJob.body.children).toHaveLength(cancelled.length);
    const after = await t.call<{ front: Obj[]; body: Obj[]; back: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
    const written = [...after.body.front, ...after.body.body, ...after.body.back].filter(
      (x) => x['enabled'] && x['writtenBy'] !== 'app' && x['kind'] !== 'part',
    );
    expect(written.every((x) => x['status'] === 'done' || x['status'] === 'needs_attention')).toBe(true);
  });

  it('writes the failed and the cancelled sections when the book is written again', async () => {
    const ai = new FlakyAi();
    ai.failChapter = 2;
    t = await testApp({ ai });
    const id = await approvedBook(t, 3);
    const first = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const j1 = await t.call<JobView>('GET', `/api/v1/jobs/${first.body.jobId}`);
    const notDone = j1.body.children.filter((c) => c.status !== 'succeeded' && c.status !== 'needs_attention').length;
    ai.failChapter = null;
    const again = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const j2 = await t.call<JobView>('GET', `/api/v1/jobs/${again.body.jobId}`);
    expect(j2.body.status).toBe('succeeded');
    expect(j2.body.children).toHaveLength(notDone);
  });

  it('cancelling a queued section cancels the ones that depend on it', async () => {
    t = await testApp();
    const id = await approvedBook(t, 3);
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle(1); // the parent only: children are queued
    const j = await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`);
    const firstChild = [...j.body.children].sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;
    await t.call('POST', `/api/v1/jobs/${firstChild.id}/cancel`, {});
    const after = await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`);
    expect(after.body.children.every((c) => c.status === 'cancelled')).toBe(true);
    expect(after.body.status).toBe('cancelled');
  });
});

describe('2. live text restart', () => {
  it('sends section.started with the attempt and names the section on job.status', async () => {
    t = await testApp();
    const id = await approvedBook(t, 1);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const events = await t.services.db.selectFrom('jobEvents').select(['type', 'data', 'jobId']).where('projectId', '=', id).execute();
    const started = events.filter((e) => e.type === 'section.started').map((e) => JSON.parse(e.data) as Obj);
    expect(started.length).toBeGreaterThan(0);
    expect(started[0]).toMatchObject({ bookId: id, projectId: id, attempt: 1, sectionId: anyString, jobId: anyString });
    const statuses = events.filter((e) => e.type === 'job.status').map((e) => JSON.parse(e.data) as Obj);
    const child = statuses.find((d) => d['kind'] === 'write_section');
    expect(child?.['sectionId']).toEqual(anyString);
    expect(statuses.find((d) => d['kind'] === 'write_book')).not.toHaveProperty('sectionId');
  });
});

describe('3. MOCK_STREAM_DELAY_MS', () => {
  it('is read from the environment (blank counts as unset) and reaches the mock AI', async () => {
    expect(testConfig().mockStreamDelayMs).toBe(0);
    expect(testConfig({ MOCK_STREAM_DELAY_MS: ' ' }).mockStreamDelayMs).toBe(0);
    expect(testConfig({ MOCK_STREAM_DELAY_MS: '40' }).mockStreamDelayMs).toBe(40);
    expect(() => testConfig({ MOCK_STREAM_DELAY_MS: 'slow' })).toThrow();
    const lines: string[] = [];
    const { ai } = await selectAiAdapter({
      choice: 'mock',
      apiKey: undefined,
      promptsDir: '',
      configDir: '',
      mockStreamDelayMs: 40,
      log: (l) => lines.push(l),
    });
    expect((ai as unknown as { streamDelayMs: number }).streamDelayMs).toBe(40);
  });
});

describe('4. writtenBy on sections', () => {
  it('is app for code-written pages, owner for owner-only text and ai otherwise', async () => {
    t = await testApp();
    const id = await approvedBook(t, 2);
    let tree = await t.call<{ front: Obj[]; body: Obj[]; back: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
    const ch1 = tree.body.body.find((x) => x['kind'] === 'chapter' && x['number'] === 1)!;
    await t.call('POST', `/api/v1/sections/${ch1['id'] as string}/versions`, { bodyMd: 'My own words.' });
    tree = await t.call('GET', `/api/v1/books/${id}/sections`);
    const by = (kind: string) => [...tree.body.front, ...tree.body.body, ...tree.body.back].find((x) => x['kind'] === kind)!['writtenBy'];
    expect(by('title_page')).toBe('app');
    expect(by('copyright')).toBe('app');
    expect(by('contents')).toBe('app');
    expect(by('about_author')).toBe('app');
    expect(tree.body.body.find((x) => x['id'] === ch1['id'])!['writtenBy']).toBe('owner');
    expect(tree.body.body.find((x) => x['kind'] === 'chapter' && x['number'] === 2)!['writtenBy']).toBe('ai');
    await t.call('POST', `/api/v1/books/${id}/write`, { onlyEmpty: false });
    await t.services.runner.runUntilIdle();
    const one = await t.call<{ section: Obj }>('GET', `/api/v1/sections/${ch1['id'] as string}`);
    expect(one.body.section['writtenBy']).toBe('ai');
  });
});

describe('5. estimates', () => {
  it('sums writing over the sections not done, with the resolved model', async () => {
    t = await testApp();
    const id = await approvedBook(t, 2);
    const tree = await t.call<{ front: Obj[]; body: Obj[]; back: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
    const writable = [...tree.body.front, ...tree.body.body, ...tree.body.back].filter(
      // Acknowledgements with no names to thank get a placeholder for the owner, with no AI call.
      (x) =>
        !['title_page', 'copyright', 'contents', 'about_author', 'half_title', 'also_by', 'part', 'acknowledgements'].includes(x['kind'] as string) &&
        x['enabled'],
    );
    const e = await t.call<{ lowUsd: number; highUsd: number; model: string; calls: number; sections: number }>('POST', `/api/v1/books/${id}/estimate`, {
      stage: 'writing',
    });
    expect(e.status).toBe(200);
    expect(e.body.sections).toBe(writable.length);
    // Writing, summary and checks per section, then the listing job's three matter prompts (one mock estimate).
    expect(e.body.calls).toBe(writable.length * 3 + 3);
    expect(e.body.lowUsd).toBeCloseTo(0.001 * (writable.length * 3 + 1), 6);
    expect(e.body.highUsd).toBeGreaterThan(e.body.lowUsd);
    expect(e.body.model).toEqual(anyString);

    const one = await t.call<{ sections: number; calls: number }>('POST', `/api/v1/books/${id}/estimate`, {
      stage: 'writing',
      sectionIds: [writable[0]!['id'] as string],
    });
    expect(one.body).toMatchObject({ sections: 1, calls: 3 });
    await t.call('PATCH', `/api/v1/books/${id}`, { settings: { models: { writing: 'book/model' } } });
    expect((await t.call<{ model: string }>('POST', `/api/v1/books/${id}/estimate`, { stage: 'writing' })).body.model).toBe('book/model');
    const part = await t.call<{ calls: number; sections: number | null }>('POST', `/api/v1/books/${id}/estimate`, {
      stage: 'blueprint_part',
      partTarget: 'chapter:1',
    });
    expect(part.body).toMatchObject({ calls: 1, sections: null });

    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call<{ sections: number; lowUsd: number }>('POST', `/api/v1/books/${id}/estimate`, { stage: 'writing' })).body).toMatchObject({
      sections: 0,
      lowUsd: 0,
    });
    expect((await t.call('POST', `/api/v1/books/${id}/estimate`, { stage: 'painting' })).status).toBe(400);
  });
});

describe('6. title favourites', () => {
  it('stars and unstars one option', async () => {
    t = await testApp();
    const id = await approvedBook(t, 1);
    await t.call('POST', `/api/v1/books/${id}/title-sets`, {});
    await t.services.runner.runUntilIdle();
    const sets = await t.call<{ items: { id: string; options: Obj[] }[] }>('GET', `/api/v1/books/${id}/title-sets`);
    const set = sets.body.items[0]!;
    expect(set.options.every((o) => o['favourite'] === false)).toBe(true);
    const r = await t.call<{ titleSet: { options: Obj[] } }>('PATCH', `/api/v1/title-sets/${set.id}/options/2`, { favourite: true });
    expect(r.body.titleSet.options.map((o) => o['favourite'])).toEqual(set.options.map((_, i) => i === 2));
    expect(r.body.titleSet.options[2]!['title']).toBe(set.options[2]!['title']);
    const off = await t.call<{ titleSet: { options: Obj[] } }>('PATCH', `/api/v1/title-sets/${set.id}/options/2`, { favourite: false });
    expect(off.body.titleSet.options[2]!['favourite']).toBe(false);
    expect((await t.call('PATCH', `/api/v1/title-sets/${set.id}/options/99`, { favourite: true })).status).toBe(404);
    expect((await t.call('PATCH', `/api/v1/title-sets/${set.id}/options/1`, {})).status).toBe(400);
  });
});

describe('7. running job on book rows', () => {
  it('shows the newest top-level job that is queued, running, waiting or paused', async () => {
    t = await testApp();
    const id = await approvedBook(t, 1);
    const row = async () => (await t!.call<{ items: Obj[] }>('GET', '/api/v1/books')).body.items.find((b) => b['id'] === id)!;
    expect((await row())['runningJob']).toBeNull();
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/research`, {});
    expect((await row())['runningJob']).toEqual({ id: job.body.jobId, kind: 'research', status: 'queued', progress: 0 });
    await t.call('POST', `/api/v1/jobs/${job.body.jobId}/pause`, {});
    expect((await row())['runningJob']).toMatchObject({ status: 'paused' });
    await t.call('POST', `/api/v1/jobs/${job.body.jobId}/resume`, {});
    await t.services.runner.runUntilIdle();
    expect((await row())['runningJob']).toBeNull();
  });
});

describe('8. settings: house style and KDP rules', () => {
  it('summarise the config files', async () => {
    t = await testApp();
    const s = await t.call<{ houseStyle: Obj; kdpRules: Obj }>('GET', '/api/v1/settings');
    expect(s.body.houseStyle).toMatchObject({ version: 1, bannedCount: anyNumber, spellingPairs: anyNumber });
    expect(s.body.houseStyle['bannedCount'] as number).toBeGreaterThan(50);
    // The newest dated rules file wins; its check dates come from the file, so only their shape is pinned here.
    expect(s.body.kdpRules).toMatchObject({ version: '2026-10-17' });
    expect(s.body.kdpRules['checkedAt']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(s.body.kdpRules['recheckDueAt']).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('9. moving a project', () => {
  it('zips a book with its files and imports it with new ids', async () => {
    t = await testApp();
    const id = await approvedBook(t, 1);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.call('POST', `/api/v1/books/${id}/cover/concepts`, {});
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${id}/cover`);
    await t.call('POST', `/api/v1/books/${id}/cover/choose`, { assetId: cover.body.cover.concepts[1]!.assetId });

    const res = await t.app.inject({ method: 'POST', url: `/api/v1/books/${id}/export-project`, headers: { host: HOST, origin: ORIGIN } });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/zip');
    expect(res.headers['content-disposition']).toMatch(/calm-mornings\.volume-project\.zip/);
    const zip = res.rawPayload;
    const names = readZip(zip).map((e) => e.name);
    expect(names[0]).toBe('project.json');
    expect(names.filter((n) => n.startsWith('assets/'))).toHaveLength(3);

    // Into a fresh database.
    const other = await testApp();
    extra.push(other);
    const imp = await other.app.inject({
      method: 'POST',
      url: '/api/v1/projects/import',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/zip' },
      payload: zip,
    });
    expect(imp.statusCode).toBe(201);
    const body = JSON.parse(imp.body) as { bookId: string; profileId: string; profileCreated: boolean; assets: number; book: Obj };
    expect(body).toMatchObject({ profileCreated: true, assets: 3 });
    expect(body.bookId).not.toBe(id);
    expect(body.book).toMatchObject({ title: 'Calm Mornings', profileId: body.profileId });
    const a = await t.call<{ totals: Obj }>('GET', `/api/v1/books/${id}/sections`);
    const b = await other.call<{ totals: Obj; body: Obj[] }>('GET', `/api/v1/books/${body.bookId}/sections`);
    expect(b.body.totals).toEqual(a.body.totals);
    const ch = b.body.body.find((x) => x['kind'] === 'chapter')!;
    const sec = await other.call<{ current: { bodyMd: string; sectionId: string } }>('GET', `/api/v1/sections/${ch['id'] as string}`);
    expect(sec.body.current.sectionId).toBe(ch['id']);
    expect(sec.body.current.bodyMd).toContain('[MOCK]');
    const cv = await other.call<{ cover: { chosenAssetId: string; concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${body.bookId}/cover`);
    expect(cv.body.cover.chosenAssetId).toBe(cv.body.cover.concepts[1]!.assetId);
    expect(cv.body.cover.concepts.map((c) => c.assetId)).not.toContain(cover.body.cover.concepts[0]!.assetId);
    const dl = await other.app.inject({ method: 'GET', url: `/api/v1/assets/${cv.body.cover.chosenAssetId}/download`, headers: { host: HOST } });
    expect(dl.statusCode).toBe(200);
    const bp = await other.call<{ blueprint: { status: string } }>('GET', `/api/v1/books/${body.bookId}/blueprint`);
    expect(bp.body.blueprint.status).toBe('approved');
    expect((await other.call<Obj>('GET', `/api/v1/books/${body.bookId}`)).body['approvedBlueprintId']).toEqual(anyString);

    // Into the same workspace under an existing pen name.
    const p = (await t.call<{ items: { id: string }[] }>('GET', '/api/v1/profiles')).body.items[0]!.id;
    const again = await t.app.inject({
      method: 'POST',
      url: `/api/v1/projects/import?profileId=${p}`,
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/zip' },
      payload: zip,
    });
    expect(JSON.parse(again.body)).toMatchObject({ profileId: p, profileCreated: false });
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/profiles')).body.items).toHaveLength(1);

    // Into the same workspace with no profile named: the matching pen name is reused, not copied.
    const matched = await t.app.inject({
      method: 'POST',
      url: '/api/v1/projects/import',
      headers: { host: HOST, origin: ORIGIN, 'content-type': 'application/zip' },
      payload: zip,
    });
    expect(matched.statusCode).toBe(201);
    expect(JSON.parse(matched.body)).toMatchObject({ profileId: p, profileCreated: false });
    expect((await t.call<{ items: unknown[] }>('GET', '/api/v1/profiles')).body.items).toHaveLength(1);
  });

  it('refuses a file that is not a Volume project', async () => {
    t = await testApp();
    const send = (payload: Buffer, type = 'application/zip') =>
      t!.app.inject({ method: 'POST', url: '/api/v1/projects/import', headers: { host: HOST, origin: ORIGIN, 'content-type': type }, payload });
    expect((await send(Buffer.from('not a zip'))).statusCode).toBe(400);
    expect((await send(writeZip([{ name: 'hello.txt', data: Buffer.from('hi') }]))).statusCode).toBe(400);
    expect((await send(writeZip([{ name: 'project.json', data: Buffer.from('{"format":"other"}') }]))).statusCode).toBe(400);
    expect((await send(Buffer.from('x'), 'text/csv')).statusCode).toBe(415);
  });

  it('round-trips the zip helper', () => {
    const data = Buffer.from('a'.repeat(5000));
    const back = readZip(
      writeZip([
        { name: 'a.txt', data },
        { name: 'empty', data: Buffer.alloc(0) },
      ]),
    );
    expect(back.map((e) => e.name)).toEqual(['a.txt', 'empty']);
    expect(Buffer.from(back[0]!.data).equals(data)).toBe(true);
  });
});

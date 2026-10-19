// Second live acceptance run, 19 October 2026: matter.back-cover v7 and matter.amazon-description v6 were never called
// by any job, so the listing came only from the blueprint drafts. The listing job runs the matter stage (AI-PIPELINE
// stage 7) after write_book and from POST /books/:id/listing. Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider } from '@volume/ai';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MOCK_MATTER_BLURB, MOCK_MATTER_DESCRIPTION, MockAiAdapter } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, estimatePlan, SUMMARY_WORDS, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import { KeyedLock } from '../src/lib/keyed-lock.js';
import type { AiCostEstimate, AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { LISTING_PROMPT_CALLS } from '../src/routes/estimate.js';
import { listingVariables } from '../src/jobs/listing-input.js';
import { str, testApp, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');
const MODEL = 'test/model';

interface Req {
  model: string;
  messages: { role: string; content: string }[];
  meta?: { promptId?: string };
}
interface MockLike {
  chat(req: Req): Promise<{ text: string; usage: Obj; [k: string]: unknown }>;
  listModels(): Promise<unknown[]>;
}
const pkg = VolumeAi as unknown as {
  MockProvider: new (opts: { chunkDelayMs?: number; models?: unknown[] }) => MockLike;
  mockModelInfo: (slug: string) => unknown;
};

async function recordingAdapter(): Promise<{ ai: OpenRouterAiAdapter; seen: Req[] }> {
  const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(MODEL)] });
  const seen: Req[] = [];
  const provider = {
    name: 'openrouter' as const,
    async chat(req: Req) {
      seen.push(req);
      const r = await mock.chat(req);
      return { ...r, provider: 'openrouter', usage: { ...r.usage, costUsd: 0 } };
    },
    generateImage: () => Promise.reject(new Error('no images in this test')),
    listModels: () => mock.listModels(),
    keyStatus: () => Promise.resolve({ valid: true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null }),
  };
  const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: provider as unknown as AiProvider });
  return { ai, seen };
}

/** The mock AI for every stage, recording the matter inputs; `real` answers the matter stage when given. */
class ListingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly inner = new MockAiAdapter();
  readonly matter: AiStageInput[] = [];
  constructor(private readonly real: OpenRouterAiAdapter | null = null) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    if (stage === 'matter_metadata') {
      this.matter.push(structuredClone(input));
      if (this.real) return this.real.runStage(stage, input, { ...opts, model: MODEL });
    }
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function newBook(app: TestApp): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', {
    profileId: p.body['id'],
    idea: 'Side projects',
    title: 'Side Projects',
    settings: { acknowledgements: 'Sam' },
  });
  expect(b.status).toBe(201);
  const id = str(b.body['id']);
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  return id;
}

describe('4. the matter stage writes the listing', () => {
  it('runs after write_book from the written chapters, and the pack and wrap use its blurb and description', async () => {
    const ai = new ListingAi();
    t = await testApp({ ai });
    const id = await newBook(t);
    expect((await t.call<{ listing: unknown }>('GET', `/api/v1/books/${id}/listing`)).body.listing).toBeNull();

    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const jobs = await t.call<{ items: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/jobs`);
    expect(jobs.body.items.find((j) => j.kind === 'listing')?.status).toBe('succeeded');
    expect(ai.matter).toHaveLength(1);
    const vars = ai.matter[0]?.variables ?? {};
    expect((vars['previousSummaries'] as unknown[]).length).toBeGreaterThan(0);
    expect(vars['pricesCheck']).toEqual(expect.any(String));

    const got = await t.call<{ listing: { backBlurb: string; descriptionHtml: string; keywords: string[]; categories: string[] } }>(
      'GET',
      `/api/v1/books/${id}/listing`,
    );
    expect(got.body.listing).toMatchObject({
      backBlurb: MOCK_MATTER_BLURB,
      descriptionHtml: MOCK_MATTER_DESCRIPTION,
      categories: ['Mock 1', 'Mock 2', 'Mock 3'],
    });
    expect(got.body.listing.keywords).toHaveLength(7);

    const book = await buildExportBook(t.services.repos, t.owner, id, t.services.configDir);
    expect(book.listing).toMatchObject({
      backBlurb: MOCK_MATTER_BLURB,
      description: MOCK_MATTER_DESCRIPTION,
      categories: ['Mock 1', 'Mock 2', 'Mock 3'],
    });
  });

  it('POST /books/:id/listing refuses an unwritten book and writes the listing again for a written one', async () => {
    const ai = new ListingAi();
    t = await testApp({ ai });
    const id = await newBook(t);
    const early = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${id}/listing`, {});
    expect(early.status).toBe(409);
    expect(early.body.error.code).toBe('writing_incomplete');
    expect((await t.call('POST', `/api/v1/books/${id}/listing`, { extra: 1 })).status).toBe(400);

    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const again = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/listing`, {});
    expect(again.status).toBe(202);
    await t.services.runner.runUntilIdle();
    expect(ai.matter).toHaveLength(2);
    expect((await t.call<{ listing: Obj | null }>('GET', `/api/v1/books/${id}/listing`)).body.listing).not.toBeNull();
  });

  it('calls matter.back-cover v7 and matter.amazon-description v6 through the real adapter', async () => {
    const real = await recordingAdapter();
    const ai = new ListingAi(real.ai);
    t = await testApp({ ai });
    const id = await newBook(t);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const ids = real.seen.map((r) => r.meta?.promptId);
    expect(ids).toEqual(['matter.amazon-description', 'matter.keywords-categories', 'matter.back-cover']);
    const system = (r: Req | undefined) => r?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system(real.seen[2])).toContain('Sell what the book does for the reader.');
    expect(system(real.seen[0])).toContain('what the book does for the reader and the promise it makes');
    const jobs = await t.call<{ items: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/jobs`);
    expect(jobs.body.items.find((j) => j.kind === 'listing')?.status).toBe('succeeded');
  });
});

/** The mock AI with a known price per stage: the matter stage costs 0.5 USD, every other stage 0.001 USD. */
class PricedAi extends ListingAi {
  readonly estimated: { stage: AiStage; input: AiStageInput }[] = [];
  override estimate: AiPort['estimate'] = (stage, input): Promise<AiCostEstimate> => {
    this.estimated.push({ stage, input: structuredClone(input) });
    const usd = stage === 'matter_metadata' ? 0.5 : 0.001;
    return Promise.resolve({ lowUsd: usd, highUsd: usd * 2 });
  };
}

describe('4. the writing estimate includes the listing job', () => {
  it('adds the three matter prompts to a whole-book writing estimate, and not to a chosen section or a written book', async () => {
    expect(estimatePlan('matter_metadata', { variables: {} }).map((p) => p.task)).toHaveLength(LISTING_PROMPT_CALLS);
    const ai = new PricedAi();
    t = await testApp({ ai });
    const id = await newBook(t);
    type Est = { lowUsd: number; highUsd: number; calls: number; sections: number };
    const all = await t.call<Est>('POST', `/api/v1/books/${id}/estimate`, { stage: 'writing' });
    expect(all.status).toBe(200);
    const matter = ai.estimated.filter((e) => e.stage === 'matter_metadata');
    expect(matter).toHaveLength(1);
    // The same variables as the listing job, built by the shared helper: a stand-in summary per section still to write.
    const sent = matter[0]?.input.variables ?? {};
    expect(Object.keys(sent).sort()).toEqual(
      Object.keys(await listingVariables(t.services.repos, t.services.configDir, t.owner, await t.services.repos.books.require(t.owner, id))).sort(),
    );
    const summaries = sent['previousSummaries'] as { summary: string }[];
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries[0]!.summary.split(' ').length).toBe(SUMMARY_WORDS);
    // Writing, summary and two checks prompts per section (three stage runs), then the three matter prompts (one run).
    expect(all.body.calls).toBe(all.body.sections * 4 + LISTING_PROMPT_CALLS);
    expect(all.body.lowUsd).toBeCloseTo(0.5 + 0.001 * all.body.sections * 3, 6);

    const tree = await t.call<{ body: { id: string }[] }>('GET', `/api/v1/books/${id}/sections`);
    const one = await t.call<Est>('POST', `/api/v1/books/${id}/estimate`, { stage: 'writing', sectionIds: [tree.body.body[0]!.id] });
    expect(one.body).toMatchObject({ sections: 1, calls: 4 });
    expect(one.body.lowUsd).toBeLessThan(0.5);

    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call<Est>('POST', `/api/v1/books/${id}/estimate`, { stage: 'writing' })).body).toMatchObject({ sections: 0, calls: 0, lowUsd: 0 });
  });
});

describe("4. the owner's listing edits always win", () => {
  it("keeps the owner's blueprint description and keywords over the matter stage, which never overwrites them", async () => {
    const ai = new ListingAi();
    t = await testApp({ ai });
    const id = await newBook(t);
    const edit = await t.call('PATCH', `/api/v1/books/${id}/blueprint`, {
      parts: { description_draft: 'The owner wrote this description.', keywords: ['owner one', 'owner two'] },
    });
    expect(edit.status).toBe(200);
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    const saved = await t.call<{ listing: { descriptionHtml: string | null; keywords: string[]; backBlurb: string; source: string } }>(
      'GET',
      `/api/v1/books/${id}/listing`,
    );
    expect(saved.body.listing).toMatchObject({ descriptionHtml: null, keywords: [], backBlurb: MOCK_MATTER_BLURB, source: 'ai:matter' });
    const book = await buildExportBook(t.services.repos, t.owner, id, t.services.configDir);
    expect(book.listing).toMatchObject({
      description: 'The owner wrote this description.',
      keywords: ['owner one', 'owner two'],
      backBlurb: MOCK_MATTER_BLURB,
      categories: ['Mock 1', 'Mock 2', 'Mock 3'],
    });
    const job = (await t.call<{ items: { kind: string; result: { ownerKept?: string[] } | null }[] }>('GET', `/api/v1/books/${id}/jobs`)).body.items.find(
      (j) => j.kind === 'listing',
    );
    expect(job?.result?.ownerKept?.sort()).toEqual(['description_draft', 'keywords']);
  });

  it('refuses a second POST /books/:id/listing while one is queued', async () => {
    t = await testApp({ ai: new ListingAi() });
    const id = await newBook(t);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/listing`, {})).status).toBe(202);
    const second = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${id}/listing`, {});
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('conflict');
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/listing`, {})).status).toBe(202);
  });

  it('two POST /books/:id/listing at once (a double click) queue exactly one job', async () => {
    t = await testApp({ ai: new ListingAi() });
    const id = await newBook(t);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const before = (await t.services.queue.list(t.owner, { projectId: id, kind: 'listing' })).length;
    // Widen the window between the check and the enqueue, so without the lock both requests would pass the check.
    const queue = t.services.queue;
    const list = queue.list.bind(queue);
    const slow = vi.spyOn(queue, 'list').mockImplementation(async (ctx, filter) => {
      const rows = await list(ctx, filter);
      if (filter.active) await new Promise((r) => setTimeout(r, 30));
      return rows;
    });
    const both = await Promise.all([t.call('POST', `/api/v1/books/${id}/listing`, {}), t.call('POST', `/api/v1/books/${id}/listing`, {})]);
    expect(both.map((r) => r.status).sort()).toEqual([202, 409]);
    slow.mockRestore();
    expect(await t.services.queue.list(t.owner, { projectId: id, kind: 'listing', active: true })).toHaveLength(1);
    expect((await t.services.queue.list(t.owner, { projectId: id, kind: 'listing' })).length).toBe(before + 1);
  });
});

describe('KeyedLock', () => {
  it('runs one step per key at a time, keeps going after a failure, and leaves other keys alone', async () => {
    const lock = new KeyedLock();
    const order: string[] = [];
    const step =
      (name: string, ms: number, fail = false) =>
      async () => {
        order.push(`${name} start`);
        await new Promise((r) => setTimeout(r, ms));
        order.push(`${name} end`);
        if (fail) throw new Error(name);
        return name;
      };
    const a = lock.run('book', step('a', 20, true));
    const b = lock.run('book', step('b', 1));
    const c = lock.run('other', step('c', 1));
    await expect(a).rejects.toThrow('a');
    expect(await b).toBe('b');
    expect(await c).toBe('c');
    expect(order.indexOf('b start')).toBeGreaterThan(order.indexOf('a end'));
    expect(order.indexOf('c start')).toBeLessThan(order.indexOf('a end'));
  });
});

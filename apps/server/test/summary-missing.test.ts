// Owner decision, 7 October 2026: when a section's summary still fails after the AI layer's retry, the written text
// is saved with a blocking summary_missing flag, later sections still run, and the owner can rerun the summary.
// No network: the summary goes through the real @volume/ai service on its MockProvider with the truncated_always
// scenario (finish_reason "length" on every answer); every other stage uses the server's mock AI.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { JobFailed } from '../src/jobs/errors.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');

type Obj = Record<string, unknown>;

interface Check {
  checker: string;
  severity: string;
  status: string;
  versionId: string | null;
}
interface SectionView {
  section: { id: string; status: string; currentVersionId: string | null };
  current: { id: string; bodyMd: string; summary: string | null; wordCount: number } | null;
  checks: Check[];
}
interface JobView {
  status: string;
  errorCode: string | null;
  result: Obj | null;
  children: { id: string; status: string }[];
}

/** The @volume/ai MockProvider behind the real adapter, listing every configured model so the runner's defaults resolve. */
async function packageMockAdapter(): Promise<OpenRouterAiAdapter> {
  const defaults = JSON.parse(readFileSync(join(CONFIG, 'models.defaults.json'), 'utf8')) as {
    stages: Record<string, { defaultModel: string; fallbacks: string[] }>;
  };
  const slugs = new Set(Object.values(defaults.stages).flatMap((st) => [st.defaultModel, ...st.fallbacks]));
  const provider = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [...slugs].map((slug) => VolumeAi.mockModelInfo(slug)) });
  return createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider });
}

/**
 * Server mock AI for every stage, except summaries (`failFor`) and checks (`failChecksFor`) of chosen sections: those run through the package
 * adapter with scenario truncated_always, so they fail exactly as a live cut-off answer does after its one wider retry.
 */
class SummaryFaultAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly writingInputs: AiStageInput[] = [];
  failFor: (section: Obj) => boolean = () => false;
  /** Sections whose claims and consistency check is cut off the same way. */
  failChecksFor: (section: Obj) => boolean = () => false;
  private readonly inner = new MockAiAdapter();
  constructor(private readonly pkg: OpenRouterAiAdapter) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts: RunStageOptions = {}): Promise<AiStageResult<S>> {
    if (stage === 'writing') this.writingInputs.push(structuredClone(input));
    const section = (input.variables['section'] ?? {}) as Obj;
    if ((stage === 'summarise' && this.failFor(section)) || (stage === 'checks' && this.failChecksFor(section))) {
      return this.pkg.runStage(stage, input, { ...opts, scenario: 'truncated_always' });
    }
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
}

const firstChapter = (s: Obj): boolean => s['kind'] === 'chapter' && s['number'] === 1;

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function approvedBook(app: TestApp, chapters: number): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const id = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: chapters });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  return id;
}

async function chapters(app: TestApp, id: string): Promise<Obj[]> {
  const tree = await app.call<{ front: Obj[]; body: (Obj & { children: Obj[] })[]; back: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
  return [...tree.body.body, ...tree.body.body.flatMap((b) => b.children)]
    .filter((s) => s['kind'] === 'chapter')
    .sort((a, b) => Number(a['number']) - Number(b['number']));
}

const view = async (app: TestApp, sectionId: string): Promise<SectionView> => (await app.call<SectionView>('GET', `/api/v1/sections/${sectionId}`)).body;
const openFlags = (v: SectionView): Check[] => v.checks.filter((c) => c.checker === 'summary_missing' && c.status === 'open');
const openChecksFlags = (v: SectionView): Check[] => v.checks.filter((c) => c.checker === 'checks_missing' && c.status === 'open');
const preflightIds = async (app: TestApp, id: string): Promise<string[]> =>
  (await app.call<{ items: { id: string; severity: string }[] }>('GET', `/api/v1/books/${id}/preflight`)).body.items
    .filter((i) => i.severity === 'block')
    .map((i) => i.id);

describe('summary failure keeps the written section (truncated_always)', () => {
  it('saves the chapter with a blocking flag, writes the later chapters without its summary, and a rerun clears the flag', async () => {
    const ai = new SummaryFaultAi(await packageMockAdapter());
    ai.failFor = firstChapter;
    t = await testApp({ ai });
    const id = await approvedBook(t, 3);
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    // The book job ends needing attention, not failed, and no child was cancelled.
    const job = (await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`)).body;
    expect(job.status).toBe('needs_attention');
    expect(job.children.filter((c) => c.status === 'failed' || c.status === 'cancelled')).toEqual([]);

    // Chapter 1: text saved, no summary, one open blocking flag naming the cut-off.
    const [one, two, three] = await chapters(t, id);
    const v1 = await view(t, one!['id'] as string);
    expect(v1.current?.bodyMd.length).toBeGreaterThan(0);
    expect(v1.current?.wordCount).toBeGreaterThan(0);
    expect(v1.current?.summary).toBeNull();
    expect(v1.section.status).toBe('needs_attention');
    expect(openFlags(v1)).toEqual([expect.objectContaining({ severity: 'block', versionId: v1.current?.id })]);
    const flag = v1.checks.find((c) => c.checker === 'summary_missing') as Check & { location: Obj; message: string };
    expect(flag.location['errorCode']).toBe('output_truncated');
    expect(flag.message).toMatch(/Run the summary again/);

    // Later chapters were written, with their own summaries, and chapter 1's summary was simply absent from their context.
    for (const later of [two, three]) {
      const v = await view(t, later!['id'] as string);
      expect(v.current?.summary).toBeTruthy();
      expect(openFlags(v)).toEqual([]);
    }
    const chapterTwoInput = ai.writingInputs.find(
      (i) => (i.variables['section'] as Obj)['number'] === 2 && (i.variables['section'] as Obj)['kind'] === 'chapter',
    );
    const titles = ((chapterTwoInput?.variables['previousSummaries'] ?? []) as { title: string | null }[]).map((s) => s.title);
    expect(titles).not.toContain(one!['title']);

    // The pack is blocked until the summary is rerun.
    expect(await preflightIds(t, id)).toContain(`body.summary-missing.${String(one!['id'])}`);

    // Rerun: the summary now works. Same version, summary set, flag resolved, section and preflight clear.
    ai.failFor = () => false;
    const rerun = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${String(one!['id'])}/summarise`, {});
    expect(rerun.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const rj = (await t.call<JobView>('GET', `/api/v1/jobs/${rerun.body.jobId}`)).body;
    const after = await view(t, one!['id'] as string);
    const otherBlocks = after.checks.filter((c) => c.status === 'open' && c.severity === 'block').length;
    expect(rj.status).toBe(otherBlocks > 0 ? 'needs_attention' : 'succeeded');
    expect(rj.result).toMatchObject({ summaryMissing: false, versionId: v1.current?.id });
    expect(after.current?.id).toBe(v1.current?.id);
    expect(after.current?.bodyMd).toBe(v1.current?.bodyMd);
    expect(after.current?.summary).toBeTruthy();
    expect(openFlags(after)).toEqual([]);
    expect(after.checks.find((c) => c.checker === 'summary_missing')?.status).toBe('resolved');
    expect(after.section.status).toBe(otherBlocks > 0 ? 'needs_attention' : 'done');
    expect(await preflightIds(t, id)).not.toContain(`body.summary-missing.${String(one!['id'])}`);
  });

  it('a rerun that fails again keeps one open flag and ends needing attention', async () => {
    const ai = new SummaryFaultAi(await packageMockAdapter());
    ai.failFor = firstChapter;
    t = await testApp({ ai });
    const id = await approvedBook(t, 1);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const [one] = await chapters(t, id);
    const sectionId = one!['id'] as string;

    const rerun = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${sectionId}/summarise`, {});
    await t.services.runner.runUntilIdle();
    const rj = (await t.call<JobView>('GET', `/api/v1/jobs/${rerun.body.jobId}`)).body;
    expect(rj.status).toBe('needs_attention');
    expect(rj.result).toMatchObject({ summaryMissing: true, errorCode: 'output_truncated' });
    const v = await view(t, sectionId);
    expect(v.current?.summary).toBeNull();
    expect(openFlags(v)).toHaveLength(1);
    expect(v.section.status).toBe('needs_attention');
  });
});

describe('checks failure keeps the written section (truncated_always)', () => {
  it('saves the chapter with its summary and a blocking checks_missing flag, writes the later chapters, and /recheck clears it', async () => {
    const ai = new SummaryFaultAi(await packageMockAdapter());
    ai.failChecksFor = firstChapter;
    t = await testApp({ ai });
    const id = await approvedBook(t, 3);
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    const job = (await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`)).body;
    expect(job.status).toBe('needs_attention');
    expect(job.children.filter((c) => c.status === 'failed' || c.status === 'cancelled')).toEqual([]);

    const [one, two, three] = await chapters(t, id);
    const sectionId = one!['id'] as string;
    const v1 = await view(t, sectionId);
    expect(v1.current?.bodyMd.length).toBeGreaterThan(0);
    expect(v1.current?.summary).toBeTruthy();
    expect(v1.section.status).toBe('needs_attention');
    expect(openFlags(v1)).toEqual([]);
    const flags = openChecksFlags(v1);
    expect(flags).toEqual([expect.objectContaining({ severity: 'block', versionId: v1.current?.id })]);
    const flag = flags[0] as Check & { location: Obj; message: string };
    expect(flag.location['errorCode']).toBe('output_truncated');
    expect(flag.message).toMatch(/Run the checks again/);
    for (const later of [two, three]) {
      const v = await view(t, later!['id'] as string);
      expect(v.current?.bodyMd.length).toBeGreaterThan(0);
      expect(openChecksFlags(v)).toEqual([]);
    }
    expect(await preflightIds(t, id)).toContain(`body.checks-missing.${sectionId}`);

    ai.failChecksFor = () => false;
    const rerun = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${sectionId}/recheck`, {});
    expect(rerun.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const rj = (await t.call<JobView>('GET', `/api/v1/jobs/${rerun.body.jobId}`)).body;
    const after = await view(t, sectionId);
    const otherBlocks = after.checks.filter((c) => c.status === 'open' && c.severity === 'block').length;
    expect(rj.status).toBe(otherBlocks > 0 ? 'needs_attention' : 'succeeded');
    // The summary was already there, so only the checks ran again.
    expect(rj.result).toMatchObject({ reran: ['checks'], checksMissing: false, summaryMissing: false, versionId: v1.current?.id });
    expect(after.current?.id).toBe(v1.current?.id);
    expect(after.current?.bodyMd).toBe(v1.current?.bodyMd);
    expect(openChecksFlags(after)).toEqual([]);
    expect(after.checks.find((c) => c.checker === 'checks_missing')?.status).toBe('resolved');
    expect(after.section.status).toBe(otherBlocks > 0 ? 'needs_attention' : 'done');
    expect(await preflightIds(t, id)).not.toContain(`body.checks-missing.${sectionId}`);
  });

  it('when the summary and the checks both fail, one /summarise rerun redoes both and clears both flags', async () => {
    const ai = new SummaryFaultAi(await packageMockAdapter());
    ai.failFor = firstChapter;
    ai.failChecksFor = firstChapter;
    t = await testApp({ ai });
    const id = await approvedBook(t, 2);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const [one, two] = await chapters(t, id);
    const sectionId = one!['id'] as string;
    const before = await view(t, sectionId);
    expect(before.current?.bodyMd.length).toBeGreaterThan(0);
    expect(openFlags(before)).toHaveLength(1);
    expect(openChecksFlags(before)).toHaveLength(1);
    expect((await view(t, two!['id'] as string)).current?.bodyMd.length).toBeGreaterThan(0);

    ai.failFor = () => false;
    ai.failChecksFor = () => false;
    const rerun = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${sectionId}/summarise`, {});
    await t.services.runner.runUntilIdle();
    const rj = (await t.call<JobView>('GET', `/api/v1/jobs/${rerun.body.jobId}`)).body;
    expect(rj.result).toMatchObject({ reran: ['summary', 'checks'], summaryMissing: false, checksMissing: false });
    const after = await view(t, sectionId);
    expect(after.current?.summary).toBeTruthy();
    expect(openFlags(after)).toEqual([]);
    expect(openChecksFlags(after)).toEqual([]);
  });
});

describe('POST /sections/:id/summarise and /recheck', () => {
  it('refuses a section with no text, an unknown section and an unexpected body', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await approvedBook(t, 1);
    const [one] = await chapters(t, id);
    const empty = await t.call<{ error: { code: string } }>('POST', `/api/v1/sections/${String(one!['id'])}/summarise`, {});
    expect(empty.status).toBe(409);
    expect(empty.body.error.code).toBe('invalid_state');
    expect((await t.call('POST', '/api/v1/sections/01ZZZZZZZZZZZZZZZZZZZZZZZZ/summarise', {})).status).toBe(404);
    expect((await t.call('POST', `/api/v1/sections/${String(one!['id'])}/summarise`, { instruction: 'x' })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/sections/${String(one!['id'])}/recheck`, {})).status).toBe(409);
    expect((await t.call('POST', '/api/v1/sections/01ZZZZZZZZZZZZZZZZZZZZZZZZ/recheck', {})).status).toBe(404);
    expect((await t.call('POST', `/api/v1/sections/${String(one!['id'])}/recheck`, { force: true })).status).toBe(400);
    expect(await t.services.db.selectFrom('jobs').select('id').where('kind', '=', 'write_section').execute()).toHaveLength(0);
  });
});

describe('mock scenarios truncated and truncated_always reach the package mock', () => {
  const input: AiStageInput = {
    promptId: 'checks.summarise-and-ledger',
    variables: { markdown: 'The kettle clicked off.', section: { kind: 'chapter', title: 'One', number: 1 }, bookTypeId: 'nonfiction', ledger: [] },
  };

  it('truncated_always fails the summary as output_truncated after the wider retry; truncated recovers on that retry', async () => {
    const ai = await packageMockAdapter();
    const err = await ai.runStage('summarise', input, { scenario: 'truncated_always' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobFailed);
    expect((err as JobFailed).code).toBe('output_truncated');
    const ok = await ai.runStage('summarise', input, { scenario: 'truncated' });
    expect(typeof (ok.output as { summary: unknown }).summary).toBe('string');
  });
});

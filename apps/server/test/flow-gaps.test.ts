import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import {
  attachPartialUsage,
  AiRetryableError,
  type AiPort,
  type AiStage,
  type AiStageInput,
  type AiStageResult,
  type RunStageOptions,
} from '../src/ports/ai.js';
import { testApp, type TestApp } from './helpers.js';

/** The em dash the house style forbids, built from its code point so this file stays clean. */
const EM_DASH = String.fromCharCode(0x2014);

// Server flow gaps found by the AI wiring: writing inputs, titles for a chosen direction,
// house-style checks from @volume/core, and the cost of a stage that fails part way.

interface Call {
  stage: AiStage;
  input: AiStageInput;
}

/** The mock AI, with a hook to change one stage's answer or throw, and a log of every call. */
class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly calls: Call[] = [];
  private readonly inner = new MockAiAdapter();
  constructor(private readonly hook: (stage: AiStage, input: AiStageInput, result: AiStageResult) => AiStageResult = (_s, _i, r) => r) {}

  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    this.calls.push({ stage, input });
    const r = await this.inner.runStage(stage, input, opts);
    return this.hook(stage, input, r) as AiStageResult<S>;
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

interface Obj {
  [k: string]: unknown;
}

async function bookWithApprovedBlueprint(app: TestApp, chapterCount = 2): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const bookId = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {})).status).toBe(200);
  return bookId;
}

describe('writing job inputs', () => {
  it('sends book type, the approved blueprint, the template, the previous summary and the next chapter', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const bookId = await bookWithApprovedBlueprint(t);
    await t.call('PATCH', `/api/v1/books/${bookId}`, { bookTypeId: 'self-help' });
    const approved = await t.call<{ blueprint: { data: Obj; version: number } }>('GET', `/api/v1/books/${bookId}/blueprint`);
    // A later draft must not reach the writer: only the approved version does.
    await t.call('POST', `/api/v1/books/${bookId}/blueprint/regenerate`, { part: 'summary' });
    await t.services.runner.runUntilIdle();

    await t.call('POST', `/api/v1/books/${bookId}/write`, {});
    await t.services.runner.runUntilIdle();
    const writes = ai.calls.filter((c) => c.stage === 'writing');
    const ch1 = writes.find((c) => (c.input.variables['section'] as Obj)['kind'] === 'chapter' && (c.input.variables['section'] as Obj)['number'] === 1)!;
    const ch2 = writes.find((c) => (c.input.variables['section'] as Obj)['kind'] === 'chapter' && (c.input.variables['section'] as Obj)['number'] === 2)!;
    const v = ch1.input.variables;
    expect(v['bookTypeId']).toBe('self-help');
    expect((v['blueprint'] as Obj)['summary']).toBe(approved.body.blueprint.data['summary']);
    expect((v['template'] as Obj)['id']).toBe('nonfiction');
    const summaries = v['previousSummaries'] as { title: string; summary: string }[];
    expect(summaries.length).toBeGreaterThan(0);
    expect(summaries[summaries.length - 1]!.title).toBe('Introduction');
    const chapters = approved.body.blueprint.data['chapters'] as { title: string }[];
    expect((v['nextChapter'] as Obj)['title']).toBe(chapters[1]!.title);
    expect((v['section'] as Obj)['isLast']).toBe(false);
    expect((ch2.input.variables['section'] as Obj)['isLast']).toBe(true);
    expect((ch2.input.variables['nextChapter'] as Obj)['title']).toBe('Conclusion');
    const prev2 = ch2.input.variables['previousSummaries'] as { title: string }[];
    expect(prev2[prev2.length - 1]!.title).toBe(chapters[0]!.title);
  });
});

describe('titles for a chosen direction', () => {
  it('keeps the first-direction default and writes titles for the direction the owner picks', async () => {
    t = await testApp();
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Bio.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings' });
    const bookId = b.body['id'] as string;

    await t.call('POST', `/api/v1/books/${bookId}/title-sets`, {});
    await t.services.runner.runUntilIdle();
    const first = await t.call<{ items: { id: string; directions: { key: string }[]; options: { direction_key: string }[] }[] }>(
      'GET',
      `/api/v1/books/${bookId}/title-sets`,
    );
    expect(first.body.items).toHaveLength(1);
    expect(first.body.items[0]!.directions).toHaveLength(5);

    const pick = await t.call<{ jobId: string }>('POST', `/api/v1/books/${bookId}/title-sets`, { directionKey: 'story' });
    expect(pick.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const second = await t.call<typeof first.body>('GET', `/api/v1/books/${bookId}/title-sets`);
    const latest = second.body.items[0]!;
    expect(second.body.items).toHaveLength(2);
    expect(latest.options.every((o) => o.direction_key === 'story')).toBe(true);
    expect(latest.directions.map((d) => d.key)).toEqual(first.body.items[0]!.directions.map((d) => d.key)); // kept for switching again

    const own = await t.call('POST', `/api/v1/books/${bookId}/title-sets`, { direction: { label: 'For night-shift nurses', audience: 'Nurses on nights' } });
    expect(own.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const third = await t.call<typeof first.body>('GET', `/api/v1/books/${bookId}/title-sets`);
    expect(third.body.items[0]!.options.every((o) => o.direction_key === 'owner')).toBe(true);

    const bad = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${bookId}/title-sets`, { directionKey: 'nope' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
    const both = await t.call<{ error: { code: string } }>('POST', `/api/v1/books/${bookId}/title-sets`, { directionKey: 'story', direction: { label: 'x' } });
    expect(both.status).toBe(400);
  });
});

describe('house-style checks in the writing job', () => {
  it('fixes em dashes and flags banned phrases and ISBNs with @volume/core and config/house-style.json', async () => {
    const ai = new RecordingAi((stage, input, r) => {
      if (stage !== 'writing' || (input.variables['section'] as Obj)['kind'] !== 'chapter') return r;
      const markdown = `Mornings matter ${EM_DASH} a lot.\n\nThis book will help you unlock calm. Order it with ISBN 978-0-306-40615-7 today.`;
      return { ...r, output: { markdown } };
    });
    t = await testApp({ ai });
    const bookId = await bookWithApprovedBlueprint(t, 1);
    await t.call('POST', `/api/v1/books/${bookId}/write`, {});
    await t.services.runner.runUntilIdle();
    const tree = await t.call<{ body: { id: string; kind: string; status: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
    const chapter = tree.body.body.find((s) => s.kind === 'chapter')!;
    expect(chapter.status).toBe('needs_attention');
    const one = await t.call<{ checks: { checker: string; severity: string; message: string }[] }>('GET', `/api/v1/sections/${chapter.id}`);
    const by = (c: string) => one.body.checks.filter((x) => x.checker === c);
    // Em dashes in AI text are fixed before the save (live acceptance run, 18 October 2026) and reported as information.
    expect(by('em_dash')).toEqual([]);
    expect(by('style_autofix').map((x) => x.severity)).toEqual(['info']);
    expect(by('banned').length).toBeGreaterThan(0);
    expect(by('guardrail').some((x) => x.severity === 'block' && /ISBN/.test(x.message))).toBe(true);
    // Clean mock text elsewhere raises no blocks.
    const intro = tree.body.body.find((s) => s.kind !== 'chapter');
    if (intro) expect(intro.status).toBe('done');
  });
});

describe('cost of a stage that fails part way', () => {
  it('records the spend the error carries and adds it to the book', async () => {
    let failed = false;
    const ai = new RecordingAi((stage, _input, r) => {
      if (stage === 'checks' && !failed) {
        failed = true;
        const err = new AiRetryableError('The second call failed.');
        attachPartialUsage(err, {
          usage: { ...r.usage, costUsd: 0.0123, inputTokens: 100, outputTokens: 50 },
          prompt: { id: 'checks.claims', version: 1, hash: 'h' },
        });
        throw err;
      }
      return r;
    });
    t = await testApp({ ai });
    const bookId = await bookWithApprovedBlueprint(t, 1);
    const before = await t.call<{ costToDateUsd: number }>('GET', `/api/v1/books/${bookId}/costs`);
    const tree = await t.call<{ body: { id: string; kind: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
    const chapter = tree.body.body.find((s) => s.kind === 'chapter')!;
    await t.call('POST', `/api/v1/sections/${chapter.id}/write`, {});
    await t.services.runner.runUntilIdle(1); // the attempt that fails at the checks stage (it is retried later)
    const after = await t.call<{ costToDateUsd: number; runs: { stage: string; status: string; costUsd: number; inputTokens: number }[] }>(
      'GET',
      `/api/v1/books/${bookId}/costs`,
    );
    const failedRun = after.body.runs.find((r) => r.status === 'failed');
    expect(failedRun).toMatchObject({ stage: 'checks', costUsd: 0.0123, inputTokens: 100 });
    // writing + summarise (mock price each) + the partial checks spend
    expect(after.body.costToDateUsd - before.body.costToDateUsd).toBeGreaterThan(0.0123);
  });
});

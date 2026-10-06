import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { selectAiAdapter } from '../src/adapters/openrouter-ai.js';
import { testApp, testConfig, type TestApp } from './helpers.js';

// MOCK_FAIL_NEXT_WRITING: the mock AI fails the nth writing call once with a model-unavailable error,
// so tests and demos can show a failed section, a retry and "write the rest". No network.

interface Obj {
  [k: string]: unknown;
}

interface JobView {
  status: string;
  errorCode: string | null;
  children: { id: string; status: string; error: string | null }[];
}

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

describe('MOCK_FAIL_NEXT_WRITING', () => {
  it('is read from the environment, blank counts as unset, and reaches the mock AI', async () => {
    expect(testConfig().mockFailNextWriting).toBeNull();
    expect(testConfig({ MOCK_FAIL_NEXT_WRITING: '' }).mockFailNextWriting).toBeNull();
    expect(testConfig({ MOCK_FAIL_NEXT_WRITING: '  ' }).mockFailNextWriting).toBeNull();
    expect(testConfig({ MOCK_FAIL_NEXT_WRITING: '2' }).mockFailNextWriting).toBe(2);
    expect(() => testConfig({ MOCK_FAIL_NEXT_WRITING: '0' })).toThrow();
    expect(() => testConfig({ MOCK_FAIL_NEXT_WRITING: 'next' })).toThrow();
    const { ai } = await selectAiAdapter({ choice: 'mock', apiKey: undefined, promptsDir: '', configDir: '', mockFailNextWriting: 3, log: () => undefined });
    expect((ai as unknown as { failWritingCall: number | null }).failWritingCall).toBe(3);
    const off = await selectAiAdapter({ choice: 'mock', apiKey: undefined, promptsDir: '', configDir: '', log: () => undefined });
    expect((off.ai as unknown as { failWritingCall: number | null }).failWritingCall).toBeNull();
  });

  it('fails only the nth writing call, once, as model unavailable; a retry and "write the rest" finish the book', async () => {
    t = await testApp({ ai: new MockAiAdapter({ failWritingCall: 2 }) });
    const id = await approvedBook(t, 3);
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const job = await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`);
    expect(job.body.status).toBe('failed');
    expect(job.body.errorCode).toBe('child_failed');
    const failed = job.body.children.filter((c) => c.status === 'failed');
    expect(failed).toHaveLength(1);
    // The dedication (writing call 1) and the acknowledgements placeholder (no AI call: the owner named nobody to thank).
    expect(job.body.children.filter((c) => c.status === 'succeeded' || c.status === 'needs_attention')).toHaveLength(2);
    const child = await t.call<{ errorCode: string | null; payload: { sectionId: string } }>('GET', `/api/v1/jobs/${failed[0]!.id}`);
    expect(child.body.errorCode).toBe('model_unavailable');

    // The switch fires once: the retry succeeds and the rest of the book is written.
    const retry = await t.call<{ jobId: string }>('POST', `/api/v1/sections/${child.body.payload.sectionId}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call<JobView>('GET', `/api/v1/jobs/${retry.body.jobId}`)).body.status).toBe('succeeded');
    const rest = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call<JobView>('GET', `/api/v1/jobs/${rest.body.jobId}`)).body.status).toBe('succeeded');
  });

  it('never fails when unset', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await approvedBook(t, 2);
    const w = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call<JobView>('GET', `/api/v1/jobs/${w.body.jobId}`)).body.status).toBe('succeeded');
  });
});

// Fixes from the first live book run (5 October 2026), at the server level. No network: the adapter runs on
// the @volume/ai MockProvider through a fake that reports itself as OpenRouter.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider, ImageRequest } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { createOpenRouterAi, mapVolumeAiError, packageUsageOf, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { ensureOwner } from '../src/auth/context.js';
import { JobFailed } from '../src/jobs/errors.js';
import { partialUsageOf } from '../src/ports/ai.js';
import { createRepos } from '../src/repos/index.js';
import { seedProfiles } from '../src/seed/seed.js';
import { memoryDb, testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');
const MODEL = 'test/model';
const IMAGE_MODEL = 'test/image-model';

type Obj = Record<string, unknown>;

let t: TestApp | undefined;
afterEach(async () => {
  await t?.close();
  t = undefined;
});

const usage = (costUsd: number): VolumeAi.Usage => ({
  ...VolumeAi.emptyUsage(),
  promptTokens: 900,
  completionTokens: 4000,
  reasoningTokens: 3900,
  costUsd,
  costSource: 'openrouter',
});

interface Fake {
  provider: AiProvider;
  images: ImageRequest[];
}

/** MockProvider answers, except that `fail` may throw a package error for a prompt id. */
function fake(fail?: (promptId: string) => Error | null): Fake {
  // Every configured slug is listed, so the runner's default models resolve.
  const defaults = JSON.parse(readFileSync(join(CONFIG, 'models.defaults.json'), 'utf8')) as {
    stages: Record<string, { defaultModel: string; fallbacks: string[] }>;
  };
  const slugs = new Set([MODEL, IMAGE_MODEL, ...Object.values(defaults.stages).flatMap((st) => [st.defaultModel, ...st.fallbacks])]);
  const mock = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [...slugs].map((slug) => VolumeAi.mockModelInfo(slug)) });
  const images: ImageRequest[] = [];
  const provider: AiProvider = {
    name: 'openrouter',
    async chat(req) {
      const err = fail?.(req.meta?.promptId ?? '');
      if (err) throw err;
      const r = await mock.chat(req);
      return { ...r, provider: 'openrouter', usage: { ...r.usage, costUsd: 0.002 } };
    },
    async generateImage(req) {
      images.push(req);
      return { ...(await mock.generateImage(req)), provider: 'openrouter' };
    },
    listModels: () => mock.listModels(),
    keyStatus: () => mock.keyStatus(),
  };
  return { provider, images };
}

async function adapter(f: Fake): Promise<OpenRouterAiAdapter> {
  return createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: f.provider });
}

const PROFILE = { penName: 'Test Author', isRealPerson: false, language: 'en-GB' };

describe('3. spend on failed calls reaches the runner', () => {
  it('a single-task stage that fails after paid calls attaches that spend and names the prompt', async () => {
    const f = fake((id) => (id === 'blueprint.blueprint' ? new VolumeAi.InvalidOutputError('did not match', ['x'], '', { usage: usage(0.07) }) : null));
    const ai = await adapter(f);
    const err = await ai
      .runStage(
        'blueprint',
        {
          promptId: 'blueprint.blueprint',
          variables: { title: 'T', idea: 'Calm mornings', template: 'nonfiction', bookTypeId: 'nonfiction', chapterCount: 3, profile: PROFILE },
        },
        { model: MODEL },
      )
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(JobFailed);
    const partial = partialUsageOf(err);
    expect(partial?.usage.costUsd).toBeCloseTo(0.07);
    expect(partial?.usage.outputTokens).toBe(4000);
    expect(partial?.prompt?.id).toBe('blueprint.blueprint');
  });

  it('a multi-task stage adds the failed task spend to the finished tasks', async () => {
    const cut = new VolumeAi.OutputTruncatedError(
      'The answer was cut off.',
      { partialText: '', maxTokens: 4000, finishReason: 'length', nativeFinishReason: 'max_tokens' },
      { usage: usage(0.04) },
    );
    const f = fake((id) => (id === 'titles.title-options' ? cut : null));
    const ai = await adapter(f);
    const err = await ai
      .runStage('titles', { promptId: 'titles.title-options', variables: { idea: 'Calm mornings', profile: PROFILE } }, { model: MODEL })
      .catch((e: unknown) => e);
    expect((err as JobFailed).code).toBe('output_truncated');
    expect((err as Error).message).toMatch(/cut off before it finished, so it was not used/);
    // 0.002 for the topic directions that worked, plus 0.04 for each cut-off try of the title options
    // (the package retries once with more room).
    expect(partialUsageOf(err)?.usage.costUsd).toBeCloseTo(0.082);
  });

  it('reads usage from error.usage or details.usage', () => {
    expect(packageUsageOf(new VolumeAi.AiError('server', 'x', { usage: usage(0.5) }))?.costUsd).toBe(0.5);
    expect(packageUsageOf(new VolumeAi.AiError('server', 'x', { details: { usage: usage(0.25) } }))?.costUsd).toBe(0.25);
    expect(packageUsageOf(new Error('plain'))).toBeNull();
  });

  it('the runner writes a failed prompt_runs row and the book cost counts it', async () => {
    const f = fake((id) => (id === 'blueprint.blueprint' ? new VolumeAi.InvalidOutputError('did not match', ['x'], '', { usage: usage(0.07) }) : null));
    t = await testApp({ ai: await adapter(f) });
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
    const id = b.body['id'] as string;
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 3 });
    await t.services.runner.runUntilIdle();
    const rows = await t.services.db.selectFrom('promptRuns').select(['stage', 'status', 'costUsd', 'promptId']).where('projectId', '=', id).execute();
    expect(rows).toEqual([expect.objectContaining({ stage: 'blueprint', status: 'failed', promptId: 'blueprint.blueprint' })]);
    expect(Number(rows[0]?.costUsd)).toBeCloseTo(0.07);
    const book = await t.call<Obj>('GET', `/api/v1/books/${id}`);
    const cost = (book.body['costToDateUsd'] ?? (book.body['book'] as Obj | undefined)?.['costToDateUsd']) as number;
    expect(cost).toBeCloseTo(0.07);
  });
});

describe('1 and 6. plain provider errors, cut-off answers, cover requests', () => {
  it('maps output_truncated and keeps provider words in a bad request', () => {
    const cut = new VolumeAi.OutputTruncatedError('Cut off at 4000 tokens.', {
      partialText: '',
      maxTokens: 4000,
      finishReason: 'length',
      nativeFinishReason: null,
    });
    expect((mapVolumeAiError(cut, { stage: 'titles' }) as JobFailed).code).toBe('output_truncated');
    const bad = new VolumeAi.BadRequestError('Provider returned error (Anthropic said: temperature: not supported)');
    expect(mapVolumeAiError(bad, { stage: 'blueprint' }).message).toBe(
      'The blueprint step could not be sent: Provider returned error (Anthropic said: temperature: not supported)',
    );
  });

  it('asks the images endpoint for one 2:3 image per concept', async () => {
    const f = fake();
    t = await testApp({ ai: await adapter(f) });
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
    const id = b.body['id'] as string;
    await t.call('POST', `/api/v1/books/${id}/cover/concepts`, {});
    await t.services.runner.runUntilIdle();
    expect(f.images.length).toBeGreaterThan(0);
    expect(f.images.every((r) => r.n === 1 && r.aspectRatio === '2:3')).toBe(true);
  });
});

describe('8. marketing needs written sections', () => {
  it('refuses with 409 and plain words before any chapter is written, then accepts', async () => {
    t = await testApp();
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
    const id = b.body['id'] as string;
    const refused = await t.call<{ error: { code: string; message: string } }>('POST', `/api/v1/books/${id}/marketing`, {});
    expect(refused.status).toBe(409);
    expect(refused.body.error.message).toMatch(/Write the book first/);
    expect(await t.services.db.selectFrom('jobs').select('id').where('kind', '=', 'marketing').execute()).toHaveLength(0);

    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 1 });
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    // Approved but not written: still refused.
    expect((await t.call('POST', `/api/v1/books/${id}/marketing`, {})).status).toBe(409);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/marketing`, {})).status).toBe(202);
  });
});

describe('7. seeded profile bios', () => {
  const files = ['gideon-akinlotan', 'harni-muharami', 'elena-marsh', 'jr-kade', 'tobi-rhymes'];
  const bioOf = (id: string): string => (JSON.parse(readFileSync(join(CONFIG, 'profiles', `${id}.json`), 'utf8')) as { bio: string }).bio;

  it('copies every profile bio word for word, and Gideon stays to confirm per his file', async () => {
    const handle = await memoryDb();
    try {
      const owner = await ensureOwner(handle.db);
      const repos = createRepos(handle.db);
      const report = await seedProfiles(repos, owner, CONFIG);
      expect(report.created.sort()).toEqual([...files].sort());
      for (const f of files) {
        const p = await repos.profiles.findBySourceKey(owner, `config:${f}`);
        expect(p?.bioThirdPerson).toBe(bioOf(f));
        expect(p?.bioThirdPerson.split(/\s+/).length).toBeGreaterThan(100);
      }
      expect((await repos.profiles.findBySourceKey(owner, 'config:gideon-akinlotan'))?.bioStatus).toBe('to_confirm');
    } finally {
      await handle.close();
    }
  });

  it('fills an empty, never-edited seeded bio on start, and leaves an owner-edited one alone', async () => {
    const handle = await memoryDb();
    try {
      const owner = await ensureOwner(handle.db);
      const repos = createRepos(handle.db);
      await seedProfiles(repos, owner, CONFIG);
      // An older database: Gideon's bio empty and untouched; Harni's emptied by the owner later.
      await handle.db.updateTable('authorProfiles').set({ bioThirdPerson: '' }).where('sourceKey', '=', 'config:gideon-akinlotan').execute();
      const harni = await repos.profiles.findBySourceKey(owner, 'config:harni-muharami');
      await handle.db
        .updateTable('authorProfiles')
        .set({ bioThirdPerson: '', updatedAt: (harni?.createdAt ?? 0) + 1000 })
        .where('sourceKey', '=', 'config:harni-muharami')
        .execute();

      const report = await seedProfiles(repos, owner, CONFIG);
      expect(report.created).toEqual([]);
      expect(report.bioFilled).toEqual(['gideon-akinlotan']);
      expect((await repos.profiles.findBySourceKey(owner, 'config:gideon-akinlotan'))?.bioThirdPerson).toBe(bioOf('gideon-akinlotan'));
      expect((await repos.profiles.findBySourceKey(owner, 'config:harni-muharami'))?.bioThirdPerson).toBe('');
    } finally {
      await handle.close();
    }
  });
});

// Clean production plan of 21 October 2026, Task 3: the pen name's writing samples reach the writer (trimmed), while a
// profile with no samples writes exactly as before.
// No network: the server mock AI and the @volume/ai MockProvider stand in for OpenRouter.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, profileInput, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { trimSample } from '../src/jobs/book-data.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');

type Obj = Record<string, unknown>;

/** The @volume/ai MockProvider behind the real adapter, listing every configured model. */
function packageMock(): { adapter: Promise<OpenRouterAiAdapter>; provider: VolumeAi.MockProvider } {
  const defaults = JSON.parse(readFileSync(join(CONFIG, 'models.defaults.json'), 'utf8')) as {
    stages: Record<string, { defaultModel: string; fallbacks: string[] }>;
  };
  const slugs = new Set(Object.values(defaults.stages).flatMap((st) => [st.defaultModel, ...st.fallbacks]));
  const provider = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [...slugs].map((slug) => VolumeAi.mockModelInfo(slug)) });
  return { adapter: createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider }), provider };
}

/** Server mock AI for every stage, recording what each writing call was given. */
class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly writingInputs: AiStageInput[] = [];
  private readonly inner = new MockAiAdapter();
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts: RunStageOptions = {}): Promise<AiStageResult<S>> {
    if (stage === 'writing') this.writingInputs.push(structuredClone(input));
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

async function newProfile(app: TestApp): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  return p.body['id'] as string;
}

async function approvedBook(app: TestApp, profileId: string, chapters: number): Promise<string> {
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId, idea: 'Calm mornings', title: 'Calm Mornings', template: 'nonfiction' });
  const id = b.body['id'] as string;
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: chapters });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  return id;
}

/** A paragraph of exactly n words. */
const para = (n: number, word: string): string => Array.from({ length: n }, () => word).join(' ') + '.';

describe('writing samples reach the writer', () => {
  it('trims a sample to whole paragraphs within 600 words', () => {
    const long = [para(250, 'alpha'), para(250, 'beta'), para(250, 'gamma')].join('\n\n');
    const cut = trimSample(long);
    expect(cut).toBe([para(250, 'alpha'), para(250, 'beta')].join('\n\n'));
    // One paragraph over the limit ends at its last full sentence inside the limit.
    const one = `${para(400, 'one')} ${para(400, 'two')}`;
    expect(trimSample(one)).toBe(para(400, 'one'));
    expect(trimSample('Short and sweet.')).toBe('Short and sweet.');
  });

  it('sends up to two sounds-like or writing samples, trimmed, as voice DNA; none when the profile has none', async () => {
    const pm = packageMock();
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const withSamples = await newProfile(t);
    const long = [para(300, 'first'), para(200, 'second'), para(300, 'third')].join('\n\n');
    for (const s of [
      { kind: 'not_like', text: 'Corporate memo prose.' },
      { kind: 'writing_sample', text: long },
      { kind: 'sounds_like', text: 'You hold the line kindly. You say what you can do.' },
      { kind: 'writing_sample', text: 'A third sample that is never sent.' },
    ]) {
      expect((await t.call('POST', `/api/v1/profiles/${withSamples}/samples`, s)).status).toBe(201);
    }
    const bookA = await approvedBook(t, withSamples, 1);
    await t.call('POST', `/api/v1/books/${bookA}/write`, {});
    await t.services.runner.runUntilIdle();

    const chapterA = ai.writingInputs.find((i) => (i.variables['section'] as Obj)['kind'] === 'chapter') as AiStageInput;
    const profileA = chapterA.variables['profile'] as Obj;
    expect(profileA['samples']).toEqual(['You hold the line kindly. You say what you can do.', [para(300, 'first'), para(200, 'second')].join('\n\n')]);
    const mapped = profileInput(profileA) as Obj;
    expect(mapped['voice']).toMatchObject({ soundsLike: profileA['samples'] });

    // Through the real adapter and prompt: both samples are in the writer's prompt, the not-like one is not.
    await (await pm.adapter).runStage('writing', chapterA);
    const sent =
      pm.provider.requests
        .at(-1)
        ?.messages.map((m) => m.content)
        .join('\n') ?? '';
    expect(sent).toContain('You hold the line kindly.');
    expect(sent).toContain('second second');
    expect(sent).not.toContain('third third');
    expect(sent).not.toContain('Corporate memo prose.');

    // A profile with no samples: no samples key, and the voice is what it was before (plain text or absent).
    const plain = await newProfile(t);
    const bookB = await approvedBook(t, plain, 1);
    const before = ai.writingInputs.length;
    await t.call('POST', `/api/v1/books/${bookB}/write`, {});
    await t.services.runner.runUntilIdle();
    const chapterB = ai.writingInputs.slice(before).find((i) => (i.variables['section'] as Obj)['kind'] === 'chapter') as AiStageInput;
    const profileB = chapterB.variables['profile'] as Obj;
    expect(profileB).toBeDefined();
    expect('samples' in profileB).toBe(false);
    const mappedB = profileInput(profileB) as Obj;
    expect(typeof mappedB['voice'] === 'string' || mappedB['voice'] === undefined).toBe(true);
    await (await pm.adapter).runStage('writing', chapterB);
    const sentB = pm.provider.requests.at(-1)?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(sentB).toContain('do not copy sentences): None');
  });
});

// house-style:off (fixtures quote AI text with dashes and US spellings on purpose)
// Fixes after the live acceptance run of 18 October 2026 (reports/volume/LIVE-ACCEPTANCE-2026-10-18.md).
// Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import { StageInputs, type AiProvider } from '@volume/ai';
import { describe, expect, it } from 'vitest';
import { createOpenRouterAi, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { storyInput } from '../src/jobs/picture-book.js';

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
interface Res {
  text: string;
  usage: Obj;
  [k: string]: unknown;
}
interface MockLike {
  chat(req: Req): Promise<Res>;
  listModels(): Promise<unknown[]>;
}
const pkg = VolumeAi as unknown as {
  MockProvider: new (opts: { chunkDelayMs?: number; models?: unknown[] }) => MockLike;
  mockModelInfo: (slug: string) => unknown;
};

/** The OpenRouter adapter over the package's mock provider, recording every request; `answer` may replace a raw answer. */
async function recordingAdapter(answer?: (promptId: string, raw: string) => string): Promise<{ ai: OpenRouterAiAdapter; seen: Req[] }> {
  const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(MODEL)] });
  const seen: Req[] = [];
  const provider = {
    name: 'openrouter' as const,
    async chat(req: Req): Promise<Res> {
      seen.push(req);
      const r = await mock.chat(req);
      const text = answer ? answer(req.meta?.promptId ?? '?', r.text) : r.text;
      return { ...r, text, provider: 'openrouter', usage: { ...r.usage, costUsd: 0 } };
    },
    generateImage: () => Promise.reject(new Error('no images in this test')),
    listModels: () => mock.listModels(),
    keyStatus: () => Promise.resolve({ valid: true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null }),
  };
  const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: provider as unknown as AiProvider });
  return { ai, seen };
}

const PICTURE_TEMPLATE = {
  audience: { defaultAgeRange: { min: 3, max: 7 } },
  spreads: { artStyleDefault: 'Soft watercolour' },
  storyRules: { wordLimit: { default: 600 } },
};

describe('1. picture-book story input matches the stage input schema', () => {
  it('sends goodnightMessage as text, on or off, and the whole input passes PictureBookStoryInput', () => {
    for (const goodnightMessage of [true, false, undefined]) {
      const story = storyInput(
        { story: { topic: 'Pip walks home', ...(goodnightMessage === undefined ? {} : { goodnightMessage }) } },
        PICTURE_TEMPLATE,
        null,
        10,
      );
      expect(story['goodnightMessage']).toBe(goodnightMessage === true ? 'on' : 'off');
      const parsed = StageInputs.PictureBookStoryInput.safeParse({ story });
      expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues)).toBe(true);
    }
  });

  it('runs the story stage through the real adapter without an input error', async () => {
    const { ai, seen } = await recordingAdapter();
    const story = storyInput({ story: { topic: 'Pip walks home', goodnightMessage: true } }, PICTURE_TEMPLATE, 'Idea', 10);
    const r = await ai.runStage('picture_story', { promptId: 'children.picture-book-story', variables: { story, title: 'Pip' } }, { model: MODEL });
    expect(r.output).toBeTruthy();
    const prompt = seen.map((s) => s.messages.map((m) => m.content).join('\n')).join('\n');
    expect(prompt).toContain('Goodnight message: on.');
  });
});

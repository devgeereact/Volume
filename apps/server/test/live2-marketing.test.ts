// house-style:off (fixtures quote AI text with dashes and odd hyphens on purpose)
// Fixes after the second live acceptance run of 19 October 2026 (reports/volume/LIVE-ACCEPTANCE-2026-10-19.md).
// Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider } from '@volume/ai';
import { describe, expect, it } from 'vitest';
import { createOpenRouterAi, tiktokBeat, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { tidyBeatLines } from '../src/jobs/handlers/production.js';

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
async function recordingAdapter(answer?: (promptId: string, raw: string, n: number) => string): Promise<{ ai: OpenRouterAiAdapter; seen: Req[] }> {
  const mock = new pkg.MockProvider({ chunkDelayMs: 0, models: [pkg.mockModelInfo(MODEL)] });
  const seen: Req[] = [];
  const provider = {
    name: 'openrouter' as const,
    async chat(req: Req): Promise<Res> {
      seen.push(req);
      const id = req.meta?.promptId ?? '?';
      const r = await mock.chat(req);
      const n = seen.filter((q) => q.meta?.promptId === id).length;
      const text = answer ? answer(id, r.text, n) : r.text;
      return { ...r, text, provider: 'openrouter', usage: { ...r.usage, costUsd: 0 } };
    },
    generateImage: () => Promise.reject(new Error('no images in this test')),
    listModels: () => mock.listModels(),
    keyStatus: () => Promise.resolve({ valid: true, label: null, limitUsd: null, limitRemainingUsd: null, usageUsd: null, isFreeTier: null }),
  };
  const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: provider as unknown as AiProvider });
  return { ai, seen };
}

describe('2. TikTok beats never start with ", : "', () => {
  it('leaves out a time with no letter or digit and keeps a real one', () => {
    expect(tiktokBeat({ second: '', say: 'Post your offer.' })).toBe('Post your offer.');
    expect(tiktokBeat({ second: '—', say: 'Post your offer.' })).toBe('Post your offer.');
    expect(tiktokBeat({ second: ', ', say: 'Post your offer.' })).toBe('Post your offer.');
    expect(tiktokBeat({ say: ', : Post your offer.' })).toBe('Post your offer.');
    expect(tiktokBeat({ second: '0–2', say: 'Post your offer.' })).toBe('0-2: Post your offer.');
    expect(tiktokBeat({ second: '0‑2', say: 'Post your offer.' })).toBe('0-2: Post your offer.');
    expect(tiktokBeat({ second: 3, say: 'Ask one question.' })).toBe('3: Ask one question.');
    expect(tiktokBeat({ second: '0-2', say: '' })).toBeNull();
  });

  it('tidies a saved script body line by line', () => {
    expect(tidyBeatLines(', : Post your offer.\n: Ask one question.\n\nOn screen: author to camera')).toBe(
      'Post your offer.\nAsk one question.\nOn screen: author to camera',
    );
  });

  it('builds clean beats from a model answer with empty, dash and comma times', async () => {
    const { ai } = await recordingAdapter((id, raw) => {
      if (id !== 'marketing.tiktok-scripts') return raw;
      const o = JSON.parse(raw) as { scripts: Obj[] };
      const times = ['', '—', ', ', '0–2'];
      return JSON.stringify({
        scripts: o.scripts.map((s) => ({ ...s, beats: times.map((second, i) => ({ second, say: `Beat ${i + 1}.`, show: 'author to camera' })) })),
      });
    });
    const res = await ai.runStage('marketing', { variables: { title: 'Side Projects', kinds: ['tiktok_script'] } }, { model: MODEL });
    expect(res.output.tiktok.length).toBeGreaterThan(0);
    for (const s of res.output.tiktok) expect(s.beats).toEqual(['Beat 1.', 'Beat 2.', 'Beat 3.', '0-2: Beat 4.']);
  });
});

// house-style:off (fixtures quote AI text with dashes and odd hyphens on purpose)
// Fixes after the second live acceptance run of 19 October 2026 (reports/volume/LIVE-ACCEPTANCE-2026-10-19.md).
// Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, distinctItems, estimatePlan, tiktokBeat, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { distinctMarketing, tidyBeatLines } from '../src/jobs/handlers/production.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
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

/** One Instagram caption in the prompt's output contract. */
function caption(n: number, firstLine = `Day ${n}: pick one small task and finish it.`): Obj {
  return {
    postType: 'single-image',
    angle: `Angle ${n}`,
    firstLine,
    body: `Chapter ${n} shows how to plan one evening of work and stop when the timer ends.`,
    cta: 'Link in bio',
    hashtags: ['#sideproject', '#planning'],
    imageIdea: 'A notebook on a desk',
    carouselSlides: null,
    needs: [],
  };
}
const SAME = caption(1, 'Five identical captions start here.');

function userText(r: Req): string {
  return r.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join('\n');
}

describe('1. marketing items are distinct', () => {
  it('drops duplicate captions and asks once more for the missing ones, naming the openings already used', async () => {
    const { ai, seen } = await recordingAdapter((id, raw, n) => {
      if (id !== 'marketing.instagram-captions') return raw;
      return JSON.stringify({ captions: n === 1 ? [SAME, SAME, SAME, SAME, SAME] : [caption(2), caption(3), SAME, caption(4), caption(5)] });
    });
    const res = await ai.runStage('marketing', { variables: { title: 'Side Projects', kinds: ['instagram_caption'], instagramCount: 5 } }, { model: MODEL });
    const captions = res.output.instagram.map((c) => c.caption);
    expect(captions).toHaveLength(5);
    expect(new Set(captions).size).toBe(5);
    const calls = seen.filter((q) => q.meta?.promptId === 'marketing.instagram-captions');
    expect(calls).toHaveLength(2);
    expect(userText(calls[0]!)).toContain('Number of captions: 5, each with a different angle');
    expect(userText(calls[1]!)).toContain('Number of captions: 4,');
    expect(userText(calls[1]!)).toContain('Five identical captions start here.');
  });

  it('makes no extra call when every item is distinct, and at most one when the retry repeats itself', async () => {
    const distinct = await recordingAdapter((id, raw) =>
      id === 'marketing.instagram-captions' ? JSON.stringify({ captions: [1, 2, 3].map((n) => caption(n)) }) : raw,
    );
    const ok = await distinct.ai.runStage(
      'marketing',
      { variables: { title: 'Side Projects', kinds: ['instagram_caption'], instagramCount: 3 } },
      { model: MODEL },
    );
    expect(ok.output.instagram).toHaveLength(3);
    expect(distinct.seen.filter((q) => q.meta?.promptId === 'marketing.instagram-captions')).toHaveLength(1);

    const stuck = await recordingAdapter((id, raw) => (id === 'marketing.instagram-captions' ? JSON.stringify({ captions: [SAME, SAME, SAME] }) : raw));
    const one = await stuck.ai.runStage(
      'marketing',
      { variables: { title: 'Side Projects', kinds: ['instagram_caption'], instagramCount: 3 } },
      { model: MODEL },
    );
    expect(one.output.instagram).toHaveLength(1);
    expect(stuck.seen.filter((q) => q.meta?.promptId === 'marketing.instagram-captions')).toHaveLength(2);
  });

  it('sends the owner instruction and the other items when one script is regenerated, and drops a repeat of them', async () => {
    const { ai, seen } = await recordingAdapter((id, raw) => {
      if (id !== 'marketing.tiktok-scripts') return raw;
      const o = JSON.parse(raw) as { scripts: Obj[] };
      const base = o.scripts[0] ?? {};
      return JSON.stringify({ scripts: [{ ...base, hooks: ['Already posted hook'], beats: [{ second: '0-3', say: 'Say it.', show: 'author' }] }] });
    });
    const res = await ai.runStage(
      'marketing',
      { variables: { title: 'Side Projects', kinds: ['tiktok_script'], count: 1, instruction: 'Use chapter four.', avoid: ['Already posted hook'] } },
      { model: MODEL },
    );
    // Both answers repeat a sibling's hook: nothing new comes back, after one retry.
    expect(res.output.tiktok).toHaveLength(0);
    const calls = seen.filter((q) => q.meta?.promptId === 'marketing.tiktok-scripts');
    expect(calls).toHaveLength(2);
    expect(userText(calls[0]!)).toContain('Use chapter four.');
    expect(userText(calls[0]!)).toContain('Already posted hook');
  });

  it('distinctItems keeps the order, folds case and punctuation, and never returns more than asked', async () => {
    const keys = (s: string): string[] => [s];
    expect(await distinctItems(['A b.', 'a B', 'c', 'd', 'e'], 3, [], keys, () => Promise.resolve(['x']))).toEqual(['A b.', 'c', 'd']);
    expect(await distinctItems(['a', 'b'], 2, ['B!'], keys, () => Promise.resolve(['b', 'c']))).toEqual(['a', 'c']);
  });

  it('prices the duplicate retry at the high end of the marketing estimate', async () => {
    const plan = estimatePlan('marketing', { variables: { title: 'Side Projects', kinds: ['tiktok_script', 'instagram_caption', 'launch_email'] } });
    expect(plan.map((p) => [p.task, p.times, p.highTimes ?? p.times])).toEqual([
      ['marketing.tiktok-scripts', 1, 2],
      ['marketing.instagram-captions', 1, 2],
      ['marketing.launch-email', 1, 1],
    ]);
    const { ai } = await recordingAdapter();
    const e = await ai.estimate('marketing', { variables: { title: 'Side Projects', kinds: ['instagram_caption'] } }, { model: MODEL });
    expect(e.highUsd).toBeGreaterThan(e.lowUsd * 1.5);
  });

  it('distinctMarketing drops a repeat of the same kind only', () => {
    const item = (kind: string, body: string) => ({ kind, hook: null, body });
    expect(distinctMarketing([item('instagram_caption', 'Same.'), item('instagram_caption', 'same'), item('tiktok_script', 'Same.')])).toHaveLength(2);
  });
});

/** The mock AI with every Instagram caption the same, recording the marketing inputs. */
class DuplicateAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly inner = new MockAiAdapter();
  readonly marketing: AiStageInput[] = [];
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    const r = await this.inner.runStage(stage, input, opts);
    if (stage !== 'marketing') return r;
    this.marketing.push(structuredClone(input));
    const out = r.output as Obj;
    const insta = (out['instagram'] as Obj[]).map((c) => ({ ...c, caption: 'The same caption, word for word.' }));
    return { ...r, output: { ...out, instagram: insta } as AiStageResult<S>['output'] };
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

describe('1. marketing job saves each post once', () => {
  it('keeps one of five identical captions, and a regenerate sends the instruction and the other openings', async () => {
    const ai = new DuplicateAi();
    t = await testApp({ ai });
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', {
      profileId: p.body['id'],
      idea: 'Side projects',
      title: 'Side Projects',
      settings: { acknowledgements: 'Sam' },
    });
    const id = str(b.body['id']);
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    expect((await t.call('POST', `/api/v1/books/${id}/marketing`, {})).status).toBe(202);
    await t.services.runner.runUntilIdle();
    const mk = await t.call<{ items: { id: string; kind: string; body: string; hook: string | null }[] }>('GET', `/api/v1/books/${id}/marketing`);
    expect(mk.body.items.filter((i) => i.kind === 'instagram_caption')).toHaveLength(1);
    const scripts = mk.body.items.filter((i) => i.kind === 'tiktok_script');
    expect(scripts.length).toBeGreaterThan(1);

    const job = await t.call('POST', `/api/v1/marketing/${scripts[0]!.id}/regenerate`, { instruction: 'Use chapter two.' });
    expect(job.status).toBe(202);
    await t.services.runner.runUntilIdle();
    const sent = ai.marketing.at(-1)?.variables ?? {};
    expect(sent['instruction']).toBe('Use chapter two.');
    expect(sent['avoid']).toEqual(expect.arrayContaining(scripts.slice(1).map((s) => s.hook)));
    expect(sent['avoid']).toHaveLength(scripts.length - 1);
  });
});

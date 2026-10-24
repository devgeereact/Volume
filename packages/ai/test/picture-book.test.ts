// Phase 7 (P7-4): picture-book stages and image requests with references and a seed (D-045). Mock provider and a
// local fake server only; no network.
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BadRequestError,
  MAX_IMAGE_SEED,
  MockProvider,
  OpenRouterClient,
  StageOutputs,
  TASKS,
  createAiService,
  mockModelInfo,
  seedFromKey,
  toImageReference,
  type AiService,
  type MockProviderOptions,
} from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR, sendJson, startFakeServer, type FakeServer } from './helpers.ts';

const IMAGE_MODEL = 'google/gemini-2.5-flash-image';
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function service(mock: MockProviderOptions = {}): AiService {
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0, ...mock } });
}

function images(s: AiService) {
  return (s.provider as MockProvider).imageRequests;
}

describe('picture-book stages (mock fixtures)', () => {
  it('writes a 10-spread story that passes its safety check on the writing model', async () => {
    const r = await service().runStage('children.picture-book-story', FULL_INPUT);
    expect(r.stage).toBe('writing');
    expect(r.output.spreads).toHaveLength(10);
    expect(r.output.spreads.map((x) => x.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.output.safetyCheck.passed).toBe(true);
    const text = r.output.spreads.map((x) => x.text).join(' ');
    expect(text.match(/patient/gi)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(text).not.toContain('—');
    expect(r.guardrails.passed).toBe(true);
  });

  it('returns a failed safety check as data, so the server can stop the job', async () => {
    const s = service({ fixturesDirs: [join(FIXTURES_DIR, 'unsafe'), FIXTURES_DIR] });
    const r = await s.runStage('children.picture-book-story', FULL_INPUT);
    expect(r.output.safetyCheck.passed).toBe(false);
    expect(r.output.safetyCheck.notes.join(' ')).toContain('alone');
  });

  it('story v3 sends the gentle problem as {{story.conflict}}, "None" when left out; v2 stays loadable', async () => {
    const s = service();
    expect(s.prompts.versions('children.picture-book-story')).toEqual([1, 2, 3]);
    const r = await s.runStage('children.picture-book-story', FULL_INPUT);
    expect(r.promptVersion).toBe(3);
    const user = (s.provider as MockProvider).requests[0]?.messages[1]?.content ?? '';
    expect(user).toContain('Gentle problem (may be empty): Hattie wants the apples to be ripe now and finds waiting hard.');
    expect(user).toContain('Topic or title idea: a sleepy hedgehog\n');

    const bare = service();
    await bare.runStage('children.picture-book-story', { ...FULL_INPUT, story: { ...FULL_INPUT.story, conflict: undefined } });
    const sys = (bare.provider as MockProvider).requests[0]?.messages[0]?.content ?? '';
    expect(sys).toContain('The gentle problem: None.');
    expect(s.prompts.load('children.picture-book-story', 2).variables).not.toContain('story.conflict');
  });

  it('refuses a gentle problem over 500 characters', async () => {
    await expect(
      service().runStage('children.picture-book-story', { ...FULL_INPUT, story: { ...FULL_INPUT.story, conflict: 'x'.repeat(501) } }),
    ).rejects.toThrow();
  });

  it('scene prompts v3 give a layout, a text area and the characters per spread, with sheets word for word', async () => {
    const s = service();
    const r = await s.runStage('children.scene-prompts', FULL_INPUT);
    expect(r.promptVersion).toBe(3);
    expect(r.stage).toBe('cover_brief');
    const sheets = new Map(r.output.characterSheets.map((c) => [c.name, c.prompt]));
    expect(r.output.scenes).toHaveLength(10);
    for (const scene of r.output.scenes) {
      expect(StageOutputs.SPREAD_LAYOUTS).toContain(scene.layout);
      expect(scene.textArea.length).toBeGreaterThan(5);
      expect(scene.imagePrompt).toContain('2:1');
      expect(scene.imagePrompt).toContain(r.output.styleLine);
      expect(scene.imagePrompt).toContain('No text, no letters');
      for (const name of scene.characters) {
        expect(sheets.has(name), name).toBe(true);
        expect(scene.imagePrompt).toContain(sheets.get(name));
      }
    }
    expect(new Set(r.output.scenes.map((x) => x.layout)).size).toBeGreaterThan(1);
  });

  it('scene prompts v3 ask for layout and the centre line; v2 stays loadable for pinned runs', () => {
    const s = service();
    expect(s.prompts.versions('children.scene-prompts')).toEqual([1, 2, 3]);
    const v3 = s.prompts.load('children.scene-prompts');
    expect(v3.system).toContain('text-left');
    expect(v3.system).toContain('centre line');
    expect(TASKS['children.scene-prompts'].output.safeParse({ characterSheets: [], styleLine: 'x', scenes: [{ spread: 1 }], cover: {} }).success).toBe(false);
  });

  it('character references: one prompt per main character, with the scene prompts in the request', async () => {
    const s = service();
    const r = await s.runStage('children.character-reference', FULL_INPUT);
    expect(r.stage).toBe('cover_brief');
    expect(r.output.references.map((x) => x.name)).toEqual(['Hattie', 'Bramble']);
    for (const ref of r.output.references) expect(ref.imagePrompt).toContain('head to toe');
    const user = (s.provider as MockProvider).requests[0]?.messages[1]?.content ?? '';
    expect(user).toContain('Soft watercolour picture-book style');
    expect(user).toContain('Hattie Goes To Sleep');
  });
});

describe('image requests with references and a seed', () => {
  it('uses the aspect ratio for the purpose: spread 16:9, character reference 2:3, cover 2:3', async () => {
    const s = service();
    const spread = await s.generateImage('A spread, no text', { purpose: 'spread' });
    await s.generateImage('A reference, no text', { purpose: 'character-reference' });
    await s.generateImage('A cover, no text');
    await s.generateImage('A spread, no text', { purpose: 'spread', aspectRatio: '3:2' });
    expect(images(s).map((r) => r.aspectRatio)).toEqual(['16:9', '2:3', '2:3', '3:2']);
    expect(spread.aspectRatio).toBe('16:9');
  });

  it('sends reference bytes as data URLs and the seed when the model lists seed', async () => {
    const s = service({ models: [mockModelInfo(IMAGE_MODEL, { inputModalities: ['text', 'image'], supportedParameters: ['seed'] })] });
    await s.listModels();
    const seed = seedFromKey('book_1');
    const r = await s.generateImage('Spread 1, no text', {
      purpose: 'spread',
      seed,
      inputReferences: [{ data: PNG, mediaType: 'image/png' }, { url: 'https://example.org/bramble.png' }],
    });
    expect(r.referencesSent).toBe(2);
    expect(r.seedSent).toBe(true);
    expect(r.notes).toEqual([]);
    const req = images(s)[0];
    expect(req?.seed).toBe(seed);
    expect(req?.inputReferences?.[0]?.url).toBe(`data:image/png;base64,${Buffer.from(PNG).toString('base64')}`);
    expect(req?.inputReferences?.[1]?.url).toBe('https://example.org/bramble.png');
  });

  it('sends at most 3 reference images and says how many were left out', async () => {
    const s = service({ models: [mockModelInfo(IMAGE_MODEL, { inputModalities: ['text', 'image'] })] });
    await s.listModels();
    const ref = { data: PNG, mediaType: 'image/png' };
    const r = await s.generateImage('Spread, no text', { purpose: 'spread', inputReferences: [ref, ref, ref, ref] });
    expect(r.referencesSent).toBe(3);
    expect(images(s)[0]?.inputReferences).toHaveLength(3);
    expect(r.notes.join(' ')).toContain('at most 3 reference images, so 1 were left out');
  });

  it('leaves the seed out, with a note, when the model does not list it or no model list is loaded', async () => {
    const listed = service({ models: [mockModelInfo(IMAGE_MODEL, { inputModalities: ['text', 'image'] })] });
    await listed.listModels();
    const a = await listed.generateImage('Spread, no text', { seed: 7 });
    expect(a.seedSent).toBe(false);
    expect(a.notes.join(' ')).toContain('does not list seed');
    expect(images(listed)[0]?.seed).toBeUndefined();

    const unlisted = service();
    const b = await unlisted.generateImage('Spread, no text', { seed: 7, inputReferences: [{ data: PNG, mediaType: 'image/png' }] });
    expect(b.seedSent).toBe(false);
    expect(b.notes.join(' ')).toContain('no model list loaded');
    expect(b.referencesSent).toBe(1);
  });

  it('leaves references out, with a note, when the model takes no image input', async () => {
    const s = service({ models: [mockModelInfo(IMAGE_MODEL, { inputModalities: ['text'] })] });
    await s.listModels();
    const r = await s.generateImage('Spread, no text', { inputReferences: [{ data: PNG, mediaType: 'image/png' }] });
    expect(r.referencesSent).toBe(0);
    expect(r.notes.join(' ')).toContain('takes no image input');
    expect(images(s)[0]?.inputReferences).toBeUndefined();
  });

  it('refuses a bad seed or reference before any call', async () => {
    const s = service();
    await expect(s.generateImage('x', { seed: -1 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(s.generateImage('x', { seed: 1.5 })).rejects.toBeInstanceOf(BadRequestError);
    await expect(s.generateImage('x', { inputReferences: [{ url: 'file:///etc/passwd' }] })).rejects.toBeInstanceOf(BadRequestError);
    await expect(s.generateImage('x', { inputReferences: [{ data: PNG, mediaType: 'image/gif' }] })).rejects.toBeInstanceOf(BadRequestError);
    expect(images(s)).toHaveLength(0);
  });

  it('makes a stable seed per key inside the accepted range', () => {
    expect(seedFromKey('book_1')).toBe(seedFromKey('book_1'));
    expect(seedFromKey('book_1')).not.toBe(seedFromKey('book_2'));
    for (const k of ['a', 'b', 'c', 'book_99']) {
      const n = seedFromKey(k);
      expect(Number.isInteger(n) && n >= 0 && n <= MAX_IMAGE_SEED).toBe(true);
    }
    expect(toImageReference({ url: ' https://example.org/a.png ' })).toEqual({ url: 'https://example.org/a.png' });
  });
});

describe('OpenRouter images body', () => {
  let server: FakeServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  it('sends input_references as image_url objects and seed as a number', async () => {
    server = await startFakeServer((_req, res) => sendJson(res, 200, { data: [{ b64_json: Buffer.from('png').toString('base64'), media_type: 'image/png' }] }));
    const client = new OpenRouterClient({ apiKey: 'test-key-not-real', baseUrl: server.url, retry: { delaysMs: [5], jitter: 0 } });
    await client.generateImage({
      model: IMAGE_MODEL,
      prompt: 'a spread',
      aspectRatio: '2:1',
      inputReferences: [{ url: 'data:image/png;base64,AAAA' }],
      seed: 42,
    });
    expect(server.requests[0]?.body).toEqual({
      model: IMAGE_MODEL,
      prompt: 'a spread',
      aspect_ratio: '2:1',
      input_references: [{ type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } }],
      seed: 42,
    });
  });
});

// Phase 6 (P6-4): fiction and workbook books through the job queue with the mock AI, the real exporter for preflight
// and the pack. Mock provider only, no live calls.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider, ChatRequest, ChatResult } from '@volume/ai';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { bookInput, OpenRouterAiAdapter, taskFor, templateIdOf } from '../src/adapters/openrouter-ai.js';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { loadBookStructure, promptTemplate } from '../src/config/book-structure.js';
import { TEMPLATE_RULES_CHECKER, templateChecks } from '../src/jobs/book-checks.js';
import type { AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { buildCovers, testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = join(ROOT, 'config');
const PROMPTS = join(ROOT, 'prompts');
const NOW = new Date(Date.UTC(2026, 9, 17, 12));

interface Obj {
  [k: string]: unknown;
}
type Item = { id: string; severity: string; message: string };

function para(n: number, topic: string): string {
  return Array.from({ length: n }, (_, i) => `This is paragraph ${i + 1} about ${topic}. It keeps to plain British English and moves the story on.`).join(
    '\n\n',
  );
}

async function promptTemplateFor(id: string): Promise<unknown> {
  return promptTemplate(await loadBookStructure(CONFIG, null, id));
}

describe('fiction and workbook books from idea to pack', () => {
  let t: TestApp;
  const exporter = new VolumeExportAdapter({ root: ROOT, now: () => NOW });

  beforeAll(async () => {
    t = await testApp({ exporter });
  });
  afterAll(async () => {
    await t.close();
  });

  async function sections(id: string): Promise<Obj[]> {
    const tree = await t.call<{ front: Obj[]; body: Obj[]; back: Obj[] }>('GET', `/api/v1/books/${id}/sections`);
    return [...tree.body.front, ...tree.body.body, ...tree.body.back];
  }
  async function current(sectionId: string): Promise<string> {
    return (await t.call<{ current: { bodyMd: string } }>('GET', `/api/v1/sections/${sectionId}`)).body.current.bodyMd;
  }
  async function blocks(id: string): Promise<Item[]> {
    const pre = await t.call<{ items: Item[] }>('GET', `/api/v1/books/${id}/preflight`);
    return pre.body.items.filter((i) => i.severity === 'block');
  }

  /** Writes a book of the template with the mock, then pads each chapter (keeping its own text) past KDP's page minimum. */
  async function written(template: 'fiction' | 'workbook', title: string): Promise<string> {
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', {
      profileId: p.body.id,
      idea: title,
      title,
      template,
      settings: { acknowledgements: 'Sam', ...(template === 'fiction' ? { pov: 'close third, Mara Quill', tense: 'past' } : {}) },
    });
    expect(b.status).toBe(201);
    const id = b.body.id;
    expect((await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 })).status).toBe(202);
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    for (const c of (await sections(id)).filter((s) => s['kind'] === 'chapter')) {
      const md = await current(c['id'] as string);
      const saved = await t.call('POST', `/api/v1/sections/${c['id'] as string}/versions`, { bodyMd: `${md}\n\n${para(140, title)}` });
      expect(saved.status).toBe(201);
    }
    return id;
  }

  async function packIt(id: string): Promise<void> {
    expect((await blocks(id)).map((i) => i.id)).toEqual(['cover.files']);
    await buildCovers(t, id);
    expect(await blocks(id)).toEqual([]);
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/exports`, { kinds: ['pdf_print', 'md'] });
    await t.services.runner.runUntilIdle();
    expect((await t.call<{ status: string }>('GET', `/api/v1/jobs/${job.body.jobId}`)).body.status).toBe('succeeded');
    const exps = await t.call<{ items: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/exports`);
    expect(exps.body.items.find((e) => e.kind === 'pack')?.status).toBe('done');
  }

  it('writes a fiction book with a story bible, scene breaks and character and setting ledger entries, then packs it', async () => {
    const id = await written('fiction', 'The Lighthouse Keeper');
    const bp = await t.call<{ blueprint: { data: Obj } }>('GET', `/api/v1/books/${id}/blueprint`);
    expect(bp.body.blueprint.data['storyBible']).toMatchObject({ characters: [{ name: 'Mara Quill' }] });
    const chapters = (await sections(id)).filter((s) => s['kind'] === 'chapter');
    expect(chapters.every((c) => c['status'] === 'done')).toBe(true);
    const chapter = chapters[0]!;
    expect((chapter['plan'] as Obj)['povCharacter']).toBe('Mara Quill');
    const md = await current(chapter['id'] as string);
    expect(md).toContain('\n***\n');
    expect(md).not.toMatch(/^##\s/m);
    const characters = await t.call<{ items: { kind: string; key: string }[] }>('GET', `/api/v1/books/${id}/story-ledger?kind=character`);
    expect(characters.body.items.map((e) => e.key)).toContain('mara quill');
    const settings = await t.call<{ items: { kind: string; key: string }[] }>('GET', `/api/v1/books/${id}/story-ledger?kind=setting`);
    expect(settings.body.items.map((e) => e.key)).toContain('the lighthouse');
    expect((await t.call('GET', `/api/v1/books/${id}/story-ledger?kind=dragon`)).status).toBe(400);
    await packIt(id);
  }, 90_000);

  it('writes a workbook with planned exercises in every chapter, then packs it', async () => {
    const id = await written('workbook', 'The Weekly Reset');
    const chapters = (await sections(id)).filter((s) => s['kind'] === 'chapter');
    expect(chapters.every((c) => c['status'] === 'done')).toBe(true);
    expect(((chapters[0]!['plan'] as Obj)['exercises'] as unknown[]).length).toBe(2);
    const md = await current(chapters[0]!['id'] as string);
    expect(md).toContain('::: exercise reflection');
    expect(md).toContain('::: exercise checklist');
    await packIt(id);
  }, 90_000);

  it('blocks the pack when a fiction chapter breaks the template rules', async () => {
    const id = await written('fiction', 'The Broken Rules');
    const chapter = (await sections(id)).find((s) => s['kind'] === 'chapter')!;
    const md = await current(chapter['id'] as string);
    await t.call('POST', `/api/v1/sections/${chapter['id'] as string}/versions`, { bodyMd: `${md}\n\n## A Subheading\n\nMore text.` });
    expect((await blocks(id)).map((i) => i.id)).toContain('structure.template-rules');
  }, 90_000);
});

describe('template checks in the checker gate', () => {
  let t: TestApp | null = null;
  afterEach(async () => {
    await t?.close();
    t = null;
  });

  it('flags subheadings and takeaways in a fiction chapter and a workbook chapter with no exercises', async () => {
    const fiction = await promptTemplateFor('fiction');
    const sec = { id: 's1', kind: 'chapter', title: 'One', number: 1 };
    const bad = templateChecks('# One\n\nText.\n\n## A Subheading\n\nMore.\n\n### Key Takeaways\n\n- One', sec, fiction);
    expect(bad.map((c) => [c.checker, c.severity, c.location['code']])).toEqual([
      [TEMPLATE_RULES_CHECKER, 'block', 'fiction.subheading'],
      [TEMPLATE_RULES_CHECKER, 'block', 'fiction.takeaways'],
    ]);
    expect(templateChecks('# One\n\nScene one.\n\n* * *\n\nScene two.', sec, fiction)).toEqual([]);
    const workbook = await promptTemplateFor('workbook');
    expect(templateChecks('# One\n\nText.', sec, workbook).map((c) => [c.severity, c.location['code']])).toEqual([['block', 'workbook.exercise-count']]);
    // Non-fiction and front matter keep their old behaviour.
    expect(templateChecks('# One\n\n## Sub\n\nText.', sec, await promptTemplateFor('nonfiction'))).toEqual([]);
    expect(templateChecks('# Prologue\n\n## Sub', { ...sec, kind: 'prologue', number: null }, fiction)).toEqual([]);
  });

  it('sets a written fiction chapter with a subheading to needs attention', async () => {
    class SubheadingAi extends MockAiAdapter {
      override async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
        const r = await super.runStage(stage, input, opts);
        const section = input.variables['section'] as Obj | undefined;
        if (stage !== 'writing' || section?.['kind'] !== 'chapter') return r;
        const out = r.output as { markdown: string };
        return { ...r, output: { markdown: `${out.markdown}\n\n## Not Allowed Here\n\nText.` } as AiStageResult<S>['output'] };
      }
    }
    t = await testApp({ ai: new SubheadingAi() });
    const p = await t.call<{ id: string }>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
    const b = await t.call<{ id: string }>('POST', '/api/v1/books', { profileId: p.body.id, idea: 'x', title: 'Rules', template: 'fiction' });
    await t.call('POST', `/api/v1/books/${b.body.id}/blueprints`, { chapterCount: 1 });
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${b.body.id}/blueprint/approve`, {});
    await t.call('POST', `/api/v1/books/${b.body.id}/write`, {});
    await t.services.runner.runUntilIdle();
    const tree = await t.call<{ body: Obj[] }>('GET', `/api/v1/books/${b.body.id}/sections`);
    const chapter = tree.body.body.find((s) => s['kind'] === 'chapter')!;
    expect(chapter['status']).toBe('needs_attention');
    const detail = await t.call<{ checks: { checker: string; severity: string }[] }>('GET', `/api/v1/sections/${chapter['id'] as string}`);
    expect(detail.body.checks.some((c) => c.checker === TEMPLATE_RULES_CHECKER && c.severity === 'block')).toBe(true);
  });
});

/** A @volume/ai provider on the mock that records every request. */
function recording(): { provider: AiProvider; seen: ChatRequest[]; images: unknown[] } {
  const seen: ChatRequest[] = [];
  const images: unknown[] = [];
  const mock = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [VolumeAi.mockModelInfo('test/model')] });
  const provider: AiProvider = {
    name: 'openrouter',
    chat: async (req: ChatRequest): Promise<ChatResult> => {
      seen.push(req);
      return mock.chat(req);
    },
    generateImage: (req) => {
      images.push(req);
      return mock.generateImage(req);
    },
    listModels: () => mock.listModels(),
    keyStatus: () => mock.keyStatus(),
  };
  return { provider, seen, images };
}

describe('OpenRouter adapter: template tasks and picture-book stages', () => {
  it('picks the template task for fiction and workbook, and the base task otherwise', () => {
    expect(taskFor('writing.chapter', { template: { id: 'fiction' } })).toBe('writing.chapter-fiction');
    expect(taskFor('blueprint.blueprint', { templateId: 'workbook' })).toBe('blueprint.blueprint-workbook');
    expect(taskFor('writing.extend-section', { template: 'fiction' })).toBe('writing.extend-section-fiction');
    expect(taskFor('blueprint.regenerate-part', { template: { id: 'fiction' } })).toBe('blueprint.regenerate-part-fiction');
    expect(taskFor('writing.chapter', { template: { id: 'nonfiction' } })).toBe('writing.chapter');
    expect(templateIdOf({})).toBeNull();
  });

  it('sends template, point of view and tense, with the template voice as the fallback', async () => {
    const fiction = await promptTemplateFor('fiction');
    expect(bookInput({ template: fiction })).toMatchObject({ template: 'fiction', pov: 'close-third', tense: 'past' });
    expect(bookInput({ template: fiction, book: { pov: 'first person', tense: 'present' } })).toMatchObject({ pov: 'first person', tense: 'present' });
    expect(bookInput({ template: await promptTemplateFor('nonfiction') })).not.toHaveProperty('pov');
  });

  it('runs the fiction blueprint and chapter prompts, keeps the story bible and maps characters and settings', async () => {
    const { provider, seen } = recording();
    const ai = new OpenRouterAiAdapter(VolumeAi.createAiService({ promptsDir: PROMPTS, configDir: CONFIG, provider }));
    const template = await promptTemplateFor('fiction');
    const bp = await ai.runStage('blueprint', { variables: { title: 'Lights', idea: 'A lighthouse', template, wordTarget: 6000 } });
    expect(seen.at(-1)?.meta?.promptId).toBe('blueprint.blueprint-fiction');
    expect(bp.output.storyBible).toBeDefined();
    const ch = bp.output.chapters[0]!;
    expect(typeof ch.povCharacter).toBe('string');
    expect(Array.isArray(ch.scenes)).toBe(true);

    await ai.runStage('writing', {
      promptId: 'writing.chapter',
      variables: {
        template,
        blueprint: bp.output,
        section: { kind: 'chapter', number: 1, title: 'One', povCharacter: 'Mara', setting: 'Quay', scenes: ['A', 'B'] },
      },
    });
    const req = seen.at(-1);
    expect(req?.meta?.promptId).toBe('writing.chapter-fiction');
    const sent = (req?.messages ?? []).map((m) => m.content).join('\n');
    expect(sent).toContain('Mara');
    expect(sent).toContain('Quay');

    const sum = await ai.runStage('summarise', {
      variables: { template, markdown: '# One\n\nMara walked.', section: { kind: 'chapter', number: 1, title: 'One' } },
    });
    expect(sum.output.ledger.every((e) => typeof e.kind === 'string')).toBe(true);
  });

  it('maps fiction ledger additions to character and setting kinds', async () => {
    const answer = {
      summary: 'Mara keeps the light.',
      keyPoints: [],
      closingLine: '',
      ledgerAdditions: {
        stories: [],
        examples: [],
        metaphors: [],
        quotes: [],
        factsWithSources: [],
        names: [],
        terms: [],
        phrasesOverused: [],
        characters: [{ name: 'Mara Quill', role: 'protagonist', details: 'red coat' }],
        settings: [{ name: 'The Lighthouse', details: 'white tower' }],
      },
      storiesForOwnerReview: [],
    };
    const { provider } = recording();
    const fixed: AiProvider = { ...provider, chat: async (req) => ({ ...(await provider.chat(req)), text: JSON.stringify(answer) }) };
    const ai = new OpenRouterAiAdapter(VolumeAi.createAiService({ promptsDir: PROMPTS, configDir: CONFIG, provider: fixed }));
    const r = await ai.runStage('summarise', { variables: { templateId: 'fiction', markdown: '# One\n\nMara.', section: { kind: 'chapter', title: 'One' } } });
    expect(r.output.ledger).toEqual(
      expect.arrayContaining([
        { kind: 'character', key: 'Mara Quill', detail: 'protagonist: red coat' },
        { kind: 'setting', key: 'The Lighthouse', detail: 'white tower' },
      ]),
    );
  });

  it('passes the workbook exercise plan to the writer', async () => {
    const { provider, seen } = recording();
    const ai = new OpenRouterAiAdapter(VolumeAi.createAiService({ promptsDir: PROMPTS, configDir: CONFIG, provider }));
    await ai.runStage('writing', {
      promptId: 'writing.chapter',
      variables: {
        template: await promptTemplateFor('workbook'),
        section: {
          kind: 'chapter',
          number: 1,
          title: 'One',
          exercises: [
            { kind: 'reflection', title: 'Your Busiest Day', purpose: 'Notice the week.', lines: 6 },
            { kind: 'bogus', title: 'Dropped' },
          ],
        },
      },
    });
    const req = seen.at(-1);
    expect(req?.meta?.promptId).toBe('writing.chapter-workbook');
    const sent = (req?.messages ?? []).map((m) => m.content).join('\n');
    expect(sent).toContain('Your Busiest Day');
    expect(sent).not.toContain('Dropped');
  });

  it('runs the picture-book stages and passes purpose, references and seed to the image call', async () => {
    const { provider, images } = recording();
    const ai = new OpenRouterAiAdapter(VolumeAi.createAiService({ promptsDir: PROMPTS, configDir: CONFIG, provider }));
    const story = await ai.runStage('picture_story', { variables: { template: 'picture-book', title: 'Pip', story: {} } });
    expect(Array.isArray(story.output.spreads)).toBe(true);
    const scenes = await ai.runStage('scene_prompts', { variables: { template: 'picture-book', story: {}, storyResult: story.output } });
    expect(Array.isArray(scenes.output.scenes)).toBe(true);
    const refs = await ai.runStage('character_reference', {
      variables: { template: 'picture-book', story: {}, storyResult: story.output, scenePrompts: scenes.output },
    });
    expect(Array.isArray(refs.output.references)).toBe(true);

    const png = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN8eeNmPQAH1gLmZQzd9gAAAABJRU5ErkJggg==', 'base64'));
    const img = await ai.generateImage('A rabbit in a meadow', {
      purpose: 'spread',
      inputReferences: [{ data: png, mediaType: 'image/png' }],
      seed: VolumeAi.seedFromKey('book-1'),
    });
    expect(img.data.byteLength).toBeGreaterThan(0);
    expect(Array.isArray(img.notes)).toBe(true);
    expect(images).toHaveLength(1);
  });
});

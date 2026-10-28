// house-style:off (test data quotes invented reviews and banned phrases on purpose)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider, ChatRequest, ChatResult } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { conceptCountOf, createOpenRouterAi, estimatePlan } from '../src/adapters/openrouter-ai.js';
import { loadBookStructure, loadBookTypes, promptTemplate, sectionKindFor } from '../src/config/book-structure.js';
import { buildExportBook, packHashOf } from '../src/jobs/book-data.js';
import { fitWordTargets, plannedWords } from '../src/jobs/handlers/planning.js';
import { ACKNOWLEDGEMENTS_PLACEHOLDER } from '../src/jobs/handlers/writing.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { buildCovers, testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = join(ROOT, 'config');
const PROMPTS = join(ROOT, 'prompts');

interface Obj {
  [k: string]: unknown;
}

/** The mock AI, recording every stage call, with optional changes to the answers. */
class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly calls: { stage: AiStage; input: AiStageInput }[] = [];
  private readonly inner = new MockAiAdapter();
  constructor(private readonly edit: { writing?: (md: string, input: AiStageInput) => string; blueprint?: (bp: Obj) => Obj } = {}) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    this.calls.push({ stage, input: structuredClone(input) });
    const r = await this.inner.runStage(stage, input, opts);
    if (stage === 'writing' && this.edit.writing) {
      const out = r.output as { markdown: string };
      return { ...r, output: { markdown: this.edit.writing(out.markdown, input) } as AiStageResult<S>['output'] };
    }
    if (stage === 'blueprint' && this.edit.blueprint) return { ...r, output: this.edit.blueprint(r.output) as AiStageResult<S>['output'] };
    return r;
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
  of(stage: AiStage, promptId?: string): AiStageInput[] {
    return this.calls.filter((c) => c.stage === stage && (!promptId || c.input.promptId === promptId)).map((c) => c.input);
  }
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

const BIO = 'Gideon Akinlotan runs the GAkinz web studio in London and builds small AI tools for clients.';

async function newBook(app: TestApp, book: Obj = {}, profile: Obj = {}): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', {
    penName: 'Gideon Akinlotan',
    isRealPerson: true,
    bioThirdPerson: BIO,
    credentials: ['Runs the GAkinz web studio'],
    links: [{ label: 'Studio', value: 'https://gakinz.example.com' }],
    ...profile,
  });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Start small with AI', title: 'Start Small With AI', ...book });
  expect(b.status).toBe(201);
  return b.body['id'] as string;
}

async function approved(app: TestApp, id: string, chapters = 2): Promise<void> {
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: chapters });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
}

async function written(app: TestApp, id: string): Promise<void> {
  await app.call('POST', `/api/v1/books/${id}/write`, {});
  await app.services.runner.runUntilIdle();
}

type Tree = { front: Obj[]; body: (Obj & { children: Obj[] })[]; back: Obj[] };
async function sections(app: TestApp, id: string): Promise<Obj[]> {
  const tree = await app.call<Tree>('GET', `/api/v1/books/${id}/sections`);
  return [...tree.body.front, ...tree.body.body, ...tree.body.back];
}

describe('1. profile facts and acknowledgements', () => {
  it('sends the profile facts to every writing and checks call', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id);
    await written(t, id);
    const writing = ai.of('writing');
    expect(writing.length).toBeGreaterThan(2);
    for (const w of writing) {
      expect(w.variables['profile']).toMatchObject({ bio: BIO, links: [{ label: 'Studio', url: 'https://gakinz.example.com' }], illustrativeLine: true });
    }
    for (const c of ai.of('checks')) expect(c.variables['profile']).toMatchObject({ bio: BIO, credentials: ['Runs the GAkinz web studio'] });
  });

  it('writes a placeholder (no AI call) when nobody is named, and the preflight blocks until names are given', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'self-help' });
    await approved(t, id);
    await written(t, id);
    const ack = (await sections(t, id)).find((s) => s['kind'] === 'acknowledgements')!;
    expect(ack['status']).toBe('needs_attention');
    const one = await t.call<{ current: { bodyMd: string; source: string } }>('GET', `/api/v1/sections/${ack['id'] as string}`);
    expect(one.body.current).toMatchObject({ bodyMd: ACKNOWLEDGEMENTS_PLACEHOLDER, source: 'app:placeholder' });
    expect(ai.of('writing').some((w) => (w.variables['section'] as Obj)['kind'] === 'acknowledgements')).toBe(false);
    const pre = await t.call<{ blocks: number; items: { id: string; severity: string }[] }>('GET', `/api/v1/books/${id}/preflight`);
    expect(pre.body.items).toContainEqual(expect.objectContaining({ id: 'front.owner-placeholder.acknowledgements', severity: 'block' }));

    // Names in the book settings: the writer thanks exactly those people.
    expect((await t.call('PATCH', `/api/v1/books/${id}`, { settings: { acknowledgements: 'Ade\nTemi' } })).status).toBe(200);
    await t.call('POST', `/api/v1/sections/${ack['id'] as string}/write`, {});
    await t.services.runner.runUntilIdle();
    const call = ai.of('writing').find((w) => (w.variables['section'] as Obj)['kind'] === 'acknowledgements');
    expect((call?.variables['profile'] as Obj)['acknowledgementNames']).toEqual(['Ade', 'Temi']);
    const after = await t.call<{ items: { id: string }[] }>('GET', `/api/v1/books/${id}/preflight`);
    expect(after.body.items.map((i) => i.id)).not.toContain('front.owner-placeholder.acknowledgements');
  });

  it('renders the facts and the no-invention rule into the real prompts, and the personal claims check', async () => {
    const seen: ChatRequest[] = [];
    const mock = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [VolumeAi.mockModelInfo('test/model')] });
    const provider: AiProvider = {
      name: 'openrouter',
      chat: (req: ChatRequest): Promise<ChatResult> => {
        seen.push(req);
        return mock.chat(req);
      },
      generateImage: (req) => mock.generateImage(req),
      listModels: () => mock.listModels(),
      keyStatus: () => mock.keyStatus(),
    };
    const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider });
    const profile = { penName: 'Gideon Akinlotan', isRealPerson: true, bio: BIO, credentials: ['Runs the GAkinz web studio'], illustrativeLine: true };
    const section = { kind: 'introduction', title: 'Introduction', word_target: 600, summary: 'Why small steps work.' };
    await ai.runStage('writing', { promptId: 'writing.introduction', variables: { title: 'Start Small', profile, section } }, { model: 'test/model' });
    const intro = seen
      .at(-1)!
      .messages.map((m) => m.content)
      .join('\n');
    expect(intro).toContain(BIO);
    expect(intro).toContain('Never describe the author as lacking something');
    expect(intro).toContain('the copyright page already says that stories are illustrative');
    expect(intro).toContain('aim for 600 words');
    await ai.runStage(
      'checks',
      { variables: { markdown: 'I have no credentials.', section: { id: 's1', title: 'Introduction' }, profile } },
      { model: 'test/model' },
    );
    const claims = seen.find((r) => r.meta?.promptId === 'checks.claims')!;
    expect(claims.messages.map((m) => m.content).join('\n')).toContain(BIO);
  });
});

describe('1a. the run options reach the provider', () => {
  it("forwards a stage run's own request time limit (a long blueprint needs more than the 10 minute default)", async () => {
    const seen: ChatRequest[] = [];
    const mock = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [VolumeAi.mockModelInfo('test/model')] });
    const provider: AiProvider = {
      name: 'openrouter',
      chat: (req: ChatRequest): Promise<ChatResult> => {
        seen.push(req);
        return mock.chat(req);
      },
      generateImage: (req) => mock.generateImage(req),
      listModels: () => mock.listModels(),
      keyStatus: () => mock.keyStatus(),
    };
    const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider });
    const profile = { penName: 'Gideon Akinlotan', isRealPerson: true, bio: BIO, credentials: [], illustrativeLine: true };
    const section = { kind: 'introduction', title: 'Introduction', word_target: 600, summary: 'Why small steps work.' };
    await ai.runStage(
      'writing',
      { promptId: 'writing.introduction', variables: { title: 'Start Small', profile, section } },
      { model: 'test/model', timeoutMs: 1_500_000 },
    );
    expect(seen.at(-1)?.timeoutMs).toBe(1_500_000);
  });
});

describe('2. checks get context', () => {
  it('passes the section plan, earlier summaries and the ledger to checks and later writing calls', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id, 2);
    await written(t, id);
    const checks = ai.of('checks');
    const second = checks.find((c) => (c.variables['section'] as Obj)['kind'] === 'chapter' && (c.variables['section'] as Obj)['number'] === 2)!;
    expect((second.variables['section'] as Obj)['summary']).toEqual(expect.stringContaining('Summary of chapter 2'));
    expect((second.variables['previousSummaries'] as unknown[]).length).toBeGreaterThan(0);
    expect((second.variables['ledger'] as unknown[]).length).toBeGreaterThan(0);
    const laterWriting = ai.of('writing', 'writing.chapter').at(-1)!;
    expect((laterWriting.variables['ledger'] as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('3. guardrails follow the saved text', () => {
  it('stores a fresh report on every save, including a book-wide replace', async () => {
    const ai = new RecordingAi({
      writing: (md, input) =>
        input.promptId === 'writing.extend-section' ? md : `${md}\n\nPeople call it a five-star guide, and at the end of the day it helps.`,
    });
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id, 1);
    await written(t, id);
    const chapter = (await sections(t, id)).find((s) => s['kind'] === 'chapter')!;
    expect(chapter['guardrails']).toMatchObject({ passed: false, blocking: [{ match: 'five-star' }], needsAttention: [{ match: 'at the end of the day' }] });
    const r = await t.call<{ replacements: number }>('POST', `/api/v1/books/${id}/replace`, { q: 'a five-star guide', replacement: 'a plain guide' });
    expect(r.body.replacements).toBeGreaterThan(0);
    const after = (await sections(t, id)).find((s) => s['kind'] === 'chapter')!;
    expect(after['guardrails']).toMatchObject({ passed: false, blocking: [], needsAttention: [{ match: 'at the end of the day' }] });
  });
});

describe('4. word targets', () => {
  it('rescales a plan outside 10% of the book target and leaves one inside it alone', () => {
    const bp: Obj = {
      chapters: [
        { number: 1, word_target: 2500 },
        { number: 2, word_target: 2500 },
      ],
      front: { introduction: { wordTarget: 1500 } },
      back: { conclusion: { wordTarget: 1000 } },
    };
    expect(plannedWords(bp).total).toBe(7500);
    const fitted = fitWordTargets(bp, 6000);
    expect(Math.abs(plannedWords(fitted).total - 6000)).toBeLessThanOrEqual(600);
    expect(fitted['word_targets_fitted']).toMatchObject({ bookTarget: 6000, planned: 7500 });
    expect(fitWordTargets(bp, 7200)).toBe(bp);
  });

  it('sends the book target to the blueprint and fits a plan that ignored it', async () => {
    const ai = new RecordingAi({
      blueprint: (bp) => ({
        ...bp,
        chapters: (bp['chapters'] as Obj[]).map((c) => ({ ...c, word_target: 2500 })),
        front: { introduction: { word_target: 1500 } },
        back: { conclusion: { word_target: 1000 } },
      }),
    });
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id, 2);
    expect(ai.of('blueprint')[0]!.variables['wordTarget']).toBe(6000);
    const bp = await t.call<{ blueprint: { data: Obj } }>('GET', `/api/v1/books/${id}/blueprint`);
    expect(Math.abs(plannedWords(bp.body.blueprint.data).total - 6000)).toBeLessThanOrEqual(600);
    const intro = (await sections(t, id)).find((s) => s['kind'] === 'introduction')!;
    expect(intro['wordTarget']).toBeLessThan(1500);
  });

  it('extends a short section once and flags one that runs long', async () => {
    const long = Array.from({ length: 400 }, (_, i) => `Sentence ${i} adds a plain step for the reader.`).join(' ');
    const ai = new RecordingAi({ writing: (md, input) => ((input.variables['section'] as Obj)['kind'] === 'conclusion' ? `${md}\n\n${long}` : md) });
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id, 1);
    await written(t, id);
    const extend = ai.of('writing', 'writing.extend-section');
    expect(extend.length).toBeGreaterThan(0);
    expect(extend[0]!.variables['currentWords']).toBeGreaterThan(0);
    const all = await sections(t, id);
    const chapter = all.find((s) => s['kind'] === 'chapter')!;
    const ch = await t.call<{ current: { bodyMd: string }; checks: { checker: string; message: string }[] }>(
      'GET',
      `/api/v1/sections/${chapter['id'] as string}`,
    );
    expect(ch.body.current.bodyMd).toContain('A further paragraph from the extend pass');
    const conclusion = all.find((s) => s['kind'] === 'conclusion')!;
    const co = await t.call<{ checks: { checker: string; message: string }[] }>('GET', `/api/v1/sections/${conclusion['id'] as string}`);
    const over: unknown = expect.stringContaining('more than 15% over');
    expect(co.body.checks).toContainEqual(expect.objectContaining({ checker: 'word_target', message: over }));
    // The conclusion was long enough: no extend pass for it.
    expect(extend.some((e) => (e.variables['section'] as Obj)['kind'] === 'conclusion')).toBe(false);
  });
});

describe('5. book-type templates', () => {
  it('links every book type to its template file and every structure section to a template section', async () => {
    const types = await loadBookTypes(CONFIG);
    expect(types).toHaveLength(36);
    for (const type of types) {
      const file = join(CONFIG, 'book-templates', String(type['templateFile']));
      expect(existsSync(file), `${String(type['id'])}: ${file}`).toBe(true);
      const template = JSON.parse(readFileSync(file, 'utf8')) as { sections: { id: string }[] };
      const ids = new Set(template.sections.map((s) => s.id));
      const structure = type['structure'] as { frontMatter: string[]; backMatter: string[] };
      for (const sid of [...structure.frontMatter, ...structure.backMatter]) expect(ids.has(sid), `${String(type['id'])} lists ${sid}`).toBe(true);
      const s = await loadBookStructure(CONFIG, String(type['id']), null);
      expect(s.templateId).toBe(String(type['templateFile']).replace(/\.json$/, ''));
      expect(s.front.filter((x) => x.inType).map((x) => x.id)).toEqual(structure.frontMatter);
      expect(s.back.filter((x) => x.inType).map((x) => x.id)).toEqual(structure.backMatter);
    }
    expect(sectionKindFor('about-the-author')).toBe('about_author');
    expect(sectionKindFor('how-to-use')).toBe('how_to_use');
  });

  it('gives a tech how-to book its glossary, resources and how-to-use sections and its genre rules', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id, 2);
    const all = await sections(t, id);
    const kinds = all.filter((s) => s['enabled']).map((s) => s['kind']);
    expect(kinds).toEqual(expect.arrayContaining(['how_to_use', 'introduction', 'conclusion', 'glossary', 'resources', 'review_request']));
    // Not in a tech how-to: no dedication or acknowledgements.
    expect(kinds).not.toContain('dedication');
    expect(kinds).not.toContain('acknowledgements');
    const template = ai.of('blueprint')[0]!.variables['template'] as Obj;
    const dated: unknown = expect.arrayContaining(['Prices or features stated without a date']);
    expect(template['bookType']).toMatchObject({ id: 'ai-tech-howto', genreRules: { avoid: dated } });
    await written(t, id);
    const glossary = ai.of('writing').find((w) => (w.variables['section'] as Obj)['kind'] === 'glossary');
    expect(glossary).toBeDefined();
    // No research source is ticked, so resources is switched off with a note (no AI call, nothing blocking).
    expect(ai.of('writing').some((w) => (w.variables['section'] as Obj)['kind'] === 'resources')).toBe(false);
    const pre = await t.call<{ items: { id: string; severity: string; message: string }[] }>('GET', `/api/v1/books/${id}/preflight`);
    expect(pre.body.items.some((i) => i.id === 'front.owner-placeholder.resources')).toBe(false);
    expect(pre.body.items).toContainEqual(expect.objectContaining({ id: 'resources.auto-off', severity: 'pass' }));
    const structure = await loadBookStructure(CONFIG, 'ai-tech-howto', 'nonfiction');
    expect((promptTemplate(structure)!['sections'] as Obj[]).map((s) => s['id'])).toEqual(expect.arrayContaining(['glossary', 'resources', 'how-to-use']));
  });

  it('keeps an owner-only section switched off and never writes it', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'health-wellbeing', wordTarget: 6000 });
    await approved(t, id, 1);
    const disclaimer = (await sections(t, id)).find((s) => s['kind'] === 'medical_disclaimer')!;
    expect(disclaimer).toMatchObject({ enabled: false, plan: { writer: 'owner' } });
    await written(t, id);
    expect(ai.of('writing').some((w) => (w.variables['section'] as Obj)['kind'] === 'medical_disclaimer')).toBe(false);
  });
});

describe('6. repetition across the book', () => {
  it('turns later repeats into editor suggestions after the book is written', async () => {
    const repeat = 'A prompt is the instruction you type into the chat box before you press send.';
    const ai = new RecordingAi({ writing: (md) => `${md}\n\n${repeat}` });
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approved(t, id, 2);
    await written(t, id);
    const chapter2 = (await sections(t, id)).find((s) => s['kind'] === 'chapter' && s['number'] === 2)!;
    const sugs = await t.call<{ items: { pass: string; original: string; proposed: string }[] }>(
      'GET',
      `/api/v1/sections/${chapter2['id'] as string}/suggestions`,
    );
    const rep = sugs.body.items.filter((s) => s.pass === 'repetition');
    expect(rep.length).toBeGreaterThan(0);
    expect(rep.some((s) => s.original.includes('A prompt is the instruction'))).toBe(true);
    expect(rep.every((s) => s.proposed === '')).toBe(true);
  });
});

describe('7. cover concepts', () => {
  it('makes as many concepts as the book asks for, 1 to 4', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', settings: { coverConcepts: 2 } });
    expect((await t.call('PATCH', `/api/v1/books/${id}`, { settings: { coverConcepts: 5 } })).status).toBe(400);
    await t.call('POST', `/api/v1/books/${id}/cover/concepts`, {});
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{ cover: { concepts: unknown[] } }>('GET', `/api/v1/books/${id}/cover`);
    expect(cover.body.cover.concepts).toHaveLength(2);
    expect(conceptCountOf({})).toBe(3);
    expect(conceptCountOf({ conceptCount: 9 })).toBe(4);
    expect(conceptCountOf({ settings: { coverConcepts: 1 } })).toBe(1);
    const plan = estimatePlan('cover_brief', { variables: { conceptCount: 1 } });
    expect(plan.find((p) => p.task === 'cover.cover-image')?.times).toBe(1);
  });
});

describe('8a. a fresh pack is not stale', () => {
  it('reads as up to date straight after the build, with an author photo on the profile', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    const book = await t.services.repos.books.require(t.owner, id);
    // A tiny PNG signature is enough: the export reads the bytes, it does not decode them.
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4, 5, 6, 7, 8]);
    const photo = await t.services.blobs.put(t.owner, { kind: 'author_photo', filename: 'portrait.png', mime: 'image/png', profileId: book.profileId }, png);
    await t.services.repos.profiles.update(t.owner, book.profileId, { brand: { photoAssetId: photo.id } });
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.services.runner.runUntilIdle();
    await approved(t, id, 1);
    await written(t, id);
    await buildCovers(t, id);
    await t.call('POST', `/api/v1/books/${id}/exports`, { kinds: ['md'] });
    await t.services.runner.runUntilIdle();
    const out = await t.call<{ items: { kind: string; status: string; stale: boolean }[] }>('GET', `/api/v1/books/${id}/exports`);
    expect(out.body.items.find((e) => e.kind === 'pack' && e.status === 'done')).toMatchObject({ stale: false });
  });

  it('stores a fingerprint that fits the 64 character column, so MariaDB does not cut it', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    const book = await buildExportBook(t.services.repos, t.owner, id, t.services.configDir, t.services.blobs);
    const hash = packHashOf(book, null);
    expect(hash).toMatch(/^p1:[0-9a-f]+$/);
    expect(hash.length).toBeLessThanOrEqual(64);
  });
});

describe('7a. a typographic cover needs no artwork', () => {
  it('builds both covers with no concept chosen, and a normal build still asks for a concept', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.services.runner.runUntilIdle();
    await approved(t, id, 1);
    await written(t, id);
    expect((await t.call('POST', `/api/v1/books/${id}/cover/build`, {})).status).toBe(409);
    expect((await t.call('POST', `/api/v1/books/${id}/cover/build`, { typographic: true })).status).toBe(202);
    await t.services.runner.runUntilIdle();
    const cover = await t.call<{
      cover: { chosenAssetId: string | null; ebookAssetId: string | null; wrapAssetId: string | null; status: string; wrapSpec: Record<string, unknown> };
    }>('GET', `/api/v1/books/${id}/cover`);
    expect(cover.body.cover).toMatchObject({ chosenAssetId: null, status: 'final' });
    expect(cover.body.cover.ebookAssetId).toBeTruthy();
    expect(cover.body.cover.wrapAssetId).toBeTruthy();
    expect(cover.body.cover.wrapSpec['typographic']).toBe(true);
    const pre = await t.call<{ items: { id: string; severity: string }[] }>('GET', `/api/v1/books/${id}/preflight`);
    expect(pre.body.items.find((i) => i.id === 'cover.files')?.severity).not.toBe('block');
  });
});

describe('8. a pack built before marketing goes stale when marketing arrives', () => {
  it('marks the latest pack stale after marketing is generated', async () => {
    t = await testApp({ ai: new MockAiAdapter() });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    // Research first: its resolved sources are ticked by default, so Resources is written rather than left a placeholder.
    await t.call('POST', `/api/v1/books/${id}/research`, {});
    await t.services.runner.runUntilIdle();
    await approved(t, id, 1);
    await written(t, id);
    await buildCovers(t, id);
    await t.call('POST', `/api/v1/books/${id}/exports`, { kinds: ['md'] });
    await t.services.runner.runUntilIdle();
    const before = await t.call<{ items: { kind: string; status: string; stale: boolean }[] }>('GET', `/api/v1/books/${id}/exports`);
    const pack = before.body.items.find((e) => e.kind === 'pack' && e.status === 'done');
    expect(pack?.stale).toBe(false);
    await new Promise((r) => setTimeout(r, 5));
    await t.call('POST', `/api/v1/books/${id}/marketing`, {});
    await t.services.runner.runUntilIdle();
    const after = await t.call<{ items: { kind: string; status: string; stale: boolean; staleReason: string | null }[] }>('GET', `/api/v1/books/${id}/exports`);
    expect(after.body.items.find((e) => e.kind === 'pack' && e.status === 'done')).toMatchObject({ stale: true, staleReason: 'changed' });
    expect(after.body.items.find((e) => e.kind === 'md')).toMatchObject({ stale: false });
  });
});

describe('9. writing estimate', () => {
  it('prices a section from its word target, not the full max tokens', async () => {
    const mock = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [VolumeAi.mockModelInfo('test/model')] });
    const ai = await createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider: mock });
    await ai.estimate('research', { variables: {} }, { model: 'test/model' });
    const section = { kind: 'chapter', title: 'One', number: 1, word_target: 1500, summary: 'Plan.' };
    const e = await ai.estimate('writing', { promptId: 'writing.chapter', variables: { section, title: 'Start Small' } }, { model: 'test/model' });
    // Mock prices: $5 per million output tokens. 1,500 words is about 3,150 expected tokens, so the high end
    // is twice that, far under the 32,000-token ceiling the old estimate assumed (about $0.16 on its own).
    expect(e.highUsd).toBeGreaterThan(e.lowUsd);
    expect(e.highUsd).toBeLessThan(0.05);
    const intro = await ai.estimate('writing', { variables: { section: { kind: 'introduction', word_target: 500 } } }, { model: 'test/model' });
    expect(intro.highUsd).toBeLessThan(0.02);
    const research = await ai.estimate('research', { variables: { idea: 'x' } }, { model: 'test/model' });
    expect(research.highUsd).toBeGreaterThan(0.09);
  });
});

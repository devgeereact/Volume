// house-style:off (fixtures quote AI text with dashes and US spellings on purpose)
// Fixes after the live acceptance run of 18 October 2026 (reports/volume/LIVE-ACCEPTANCE-2026-10-18.md).
// Mock provider only, no network.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import { StageInputs, type AiProvider } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import {
  BOOK_LINK_PLACEHOLDER,
  bookInput,
  createOpenRouterAi,
  dropNoneLines,
  fillPromptVariables,
  locateQuote,
  type OpenRouterAiAdapter,
} from '../src/adapters/openrouter-ai.js';
import { loadHouseStyle } from '@volume/core/node';
import { cleanTitleText } from '../src/jobs/handlers/planning.js';
import { fixHouseStyle } from '../src/jobs/house-style-fix.js';
import { storyInput } from '../src/jobs/picture-book.js';
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

/** The mock AI, recording every stage call. */
class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly calls: { stage: AiStage; input: AiStageInput }[] = [];
  readonly inner = new MockAiAdapter();
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    this.calls.push({ stage, input: structuredClone(input) });
    return this.inner.runStage(stage, input, opts);
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
  of(stage: AiStage): AiStageInput[] {
    return this.calls.filter((c) => c.stage === stage).map((c) => c.input);
  }
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function newBook(app: TestApp, book: Obj = {}): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain guides.' });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Side projects', ...book });
  expect(b.status).toBe(201);
  return str(b.body['id']);
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

const BRIEF = 'A careful 30-day plan for UK workers with five spare hours a week. Cover HMRC rules and safe AI use.';

describe('2. the author brief reaches titles and blueprint', () => {
  it('the titles, blueprint and regenerate jobs send the book notes', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { notes: BRIEF });
    await t.call('POST', `/api/v1/books/${id}/title-sets`, {});
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    await t.call('POST', `/api/v1/books/${id}/blueprint/regenerate`, { part: 'summary' });
    await t.services.runner.runUntilIdle();
    for (const stage of ['titles', 'blueprint', 'blueprint_part'] as const) {
      expect(ai.of(stage).length, stage).toBeGreaterThan(0);
      for (const c of ai.of(stage)) expect(c.variables['notes'], stage).toBe(BRIEF);
    }
  });

  it('the adapter sends it as book.authorBrief, which the blueprint and titles inputs accept', () => {
    const book = bookInput({ idea: 'Side projects', notes: BRIEF });
    expect(book).toMatchObject({ idea: 'Side projects', authorBrief: BRIEF });
    for (const schema of [StageInputs.BlueprintInput, StageInputs.TopicDirectionsInput, StageInputs.TitleOptionsInput]) {
      const parsed = schema.safeParse({ book, direction: {} });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.book?.authorBrief).toBe(BRIEF);
    }
  });

  it('a prompt that reads {{book.authorBrief}} gets it on its own; an older prompt gets it inside {{book.idea}}', () => {
    const input = { book: bookInput({ idea: 'Side projects', notes: BRIEF }) };
    const newer = fillPromptVariables(input, ['book.idea', 'book.authorBrief']);
    expect(newer['book']).toMatchObject({ idea: 'Side projects', authorBrief: BRIEF });
    const older = fillPromptVariables(input, ['book.idea']);
    expect(older['book']).toEqual({ idea: `Side projects\n\nOwner notes: ${BRIEF}` });
    // No brief: nothing is added.
    expect(fillPromptVariables({ book: bookInput({ idea: 'Side projects' }) }, ['book.idea'])['book']).toEqual({ idea: 'Side projects' });
  });

  it('the live titles stage puts the brief in the topic directions prompt', async () => {
    const { ai, seen } = await recordingAdapter();
    await ai.runStage('titles', { promptId: 'titles.title-options', variables: { idea: 'Side projects', notes: BRIEF, title: null } }, { model: MODEL });
    const directions = seen.find((r) => r.meta?.promptId === 'titles.topic-directions');
    expect(directions?.messages.map((m) => m.content).join('\n')).toContain(BRIEF);
  });
});

describe('4. no literal "None" in the launch email', () => {
  it('sends the launch facts the book does not have as words and a link placeholder, never "None"', async () => {
    const { ai, seen } = await recordingAdapter((id, raw) => {
      if (id !== 'marketing.launch-email') return raw;
      const o = JSON.parse(raw) as Obj;
      return JSON.stringify({ ...o, body: 'Hello,\n\nThe book is out.\n\nNone\n\nThanks for reading.' });
    });
    const r = await ai.runStage(
      'marketing',
      { promptId: 'marketing.launch-pack', variables: { title: 'Side Projects', subtitle: 'A plan', kinds: ['launch_email'] } },
      { model: MODEL },
    );
    const prompt =
      seen
        .find((q) => q.meta?.promptId === 'marketing.launch-email')
        ?.messages.map((m) => m.content)
        .join('\n') ?? '';
    expect(prompt).toContain(`plain link line \`${BOOK_LINK_PLACEHOLDER}\``);
    expect(prompt).not.toMatch(/goes live on None|KDP Select status: None|link line `None`/);
    const email = (r.output as { email: { body: string } }).email;
    expect(email.body).toBe('Hello,\n\nThe book is out.\n\nThanks for reading.');
  });

  it('drops only lines that are just "None"', () => {
    expect(dropNoneLines('A\nNone\nB')).toBe('A\nB');
    expect(dropNoneLines('A\n  None.  \n\nB')).toBe('A\n\nB');
    expect(dropNoneLines('None of this is hard.\nNone')).toBe('None of this is hard.');
  });
});

describe('5. editing: local JSON repair and suggestions that can be accepted', () => {
  it('a line edit with trailing commas runs in one call, with no repair request', async () => {
    const { ai, seen } = await recordingAdapter((id, raw) =>
      id === 'editing.line-edit-uk'
        ? '```json\n{"edited": "x", "changes": [{"before": "Old line.", "after": "New line.", "why": "Shorter", "kind": "clarity",},], "otherChangesByKind": {}, "unchangedOnPurpose": [],}\n```'
        : raw,
    );
    const r = await ai.runStage('editing', { promptId: 'editing.line', variables: { pass: 'line', markdown: 'Old line.\n\nMore.' } }, { model: MODEL });
    expect(seen).toHaveLength(1);
    expect(r.output.suggestions[0]).toMatchObject({ original: 'Old line.', proposed: 'New line.', start: 0, end: 9 });
  });

  it('finds a quote the model sent with straight quotes, plain dashes or no emphasis, as the text has it', () => {
    const md = 'She said “wait” and it’s **really** fine.\n\nNext  paragraph.';
    const a = locateQuote(md, 'She said "wait" and it\'s really fine.');
    expect(a.original).toBe('She said “wait” and it’s **really** fine.');
    expect(md.slice(a.start ?? -1, a.end ?? -1)).toBe(a.original);
    expect(locateQuote(md, 'Next paragraph.').original).toBe('Next  paragraph.');
    expect(locateQuote(md, 'Not in the text.')).toEqual({ start: null, end: null, original: null });
  });
});

describe('3. house style auto-fix on AI text', () => {
  const style = loadHouseStyle(ROOT);

  it('fixes em dashes, en dashes and US spellings, and leaves context words, code and links alone', () => {
    const r = fixHouseStyle(
      'The plan — short and clear — works.\nPages 10–20 cover the color of your organization.\n— Said nobody.\nWe check the program. See `a—b` and https://example.com/color.',
      style,
    );
    expect(r.text).toBe(
      'The plan, short and clear, works.\nPages 10 to 20 cover the colour of your organisation.\nSaid nobody.\nWe check the program. See `a—b` and https://example.com/color.',
    );
    expect(r).toMatchObject({ dashes: 4, spellings: 2 });
  });

  it('does not add a comma next to other punctuation', () => {
    expect(fixHouseStyle('Wait, — then go.', style).text).toBe('Wait, then go.');
    expect(fixHouseStyle('"I was—" she said.', style).text).toBe('"I was" she said.');
  });

  it('keeps paragraphs that stood in the earlier text and protected passages exactly', () => {
    const owner = 'My own words — kept.';
    const r = fixHouseStyle(`${owner}\n\nNew AI words — fixed.\n\nBio — as written.`, style, { keep: owner, protect: ['Bio — as written.'] });
    expect(r.text).toBe(`${owner}\n\nNew AI words, fixed.\n\nBio — as written.`);
  });

  it('cleans titles: formula labels, odd hyphens, stray spaces and dashes', () => {
    expect(cleanTitleText('Intrigue: The Quiet — Side‑Project  Plan ', style)).toBe('The Quiet, Side-Project Plan');
    expect(cleanTitleText('Direct label: A plan', style)).toBe('A plan');
  });

  it('saves AI sections and marketing in house style, and never changes an owner save', async () => {
    const ai = new DashAi();
    t = await testApp({ ai });
    const id = await newBook(t, { title: 'Side Projects', settings: { acknowledgements: 'Sam' } });
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();
    const tree = await t.call<{ body: { id: string }[] }>('GET', `/api/v1/books/${id}/sections`);
    const chapterId = tree.body.body[0]!.id;
    const sec = await t.call<{ current: { bodyMd: string; source: string }; checks: { checker: string; severity: string }[] }>(
      'GET',
      `/api/v1/sections/${chapterId}`,
    );
    expect(sec.body.current.source).toBe('ai:writing');
    expect(sec.body.current.bodyMd).toContain('A plain point, with colour.');
    expect(sec.body.current.bodyMd).not.toMatch(/[—–]|color/);
    expect(sec.body.checks.some((c) => c.checker === 'em_dash')).toBe(false);
    expect(sec.body.checks.find((c) => c.checker === 'style_autofix')).toMatchObject({ severity: 'info' });

    const owner = 'The owner wrote this — with a color.';
    expect((await t.call('POST', `/api/v1/sections/${chapterId}/versions`, { bodyMd: owner })).status).toBe(201);
    expect((await t.call<{ current: { bodyMd: string } }>('GET', `/api/v1/sections/${chapterId}`)).body.current.bodyMd).toBe(owner);

    const job = await t.call<Obj>('POST', `/api/v1/books/${id}/marketing`, {});
    expect(job.status, JSON.stringify(job.body)).toBe(202);
    await t.services.runner.runUntilIdle();
    const mk = await t.call<{ items: { body: string; hashtags: string[] }[] }>('GET', `/api/v1/books/${id}/marketing`);
    expect(mk.body.items.length).toBeGreaterThan(0);
    for (const item of mk.body.items) expect(item.body).not.toMatch(/[—–]|color/);
  });
});

/** The mock AI with house style breaks added to the writing and marketing answers. */
class DashAi extends RecordingAi {
  override async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    const r = await super.runStage(stage, input, opts);
    const out = r.output as Obj;
    if (stage === 'writing' && typeof out['markdown'] === 'string') {
      return { ...r, output: { ...out, markdown: `${out['markdown']}\n\nA plain point — with color.` } as AiStageResult<S>['output'] };
    }
    if (stage === 'marketing' && out['email']) {
      const email = out['email'] as Obj;
      return { ...r, output: { ...out, email: { ...email, body: `${String(email['body'])} Out now – the color edition.` } } as AiStageResult<S>['output'] };
    }
    return r;
  }
}

/** Line edits through the real adapter (mock provider), every other stage through the mock adapter. */
class EditingAi extends RecordingAi {
  constructor(private readonly real: OpenRouterAiAdapter) {
    super();
  }
  override async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    if (stage === 'editing') return this.real.runStage(stage, input, { ...opts, model: MODEL });
    return super.runStage(stage, input, opts);
  }
}

describe('5. accepting several line edits in a row', () => {
  it('applies each one in turn, including quotes the model changed, and drops a change it cannot place', async () => {
    const TEXT = 'It’s the first line.\n\nThe **second** line stays short.\n\nA third line.';
    const { ai: real } = await recordingAdapter((id, raw) =>
      id === 'editing.line-edit-uk'
        ? JSON.stringify({
            edited: '',
            changes: [
              { before: "It's the first line.", after: 'This is the first line.', why: 'Clearer', kind: 'clarity' },
              { before: 'The second line stays short.', after: 'The second line is short.', why: 'Shorter', kind: 'concision' },
              { before: 'A third line.', after: 'The third line.', why: 'Flow', kind: 'flow' },
              { before: 'A sentence the text never had.', after: 'Anything.', why: 'x', kind: 'x' },
            ],
            otherChangesByKind: {},
            unchangedOnPurpose: [],
          })
        : raw,
    );
    t = await testApp({ ai: new EditingAi(real) });
    const id = await newBook(t, { title: 'Side Projects' });
    await t.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: 2 });
    await t.services.runner.runUntilIdle();
    expect((await t.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
    const tree = await t.call<{ body: { id: string }[] }>('GET', `/api/v1/books/${id}/sections`);
    const chapterId = tree.body.body[0]!.id;
    expect((await t.call('POST', `/api/v1/sections/${chapterId}/versions`, { bodyMd: TEXT })).status).toBe(201);

    await t.call('POST', `/api/v1/sections/${chapterId}/edit-pass`, { pass: 'line' });
    await t.services.runner.runUntilIdle();
    const open = await t.call<{ items: { id: string; pass: string; original: string }[] }>('GET', `/api/v1/sections/${chapterId}/suggestions?status=open`);
    const line = open.body.items.filter((i) => i.pass === 'line');
    expect(line).toHaveLength(3);
    let body = '';
    for (const s of line) {
      const acc = await t.call<{ version: { bodyMd: string } }>('POST', `/api/v1/suggestions/${s.id}/accept`, {});
      expect(acc.status, s.original).toBe(200);
      body = acc.body.version.bodyMd;
    }
    expect(body).toBe('This is the first line.\n\nThe second line is short.\n\nThe third line.');
  });
});

// Clean production plan of 21 October 2026, Task 2: the writer gets the book type's rules as plain text, and a summary
// or check that fails once is tried again before a missing-step flag is raised.
// No network: the server mock AI and the @volume/ai MockProvider stand in for OpenRouter.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import { createOpenRouterAi, type OpenRouterAiAdapter } from '../src/adapters/openrouter-ai.js';
import { bookTypeRulesText, loadBookStructure, promptTemplate } from '../src/config/book-structure.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PROMPTS = join(ROOT, 'prompts');
const CONFIG = join(ROOT, 'config');

type Obj = Record<string, unknown>;

interface Check {
  checker: string;
  status: string;
}
interface SectionView {
  current: { id: string; summary: string | null } | null;
  checks: Check[];
}

/** The @volume/ai MockProvider behind the real adapter, listing every configured model. */
function packageMock(): { adapter: Promise<OpenRouterAiAdapter>; provider: VolumeAi.MockProvider } {
  const defaults = JSON.parse(readFileSync(join(CONFIG, 'models.defaults.json'), 'utf8')) as {
    stages: Record<string, { defaultModel: string; fallbacks: string[] }>;
  };
  const slugs = new Set(Object.values(defaults.stages).flatMap((st) => [st.defaultModel, ...st.fallbacks]));
  const provider = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [...slugs].map((slug) => VolumeAi.mockModelInfo(slug)) });
  return { adapter: createOpenRouterAi({ promptsDir: PROMPTS, configDir: CONFIG, provider }), provider };
}

/**
 * Server mock AI for every stage. The first summary and the first check of chapter 1 (when asked) go through the package
 * adapter with scenario truncated_always, so they fail exactly as a live cut-off answer does; every later call works.
 */
class FailOnceAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly writingInputs: AiStageInput[] = [];
  readonly calls: { stage: string; section: Obj }[] = [];
  failSummaryOnce = false;
  failChecksOnce = false;
  private readonly inner = new MockAiAdapter();
  constructor(private readonly pkg: OpenRouterAiAdapter) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts: RunStageOptions = {}): Promise<AiStageResult<S>> {
    if (stage === 'writing') this.writingInputs.push(structuredClone(input));
    const section = (input.variables['section'] ?? {}) as Obj;
    this.calls.push({ stage, section });
    const first = section['kind'] === 'chapter' && section['number'] === 1;
    if (first && stage === 'summarise' && this.failSummaryOnce) {
      this.failSummaryOnce = false;
      return this.pkg.runStage(stage, input, { ...opts, scenario: 'truncated_always' });
    }
    if (first && stage === 'checks' && this.failChecksOnce) {
      this.failChecksOnce = false;
      return this.pkg.runStage(stage, input, { ...opts, scenario: 'truncated_always' });
    }
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

async function firstChapterId(app: TestApp, id: string): Promise<string> {
  const tree = await app.call<{ body: (Obj & { children: Obj[] })[] }>('GET', `/api/v1/books/${id}/sections`);
  const all = [...tree.body.body, ...tree.body.body.flatMap((b) => b.children)].filter((s) => s['kind'] === 'chapter');
  return all.find((s) => s['number'] === 1)?.['id'] as string;
}

describe('book-type rules reach the writer as plain text', () => {
  it('renders the must-haves and things to avoid, including the tool rule for a tech how-to', async () => {
    const template = promptTemplate(await loadBookStructure(CONFIG, 'ai-tech-howto', null));
    const rules = bookTypeRulesText(template);
    expect(rules).toContain('Must have:\n- ');
    expect(rules).toContain('- Name only tools that appear in the research sources');
    expect(rules).toContain('Avoid:\n- Hype and income claims');
    expect(bookTypeRulesText(JSON.stringify(template))).toBe(rules);
    expect(bookTypeRulesText(null)).toBeNull();
    expect(bookTypeRulesText({ bookType: { genreRules: {} } })).toBeNull();

    const { adapter, provider } = packageMock();
    const ai = await adapter;
    await ai.runStage('writing', { variables: { section: { kind: 'chapter', number: 1, title: 'Getting Started' }, template } });
    const system = provider.requests[0]?.messages.find((m) => m.role === 'system')?.content ?? '';
    expect(system).toContain('## Book-type rules');
    expect(system).toContain('- Name only tools that appear in the research sources');
    expect(system).toContain('## Clean draft rules');
    expect(system).toContain('never square-bracket placeholders');
  });
});

describe('a post-write step that fails once is tried again', () => {
  it('a summary that is cut off once, then works, raises no summary_missing flag', async () => {
    const pm = packageMock();
    const ai = new FailOnceAi(await pm.adapter);
    ai.failSummaryOnce = true;
    t = await testApp({ ai });
    const id = await approvedBook(t, await newProfile(t), 2);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    expect(ai.failSummaryOnce).toBe(false);
    const one = await firstChapterId(t, id);
    const v = (await t.call<SectionView>('GET', `/api/v1/sections/${one}`)).body;
    expect(v.current?.summary).toBeTruthy();
    expect(v.checks.filter((c) => c.checker === 'summary_missing')).toEqual([]);
    const summaries = ai.calls.filter((c) => c.stage === 'summarise' && c.section['kind'] === 'chapter' && c.section['number'] === 1);
    expect(summaries).toHaveLength(2);
  });

  it('a check that is cut off once, then works, raises no checks_missing flag', async () => {
    const pm = packageMock();
    const ai = new FailOnceAi(await pm.adapter);
    ai.failChecksOnce = true;
    t = await testApp({ ai });
    const id = await approvedBook(t, await newProfile(t), 1);
    await t.call('POST', `/api/v1/books/${id}/write`, {});
    await t.services.runner.runUntilIdle();

    expect(ai.failChecksOnce).toBe(false);
    const one = await firstChapterId(t, id);
    const v = (await t.call<SectionView>('GET', `/api/v1/sections/${one}`)).body;
    expect(v.checks.filter((c) => c.checker === 'checks_missing')).toEqual([]);
    expect(ai.calls.filter((c) => c.stage === 'checks' && c.section['kind'] === 'chapter' && c.section['number'] === 1)).toHaveLength(2);
  });
});

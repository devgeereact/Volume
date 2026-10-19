import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockProvider, PromptLoader, TASKS, createAiService } from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR, ROOT } from './helpers.ts';

const loader = new PromptLoader(PROMPTS_DIR);

/** Prompts changed again after the humanizer revision of 6 October 2026: the version that revision made. */
const HUMANIZER_VERSION: Record<string, number> = {
  'children.scene-prompts': 2,
  'children.picture-book-story': 2,
  'checks.summarise-and-ledger': 3,
  'checks.consistency': 3,
  'writing.rewrite-selection': 4,
  // Honesty versions of 19 October 2026 (live acceptance run): prices only from sources, no invented author scenes.
  'writing.chapter': 5,
  'writing.introduction': 5,
  'writing.conclusion': 5,
  'writing.front-matter': 5,
  'writing.back-matter': 5,
  'writing.extend-section': 3,
};
/** Prompts whose latest version moved to another model stage on purpose, with that stage. */
const STAGE_MOVED: Record<string, string> = {
  // v5 (18 October 2026): the server already sends selection rewrites to the editing model.
  'writing.rewrite-selection': 'editing',
};
/** Prompts first written after the revision, with the guidance from version 1. */
const NEW_AFTER_HUMANIZER = new Set([
  'children.character-reference',
  'blueprint.blueprint-fiction',
  'blueprint.blueprint-workbook',
  'writing.chapter-fiction',
  'writing.chapter-workbook',
  'writing.extend-section-fiction',
  'blueprint.regenerate-part-fiction',
]);

describe('versioned humanizer guidance', () => {
  it('keeps old pins, variables and stage contracts available for every prompt', () => {
    for (const latest of loader.latest()) {
      expect(latest.system + latest.user, latest.meta.id).toContain('Humanizer editing discipline');
      if (NEW_AFTER_HUMANIZER.has(latest.meta.id)) continue;
      const revised = loader.load(latest.meta.id, HUMANIZER_VERSION[latest.meta.id]);
      const versions = loader.versions(latest.meta.id);
      const previousVersion = versions[versions.indexOf(revised.meta.version) - 1];
      expect(previousVersion, latest.meta.id).toBeDefined();
      const previous = loader.load(latest.meta.id, previousVersion);
      expect(revised.meta.version).toBe(previous.meta.version + 1);
      expect(latest.meta.stage, latest.meta.id).toBe(STAGE_MOVED[latest.meta.id] ?? previous.meta.stage);
      expect(latest.meta.tier).toBe(previous.meta.tier);
      expect(revised.meta.inputs).toEqual(previous.meta.inputs);
      expect(new Set(revised.variables)).toEqual(new Set(previous.variables));
      expect(revised.meta.guardrails).toEqual(previous.meta.guardrails);
      expect(loader.load(latest.meta.id, previous.meta.version).hash).toBe(previous.hash);
      expect(revised.system + revised.user).toContain('Humanizer editing discipline');
    }
  });

  it('indexes the selected version of every prompt, including JSON repair', () => {
    const index = readFileSync(join(ROOT, 'docs/book-production/PROMPTS.md'), 'utf8');
    for (const latest of loader.latest()) {
      const relative = `../prompts/${latest.meta.id.replace('.', '/')}.v${latest.meta.version}.md`;
      expect(index, latest.meta.id).toContain(relative);
    }
  });

  for (const task of ['writing.chapter', 'editing.voice', 'editing.line-edit-uk', 'checks.summarise-and-ledger'] as const) {
    it(`delivers guidance and fenced source data through ${task} without an extra call`, async () => {
      const ai = createAiService({
        promptsDir: PROMPTS_DIR,
        configDir: CONFIG_DIR,
        mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0 },
      });
      const source = 'The owner supplied 12 pots (October 2026). Keep this exact sentence. [[S1]]';
      const result = await ai.runStage(task, { ...FULL_INPUT, text: source, keepLines: [source] });
      const requests = (ai.provider as MockProvider).requests;
      expect(requests).toHaveLength(1);
      const system = requests[0]?.messages.find((message) => message.role === 'system')?.content ?? '';
      expect(system).toContain('Humanizer editing discipline');
      expect(result.promptVersion).toBe(loader.load(TASKS[task].promptId).meta.version);
      expect(TASKS[task].output.safeParse(result.output).success).toBe(true);
      if (task !== 'writing.chapter') {
        expect(requests[0]?.messages.map((message) => message.content).join('\n')).toContain(source);
      }
    });
  }

  it('preserves exact evidence in internal tasks and keeps repair guidance in the sent user message', () => {
    for (const id of ['checks.claims', 'checks.consistency', 'checks.summarise-and-ledger', 'system.json-repair']) {
      expect(loader.load(id).system).toContain('preserve their exact wording');
    }
    expect(loader.load('system.style-rewrite').user).toContain('Humanizer editing discipline');
    expect(loader.load('system.style-rewrite').user).toContain('original repair contract permits');
    expect(loader.load('editing.line-edit-uk').system).toContain('Change these lines at all: {{keepLines}}');
    expect(loader.load('editing.voice').system).not.toContain('I noticed, one long shift');
    expect(loader.load('writing.chapter').system).not.toContain('If neither is available, open with a scene.');
  });
});

// house-style:off (the rules quote the words and phrases the writer must avoid)
// Clean production plan of 21 October 2026, Task 2: the writing prompts carry the clean draft rules and the book type's
// rules ({{bookTypeRules}}), and summarise-and-ledger v6 accepts a short summary for a front or back matter page.
// No network: rendering only, and the mock provider for the summary.
import { describe, expect, it } from 'vitest';
import { FENCED_VARIABLES, PromptLoader, TASKS, buildVariables, createAiService, loadConfig, type TaskId } from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

const loader = new PromptLoader(PROMPTS_DIR);
const config = loadConfig(CONFIG_DIR);
const RULES = 'Must have:\n- Name only tools that appear in the research sources\nAvoid:\n- Hype and income claims';

const WRITERS: [TaskId, number][] = [
  ['writing.chapter', 9],
  ['writing.introduction', 8],
  ['writing.conclusion', 8],
  ['writing.back-matter', 8],
  ['writing.extend-section', 6],
];

function system(task: TaskId, input: Record<string, unknown>): string {
  const def = TASKS[task];
  const values = buildVariables(def.input.parse(input), config);
  const r = loader.render(def.promptId, values, { fence: FENCED_VARIABLES });
  return r.messages.find((m) => m.role === 'system')?.content ?? '';
}

describe('clean draft writing prompts', () => {
  for (const [task, version] of WRITERS) {
    it(`${task} v${version} renders the clean draft rules and the book-type rules`, () => {
      expect(loader.load(TASKS[task].promptId).meta.version).toBe(version);
      const text = system(task, { ...FULL_INPUT, bookTypeRules: RULES });
      expect(text).toContain('## Book-type rules');
      expect(text).toContain(RULES);
      expect(text).toContain('## Clean draft rules');
      expect(text).toContain('written fully filled in with a realistic, clearly invented detail, never square-bracket placeholders');
      expect(text).toContain('never invent a brand, company, product or named case-study person with a backstory');
      expect(text).toContain('Every list item has text. Prefer prose; use a list only for real steps.');
      expect(text).toContain('Never write "guarantee" in any form');
      expect(text).toContain('No statistics, percentages, "studies show" or "research suggests" unless the research sources give them');
      expect(text).toContain('Aim for a mean of 18 to 21 words');
      expect(text).toContain('delve, crucial, pivotal, landscape, testament, showcase, underscore, vibrant, robust, seamless, tapestry, journey');
      expect(text).not.toContain('house-style:off');
    });

    it(`${task} v${version} sends None when the book type has no rules`, () => {
      expect(system(task, FULL_INPUT)).toMatch(/everything under avoid \(may be empty\): None/);
    });
  }
});

describe('summarise-and-ledger v6 on short pages', () => {
  it('tells the model the section kind and the short-page lengths', () => {
    const def = TASKS['checks.summarise-and-ledger'];
    const values = buildVariables(def.input.parse({ ...FULL_INPUT, chapter: { ...FULL_INPUT.chapter, kind: 'glossary', title: 'Glossary' } }), config);
    const r = loader.render(def.promptId, values, { fence: FENCED_VARIABLES });
    expect(r.promptVersion).toBe(6);
    const all = r.messages.map((m) => m.content).join('\n');
    expect(all).toContain('Section kind (may be empty, then a chapter): glossary');
    expect(all).toContain('the summary is 1 to 3 plain sentences');
    expect(all).toContain('keyPoints holds 0 to 6 items');
  });

  it('accepts a one-sentence glossary summary with no key points', async () => {
    const answer = {
      summary: 'The glossary defines the terms the book uses.',
      keyPoints: [],
      closingLine: 'None.',
      ledgerAdditions: { stories: [], examples: [], metaphors: [], quotes: [], factsWithSources: [], names: [], terms: [], phrasesOverused: [], warnings: [] },
      storiesForOwnerReview: [],
    };
    expect(TASKS['checks.summarise-and-ledger'].output.safeParse(answer).success).toBe(true);
    const ai = createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0 } });
    const result = await ai.runStage('checks.summarise-and-ledger', {
      ...FULL_INPUT,
      chapter: { ...FULL_INPUT.chapter, kind: 'glossary', title: 'Glossary' },
      text: '**Handover**: passing the ward on to the next shift.',
    });
    expect(result.promptVersion).toBe(6);
    expect(TASKS['checks.summarise-and-ledger'].output.safeParse(result.output).success).toBe(true);
  });
});

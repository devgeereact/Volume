// Phase 6 (P6-3): fiction and workbook prompts, stage selection by template, story bible and ledger kinds
// (D-042, D-043). Mock provider only; no network.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { checkTemplateRules, parseManuscript, templateRulesFromTemplate, type Block } from '@volume/core';
import { describe, expect, it } from 'vitest';
import {
  FENCED_VARIABLES,
  PromptLoader,
  StageOutputs,
  TASKS,
  TEMPLATE_TASKS,
  buildVariables,
  createAiService,
  formatLedger,
  loadConfig,
  runGuardrails,
  taskForTemplate,
  type AiService,
  type MockProviderOptions,
} from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR, ROOT } from './helpers.ts';

const FICTION_DIR = join(FIXTURES_DIR, 'fiction');
const STORY_BIBLE: unknown = JSON.parse(readFileSync(join(FICTION_DIR, 'story-bible.json'), 'utf8'));
const config = loadConfig(CONFIG_DIR);
const loader = new PromptLoader(PROMPTS_DIR);

function service(mock: MockProviderOptions = {}): AiService {
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0, ...mock } });
}

const FICTION_INPUT = {
  ...FULL_INPUT,
  profile: { penName: 'Isla Rowe', voice: 'Spare and exact.', voiceSample: null },
  book: {
    ...FULL_INPUT.book,
    type: 'mystery',
    genre: 'Mystery',
    title: 'The Twelfth Mooring',
    template: 'fiction',
    pov: 'close third, Mara Quinn',
    tense: 'past',
  },
  blueprint: { title: 'The Twelfth Mooring', storyBible: STORY_BIBLE, chapters: [{ number: 1, title: 'Eleven' }] },
  storyBible: undefined,
  sources: [],
  chapter: {
    number: 1,
    title: 'Eleven',
    partTitle: null,
    povCharacter: 'Mara Quinn',
    setting: 'Calder Harbour',
    scenes: ['Mara counts eleven moorings', 'Mara finds the word Wait'],
    summary: 'Mara arrives and finds a mooring empty.',
    wordTarget: 160,
    isLast: false,
  },
};

describe('stage selection by template', () => {
  it('maps the blueprint and chapter tasks for fiction and workbook, and leaves every other template alone', () => {
    expect(taskForTemplate('writing.chapter', 'fiction')).toBe('writing.chapter-fiction');
    expect(taskForTemplate('blueprint.blueprint', 'fiction')).toBe('blueprint.blueprint-fiction');
    expect(taskForTemplate('writing.chapter', 'workbook')).toBe('writing.chapter-workbook');
    expect(taskForTemplate('blueprint.blueprint', 'workbook')).toBe('blueprint.blueprint-workbook');
    expect(taskForTemplate('writing.extend-section', 'fiction')).toBe('writing.extend-section-fiction');
    expect(taskForTemplate('blueprint.regenerate-part', 'fiction')).toBe('blueprint.regenerate-part-fiction');
    expect(taskForTemplate('writing.extend-section', 'workbook')).toBe('writing.extend-section');
    for (const t of ['nonfiction', 'picture-book', '', null, undefined, 'toString', 'constructor']) {
      expect(taskForTemplate('writing.chapter', t)).toBe('writing.chapter');
      expect(taskForTemplate('blueprint.blueprint', t)).toBe('blueprint.blueprint');
    }
    expect(taskForTemplate('checks.summarise-and-ledger', 'fiction')).toBe('checks.summarise-and-ledger');
    for (const map of Object.values(TEMPLATE_TASKS)) for (const id of Object.values(map)) expect(id && TASKS[id]).toBeTruthy();
  });

  it('every new prompt is in its stage list in config/models.defaults.json and runs on that stage', () => {
    const stages = config.defaults.stages;
    for (const id of ['blueprint.blueprint-fiction', 'blueprint.blueprint-workbook', 'writing.chapter-fiction', 'writing.chapter-workbook']) {
      const stage = loader.load(id).meta.stage;
      expect(stages[stage]?.prompts, id).toContain(id);
    }
  });

  it('non-fiction runs writing.chapter v8 and blueprint.blueprint v6; v5 to v7 stay loadable for pinned books', () => {
    expect(loader.load('writing.chapter').meta.version).toBe(8);
    expect(loader.load('writing.chapter', 7).meta.version).toBe(7);
    expect(loader.load('writing.chapter', 6).meta.version).toBe(6);
    expect(loader.load('blueprint.blueprint').meta.version).toBe(6);
    expect(loader.load('writing.chapter', 5).meta.version).toBe(5);
    expect(loader.load('blueprint.blueprint', 5).meta.version).toBe(5);
  });
});

describe('fiction stages (mock fixtures)', () => {
  it('the fiction blueprint carries a story bible that parses, with no subheadings or takeaways', async () => {
    const r = await service().runStage('blueprint.blueprint-fiction', FICTION_INPUT);
    expect(r.stage).toBe('blueprint');
    expect(StageOutputs.StoryBible.safeParse(r.output.storyBible).success).toBe(true);
    const names = new Set(r.output.storyBible.characters.map((c) => c.name));
    const places = new Set(r.output.storyBible.settings.map((s) => s.name));
    for (const ch of r.output.chapters) {
      expect(names.has(ch.povCharacter), ch.povCharacter).toBe(true);
      expect(places.has(ch.setting), ch.setting).toBe(true);
      expect(ch).not.toHaveProperty('subheadings');
      expect(ch).not.toHaveProperty('keyTakeaways');
    }
    expect(StageOutputs.FICTION_HOOK_STYLES).toContain(r.output.hookStyle);
    expect(r.guardrails.passed).toBe(true);
  });

  it('the fiction blueprint schema rejects a missing story bible', () => {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, 'blueprint.blueprint-fiction.json'), 'utf8')) as { content: Record<string, unknown> };
    const { storyBible: _bible, ...rest } = fixture.content;
    expect(TASKS['blueprint.blueprint-fiction'].output.safeParse(rest).success).toBe(false);
  });

  it('writes a fiction chapter with *** scene breaks, no headings, and guardrails that do not flag invented dialogue', async () => {
    const r = await service().runStage('writing.chapter-fiction', FICTION_INPUT);
    expect(r.stage).toBe('writing');
    const md = r.output;
    expect(md.split('\n').filter((l) => l.trim() === '***')).toHaveLength(1);
    expect(md).not.toMatch(/^#{1,6}\s/m);
    expect(md).not.toMatch(/key takeaways/i);
    expect(md).not.toContain('* * *');
    expect(md).not.toMatch(/[—–]/);
    expect(r.guardrails.passed).toBe(true);
    expect(r.guardrails.claims).toEqual([]);
    // The same text on the non-fiction rules would send the dialogue to the claims report.
    const plain = runGuardrails(md, config.houseStyle, {});
    expect(plain.claims.map((h) => h.rule)).toContain('quoted-testimonial');
  });

  it('sends the story bible from the blueprint data as {{storyBible}}, with the viewpoint and scenes', () => {
    const def = TASKS['writing.chapter-fiction'];
    const values = buildVariables(def.input.parse(FICTION_INPUT), config);
    const r = loader.render(def.promptId, values, { fence: FENCED_VARIABLES });
    const user = r.messages[1]?.content ?? '';
    expect(user).toContain('Story bible:\n{"logline":"A harbourmaster');
    // Sent once: {{blueprint}} goes without the story bible.
    expect(user.split('"logline"')).toHaveLength(2);
    expect(String(values['blueprint'])).not.toContain('storyBible');
    expect(String(values['blueprint'])).toContain('"title":"The Twelfth Mooring"');
    expect(user).toContain('Viewpoint character (may be empty): Mara Quinn');
    expect(user).toContain('- Mara finds the word Wait');
    const system = r.messages[0]?.content ?? '';
    expect(system).toContain('close third, Mara Quinn');
    expect(system).toContain('`***`');
    expect(system).not.toContain('{{');
  });

  it('summarise v5 and later log characters and settings for fiction; v4 stays loadable', async () => {
    expect(loader.versions('checks.summarise-and-ledger')).toEqual([1, 2, 3, 4, 5, 6]);
    const s = service({ fixturesDirs: [FICTION_DIR, FIXTURES_DIR] });
    const r = await s.runStage('checks.summarise-and-ledger', { ...FICTION_INPUT, text: 'Chapter text.' });
    expect(r.promptVersion).toBe(6);
    expect(r.stage).toBe('summarise');
    expect(r.output.ledgerAdditions.characters?.map((c) => c.name)).toEqual(['Mara Quinn', 'Tomas Reyes']);
    expect(r.output.ledgerAdditions.settings?.map((x) => x.name)).toContain('Calder Harbour');
    const rendered = r.calls.length;
    expect(rendered).toBe(1);
    // A v4 answer (no characters or settings) still parses for pinned runs.
    const v4 = { ...r.output, ledgerAdditions: { ...r.output.ledgerAdditions, characters: undefined, settings: undefined } };
    expect(TASKS['checks.summarise-and-ledger'].output.safeParse(v4).success).toBe(true);
  });

  it('formats character and setting ledger entries as things that return, not things to avoid', () => {
    const text = formatLedger([
      { kind: 'character', key: 'Mara Quinn', detail: 'protagonist; wears her father’s coat' },
      { kind: 'setting', key: 'Calder Harbour', detail: 'twelve moorings' },
    ]);
    expect(text).toContain('Characters already on the page (they may return');
    expect(text).toContain('- Mara Quinn: protagonist');
    expect(text).toContain('Settings already on the page (they may return');
    expect(text).not.toContain('Other things already used');
  });

  it('consistency v4 reads the template and the story bible, and treats a first-person narrator as a character', () => {
    const f = loader.load('checks.consistency');
    expect(f.meta.version).toBe(4);
    expect(f.optional).toEqual(expect.arrayContaining(['storyBible', 'book.template']));
    expect(f.system).toContain('a first-person narrator is a character, not the author');
    expect(f.system).toContain('exercise-format');
    const def = TASKS['checks.consistency'];
    const values = buildVariables(def.input.parse({ ...FICTION_INPUT, text: 'x' }), config);
    const user = loader.render(def.promptId, values, { fence: FENCED_VARIABLES }).messages[1]?.content ?? '';
    expect(user).toContain('Book template (may be empty): fiction');
    expect(user).toContain('"name":"Tomas Reyes"');
  });
});

describe('workbook stages (mock fixtures)', () => {
  const WORKBOOK_INPUT = {
    ...FULL_INPUT,
    book: { ...FULL_INPUT.book, template: 'workbook', variant: 'practical' },
    chapter: {
      ...FULL_INPUT.chapter,
      exercises: [
        { kind: 'reflection' as const, title: 'Your Usual Evening', purpose: 'Notice the hour after work.', lines: 6 },
        { kind: 'checklist' as const, title: 'Before You Start Tonight', purpose: 'Get one change in place.', lines: null },
      ],
    },
  };

  it('exercise kinds match the workbook template', () => {
    const tpl = JSON.parse(readFileSync(join(ROOT, 'config', 'book-templates', 'workbook.json'), 'utf8')) as {
      chapterRules: { exercises: { types: string[] } };
    };
    expect([...StageOutputs.EXERCISE_KINDS]).toEqual(tpl.chapterRules.exercises.types);
  });

  it('the workbook blueprint plans 2 to 4 exercises of known kinds per chapter', async () => {
    const r = await service().runStage('blueprint.blueprint-workbook', WORKBOOK_INPUT);
    expect(r.stage).toBe('blueprint');
    for (const ch of r.output.chapters) {
      expect(ch.exercises.length).toBeGreaterThanOrEqual(2);
      expect(ch.exercises.length).toBeLessThanOrEqual(4);
      for (const e of ch.exercises) expect(StageOutputs.EXERCISE_KINDS).toContain(e.kind);
    }
    expect(r.guardrails.passed).toBe(true);
    const bad = { ...r.output, chapters: [{ ...r.output.chapters[0], exercises: [{ kind: 'quiz', title: 'X', purpose: 'Y', lines: null }] }] };
    expect(TASKS['blueprint.blueprint-workbook'].output.safeParse(bad).success).toBe(false);
  });

  it('sends the planned exercises to the writer as numbered lines', () => {
    const def = TASKS['writing.chapter-workbook'];
    const values = buildVariables(def.input.parse(WORKBOOK_INPUT), config);
    expect(values['chapter.exercises']).toBe(
      '1. reflection, "Your Usual Evening": Notice the hour after work. (6 ruled lines)\n2. checklist, "Before You Start Tonight": Get one change in place.',
    );
    const r = loader.render(def.promptId, values, { fence: FENCED_VARIABLES });
    expect(r.messages[0]?.content).toContain('::: exercise <kind> <Title>');
    expect(r.messages[1]?.content).toContain('(6 ruled lines)');
  });

  it('writes a workbook chapter in the exact block dialect', async () => {
    const r = await service().runStage('writing.chapter-workbook', WORKBOOK_INPUT);
    const md = r.output;
    const lines = md.split('\n');
    const opens = lines.filter((l) => /^::: exercise (reflection|checklist|fill-in|tracker|scenario) \S/.test(l));
    expect(opens.length).toBeGreaterThanOrEqual(2);
    expect(opens.length).toBeLessThanOrEqual(4);
    // Every fence that opens (exercise, lines, fill-in) has its own close.
    const openCount = lines.filter((l) => /^::: \S/.test(l)).length;
    const closeCount = lines.filter((l) => l.trim() === ':::').length;
    expect(closeCount).toBe(openCount);
    expect(lines.some((l) => /^::: lines ([1-9]|[12]\d|30)$/.test(l))).toBe(true);
    expect(lines.some((l) => l.startsWith('- [ ] '))).toBe(true);
    expect(lines.filter((l) => l.startsWith('## '))).toHaveLength(3);
    expect(r.guardrails.passed).toBe(true);
  });
});

const templateFile = (id: string): unknown => JSON.parse(readFileSync(join(ROOT, 'config', 'book-templates', `${id}.json`), 'utf8'));
const fixtureText = (name: string): string => (JSON.parse(readFileSync(join(FIXTURES_DIR, name), 'utf8')) as { content: string }).content;
const chapterOf = (body: string) => {
  const book = parseManuscript(`# Chapter 1: Test\n\n${body}\n`);
  const ch = book.sections.find((x) => x.kind === 'chapter');
  if (!ch) throw new Error('no chapter parsed');
  return ch;
};
const types = (blocks: Block[]): string[] => blocks.map((b) => b.type);

describe('mock fixtures through the @volume/core parser (D-042)', () => {
  for (const name of ['writing.chapter-fiction.json', 'writing.extend-section-fiction.json']) {
    it(`${name}: scene breaks come through and the fiction rules find nothing`, () => {
      const ch = chapterOf(fixtureText(name));
      expect(types(ch.blocks).filter((t) => t === 'sceneBreak')).toHaveLength(1);
      expect(types(ch.blocks)).not.toContain('heading2');
      expect(types(ch.blocks)).not.toContain('heading3');
      expect(checkTemplateRules(ch, templateRulesFromTemplate(templateFile('fiction')))).toEqual([]);
    });
  }

  it('writing.chapter-workbook.json: exercises with lines, tick boxes, a tracker table and fill-in blanks', () => {
    const ch = chapterOf(fixtureText('writing.chapter-workbook.json'));
    const exercises = ch.blocks.filter((b): b is Extract<Block, { type: 'exercise' }> => b.type === 'exercise');
    expect(exercises.map((e) => [e.kind, e.title])).toEqual([
      ['reflection', 'Your Usual Evening'],
      ['checklist', 'Before You Start Tonight'],
      ['tracker', 'Seven Evenings'],
      ['fill-in', 'My Evening Plan'],
    ]);
    const [reflection, checklist, tracker, fillIn] = exercises;
    expect(reflection?.blocks).toContainEqual({ type: 'lines', count: 6 });
    expect(checklist?.blocks.find((b) => b.type === 'checklist')).toEqual({
      type: 'checklist',
      items: ['One five-minute change chosen', 'A cue picked, such as putting the kettle on', 'A note on the fridge to remind you'],
    });
    expect(types(tracker?.blocks ?? [])).toContain('table');
    expect(fillIn?.blocks.find((b) => b.type === 'fillIn')).toMatchObject({
      prompts: ['My five-minute change is:', 'I will do it straight after:', 'If I miss a night, I will:'],
    });
    expect(types(ch.blocks)).not.toContain('callout');
    expect(checkTemplateRules(ch, templateRulesFromTemplate(templateFile('workbook')))).toEqual([]);
  });
});

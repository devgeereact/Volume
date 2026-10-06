// house-style:off (test data quotes banned phrases, ISBNs and claims on purpose)
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FENCED_VARIABLES,
  MissingVariableError,
  PromptLoader,
  TASKS,
  TASK_IDS,
  buildVariables,
  loadConfig,
  renderTemplate,
  toPromptValue,
} from '../src/index.ts';
import { CONFIG_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

const loader = new PromptLoader(PROMPTS_DIR);
const config = loadConfig(CONFIG_DIR);

describe('prompt loader', () => {
  it('loads every prompt in prompts/ (27 from the index, weave-note, expand-note and the JSON repair prompt)', () => {
    const ids = loader.ids();
    expect(ids.length).toBeGreaterThanOrEqual(30);
    for (const id of TASK_IDS) expect(ids).toContain(TASKS[id].promptId);
    expect(ids).toContain('writing.weave-note');
    expect(ids).toContain('writing.expand-note');
    expect(ids).toContain('system.json-repair');
  });

  it('every prompt has System and User parts and uses exactly the variables it declares', () => {
    for (const f of loader.latest()) {
      expect(f.system.length, f.meta.id).toBeGreaterThan(20);
      expect(f.user.length, f.meta.id).toBeGreaterThan(5);
      expect(new Set(f.variables), f.meta.id).toEqual(new Set(f.meta.inputs));
      expect(f.hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('every task prompt renders from a full input with no placeholder left', () => {
    for (const id of TASK_IDS) {
      const def = TASKS[id];
      const parsed = def.input.parse(FULL_INPUT) as Record<string, unknown>;
      const values = buildVariables(parsed, config);
      if (id === 'checks.claims') values['patternHits'] = 'None';
      const r = loader.render(def.promptId, values, { fence: FENCED_VARIABLES });
      const file = loader.load(def.promptId);
      for (const name of file.meta.inputs) expect(Object.keys(r.values), `${id}: ${name}`).toContain(name);
      for (const m of r.messages) expect(m.content, id).not.toMatch(/\{\{/);
      expect(r.messages.map((m) => m.role)).toEqual(['system', 'user']);
    }
  });

  it('injects house style and KDP variables from config', () => {
    const values = buildVariables(TASKS['titles.title-options'].input.parse(FULL_INPUT), config);
    const r = loader.render('titles.title-options', values);
    const text = r.messages.map((m) => m.content).join('\n');
    expect(text).toContain('no more than 199 characters');
    expect(text).toContain('delve');
    expect(text).toContain('circle back');
    expect(r.values['kdp.titleSubtitleMaxChars']).toBe('199');
    expect(values['kdp.keywordsMax']).toBe('7');
    expect(values['kdp.categoriesMax']).toBe('3');
    expect(values['kdp.descriptionMaxChars']).toBe('4000');
    expect(values['kdp.spineTextMinPages']).toBe('80');
  });

  it('fails with every missing required variable named', () => {
    expect(() => loader.render('titles.title-options', { 'book.type': 'nonfiction' })).toThrowError(MissingVariableError);
    try {
      loader.render('titles.title-options', { 'book.type': 'nonfiction' });
    } catch (e) {
      expect(e).toBeInstanceOf(MissingVariableError);
      const vars = (e as MissingVariableError).variables;
      expect(vars).toContain('direction');
      expect(vars).toContain('profile.penName');
      expect(vars).not.toContain('book.genre'); // marked "(may be empty)"
    }
  });

  it('renders null, empty strings and empty lists as None, and fences owner text', () => {
    expect(toPromptValue(null)).toBe('None');
    expect(toPromptValue('')).toBe('None');
    expect(toPromptValue([])).toBe('None');
    expect(toPromptValue(['a', 'b'])).toBe('- a\n- b');
    expect(toPromptValue(true)).toBe('true');
    const out = renderTemplate('A {{x}} B {{y}}', { x: 'owner text', y: null }, { promptId: 't', optional: new Set(), fence: new Set(['x']) });
    expect(out).toBe('A <data label="x">\nowner text\n</data> B None');
  });

  it('picks the highest version unless pinned, strips comments and Changes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'volume-prompts-'));
    mkdirSync(join(dir, 'demo'));
    const file = (v: number, body: string) =>
      `---\nid: demo.hello\nversion: ${v}\nstage: titles\ntier: mid\ninputs:\n  - "{{name}}"\noutput: markdown\n---\n\n# System\n\nYou greet people. <!-- hidden note -->\n\n# User\n\n${body} {{name}}\n\n# Changes\n\n- {{notAVariable}} ignored\n`;
    writeFileSync(join(dir, 'demo', 'hello.v1.md'), file(1, 'Hello'));
    writeFileSync(join(dir, 'demo', 'hello.v2.md'), file(2, 'Hi'));
    const l = new PromptLoader(dir);
    expect(l.versions('demo.hello')).toEqual([1, 2]);
    expect(l.render('demo.hello', { name: 'Sam' }).messages[1]?.content).toBe('Hi Sam');
    const pinned = l.render('demo.hello', { name: 'Sam' }, { version: 1 });
    expect(pinned.messages[1]?.content).toBe('Hello Sam');
    expect(pinned.promptVersion).toBe(1);
    expect(pinned.messages[0]?.content).not.toContain('hidden note');
  });

  it('formats voice DNA, sources, summaries and ledger into readable blocks', () => {
    const v = buildVariables(TASKS['writing.chapter'].input.parse(FULL_INPUT), config);
    expect(String(v['profile.voice'])).toContain('Characteristics: short sentences');
    expect(String(v['profile.voice'])).toContain('Does not sound like this');
    expect(String(v['profile.voiceSample'])).toContain('sat in the car');
    expect(v['research.sources']).toBe(
      '[S1] Sleep after night shifts, https://www.example.org/night-shift-sleep, Advice on recovering sleep after a run of nights.\n' +
        '[S2] Guides for new nurses, https://www.example.org/new-nurse-guides, What first-year nurses say they need.',
    );
    expect(v['previousSummaries']).toContain('Chapter 1, Arrival:');
    expect(v['ledger']).toBe('Stories already told (never retell them; refer back in a few words if needed):\n- car park: Sitting in the car after a shift');
  });
});

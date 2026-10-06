// house-style:off (test data uses banned phrases on purpose)
// The automatic style rewrite on the mock provider: banned phrases trigger one rewrite on the same model,
// then anything left is reported as needs attention instead of failing the stage.
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockProvider, TASKS, createAiService, type AiService } from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

function direction(focus: string) {
  return {
    workingTitle: 'Quiet Hours',
    focus,
    whyItWorks: 'Few guides speak to the first month of nights.',
    targetReaders: 'Newly qualified nurses in the UK',
    authorFit: 'Twenty years of night shifts in London.',
    evidence: ['S1'],
    risk: 'Overlaps with general sleep books.',
  };
}

const BANNED_ANSWER = {
  ideaAnalysis: 'New nurses want help to navigate their first nights and unlock better sleep.',
  directions: [direction('Nights as a skill you can learn.'), direction('A plain guide to the hours between two and five.')],
};

const CLEAN_ANSWER = {
  ideaAnalysis: 'New nurses want help to get through their first nights and sleep better afterwards.',
  directions: BANNED_ANSWER.directions,
};

function serviceWith(fixtures: Record<string, unknown>): AiService {
  const dir = mkdtempSync(join(tmpdir(), 'volume-rewrite-'));
  for (const [name, content] of Object.entries(fixtures)) writeFileSync(join(dir, `${name}.json`), JSON.stringify({ content }));
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [dir], chunkDelayMs: 0 } });
}

describe('automatic style rewrite', () => {
  it('a banned phrase triggers one rewrite on the same model, naming the phrases, and clears', async () => {
    const ai = serviceWith({
      'titles.topic-directions': BANNED_ANSWER,
      'titles.topic-directions.style-rewrite': CLEAN_ANSWER,
    });
    const r = await ai.runStage('titles.topic-directions', FULL_INPUT);
    const requests = (ai.provider as MockProvider).requests;

    expect(requests).toHaveLength(2);
    const [first, rewrite] = requests;
    expect(rewrite?.model).toBe(first?.model);
    expect(rewrite?.meta?.purpose).toBe('style-rewrite');
    expect(rewrite?.stream).toBe(false);
    expect(rewrite?.webSearch).toBeUndefined();
    expect(rewrite?.responseFormat).toEqual(first?.responseFormat);
    const ask = rewrite?.messages.at(-1)?.content ?? '';
    expect(ask).toContain('"navigate": written as "navigate", 1 time in ideaAnalysis');
    expect(ask).toContain('"unlock": written as "unlock"');
    expect(ask).toContain('Format of your last answer: a JSON object');
    expect(rewrite?.messages.at(-2)).toEqual({ role: 'assistant', content: JSON.stringify(BANNED_ANSWER, null, 2) });

    expect(r.output).toEqual(CLEAN_ANSWER);
    expect(TASKS['titles.topic-directions'].output.safeParse(r.output).success).toBe(true);
    expect(r.guardrails.passed).toBe(true);
    expect(r.guardrails.blocking).toEqual([]);
    expect(r.guardrails.needsAttention).toEqual([]);
    expect(r.guardrails.styleRewrite).toEqual({ phrases: ['navigate', 'unlock'], applied: true, cleared: true, note: '' });
    expect(r.raw).toBe(JSON.stringify(CLEAN_ANSWER, null, 2));
    expect(r.calls).toHaveLength(2);
    expect(r.usage.costUsd).toBeCloseTo(0.0002);
    expect(r.notes.join(' ')).toContain('Style rewrite: removed 2 banned phrases (navigate, unlock).');
  });

  it('a stubborn banned phrase is reported as needs attention after one rewrite, and the stage does not fail', async () => {
    // No .style-rewrite fixture: the mock gives the same answer again.
    const ai = serviceWith({ 'titles.topic-directions': BANNED_ANSWER });
    const r = await ai.runStage('titles.topic-directions', FULL_INPUT);

    expect((ai.provider as MockProvider).requests).toHaveLength(2);
    expect(r.calls).toHaveLength(2);
    expect(r.usage.costUsd).toBeCloseTo(0.0002);
    expect(r.output).toEqual(BANNED_ANSWER);
    expect(r.guardrails.passed).toBe(false);
    expect(r.guardrails.blocking.filter((h) => h.rule === 'banned-phrase')).toEqual([]);
    expect(r.guardrails.needsAttention.map((h) => [h.phrase, h.match, h.path])).toEqual([
      ['navigate', 'navigate', 'ideaAnalysis'],
      ['unlock', 'unlock', 'ideaAnalysis'],
    ]);
    expect(r.guardrails.styleRewrite).toMatchObject({ phrases: ['navigate', 'unlock'], applied: true, cleared: false });
    expect(r.notes.join(' ')).toContain('2 banned phrases are left (navigate, unlock), marked needs attention.');
  });

  it('a clean answer makes no rewrite call', async () => {
    const ai = serviceWith({ 'titles.topic-directions': CLEAN_ANSWER });
    const r = await ai.runStage('titles.topic-directions', FULL_INPUT);
    expect((ai.provider as MockProvider).requests).toHaveLength(1);
    expect(r.guardrails.passed).toBe(true);
    expect(r.guardrails.styleRewrite).toBeUndefined();
  });

  it('a Markdown rewrite keeps its headings, replaces the streamed text and clears', async () => {
    const chapter = (word: string) =>
      [
        `By two the ward had gone quiet and I learned to ${word} the long middle of the night.`,
        '## The Hours Nobody Warns You About',
        'The corridor lights hum. You learn which bay needs you first.',
        '## Small Rituals That Hold You Steady',
        'Tea at three. A walk to the window. A list on the back of your hand.',
        '## When The Ward Goes Quiet',
        'Quiet is not empty. It is the time to check twice.',
      ].join('\n\n');
    const ai = serviceWith({ 'writing.chapter': chapter('navigate'), 'writing.chapter.style-rewrite': chapter('get through') });
    let streamed = '';
    let resets = 0;
    const r = await ai.runStage('writing.chapter', FULL_INPUT, {
      onDelta: (t) => (streamed += t),
      onReset: () => {
        resets += 1;
        streamed = '';
      },
    });
    const requests = (ai.provider as MockProvider).requests;
    expect(requests).toHaveLength(2);
    expect(requests[1]?.messages.at(-1)?.content).toContain('Format of your last answer: Markdown');
    expect(r.output).toBe(chapter('get through'));
    expect(streamed).toBe(chapter('get through'));
    expect(resets).toBe(1);
    expect(r.guardrails.needsAttention).toEqual([]);
    expect(r.guardrails.styleRewrite).toMatchObject({ applied: true, cleared: true });
  });

  it('a Markdown rewrite that drops headings is not used, and the phrase needs attention', async () => {
    const original = 'I learned to navigate the night.\n\n## First\n\nText.\n\n## Second\n\nMore text.\n\n## Third\n\nEnd.';
    const flattened = 'I learned to get through the night. Text. More text. End.';
    const ai = serviceWith({ 'writing.chapter': original, 'writing.chapter.style-rewrite': flattened });
    const r = await ai.runStage('writing.chapter', FULL_INPUT);
    expect(r.output).toBe(original);
    expect(r.guardrails.needsAttention.map((h) => h.phrase)).toEqual(['navigate']);
    expect(r.guardrails.styleRewrite).toMatchObject({
      applied: false,
      cleared: false,
      note: 'The style rewrite changed the headings, so the first answer was kept.',
    });
    expect(r.calls).toHaveLength(2);
  });

  it('research is internal notes: a banned phrase gets no rewrite call and is reported as a warning, blockers still show', async () => {
    const research = JSON.parse(readFileSync(join(FIXTURES_DIR, 'research.title-research.json'), 'utf8')) as { content: Record<string, unknown> };
    const content = {
      ...research.content,
      ideaSummary: 'New nurses need help to navigate their first nights; the bestselling guides skip the hours after two.',
    };
    const ai = serviceWith({ 'research.title-research': content });
    const r = await ai.runStage('research.title-research', FULL_INPUT);

    expect((ai.provider as MockProvider).requests).toHaveLength(1);
    expect(r.calls).toHaveLength(1);
    expect(r.guardrails.styleRewrite).toBeUndefined();
    expect(r.guardrails.needsAttention).toEqual([]);
    expect(r.guardrails.blocking.filter((h) => h.rule === 'banned-phrase')).toEqual([]);
    expect(r.guardrails.warnings.filter((h) => h.rule === 'banned-phrase').map((h) => [h.phrase, h.severity, h.path])).toEqual([
      ['navigate', 'warn', 'ideaSummary'],
    ]);
    expect(r.guardrails.blocking.map((h) => h.rule)).toEqual(['bestselling']);
    expect(r.guardrails.passed).toBe(false);
    // The base fixture also has a clinical claim, so only these two entries are checked.
    expect(r.guardrails.rules[0]?.list).toBe('blocking');
    expect(r.guardrails.rules).toEqual(
      expect.arrayContaining([
        {
          rule: 'bestselling',
          list: 'blocking',
          count: 1,
          message: 'Bestseller or ranking claim. Remove unless verified by the owner.',
          matches: ['bestselling'],
        },
        { rule: 'banned-phrase', list: 'warnings', count: 1, message: 'Banned phrase from the house style or the profile.', matches: ['navigate'] },
      ]),
    );
    expect(r.notes.join(' ')).toContain('reported without a rewrite: navigate');
  });

  it('the rules summary names what is left after a rewrite', async () => {
    const ai = serviceWith({ 'titles.topic-directions': BANNED_ANSWER });
    const r = await ai.runStage('titles.topic-directions', FULL_INPUT);
    expect(r.guardrails.rules).toEqual([
      {
        rule: 'banned-phrase',
        list: 'needsAttention',
        count: 2,
        message: 'Banned phrase from the house style or the profile.',
        matches: ['navigate', 'unlock'],
      },
    ]);
  });
});

// house-style:off (live run 3 text quoted as fixtures)
// Fixes after live run 3 ("Small Offer, Real Customers", 5 October 2026): scaffolding openers get the one style
// rewrite, and the new output fields (claims type, unknown references, source titles) are accepted.
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MockProvider, TASKS, createAiService, describeOpeners, loadConfig, scaffoldingOpeners, type AiService } from '../src/index.ts';
import { CONFIG_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

const config = loadConfig(CONFIG_DIR);

// Five "Here's/Here is the" openers in one section, as live run 3 wrote them.
const SCAFFOLDED = [
  "Here's the budget rule, and I'd like you to treat it as firm.",
  '',
  'Here is the routine, with what you should see at each stage.',
  '',
  'Here is the shape of the message, so you can see how little there is.',
  '',
  "Here's the honest version of the sum.",
  '',
  'Here is the part most people skip.',
].join('\n');
const CLEAN = [
  'The budget rule is firm: start on free plans, or one paid subscription at most.',
  '',
  'The routine runs in five stages, with what you should see at each one.',
  '',
  'The message is short, so you can see how little there is.',
  '',
  "Here's the honest version of the sum.",
  '',
  'Most people skip the next part.',
].join('\n');

function serviceWith(fixtures: Record<string, unknown>): AiService {
  const dir = mkdtempSync(join(tmpdir(), 'volume-live3-'));
  for (const [name, content] of Object.entries(fixtures)) writeFileSync(join(dir, `${name}.json`), JSON.stringify({ content }));
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [dir], chunkDelayMs: 0 } });
}

describe('scaffolding openers', () => {
  it('counts paragraph openers the way the core habit check does', () => {
    const r = scaffoldingOpeners(SCAFFOLDED, config.houseStyle);
    expect(r.hits).toHaveLength(5);
    expect(r.max).toBe(2);
    expect(r.excess).toBe(true);
    expect(describeOpeners(r)).toContain('5 paragraphs open with scaffolding; at most 2 may.');
    expect(scaffoldingOpeners(CLEAN, config.houseStyle).excess).toBe(false);
    expect(describeOpeners(scaffoldingOpeners(CLEAN, config.houseStyle))).toBe('None');
  });

  it('runs the one style rewrite on a written section with too many openers, naming them', async () => {
    const ai = serviceWith({ 'writing.chapter': SCAFFOLDED, 'writing.chapter.style-rewrite': CLEAN });
    const r = await ai.runStage('writing.chapter', FULL_INPUT);
    const requests = (ai.provider as MockProvider).requests;
    expect(requests).toHaveLength(2);
    const ask = requests[1]?.messages.at(-1)?.content ?? '';
    expect(requests[1]?.meta?.purpose).toBe('style-rewrite');
    expect(ask).toContain(`"Here's the"`);
    expect(ask).toContain('5 paragraphs open with scaffolding');
    expect(r.output).toBe(CLEAN);
    expect(r.guardrails.styleRewrite).toMatchObject({ applied: true, openers: expect.arrayContaining(["Here's the"]) as unknown });
    expect(r.notes.join(' ')).toContain('scaffolding openers 5 to 1');
  });

  it('keeps the first answer when the rewrite does not reduce the openers', async () => {
    const ai = serviceWith({ 'writing.chapter': SCAFFOLDED });
    const r = await ai.runStage('writing.chapter', FULL_INPUT);
    expect(r.output).toBe(SCAFFOLDED);
    expect(r.guardrails.styleRewrite?.applied).toBe(false);
  });

  it('sends no rewrite when the openers are within the limit', async () => {
    const ai = serviceWith({ 'writing.chapter': CLEAN });
    await ai.runStage('writing.chapter', FULL_INPUT);
    expect((ai.provider as MockProvider).requests).toHaveLength(1);
  });
});

describe('new output fields', () => {
  it('accepts the named-entity-regulatory claim type, unknown references and source titles', () => {
    const claim = {
      quote: 'A platform called Quantum AI is one name that has appeared on it.',
      type: 'named-entity-regulatory',
      risk: 'high',
      harmIfWrong: true,
      sourceMarker: null,
      sourceSupports: 'no-marker',
      check: "the regulator's own register entry",
      suggestion: 'verify',
      softerVersion: null,
    };
    expect(TASKS['checks.claims'].output.safeParse({ claims: [claim] }).success).toBe(true);
    const consistency = {
      promiseKept: 'yes',
      promiseNote: '',
      subheadingsMatch: true,
      subheadingIssues: [],
      issues: [],
      rewriteNeeded: false,
      unknownReferences: [
        { quote: 'After the chat by the van, he sent a short text.', reference: 'a chat by the van', detail: 'No earlier section shows it.' },
      ],
    };
    expect(TASKS['checks.consistency'].output.safeParse(consistency).success).toBe(true);
    const notes = [{ id: 'S1', whatItSupports: 'ideas', title: 'AI side hustles guide', url: 'https://sidehustleschool.com/guides/ai-side-hustles/' }];
    const research = TASKS['research.title-research'].output.safeParse({
      ideaSummary: '',
      audience: { who: '', situation: '', alreadyTried: [], wordsTheyUse: [] },
      pains: [],
      desiredOutcomes: [],
      angles: [],
      competitorThemes: [],
      keywordIdeas: [],
      cautions: [],
      sourceNotes: notes,
    });
    expect(research.success).toBe(true);
  });
});

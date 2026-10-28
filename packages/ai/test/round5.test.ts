// house-style:off (test data quotes banned phrases and invented reviews on purpose)
// Round 5 live-book fixes: profile facts in every reader-facing prompt, the grouped used-already list,
// guardrails for saved text, cover concept count, the extend prompt and realistic writing estimates.
import { describe, expect, it } from 'vitest';
import { buildVariables, createAiService, formatLedger, formatProfileFacts, loadConfig, PromptLoader, savedTextReport, type AiService } from '../src/index.ts';
import { CONFIG_DIR, FIXTURES_DIR, FULL_INPUT, PROMPTS_DIR } from './helpers.ts';

function service(): AiService {
  return createAiService({ promptsDir: PROMPTS_DIR, configDir: CONFIG_DIR, mock: { fixturesDirs: [FIXTURES_DIR], chunkDelayMs: 0 } });
}

const config = loadConfig(CONFIG_DIR);
const loader = new PromptLoader(PROMPTS_DIR);

/** Reader-facing prompts that must carry the profile facts block and the no-invention rule. */
const READER_FACING = [
  'blueprint.blueprint',
  'writing.chapter',
  'writing.introduction',
  'writing.conclusion',
  'writing.front-matter',
  'writing.back-matter',
  'writing.extend-section',
  'writing.rewrite-selection',
  'writing.weave-note',
  'writing.expand-note',
  'matter.amazon-description',
  'matter.back-cover',
  'marketing.launch-email',
  'marketing.tiktok-scripts',
  'marketing.instagram-captions',
  'checks.claims',
];

describe('profile facts', () => {
  it('lists only what the profile says, and says when nobody is named for thanks', () => {
    const facts = formatProfileFacts({
      penName: 'Gideon Akinlotan',
      isRealPerson: true,
      bio: 'Gideon runs the GAkinz web studio.',
      credentials: null,
      links: ['Studio: https://gakinz.example.com'],
      illustrativeLine: true,
    });
    expect(facts).toContain('Gideon runs the GAkinz web studio.');
    expect(facts).toContain('a real person writing under their own name');
    expect(facts).toContain('Credentials: none listed (say nothing about credentials either way)');
    expect(facts).toContain('People the owner has named for thanks: none (thank no one by name or by group)');
    expect(facts).toContain('the copyright page already says that stories are illustrative');
    expect(formatProfileFacts({ acknowledgementNames: ['Ade', 'Temi'] })).toContain('People the owner has named for thanks: Ade; Temi');
  });

  it('reaches every reader-facing prompt with the hard rule', () => {
    const vars = { ...buildVariables({ ...FULL_INPUT, currentWords: 100 }, config), patternHits: 'None' };
    for (const id of READER_FACING) {
      const file = loader.load(id);
      expect(file.meta.inputs, id).toContain('profile.facts');
      const r = loader.render(id, vars);
      const text = r.messages.map((m) => m.content).join('\n');
      expect(text, id).toContain('Amira Hale is a nurse who has worked nights in London hospitals for twenty years.');
      if (id !== 'checks.claims' && id !== 'blueprint.blueprint') expect(text, id).toContain('Never state a personal fact, relationship');
    }
  });

  it('asks the acknowledgements to thank only the names given', () => {
    const r = loader.render('writing.front-matter', buildVariables(FULL_INPUT, config));
    const text = r.messages.map((m) => m.content).join('\n');
    expect(text).toContain('Thank only the people in this list');
    expect(text).toContain('no family, partner, children, friends, colleagues, clients, early readers');
  });
});

describe('used-already list', () => {
  it('groups defined terms, warnings, stories and phrases with what to do with each', () => {
    const text = formatLedger([
      { kind: 'term', key: 'prompt', detail: 'the instruction you type' },
      { kind: 'warning', key: 'Do not paste client data into a chat tool' },
      { kind: 'story', key: 'first invoice', detail: 'composite' },
      { kind: 'phrase', key: 'here is the thing' },
      { kind: 'odd', key: 'something else' },
    ]);
    expect(text).toContain('Terms already defined (use them freely, never define them again):\n- prompt: the instruction you type');
    expect(text).toContain('Warnings, cautions and disclaimers already given');
    expect(text).toContain('- Do not paste client data into a chat tool');
    expect(text).toContain('Stories already told');
    expect(text).toContain('Phrases leaned on too often (do not use them again):\n- here is the thing');
    expect(text).toContain('- [odd] something else');
    expect(formatLedger([])).toBe('None');
  });

  it('asks the summary to log warnings and defined terms', async () => {
    const s = service();
    const r = await s.runStage('checks.summarise-and-ledger', FULL_INPUT);
    expect(r.promptVersion).toBe(loader.load('checks.summarise-and-ledger').meta.version);
    expect(loader.load('checks.summarise-and-ledger').user + loader.load('checks.summarise-and-ledger').system).toContain(
      'warning, caution, safety or privacy note',
    );
  });
});

describe('saved text guardrails', () => {
  it('keeps blocking hits blocking and puts banned phrases under needs attention', () => {
    const r = savedTextReport('Readers call it a five-star guide, and at the end of the day it helps.', config.houseStyle, {
      bannedPhrases: config.houseStyle.bannedPhrases,
    });
    expect(r.passed).toBe(false);
    expect(r.blocking.map((h) => h.rule)).toEqual(['review-words']);
    expect(r.needsAttention.map((h) => h.match)).toEqual(['at the end of the day']);
    expect(r.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'review-words', list: 'blocking' }),
        expect.objectContaining({ rule: 'banned-phrase', list: 'needsAttention' }),
      ]),
    );
    expect(savedTextReport('A calm, plain sentence.', config.houseStyle, { bannedPhrases: config.houseStyle.bannedPhrases }).passed).toBe(true);
  });
});

describe('cover concept count', () => {
  it('defaults to three and passes the book setting through', () => {
    const three = loader.render('cover.cover-brief', buildVariables(FULL_INPUT, config));
    expect(three.messages[0]?.content).toContain('exactly 3 distinct concepts');
    const input = { ...FULL_INPUT, cover: { ...FULL_INPUT.cover, conceptCount: 1 } };
    const one = loader.render('cover.cover-brief', buildVariables(input, config));
    expect(one.messages[0]?.content).toContain('exactly 1 distinct concepts');
  });
});

describe('extend pass and word targets in the prompts', () => {
  it('renders the extend prompt with the current and target words', () => {
    const r = loader.render('writing.extend-section', buildVariables({ ...FULL_INPUT, currentWords: 120 }, config));
    const text = r.messages.map((m) => m.content).join('\n');
    expect(text).toContain('came back short of its word target');
    expect(text).toContain('Word target: 180\nWords now: 120');
    expect(text).toContain('never by padding');
  });

  it('gives the introduction and conclusion their own word target and the blueprint the book target', () => {
    const vars = buildVariables(FULL_INPUT, config);
    for (const id of ['writing.introduction', 'writing.conclusion']) {
      expect(
        loader
          .render(id, vars)
          .messages.map((m) => m.content)
          .join('\n'),
        id,
      ).toContain('aim for 180 words');
    }
    const bp = loader
      .render('blueprint.blueprint', vars)
      .messages.map((m) => m.content)
      .join('\n');
    expect(bp).toContain('Distributes the book word target (40000 words)');
    expect(bp).toContain('template.bookType.structure');
  });
});

describe('writing estimates', () => {
  it('put the high end at twice the expected output for a section, capped at max tokens; research keeps its allowance', () => {
    const s = service();
    const stage = s.registry.resolve('writing');
    const chapter = { ...FULL_INPUT, chapter: { ...FULL_INPUT.chapter, wordTarget: 1500 } };
    const est = s.estimate('writing.chapter', chapter);
    expect(est.expectedOutputTokens).toBe(Math.ceil(1500 * 1.4 * 1.5));
    const p = s.registry.pricing(est.model);
    if (p?.outputPerMillion && p.inputPerMillion !== null) {
      const input = (est.inputTokens * p.inputPerMillion) / 1_000_000;
      expect(est.highUsd ?? 0).toBeCloseTo(input + (est.expectedOutputTokens * 2 * p.outputPerMillion) / 1_000_000, 6);
      const oldHigh = input + ((stage.maxTokens ?? 0) * p.outputPerMillion) / 1_000_000;
      expect(est.highUsd ?? 0).toBeLessThan(oldHigh / 3);
    }
    // A front matter page with no chapter target uses expectedWords.
    const page = s.estimate('writing.front-matter', { ...FULL_INPUT, expectedWords: 250 });
    expect(page.expectedOutputTokens).toBe(Math.ceil(250 * 1.4 * 1.5));
    // Research has no word target: its high end still covers the whole allowance.
    const research = s.estimate('research.title-research', FULL_INPUT);
    const rStage = s.registry.resolve('research');
    const rp = s.registry.pricing(research.model);
    if (rp?.outputPerMillion) expect(research.highUsd ?? 0).toBeGreaterThan(((rStage.highOutputTokens ?? 0) * rp.outputPerMillion) / 1_000_000);
  });
});

// house-style:off (live run 3 text quoted as fixtures)
// Fixes after live run 3 ("Small Offer, Real Customers", 5 October 2026). Mock provider only, no live calls.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as VolumeAi from '@volume/ai';
import type { AiProvider, ChatRequest, ChatResult } from '@volume/ai';
import { afterEach, describe, expect, it } from 'vitest';
import { MockAiAdapter } from '../src/adapters/mock-ai.js';
import {
  betterTitle,
  estimatePlan,
  fillPromptVariables,
  HIGH_ESTIMATE_MARGIN,
  isDomainTitle,
  OpenRouterAiAdapter,
  resourcesMarkdown,
} from '../src/adapters/openrouter-ai.js';
import { hasDatedPrices, loadBookStructure } from '../src/config/book-structure.js';
import { pricesCheckLine, takeawaysOf, writtenSummaries } from '../src/jobs/book-checks.js';
import { RESOURCES_PLACEHOLDER } from '../src/jobs/handlers/writing.js';
import type { AiPort, AiStage, AiStageInput, AiStageResult, RunStageOptions } from '../src/ports/ai.js';
import { buildCovers, testApp, type TestApp } from './helpers.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const CONFIG = join(ROOT, 'config');
const PROMPTS = join(ROOT, 'prompts');

interface Obj {
  [k: string]: unknown;
}

// Live run 3 text.
const BIO =
  'Gideon Akinlotan is a London-based writer and the person behind the Real Mr Gee and GAkinz brands. Through GAkinz, a web design and development studio, he designs and builds websites for small businesses, holding design and build to one standard so a site looks right and works right, with accessibility built in from the start.';
const BIO_IN_BODY =
  "I'm a writer based in London, and through my studio, GAkinz, I design and build websites for small businesses. I hold design and build to one standard, so a site has to look right and work right, with accessibility built in from the start.";
const GLOSSARY = [
  '**Offer**: One clear thing you sell, to one kind of customer, at one price.',
  '**Niche**: A small, specific group of customers with a shared problem.',
  '**Small Offer**: One clear thing you sell, to one kind of customer, at one price.',
  '**Voice Agent**: A tool that answers phone calls automatically.',
  '**Free Plan**: A version of a tool you can use without paying, usually with limits.',
].join('\n\n');

/** The mock AI, recording every stage call, with optional changes to the writing answers. */
class RecordingAi implements AiPort {
  readonly provider = 'mock' as const;
  readonly calls: { stage: AiStage; input: AiStageInput }[] = [];
  private readonly inner = new MockAiAdapter();
  constructor(private readonly edit: (md: string, section: Obj, input: AiStageInput) => string = (md) => md) {}
  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>> {
    this.calls.push({ stage, input: structuredClone(input) });
    const r = await this.inner.runStage(stage, input, opts);
    if (stage === 'writing') {
      const out = r.output as { markdown: string };
      return { ...r, output: { markdown: this.edit(out.markdown, (input.variables['section'] ?? {}) as Obj, input) } as AiStageResult<S>['output'] };
    }
    return r;
  }
  generateImage: AiPort['generateImage'] = (prompt, opts) => this.inner.generateImage(prompt, opts);
  estimate: AiPort['estimate'] = () => this.inner.estimate();
  of(stage: AiStage, kind?: string): AiStageInput[] {
    return this.calls.filter((c) => c.stage === stage && (!kind || (c.input.variables['section'] as Obj | undefined)?.['kind'] === kind)).map((c) => c.input);
  }
}

let t: TestApp | null = null;
afterEach(async () => {
  await t?.close();
  t = null;
});

async function newBook(app: TestApp, book: Obj = {}): Promise<string> {
  const p = await app.call<Obj>('POST', '/api/v1/profiles', { penName: 'Gideon Akinlotan', isRealPerson: true, bioThirdPerson: BIO, credentials: [] });
  const b = await app.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Small offer', title: 'Small Offer, Real Customers', ...book });
  return b.body['id'] as string;
}
async function research(app: TestApp, id: string): Promise<void> {
  await app.call('POST', `/api/v1/books/${id}/research`, {});
  await app.services.runner.runUntilIdle();
}
async function approveAndWrite(app: TestApp, id: string, chapters = 2): Promise<void> {
  await app.call('POST', `/api/v1/books/${id}/blueprints`, { chapterCount: chapters });
  await app.services.runner.runUntilIdle();
  expect((await app.call('POST', `/api/v1/books/${id}/blueprint/approve`, {})).status).toBe(200);
  await app.call('POST', `/api/v1/books/${id}/write`, {});
  await app.services.runner.runUntilIdle();
}
type Tree = { front: Obj[]; body: Obj[]; back: Obj[] };
async function sections(app: TestApp, id: string): Promise<Obj[]> {
  const tree = await app.call<Tree>('GET', `/api/v1/books/${id}/sections`);
  return [...tree.body.front, ...tree.body.body, ...tree.body.back];
}
async function current(app: TestApp, sectionId: string): Promise<{ bodyMd: string; source: string }> {
  return (await app.call<{ current: { bodyMd: string; source: string } }>('GET', `/api/v1/sections/${sectionId}`)).body.current;
}
async function preflight(app: TestApp, id: string) {
  return (await app.call<{ items: { id: string; severity: string; message: string }[] }>('GET', `/api/v1/books/${id}/preflight`)).body.items;
}

/** A @volume/ai provider on the mock that answers chosen prompts with the given JSON or text, recording every request. */
function fakeProvider(answers: Record<string, unknown>): { provider: AiProvider; seen: ChatRequest[] } {
  const seen: ChatRequest[] = [];
  const mock = new VolumeAi.MockProvider({ chunkDelayMs: 0, models: [VolumeAi.mockModelInfo('test/model')] });
  const provider: AiProvider = {
    name: 'openrouter',
    chat: async (req: ChatRequest): Promise<ChatResult> => {
      seen.push(req);
      const r = await mock.chat(req);
      const a = answers[req.meta?.promptId ?? ''];
      return a === undefined ? r : { ...r, text: typeof a === 'string' ? a : JSON.stringify(a) };
    },
    generateImage: (req) => mock.generateImage(req),
    listModels: () => mock.listModels(),
    keyStatus: () => mock.keyStatus(),
  };
  return { provider, seen };
}
function adapterWith(answers: Record<string, unknown>): { ai: OpenRouterAiAdapter; seen: ChatRequest[]; service: VolumeAi.AiService } {
  const { provider, seen } = fakeProvider(answers);
  const service = VolumeAi.createAiService({ promptsDir: PROMPTS, configDir: CONFIG, provider });
  return { ai: new OpenRouterAiAdapter(service), seen, service };
}
const text = (r: ChatRequest | undefined) => (r?.messages ?? []).map((m) => m.content).join('\n');

describe('1. resources', () => {
  it('saves an owner placeholder with a preflight block when no source is ticked, and never calls the AI', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approveAndWrite(t, id, 1);
    const res = (await sections(t, id)).find((s) => s['kind'] === 'resources')!;
    expect(res['status']).toBe('needs_attention');
    expect(await current(t, res['id'] as string)).toMatchObject({ bodyMd: RESOURCES_PLACEHOLDER, source: 'app:placeholder' });
    expect(ai.of('writing', 'resources')).toEqual([]);
    const block = (await preflight(t, id)).find((i) => i.id === 'front.owner-placeholder.resources');
    expect(block).toMatchObject({ severity: 'block' });
    expect(block?.message).toContain('Resources needs sources: tick sources in Research');
  });

  it('ticks resolved research sources by default and sends every one of them to the resources page', async () => {
    const ai = new RecordingAi();
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await research(t, id);
    const run = await t.call<{ latest: { sources: { useInBook: boolean }[] } }>('GET', `/api/v1/books/${id}/research`);
    expect(run.body.latest.sources.map((s) => s.useInBook)).toEqual([true, true]);
    await approveAndWrite(t, id, 1);
    const call = ai.of('writing', 'resources')[0];
    expect((call?.variables['sources'] as unknown[]).length).toBe(2);
  });

  it('lists every ticked source, drops junk like "- x: x" and fills a missing description from the title', () => {
    const sources = [
      { title: 'sidehustleschool.com', url: 'https://sidehustleschool.com/guides/ai-side-hustles/' },
      { title: 'How to make money with AI', url: 'https://www.printful.com/uk/blog/how-to-make-money-with-ai' },
      { title: 'riftrefunds.co.uk', url: 'https://www.riftrefunds.co.uk/blogs/do-you-need-to-pay-tax-on-your-side-hustle/' },
    ];
    const items = [
      { sourceId: 'S1', name: 'Side Hustle School: AI side hustles guide', description: 'Ideas to test against the demand check.' },
      { sourceId: 'S9', name: 'x', description: 'x' },
      { sourceId: 'S3', name: 'x', description: 'x' },
    ];
    expect(resourcesMarkdown(items, sources)).toBe(
      [
        '- Side Hustle School: AI side hustles guide (sidehustleschool.com): Ideas to test against the demand check.',
        '- How to make money with AI (printful.com)',
        '- riftrefunds.co.uk',
      ].join('\n'),
    );
    expect(resourcesMarkdown(items, [])).toBeNull();
  });
});

describe('2 and 3. preflight: placeholders and covers', () => {
  it('blocks a "- x: x" line when it is saved and blocks the pack (not the single files) with no cover', async () => {
    const ai = new RecordingAi((md, section) => (section['kind'] === 'conclusion' ? `${md}\n\n- x: x` : md));
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'self-help', settings: { acknowledgements: 'Sam' } });
    await approveAndWrite(t, id, 1);
    const conclusion = (await sections(t, id)).find((s) => s['kind'] === 'conclusion')!;
    expect(conclusion['status']).toBe('needs_attention');
    // The owner fixes the line; then only the cover blocks.
    const md = (await current(t, conclusion['id'] as string)).bodyMd.replace('\n\n- x: x', '');
    expect((await t.call('POST', `/api/v1/sections/${conclusion['id'] as string}/versions`, { bodyMd: md })).status).toBe(201);
    const items = await preflight(t, id);
    expect(items.filter((i) => i.severity === 'block').map((i) => i.id)).toEqual(['cover.files']);
    const job = await t.call<{ jobId: string }>('POST', `/api/v1/books/${id}/exports`, { kinds: ['md', 'txt'] });
    await t.services.runner.runUntilIdle();
    const done = await t.call<Obj>('GET', `/api/v1/jobs/${job.body.jobId}`);
    expect(done.body).toMatchObject({ status: 'failed', errorCode: 'preflight_blocked' });
    expect(done.body['error']).toContain('No eBook cover or paperback wrap yet');
    const exps = await t.call<{ items: { kind: string; status: string }[] }>('GET', `/api/v1/books/${id}/exports`);
    expect(
      exps.body.items
        .filter((e) => e.status === 'done')
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['md', 'txt']);
    await buildCovers(t, id);
    expect((await preflight(t, id)).some((i) => i.id === 'cover.files')).toBe(false);
  });
});

describe('4 and 9. checks context and continuity', () => {
  it('renders the real profile facts (bio) and each section its own plan into the consistency check', async () => {
    const { ai, seen } = adapterWith({});
    const profile = { penName: 'Gideon Akinlotan', isRealPerson: true, bio: BIO, credentials: [] };
    const section = {
      id: 's9',
      kind: 'review_request',
      title: 'A Small Request',
      rule: 'Two or three polite sentences asking readers who found the book useful to leave an honest review.',
    };
    await ai.runStage(
      'checks',
      {
        variables: {
          markdown: 'If this book helped, please leave an honest review.',
          section,
          profile,
          previousSummaries: [{ number: 9, title: 'Conclusion', summary: 'The conclusion opens on a weeknight scene a few months later.' }],
        },
      },
      { model: 'test/model' },
    );
    const consistency = text(seen.find((r) => r.meta?.promptId === 'checks.consistency'));
    expect(consistency).toContain(BIO);
    expect(consistency).not.toContain('Credentials: None');
    expect(consistency).toContain('(review_request)');
    expect(consistency).toContain('Two or three polite sentences asking readers');
    // Claims (items 7, 8, 11): personal history, named firms with a regulatory status, composite story lines skipped.
    const claims = text(seen.find((r) => r.meta?.promptId === 'checks.claims'));
    expect(claims).toContain('Skip clearly illustrative narrative lines');
    expect(claims).toContain('named-entity-regulatory');
    expect(claims).toContain('the worry I hear most');
  });

  it('maps unknown scene references to consistency issues, and personal and named-firm claims to their categories', async () => {
    const { ai } = adapterWith({
      'checks.claims': {
        claims: [
          {
            quote: "I'll admit I used to read those as rejections, which cost me follow-ups I never made.",
            type: 'personal',
            risk: 'high',
            harmIfWrong: false,
            sourceMarker: null,
            sourceSupports: 'no-marker',
            check: 'author profile',
            suggestion: 'remove',
            softerVersion: null,
          },
          {
            quote: 'A platform called Quantum AI is one name that has appeared on it.',
            type: 'named-entity-regulatory',
            risk: 'high',
            harmIfWrong: true,
            sourceMarker: null,
            sourceSupports: 'no-marker',
            check: "the regulator's own register entry",
            suggestion: 'verify',
            softerVersion: null,
          },
        ],
      },
      'checks.consistency': {
        promiseKept: 'yes',
        promiseNote: '',
        subheadingsMatch: true,
        subheadingIssues: [],
        issues: [],
        rewriteNeeded: false,
        unknownReferences: [
          { quote: 'After the chat by the van, he sent a short text.', reference: 'the chat by the van', detail: 'No earlier section shows it.' },
        ],
      },
    });
    const r = await ai.runStage(
      'checks',
      { variables: { markdown: 'After the chat by the van, he sent a short text.', section: { id: 's3', kind: 'chapter', title: 'Chapter 3' } } },
      { model: 'test/model' },
    );
    expect(r.output.claims.map((c) => c.category)).toEqual(['personal', 'regulatory']);
    expect(r.output.claims[1]?.check_needed).toContain('Blocks the pack until verified');
    // Claim tiers: the checker's risk and harmIfWrong pass through to the filed claim.
    expect(r.output.claims.map((c) => [c.risk, c.harmIfWrong])).toEqual([
      ['high', false],
      ['high', true],
    ]);
    expect(r.output.consistency[0]?.issue).toContain('Refers back to something the book never showed: "the chat by the van"');
  });

  it('turns open personal claims into preflight warnings and named-firm claims into blocks', async () => {
    t = await testApp({ ai: new RecordingAi() });
    const id = await newBook(t, { bookTypeId: 'self-help', settings: { acknowledgements: 'Sam' } });
    await approveAndWrite(t, id, 1);
    const ch = (await sections(t, id)).find((s) => s['kind'] === 'chapter')!;
    const v = await t.services.repos.manuscript.getVersion(
      t.owner,
      (await t.services.repos.manuscript.requireSection(t.owner, ch['id'] as string)).currentVersionId!,
    );
    await t.services.repos.manuscript.addClaims(t.owner, id, ch['id'] as string, v!.id, [
      { sentence: 'I used to read those as rejections.', category: 'personal', checkNeeded: '', start: null, end: null },
      { sentence: 'A platform called Quantum AI is on the list.', category: 'regulatory', checkNeeded: '', start: null, end: null },
    ]);
    const items = await preflight(t, id);
    // The mock exporter does not report claims itself; the real one does (packages/export tests), so this
    // checks the server keeps the categories end to end.
    const claims = await t.call<{ items: { category: string }[] }>('GET', `/api/v1/books/${id}/claims`);
    expect(claims.body.items.map((c) => c.category)).toEqual(expect.arrayContaining(['personal', 'regulatory']));
    expect(items.some((i) => i.id === 'claims.open')).toBe(true);
  });
});

describe('5. glossary post-step', () => {
  it('merges duplicates, drops unused terms and sorts what is left before saving', async () => {
    const ai = new RecordingAi((md, section) =>
      section['kind'] === 'glossary' ? GLOSSARY : section['kind'] === 'chapter' ? `${md}\n\nYour small offer runs on a free plan.` : md,
    );
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approveAndWrite(t, id, 1);
    const g = (await sections(t, id)).find((s) => s['kind'] === 'glossary')!;
    expect((await current(t, g['id'] as string)).bodyMd).toBe(
      '**Free Plan**: A version of a tool you can use without paying, usually with limits.\n\n**Small Offer**: One clear thing you sell, to one kind of customer, at one price.',
    );
  });
});

describe('6. dated prices', () => {
  it('flags the tech how-to and travel types and gives the writer the rule and the write month', async () => {
    expect(hasDatedPrices(await loadBookStructure(CONFIG, 'ai-tech-howto', null))).toBe(true);
    expect(hasDatedPrices(await loadBookStructure(CONFIG, 'travel', null))).toBe(true);
    expect(hasDatedPrices(await loadBookStructure(CONFIG, 'self-help', null))).toBe(false);
    const ai = new RecordingAi((md, section) =>
      section['kind'] === 'chapter' ? `${md}\n\nA price of £60 a month [[S1]]. ChatGPT Plus costs £20 a month.` : md,
    );
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'ai-tech-howto', wordTarget: 6000 });
    await approveAndWrite(t, id, 1);
    const chapterCall = ai.of('writing', 'chapter')[0]!;
    expect(chapterCall.variables).toMatchObject({ datedPrices: 'yes', checkedMonth: expect.stringMatching(/^[A-Z][a-z]+ \d{4}$/) as unknown });
    const how = ai.of('writing', 'how_to_use')[0]!;
    expect(how.variables['pricesCheck']).toMatch(/^not run/);
    const ch = (await sections(t, id)).find((s) => s['kind'] === 'chapter')!;
    const one = await t.call<{ checks: { checker: string; severity: string; message: string }[] }>('GET', `/api/v1/sections/${ch['id'] as string}`);
    // Only the sourced price is asked for a month; the unsourced specific price goes to the claims report.
    const dated = one.body.checks.filter((c) => c.checker === 'dated_price').map((c) => c.message);
    expect(dated.length).toBeGreaterThan(0);
    for (const m of dated) expect(m).toMatch(/^£60 is a sourced price/);
    const claims = await t.call<{ items: { sentence: string; category: string; location: Record<string, unknown> }[] }>(
      'GET',
      `/api/v1/books/${id}/claims?status=open`,
    );
    // Code-filed claims always need the owner's check (claim tiers): risk high.
    const price = claims.body.items.find((c) => c.sentence === 'ChatGPT Plus costs £20 a month.');
    expect(price?.category).toBe('financial');
    expect(price?.location['risk']).toBe('high');
  });

  it('builds the prices check line the how-to and listing prompts read', () => {
    expect(pricesCheckLine([])).toMatch(/^not run/);
    expect(pricesCheckLine([{ kind: 'chapter', title: 'Chapter 1', bodyMd: 'It costs £15 a month (checked October 2026).' }])).toMatch(/^passed/);
    expect(pricesCheckLine([{ kind: 'chapter', title: 'Chapter 1', bodyMd: 'It costs £15 a month (checked October 2026).' }], 3)).toBe(
      'not run: 1 of 3 body sections written so far',
    );
    expect(pricesCheckLine([{ kind: 'introduction', title: 'Introduction', bodyMd: 'No prices here.' }])).toMatch(/^not run/);
    expect(pricesCheckLine([{ kind: 'chapter', title: 'Chapter 1', bodyMd: 'A price of £60 a month [[S1]].' }])).toBe(
      'failed: 1 price has no month checked (£60 in Chapter 1)',
    );
  });

  it('renders the rule and the month into the real chapter prompt', async () => {
    const { ai, seen } = adapterWith({});
    await ai.runStage(
      'writing',
      {
        promptId: 'writing.chapter',
        variables: {
          title: 'Small Offer',
          datedPrices: 'yes',
          checkedMonth: 'October 2026',
          section: { kind: 'chapter', number: 1, title: 'One', word_target: 500 },
        },
      },
      { model: 'test/model' },
    );
    const chapter = text(seen[0]);
    expect(chapter).toContain('(checked October 2026)');
    // Items 7 and 8: no invented author history, no named firm given a regulatory status without a source.
    expect(chapter).toContain("I'll admit I used to");
    expect(chapter).toContain("regulator's own register");
  });
});

describe('10. marketing describes what the book teaches', () => {
  it('sends the approved blueprint and the written summaries with their key takeaways', async () => {
    const ai = new RecordingAi((md, section) =>
      section['kind'] === 'chapter' ? `${md}\n\n### Key Takeaways\n\n- Price the problem, not the tool.\n- Ask three people first.` : md,
    );
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'self-help', settings: { acknowledgements: 'Sam' } });
    await approveAndWrite(t, id, 1);
    await t.call('POST', `/api/v1/books/${id}/marketing`, {});
    await t.services.runner.runUntilIdle();
    const m = ai.of('marketing')[0]!;
    expect(m.variables['blueprint']).toBeTruthy();
    const summaries = m.variables['previousSummaries'] as { title: string; summary: string }[];
    expect(summaries.find((s) => s.title.startsWith('Chapter 1'))?.summary).toContain(
      'Key takeaways: Price the problem, not the tool.; Ask three people first.',
    );
  });

  it('reads key takeaways from a section and keeps sections with no summary out', () => {
    expect(takeawaysOf('Text.\n\n### Key Takeaways\n\n- One.\n- Two.\n\nBridge paragraph.')).toEqual(['One.', 'Two.']);
    expect(writtenSummaries([{ id: 'a', kind: 'glossary', number: null, title: 'Glossary', bodyMd: 'x', summary: 'y' }])).toEqual([]);
  });
});

describe('12. profile facts once in the body', () => {
  it('tells later sections where the background already is and suggests cutting the repeat', async () => {
    const ai = new RecordingAi((md, section) => (section['kind'] === 'introduction' || section['kind'] === 'chapter' ? `${md}\n\n${BIO_IN_BODY}` : md));
    t = await testApp({ ai });
    const id = await newBook(t, { bookTypeId: 'self-help', settings: { acknowledgements: 'Sam' } });
    await approveAndWrite(t, id, 1);
    const chapterCall = ai.of('writing', 'chapter')[0]!;
    expect((chapterCall.variables['profile'] as Obj)['factsUsedIn']).toBe('Introduction');
    const ch = (await sections(t, id)).find((s) => s['kind'] === 'chapter')!;
    const sugg = await t.call<{ items: { pass: string; reason: string; original: string }[] }>('GET', `/api/v1/sections/${ch['id'] as string}/suggestions`);
    expect(sugg.body.items.some((s) => s.pass === 'repetition' && s.reason.includes("author's background") && s.original.includes('GAkinz'))).toBe(true);
    const intro = (await sections(t, id)).find((s) => s['kind'] === 'introduction')!;
    const introSugg = await t.call<{ items: { reason: string }[] }>('GET', `/api/v1/sections/${intro['id'] as string}/suggestions`);
    expect(introSugg.body.items.some((s) => s.reason.includes("author's background"))).toBe(false);
  });
});

describe('14. source titles', () => {
  it('replaces a domain-only citation title with the research notes title, matched by URL', () => {
    const url = 'https://sidehustleschool.com/guides/ai-side-hustles/';
    expect(isDomainTitle('sidehustleschool.com', url, 'sidehustleschool.com')).toBe(true);
    expect(isDomainTitle('AI side hustles guide', url, null)).toBe(false);
    const notes = [{ id: 'S4', whatItSupports: 'ideas', title: 'AI side hustles guide', url: 'https://www.sidehustleschool.com/guides/ai-side-hustles' }];
    expect(betterTitle('sidehustleschool.com', url, 'sidehustleschool.com', notes, 'S1')).toBe('AI side hustles guide');
    expect(betterTitle('A real title', url, null, notes, 'S1')).toBe('A real title');
    expect(betterTitle(null, url, null, [{ id: 'S1', whatItSupports: '', title: 'By id' }], 'S1')).toBe('By id');
  });
});

describe('15. blueprint estimate margin', () => {
  it('raises the blueprint high estimate by the margin', async () => {
    const { ai, service } = adapterWith({});
    await service.listModels();
    const input: AiStageInput = { variables: { title: 'Small Offer', idea: 'Small offer', wordTarget: 30000 } };
    const est = await ai.estimate('blueprint', input, { model: 'test/model' });
    let high = 0;
    for (const s of estimatePlan('blueprint', input)) {
      if (!VolumeAi.isTaskId(s.task)) throw new Error(s.task);
      const e = service.estimate(s.task, fillPromptVariables(s.input, service.prompts.load(s.task).variables), {
        model: 'test/model',
      });
      high += (e.highUsd ?? 0) * s.times;
    }
    expect(HIGH_ESTIMATE_MARGIN.blueprint).toBeGreaterThanOrEqual(1.3);
    expect(est.highUsd).toBeCloseTo(high * (HIGH_ESTIMATE_MARGIN.blueprint ?? 1), 8);
    // Live run 3: a high of $0.651 against an actual $0.687.
    expect(0.651 * (HIGH_ESTIMATE_MARGIN.blueprint ?? 1)).toBeGreaterThan(0.687);
  });
});

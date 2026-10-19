import { z } from 'zod';
import { ConfigError } from '../config/env.js';
import { JobFailed } from '../jobs/errors.js';
import { sha256Hex } from '../lib/util.js';
import {
  AI_OUTPUT_SCHEMAS,
  attachPartialUsage,
  AiModelUnavailableError,
  AiRetryableError,
  BlueprintChapterSchema,
  CLAIM_CATEGORIES,
  type AiCostEstimate,
  type AiCredit,
  type AiGuardrailHit,
  type AiGuardrails,
  type AiImageEstimate,
  type AiImageResult,
  type AiPort,
  type AiSource,
  type AiStage,
  type AiStageInput,
  type AiStageOutputMap,
  type AiStageResult,
  type AiUsage,
  type GenerateImageOptions,
  type RunStageOptions,
} from '../ports/ai.js';
import { MockAiAdapter } from './mock-ai.js';
import {
  createAiService,
  isTaskId,
  StageOutputs,
  taskForTemplate,
  type AiProvider,
  type AiService,
  type CostEstimate,
  type CreateAiServiceOptions,
  type GenerateImageOptions as VolumeAiImageOptions,
  type GuardrailHit as VolumeAiGuardrailHit,
  type GenerateImageResult as VolumeAiImageResult,
  type KeyStatus as VolumeAiKeyStatus,
  type MockScenario,
  type ModelPricing,
  type RunStageOptions as VolumeAiRunOptions,
  type StageResult,
} from '@volume/ai';

/**
 * The real AI adapter: implements AiPort on top of @volume/ai (packages/ai).
 *
 * The server's stages are coarser than the package's tasks, so one server stage can run several
 * package tasks (checks runs claims and consistency; marketing runs one task per kind). Server
 * variables are translated into the package's nested inputs, every prompt variable the server
 * cannot supply is sent as null ("None"), and each answer is mapped back to the server's output
 * shape and validated with AI_OUTPUT_SCHEMAS before it is returned.
 *
 * Model precedence (D-019) is resolved by the job runner; the final model arrives in opts.model.
 *
 * @volume/ai ships TypeScript sources with `.ts` import paths. The server type-checks them
 * statically (allowImportingTsExtensions in tsconfig.json) and Node strips their types at run time.
 */

/** The answer of one @volume/ai task. Task outputs are mapped by hand below, so the output is read as unknown. */
export type VolumeAiStageResult = StageResult<unknown>;

/** Runs one @volume/ai task whose id was picked at run time (the ids come from STAGE_TASKS). */
function runTask(service: AiService, task: string, input: Rec, opts: VolumeAiRunOptions): Promise<VolumeAiStageResult> {
  if (!isTaskId(task)) throw new JobFailed(`Unknown @volume/ai task ${task}.`, 'ai_request_invalid');
  // The input is checked by the package against the task's zod schema before anything is sent.
  return service.runStage(task, input, opts);
}

function estimateTask(service: AiService, task: string, input: Rec, opts: VolumeAiRunOptions): CostEstimate {
  if (!isTaskId(task)) throw new JobFailed(`Unknown @volume/ai task ${task}.`, 'ai_request_invalid');
  return service.estimate(task, input, opts);
}

// ---------- stage to task mapping ----------

/** Every @volume/ai task a server stage may run. The first is the default. */
export const STAGE_TASKS: { readonly [S in AiStage]: readonly string[] } = {
  research: ['research.title-research'],
  titles: ['titles.topic-directions', 'titles.title-options'],
  blueprint: ['blueprint.blueprint', 'blueprint.blueprint-fiction', 'blueprint.blueprint-workbook'],
  blueprint_part: ['blueprint.regenerate-part', 'blueprint.regenerate-part-fiction'],
  writing: [
    'writing.chapter',
    'writing.chapter-fiction',
    'writing.chapter-workbook',
    'writing.extend-section',
    'writing.extend-section-fiction',
    'writing.introduction',
    'writing.conclusion',
    'writing.front-matter',
    'writing.back-matter',
  ],
  summarise: ['checks.summarise-and-ledger'],
  checks: ['checks.claims', 'checks.consistency'],
  editing: ['editing.line-edit-uk', 'editing.structural', 'editing.voice', 'writing.rewrite-selection'],
  weave: ['writing.weave-note', 'writing.expand-note'],
  matter_metadata: ['matter.amazon-description', 'matter.keywords-categories', 'matter.back-cover'],
  cover_brief: ['cover.cover-brief', 'cover.cover-image'],
  marketing: ['marketing.tiktok-scripts', 'marketing.instagram-captions', 'marketing.launch-email'],
  picture_story: ['children.picture-book-story'],
  scene_prompts: ['children.scene-prompts'],
  character_reference: ['children.character-reference'],
};

/**
 * The book's template id: an explicit templateId, else the id inside the {{template}} rules object, else the
 * template string (research sends book.template), else book.template.
 */
export function templateIdOf(v: Rec): string | null {
  const t = v['template'];
  return firstText(v['templateId'], rec(t)['id'], typeof t === 'string' ? t : null, rec(v['book'])['template']);
}

/** The @volume/ai task for a base task in this book's template (fiction and workbook have their own prompts). */
export function taskFor(task: string, v: Rec): string {
  return isTaskId(task) ? taskForTemplate(task, templateIdOf(v)) : task;
}

/** Cover art ratio sent to the images endpoint (5:8 is rejected; the export fits 2:3 to 1600 x 2560). */
export const COVER_ASPECT_RATIO = '2:3';

const MOCK_SCENARIOS: ReadonlySet<string> = new Set<MockScenario>([
  'rate_limit',
  'server_error',
  'invalid_json',
  'invalid_json_always',
  'stream_cut',
  'truncated',
  'truncated_always',
  'refusal',
  'model_missing',
  'slow',
  'no_sources',
]);

/** Front and back matter pages written by the writing.front-matter / writing.back-matter prompts. */
const FRONT_MATTER: Readonly<Record<string, string>> = {
  dedication: 'dedication',
  preface: 'preface',
  acknowledgements: 'acknowledgements',
  how_to_use: 'howToUse',
};
const BACK_MATTER: Readonly<Record<string, string>> = { review_request: 'reviewRequest', appendix: 'appendix', glossary: 'glossary', resources: 'resources' };
/** Expected words for a front or back matter page with no word target of its own (cost estimate only). */
const MATTER_WORDS: Readonly<Record<string, number>> = {
  dedication: 40,
  preface: 700,
  acknowledgements: 250,
  how_to_use: 300,
  review_request: 80,
  appendix: 1000,
  glossary: 800,
  resources: 500,
};
/**
 * Extra margin on the high estimate for stages whose real cost ran over it (live run 3: blueprint $0.687 against a
 * high of $0.651, a long reasoning answer on the blueprint model).
 */
export const HIGH_ESTIMATE_MARGIN: Readonly<Partial<Record<AiStage, number>>> = { blueprint: 1.35, blueprint_part: 1.35 };

/** Expected answer words for the per-section summary and each checks call (cost estimate only). */
export const SUMMARY_WORDS = 450;
export const CHECKS_WORDS = 600;

function wordsIn(markdown: string): number {
  return markdown.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

const CLAIM_TYPE_TO_CATEGORY: Readonly<Record<string, (typeof CLAIM_CATEGORIES)[number]>> = {
  statistic: 'statistical',
  'study-or-research': 'other_fact',
  'quote-attribution': 'other_fact',
  'medical-clinical': 'medical',
  legal: 'legal',
  safety: 'safety',
  financial: 'financial',
  'product-or-brand': 'other_fact',
  instruction: 'safety',
  'real-person': 'other_fact',
  'award-or-praise': 'other_fact',
  isbn: 'other_fact',
  'children-safety': 'safety',
  personal: 'personal',
  'named-entity-regulatory': 'regulatory',
};

function isMockScenario(v: string): v is MockScenario {
  return MOCK_SCENARIOS.has(v);
}

// ---------- small value helpers ----------

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function rec(v: unknown): Rec {
  return isRec(v) ? v : {};
}
function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
/** A string or number field as text, '' for anything else (objects are never stringified). */
function plain(v: unknown): string {
  return typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '';
}
function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v : null;
}
function firstText(...vals: unknown[]): string | null {
  for (const v of vals) {
    const t = text(v);
    if (t !== null) return t;
  }
  return null;
}
function firstNum(...vals: unknown[]): number | null {
  for (const v of vals) if (typeof v === 'number' && Number.isFinite(v)) return v;
  return null;
}
function firstBool(...vals: unknown[]): boolean | null {
  for (const v of vals) if (typeof v === 'boolean') return v;
  return null;
}
function strList(v: unknown): string[] {
  return list(v).filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}
/** Sets key only when the value is not null, so the prompt filler decides what is sent as "None". */
function put(target: Rec, key: string, value: unknown): void {
  if (value !== null && value !== undefined) target[key] = value;
}

// ---------- input builders (server variables to @volume/ai inputs) ----------

function voiceText(voice: Rec, memory: string[]): string | null {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(voice)) {
    if (k === 'sample' || k === 'soundsLike') continue;
    if (Array.isArray(v)) {
      const items = v.filter((x) => typeof x === 'string' || typeof x === 'number').map(String);
      if (items.length) lines.push(`${k}: ${items.join(', ')}`);
    } else if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      if (String(v).trim()) lines.push(`${k}: ${String(v)}`);
    }
  }
  if (memory.length) lines.push(`Remember:\n${memory.map((m) => `- ${m}`).join('\n')}`);
  return lines.length ? lines.join('\n') : null;
}

export function profileInput(v: unknown): Rec | null {
  if (!isRec(v)) return null;
  const voice = rec(v['voice']);
  const memory = list(v['memory'])
    .map((m) => (typeof m === 'string' ? m : text(rec(m)['content'])))
    .filter((m): m is string => m !== null && m.trim().length > 0);
  const credentials = Array.isArray(v['credentials']) ? strList(v['credentials']).join('; ') : text(v['credentials']);
  // Profile links are {label, value} (or {label, url}); the label goes with the link so prompts can name it.
  const links = list(v['links'])
    .map((l) => {
      if (typeof l === 'string') return text(l);
      const o = rec(l);
      const url = firstText(o['url'], o['value']);
      const label = text(o['label']);
      return url && label ? `${label}: ${url}` : url;
    })
    .filter((l): l is string => l !== null);
  const out: Rec = {};
  put(out, 'penName', text(v['penName']));
  put(out, 'perspective', firstText(v['perspective'], voice['perspective'], voice['pov']));
  put(out, 'credentials', credentials || null);
  put(out, 'voice', typeof v['voice'] === 'string' ? v['voice'] : voiceText(voice, memory));
  put(out, 'voiceSample', firstText(v['voiceSample'], voice['sample']));
  put(out, 'isRealPerson', firstBool(v['isRealPerson']));
  put(out, 'bio', firstText(v['bio'], v['bioThirdPerson']));
  put(out, 'shortBio', text(v['shortBio']));
  put(out, 'location', text(v['location']));
  put(out, 'illustrativeLine', firstBool(v['illustrativeLine']));
  put(out, 'factsUsedIn', Array.isArray(v['factsUsedIn']) ? strList(v['factsUsedIn']).join('; ') || null : text(v['factsUsedIn']));
  if (links.length) out['links'] = links;
  if (isRec(v['brand']) && Object.keys(v['brand']).length) out['brand'] = v['brand'];
  put(out, 'dedicationNames', Array.isArray(v['dedicationNames']) ? strList(v['dedicationNames']) : text(v['dedicationNames']));
  put(out, 'acknowledgementNames', Array.isArray(v['acknowledgementNames']) ? strList(v['acknowledgementNames']) : text(v['acknowledgementNames']));
  if (Array.isArray(v['bannedPhrases'])) out['bannedPhrases'] = strList(v['bannedPhrases']);
  return out;
}

export function bookInput(v: Rec): Rec {
  const b = rec(v['book']);
  const out: Rec = {};
  const idea = firstText(v['idea'], b['idea']);
  const notes = firstText(v['notes'], b['notes']);
  // The author's brief goes as its own field ({{book.authorBrief}}); fillPromptVariables folds it into the idea for a
  // prompt version that does not read it yet.
  put(out, 'idea', idea ?? notes);
  put(out, 'authorBrief', notes);
  put(out, 'type', firstText(v['bookTypeId'], v['bookType'], b['type'], b['bookTypeId']));
  put(out, 'variant', firstText(v['variant'], b['variant']));
  put(out, 'genre', firstText(v['genre'], b['genre']));
  put(out, 'title', firstText(v['title'], b['title']));
  put(out, 'subtitle', firstText(v['subtitle'], b['subtitle']));
  put(out, 'audience', firstText(v['audience_hint'], v['audience'], b['audience']));
  put(out, 'tone', firstText(v['tone'], b['tone']));
  put(out, 'toneNotes', firstText(v['toneNotes'], b['toneNotes'], b['tone_notes']));
  put(out, 'wordTarget', firstNum(v['wordTarget'], b['wordTarget'], b['word_target']));
  put(out, 'wordCount', firstNum(v['wordCount'], b['wordCount']));
  put(out, 'chapterCount', firstNum(v['chapterCount'], b['chapterCount']));
  put(out, 'hookStyle', firstText(v['hookStyle'], b['hookStyle'], b['hook_style']));
  put(out, 'takeaways', firstBool(v['takeaways'], b['takeaways']));
  put(out, 'illustrativeStories', firstBool(v['illustrativeStories'], b['illustrativeStories']));
  const quotes = v['quotes'] ?? b['quotes'];
  if (typeof quotes === 'string' && quotes.trim()) out['quotes'] = quotes;
  else if (Array.isArray(quotes)) {
    const q = quotes.filter(isRec).flatMap((x) => {
      const t = text(x['text']);
      return t ? [{ text: t, attribution: text(x['attribution']) ?? '' }] : [];
    });
    if (q.length) out['quotes'] = q;
  }
  const format = firstText(v['format'], b['format']);
  if (format === 'ebook' || format === 'print') out['format'] = format;
  const isbns = strList(v['isbns'] ?? b['isbns']);
  if (isbns.length) out['isbns'] = isbns;
  // Dated prices (tech how-to, travel): the rule, the month to write and the app's check over the written chapters.
  const dated = v['datedPrices'] ?? b['datedPrices'];
  if (typeof dated === 'boolean') out['datedPrices'] = dated ? 'yes' : 'no';
  else put(out, 'datedPrices', text(dated));
  put(out, 'checkedMonth', firstText(v['checkedMonth'], b['checkedMonth']));
  put(out, 'pricesCheck', firstText(v['pricesCheck'], b['pricesCheck']));
  // Template (fiction and workbook prompts read it), and the fiction point of view and tense: the book's own choice,
  // else the template's voice defaults (fiction.json voice.defaultPerspective and voice.tense).
  const templateId = templateIdOf(v);
  put(out, 'template', templateId);
  const voice = rec(rec(v['template'])['voice']);
  const fiction = templateId === 'fiction';
  put(out, 'pov', firstText(v['pov'], b['pov'], fiction ? voice['defaultPerspective'] : null));
  put(out, 'tense', firstText(v['tense'], b['tense'], fiction ? voice['tense'] : null));
  return out;
}

function sourcesInput(v: unknown): Rec[] {
  return list(v)
    .filter(isRec)
    .flatMap((s) => {
      const url = text(s['url']);
      if (!url) return [];
      const out: Rec = { title: firstText(s['title']) ?? url, url };
      put(out, 'id', text(s['id']));
      put(out, 'snippet', firstText(s['excerpt'], s['snippet']));
      return [out];
    });
}

function summariesInput(v: unknown): Rec[] {
  return list(v)
    .filter(isRec)
    .flatMap((s, i) => {
      const summary = text(s['summary']);
      return summary ? [{ number: firstNum(s['number']) ?? i + 1, title: firstText(s['title']) ?? `Section ${i + 1}`, summary }] : [];
    });
}

function ledgerInput(v: unknown): Rec[] {
  return list(v)
    .filter(isRec)
    .flatMap((e) => {
      const kind = text(e['kind']);
      const key = firstText(e['key'], e['ledgerKey']);
      return kind && key ? [{ kind, key, detail: text(e['detail']) }] : [];
    });
}

/** Fields every @volume/ai task input shares. */
export function baseInput(v: Rec): Rec {
  const out: Rec = {};
  const profile = profileInput(v['profile']);
  if (profile) out['profile'] = profile;
  out['book'] = bookInput(v);
  for (const k of ['blueprint', 'template', 'research'] as const) if (v[k] !== undefined) out[k] = v[k] ?? null;
  // The fiction story bible goes on its own as {{storyBible}}, never inside {{blueprint}} (D-043).
  const bp = out['blueprint'];
  const bible = v['storyBible'] ?? (isRec(bp) ? bp['storyBible'] : undefined);
  if (isRec(bp) && 'storyBible' in bp) {
    const { storyBible: _bible, ...rest } = bp;
    out['blueprint'] = rest;
  }
  if (isRec(bible)) out['storyBible'] = bible;
  if (v['sources'] !== undefined) out['sources'] = sourcesInput(v['sources']);
  if (v['previousSummaries'] !== undefined) out['previousSummaries'] = summariesInput(v['previousSummaries']);
  if (v['ledger'] !== undefined) out['ledger'] = ledgerInput(v['ledger']);
  put(out, 'cta', text(v['cta']));
  return out;
}

function chapterInput(section: Rec, instruction: string | null = null): Rec {
  const out: Rec = {};
  put(out, 'kind', text(section['kind']));
  put(out, 'number', firstNum(section['number']));
  put(out, 'title', text(section['title']));
  put(out, 'partTitle', firstText(section['partTitle'], section['part_title']));
  const subs = strList(section['subheadings']);
  if (subs.length) out['subheadings'] = subs;
  // A front or back matter page has no summary of its own: its template rule is its plan (never another section's).
  const summary = firstText(section['summary'], section['rule'], section['content']);
  put(out, 'summary', instruction ? `${summary ?? ''}\n\nOwner instruction: ${instruction}`.trim() : summary);
  put(out, 'wordTarget', firstNum(section['wordTarget'], section['word_target']));
  put(out, 'isLast', firstBool(section['isLast'], section['is_last']));
  // Fiction: viewpoint character, setting and scene beats; workbook: the planned exercises (blueprint chapter plan).
  put(out, 'povCharacter', firstText(section['povCharacter'], section['pov_character']));
  put(out, 'setting', text(section['setting']));
  const scenes = strList(section['scenes']);
  if (scenes.length) out['scenes'] = scenes;
  const exercises = exercisesOf(section['exercises']);
  if (exercises.length) out['exercises'] = exercises;
  return out;
}

/** Planned workbook exercises that match the AI layer's ExercisePlan schema; anything else is dropped. */
function exercisesOf(v: unknown): StageOutputs.ExercisePlan[] {
  return list(v).flatMap((e) => {
    const ok = StageOutputs.ExercisePlan.safeParse({ lines: null, purpose: '', ...rec(e) });
    return ok.success ? [ok.data] : [];
  });
}

/** Variables the package fills itself (config, computed hits): never pre-filled here. */
function filledByPackage(name: string): boolean {
  return name.startsWith('houseStyle.') || name.startsWith('kdp.') || name === 'goLiveNote' || name === 'patternHits';
}

/**
 * A prompt that does not read {{book.authorBrief}} gets the brief inside {{book.idea}} ("Owner notes: ..."), so the
 * author's brief is never lost on an older prompt version.
 */
function foldAuthorBrief(out: Rec, variables: readonly string[]): void {
  const book = out['book'];
  if (!isRec(book) || variables.includes('book.authorBrief') || variables.includes('book')) return;
  const { authorBrief, ...rest } = book;
  const brief = text(authorBrief);
  if (!brief) return;
  const idea = text(rest['idea']);
  out['book'] = { ...rest, idea: idea && idea !== brief ? `${idea}\n\nOwner notes: ${brief}` : brief };
}

/** Sends every prompt variable the server could not supply as null, which the prompt shows as "None". */
export function fillPromptVariables(input: Rec, variables: readonly string[]): Rec {
  const out: Rec = { ...input };
  foldAuthorBrief(out, variables);
  for (const name of variables) {
    if (filledByPackage(name)) continue;
    if (name === 'research.sources') {
      if (out['sources'] === undefined) out['sources'] = [];
      continue;
    }
    if (name === 'story') {
      if (!('storyResult' in out)) out['storyResult'] = null;
      continue;
    }
    const dot = name.indexOf('.');
    if (dot < 0) {
      if (out[name] === undefined) out[name] = null;
      continue;
    }
    const head = name.slice(0, dot);
    const tail = name.slice(dot + 1);
    const current = out[head];
    if (current !== undefined && current !== null && !isRec(current)) continue;
    const nested: Rec = { ...rec(current) };
    if (nested[tail] === undefined) nested[tail] = null;
    out[head] = nested;
  }
  return out;
}

// ---------- output mappers (@volume/ai shapes to the server's) ----------

function chapterOut(c: unknown, fallbackNumber: number): Rec {
  const o = rec(c);
  const keyPoints = strList(o['keyTakeaways'] ?? o['key_points']);
  const wordTarget = firstNum(o['wordTarget'], o['word_target']);
  const out: Rec = {
    number: firstNum(o['number']) ?? fallbackNumber,
    title: o['title'],
    part: firstNum(o['partNumber'], o['part']),
    subheadings: strList(o['subheadings']),
    summary: firstText(o['summary']) ?? '',
    key_points: keyPoints,
    takeaways: firstBool(o['takeaways']) ?? keyPoints.length > 0,
    bridge_note: firstText(o['bridgeToNext'], o['bridge_note']) ?? '',
  };
  if (wordTarget !== null) out['word_target'] = Math.max(1, Math.round(wordTarget));
  put(out, 'promise', text(o['promise']));
  put(out, 'opening_hook', firstText(o['openingHookIdea'], o['opening_hook']));
  if (Array.isArray(o['storyIdeas'])) out['story_ideas'] = strList(o['storyIdeas']);
  if (Array.isArray(o['sourceIds'])) out['source_ids'] = strList(o['sourceIds']);
  // Fiction and workbook chapter plans (blueprint.blueprint-fiction, blueprint.blueprint-workbook).
  const exercises = exercisesOf(o['exercises']);
  if (Array.isArray(o['exercises'])) out['exercises'] = exercises;
  put(out, 'povCharacter', firstText(o['povCharacter'], o['pov_character']));
  put(out, 'setting', text(o['setting']));
  if (Array.isArray(o['scenes'])) out['scenes'] = strList(o['scenes']);
  return out;
}

function blueprintOut(o: Rec): Rec {
  const out: Rec = {
    title: o['title'],
    subtitle: firstText(o['subtitle']) ?? '',
    summary: firstText(o['summary']) ?? '',
    audience: firstText(o['targetAudience'], rec(o['bookInfo'])['targetAudience']) ?? '',
    usps: strList(o['uniqueSellingPoints']),
    tone_notes: firstText(o['toneNotes']) ?? '',
    hook_style: firstText(o['hookStyle']) ?? 'question',
    parts: list(o['parts'])
      .filter(isRec)
      .map((p) => ({ number: p['number'], title: p['title'] })),
    chapters: list(o['chapters']).map((c, i) => chapterOut(c, i + 1)),
    front: rec(o['frontMatter']),
    back: rec(o['backMatter']),
    back_blurb: firstText(o['backCoverBlurb']) ?? '',
    description_draft: firstText(o['amazonDescriptionDraft']) ?? '',
    categories: strList(o['categories']),
    keywords: strList(o['keywords']),
  };
  if (isRec(o['bookInfo'])) out['book_info'] = o['bookInfo'];
  if (typeof o['illustrativeStoriesLine'] === 'boolean') out['illustrative_stories_line'] = o['illustrativeStoriesLine'];
  if (Array.isArray(o['claimsToWatch'])) out['claims_to_watch'] = strList(o['claimsToWatch']);
  // Fiction: the story bible travels in the blueprint data (D-043).
  if (isRec(o['storyBible'])) out['storyBible'] = o['storyBible'];
  return out;
}

function directionOut(d: Rec, i: number): Rec {
  return {
    key: firstText(d['key']) ?? `d${i + 1}`,
    label: firstText(d['label'], d['workingTitle']) ?? `Direction ${i + 1}`,
    angle: firstText(d['angle'], d['focus']) ?? '',
    audience: firstText(d['audience'], d['targetReaders']) ?? '',
    promise: firstText(d['promise'], d['whyItWorks']) ?? '',
  };
}

function researchOut(o: Rec): Rec {
  const audience = rec(o['audience']);
  const themes = list(o['competitorThemes']).filter(isRec);
  const notes = [
    text(o['ideaSummary']),
    strList(o['desiredOutcomes']).length ? `Desired outcomes: ${strList(o['desiredOutcomes']).join('; ')}` : null,
    strList(audience['alreadyTried']).length ? `Already tried: ${strList(audience['alreadyTried']).join('; ')}` : null,
    strList(audience['wordsTheyUse']).length ? `Words they use: ${strList(audience['wordsTheyUse']).join('; ')}` : null,
    strList(o['cautions']).length ? `Cautions: ${strList(o['cautions']).join('; ')}` : null,
  ].filter((x): x is string => x !== null);
  return {
    audience: { who: audience['who'], situation: firstText(audience['situation']) ?? '', level: '' },
    problems: list(o['pains'])
      .map((p) => (isRec(p) ? p['pain'] : p))
      .filter((x): x is string => typeof x === 'string'),
    angles: list(o['angles'])
      .filter(isRec)
      .map((a) => ({ angle: a['angle'], why: firstText(a['whyThisAuthor']) ?? '' })),
    competing_themes: themes.map((t) => t['theme']).filter((x): x is string => typeof x === 'string'),
    gaps: themes.map((t) => text(t['gapOrComplaint'])).filter((x): x is string => x !== null),
    keyword_ideas: list(o['keywordIdeas'])
      .map((k) => (isRec(k) ? k['phrase'] : k))
      .filter((x): x is string => typeof x === 'string'),
    notes: notes.join('\n'),
  };
}

function summariseOut(o: Rec): Rec {
  const l = rec(o['ledgerAdditions']);
  const ledger: { kind: string; key: string; detail: string }[] = [];
  for (const s of list(l['stories']).filter(isRec)) {
    const key = text(s['label']);
    if (key) ledger.push({ kind: 'story', key, detail: `${firstText(s['oneLine']) ?? ''}${s['illustrative'] === true ? ' (illustrative)' : ''}`.trim() });
  }
  for (const [field, kind] of [
    ['examples', 'example'],
    ['metaphors', 'metaphor'],
    ['quotes', 'quote'],
    ['phrasesOverused', 'phrase'],
    ['warnings', 'warning'],
  ] as const) {
    for (const key of strList(l[field])) ledger.push({ kind, key, detail: '' });
  }
  for (const f of list(l['factsWithSources']).filter(isRec)) {
    const key = text(f['fact']);
    if (key) ledger.push({ kind: 'fact', key, detail: firstText(f['sourceMarker']) ?? '' });
  }
  for (const n of list(l['names']).filter(isRec)) {
    const key = text(n['name']);
    if (key) ledger.push({ kind: 'name', key, detail: firstText(n['role']) ?? '' });
  }
  for (const t of list(l['terms']).filter(isRec)) {
    const key = text(t['term']);
    if (key) ledger.push({ kind: 'term', key, detail: firstText(t['explainedAs']) ?? '' });
  }
  // Fiction (summarise-and-ledger v5): characters and settings on the page (D-043).
  for (const c of list(l['characters']).filter(isRec)) {
    const key = text(c['name']);
    if (key) ledger.push({ kind: 'character', key, detail: [firstText(c['role']), firstText(c['details'])].filter(Boolean).join(': ') });
  }
  for (const st of list(l['settings']).filter(isRec)) {
    const key = text(st['name']);
    if (key) ledger.push({ kind: 'setting', key, detail: firstText(st['details']) ?? '' });
  }
  return { summary: o['summary'], ledger };
}

function span(markdown: string, needle: string | null): { start: number | null; end: number | null } {
  if (!needle) return { start: null, end: null };
  const i = markdown.indexOf(needle);
  return i >= 0 ? { start: i, end: i + needle.length } : { start: null, end: null };
}

/** Characters a model often changes when it quotes the text back: curly quotes, dashes, spaces, ellipses. */
const LOOSE_CHARS: Readonly<Record<string, string>> = {
  '‘': "'",
  '’': "'",
  '‚': "'",
  '‛': "'",
  '“': '"',
  '”': '"',
  '„': '"',
  '–': '-',
  '—': '-',
  '‑': '-',
  '…': '...',
};

/**
 * The text folded for a loose match (quotes, dashes and ellipses made plain, whitespace runs made one space, markdown
 * emphasis marks dropped), with each folded character's offset in the original.
 */
function looseFold(s: string): { text: string; at: number[] } {
  let text = '';
  const at: number[] = [];
  let space = false;
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i);
    if (c === '*' || c === '_') continue;
    if (/\s/.test(c)) {
      if (!space && text.length > 0) {
        text += ' ';
        at.push(i);
      }
      space = true;
      continue;
    }
    space = false;
    for (const ch of LOOSE_CHARS[c] ?? c) {
      text += ch;
      at.push(i);
    }
  }
  return { text, at };
}

/**
 * Where a quoted passage sits in the text: an exact match first, else a loose one (live acceptance run, 18 October
 * 2026: 5 of 6 line edits on one chapter came back as conflicts because the model quoted the text with other quote
 * marks or without its emphasis). `original` is the passage exactly as the text has it, so accepting it can apply.
 */
export function locateQuote(markdown: string, needle: string | null): { start: number | null; end: number | null; original: string | null } {
  if (!needle) return { start: null, end: null, original: null };
  const i = markdown.indexOf(needle);
  if (i >= 0) return { start: i, end: i + needle.length, original: needle };
  const want = looseFold(needle).text.trim();
  if (!want) return { start: null, end: null, original: null };
  const hay = looseFold(markdown);
  const j = hay.text.indexOf(want);
  if (j < 0) return { start: null, end: null, original: null };
  const start = hay.at[j] ?? 0;
  const end = (hay.at[j + want.length - 1] ?? start) + 1;
  return { start, end, original: markdown.slice(start, end) };
}

function suggestion(markdown: string, original: string | null, proposed: unknown, reason: string): Rec {
  const found = locateQuote(markdown, original);
  return { original: found.original ?? original ?? '', proposed, reason, start: found.start, end: found.end };
}

// ---------- errors ----------

/** The answer did not fit the server's contract (AI_OUTPUT_SCHEMAS). Not retried: the owner retries or picks another model. */
export class AiOutputMismatchError extends JobFailed {
  override name = 'AiOutputMismatchError';
  constructor(
    readonly stage: string,
    readonly issues: string[],
    readonly usage: AiUsage | null = null,
  ) {
    super(`The ${stage} answer did not match what Volume expects (${issues.slice(0, 3).join('; ')}). Try again or pick another model.`, 'invalid_output');
  }
}

interface AiErrorLike {
  kind: string;
  message: string;
  status?: unknown;
  retryable?: unknown;
  retryAfterMs?: unknown;
  model?: unknown;
  cause?: unknown;
}

function asAiError(e: unknown): AiErrorLike | null {
  return e instanceof Error && typeof (e as { kind?: unknown }).kind === 'string' ? (e as unknown as AiErrorLike) : null;
}

/** Looks through an error and its causes for the first value of a field. */
function fromChain(e: unknown, field: 'retryAfterMs' | 'status' | 'model'): unknown {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur instanceof Error; i += 1) {
    const v = (cur as unknown as Rec)[field];
    if (v !== undefined && v !== null) return v;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}

function hasSpend(f: FailedSpend): boolean {
  return f.costUsd > 0 || f.inputTokens > 0 || f.outputTokens > 0;
}

/** The usage a @volume/ai error carries for the calls made before it failed (error.usage, or details.usage). */
export function packageUsageOf(e: unknown): { costUsd: number; inputTokens: number; outputTokens: number } | null {
  let cur: unknown = e;
  for (let i = 0; i < 5 && cur instanceof Error; i += 1) {
    const o = cur as unknown as Rec;
    const u = isRec(o['usage']) ? o['usage'] : isRec(rec(o['details'])['usage']) ? rec(rec(o['details'])['usage']) : null;
    if (u) {
      return {
        costUsd: firstNum(u['costUsd']) ?? 0,
        inputTokens: firstNum(u['promptTokens']) ?? 0,
        outputTokens: firstNum(u['completionTokens']) ?? 0,
      };
    }
    cur = (cur as { cause?: unknown }).cause;
  }
  return null;
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/** Maps @volume/ai errors onto the errors the job runner understands. */
export function mapVolumeAiError(e: unknown, ctx: { stage: string; model?: string | undefined }): Error {
  if (e instanceof AiRetryableError || e instanceof AiModelUnavailableError || e instanceof JobFailed) return e;
  if (e instanceof Error && e.name === 'AbortError') return e;
  const a = asAiError(e);
  if (!a) return e instanceof Error ? e : new Error(String(e));
  const retryAfter = fromChain(a, 'retryAfterMs');
  const retryAfterMs = typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? retryAfter : null;
  const statusRaw = fromChain(a, 'status');
  const status = typeof statusRaw === 'number' ? statusRaw : null;
  switch (a.kind) {
    case 'rate_limit':
      return new AiRetryableError(`OpenRouter is rate limiting requests (${ctx.stage}): ${a.message}`, retryAfterMs);
    case 'timeout':
    case 'network':
    case 'server':
    case 'stream_cut':
      return new AiRetryableError(`The ${ctx.stage} call failed for a reason worth retrying: ${a.message}`, retryAfterMs);
    case 'model_unavailable': {
      if ((status !== null && status >= 500) || a.retryable === true) {
        return new AiRetryableError(`No provider could serve the ${ctx.stage} model just now: ${a.message}`, retryAfterMs);
      }
      const model = fromChain(a, 'model');
      return new AiModelUnavailableError(a.message, typeof model === 'string' && model !== 'unknown' ? model : (ctx.model ?? 'unknown'));
    }
    case 'aborted':
      return abortError();
    case 'invalid_output':
      return new JobFailed(`The ${ctx.stage} answer was not valid after one repair: ${a.message} Try again or pick another model.`, 'invalid_output');
    case 'output_truncated':
      return new JobFailed(`The ${ctx.stage} answer was cut off before it finished, so it was not used. ${a.message}`, 'output_truncated');
    case 'auth':
      return new JobFailed('OpenRouter did not accept the API key. Check OPENROUTER_API_KEY in .env and restart Volume.', 'ai_auth');
    case 'budget':
      return new JobFailed(`OpenRouter stopped the ${ctx.stage} call: ${a.message}`, 'ai_credits');
    case 'refusal':
      return new JobFailed(`The model declined the ${ctx.stage} request: ${a.message}`, 'ai_refusal');
    case 'context_too_large':
      return new JobFailed(a.message, 'context_too_large');
    default:
      return new JobFailed(`The ${ctx.stage} step could not be sent: ${a.message}`, 'ai_request_invalid');
  }
}

// ---------- the adapter ----------

interface CallOptions {
  /** Pass onDelta through (markdown writing tasks only). */
  stream?: boolean;
  /** The result that names the prompt and the generation in prompt_runs. */
  primary?: boolean;
  /** Pin the prompt version from the stage input. */
  pinVersion?: boolean;
}

/** Spend of calls inside tasks that failed (cut-off answers, failed repairs): paid, so it is recorded. */
interface FailedSpend {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  /** The first task that failed after spending, for the prompt_runs row. */
  task: string | null;
}

interface StageRun {
  stage: AiStage;
  input: AiStageInput;
  opts: RunStageOptions;
  results: VolumeAiStageResult[];
  primary: VolumeAiStageResult | null;
  failed: FailedSpend;
  call(task: string, input: Rec, o?: CallOptions): Promise<VolumeAiStageResult>;
}

function emitInChunks(onDelta: ((t: string) => void) | undefined, markdown: string): void {
  if (!onDelta) return;
  for (let i = 0; i < markdown.length; i += 400) onDelta(markdown.slice(i, i + 400));
}

/** Width and height from a PNG header; null for other formats. */
function pngSize(data: Uint8Array): { width: number; height: number } | null {
  const sig = [0x89, 0x50, 0x4e, 0x47];
  if (data.length < 24 || !sig.every((b, i) => data[i] === b)) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export interface OpenRouterAiOptions {
  /** Retry listing models for estimates at most this often after a failure (default 5 minutes). */
  modelListRetryMs?: number;
}

function hitOut(h: VolumeAiGuardrailHit): AiGuardrailHit {
  const out: AiGuardrailHit = { rule: h.rule, severity: h.severity, message: h.message, match: h.match, path: h.path };
  if (h.phrase !== undefined) out.phrase = h.phrase;
  return out;
}

/** One guardrail report for a stage that ran several tasks: lists joined, passed only when every task passed. */
export function mergeGuardrails(results: readonly VolumeAiStageResult[]): AiGuardrails | null {
  const reports = results.map((r) => r.guardrails).filter((g) => g !== undefined && g !== null);
  if (reports.length === 0) return null;
  const rewrite = reports.find((g) => g.styleRewrite !== undefined)?.styleRewrite;
  return {
    passed: reports.every((g) => g.passed),
    blocking: reports.flatMap((g) => g.blocking.map(hitOut)),
    needsAttention: reports.flatMap((g) => g.needsAttention.map(hitOut)),
    rules: reports.flatMap((g) => g.rules.map((r) => ({ rule: r.rule, list: r.list, count: r.count, message: r.message, matches: [...r.matches] }))),
    styleRewrite: rewrite ? { phrases: [...rewrite.phrases], applied: rewrite.applied, cleared: rewrite.cleared, note: rewrite.note } : null,
  };
}

export class OpenRouterAiAdapter implements AiPort {
  readonly provider: 'mock' | 'openrouter';
  private modelsLoadedAt: number | null = null;
  private modelsTriedAt = 0;
  private readonly modelListRetryMs: number;

  constructor(
    private readonly service: AiService,
    opts: OpenRouterAiOptions = {},
  ) {
    this.provider = service.provider.name === 'openrouter' ? 'openrouter' : 'mock';
    this.modelListRetryMs = opts.modelListRetryMs ?? 5 * 60 * 1000;
  }

  // ----- runStage -----

  async runStage<S extends AiStage>(stage: S, input: AiStageInput, opts: RunStageOptions = {}): Promise<AiStageResult<S>> {
    if (opts.signal?.aborted) throw abortError();
    const started = Date.now();
    const run = this.newRun(stage, input, opts);
    let output: unknown;
    try {
      output = await this.runPlan(run);
    } catch (e) {
      // A stage that fails after any paid call (an earlier task, a cut-off answer, a failed repair) has
      // spent money: the runner records it.
      if (run.results.length > 0 || hasSpend(run.failed)) attachPartialUsage(e, { usage: this.usage(run, started), prompt: this.promptRef(run) });
      throw e;
    }

    const schema: z.ZodType<AiStageOutputMap[S]> = AI_OUTPUT_SCHEMAS[stage];
    const usage = this.usage(run, started);
    const parsed = schema.safeParse(output);
    if (!parsed.success) {
      const err = new AiOutputMismatchError(
        stage,
        parsed.error.issues.map((i) => `${i.path.join('.') || 'output'}: ${i.message}`),
        usage,
      );
      attachPartialUsage(err, { usage, prompt: this.promptRef(run) });
      throw err;
    }
    return {
      stage,
      output: parsed.data,
      rawText: this.rawText(run),
      usage,
      prompt: this.promptRef(run),
      sources: stage === 'research' ? this.sources(run) : [],
      mock: this.provider === 'mock',
      guardrails: mergeGuardrails(run.results),
    };
  }

  private newRun(stage: AiStage, input: AiStageInput, opts: RunStageOptions): StageRun {
    const run: StageRun = {
      stage,
      input,
      opts,
      results: [],
      primary: null,
      failed: { costUsd: 0, inputTokens: 0, outputTokens: 0, task: null },
      call: async (task, taskInput, o = {}) => {
        const result = await this.callTask(run, task, taskInput, o);
        run.results.push(result);
        if (o.primary && !run.primary) run.primary = result;
        return result;
      },
    };
    return run;
  }

  private prepare(task: string, input: Rec, version: number | undefined): Rec {
    const file = version === undefined ? this.service.prompts.load(task) : this.service.prompts.load(task, version);
    return fillPromptVariables(input, file.variables);
  }

  private async callTask(run: StageRun, task: string, input: Rec, o: CallOptions): Promise<VolumeAiStageResult> {
    const { opts } = run;
    if (opts.signal?.aborted) throw abortError();
    const version = o.pinVersion ? run.input.promptVersion : undefined;
    const runOpts: VolumeAiRunOptions = {};
    if (opts.beforeCall) {
      runOpts.beforeCall = (spent, estimate) =>
        opts.beforeCall!(run.results.reduce((sum, result) => sum + (result.usage.costUsd ?? 0), run.failed.costUsd) + spent, estimate);
    }
    if (opts.signal) runOpts.signal = opts.signal;
    if (opts.model) runOpts.model = opts.model;
    if (o.stream && opts.onDelta) runOpts.onDelta = opts.onDelta;
    if (version !== undefined) runOpts.promptVersion = version;
    if (opts.scenario && this.provider === 'mock' && isMockScenario(opts.scenario)) runOpts.scenario = opts.scenario;
    try {
      const prepared = this.prepare(task, input, version);
      const params: { maxTokens?: number; temperature?: number } = {};
      if (opts.maxTokens !== undefined) params.maxTokens = opts.maxTokens;
      if (opts.temperature !== undefined) params.temperature = opts.temperature;
      if (Object.keys(params).length > 0) runOpts.overrides = { book: { [this.service.prompts.load(task).meta.stage]: { params } } };
      return await runTask(this.service, task, prepared, runOpts);
    } catch (e) {
      const spent = packageUsageOf(e);
      if (spent) {
        run.failed.costUsd += spent.costUsd;
        run.failed.inputTokens += spent.inputTokens;
        run.failed.outputTokens += spent.outputTokens;
        run.failed.task ??= task;
      }
      throw mapVolumeAiError(e, { stage: run.stage, model: opts.model });
    }
  }

  private usage(run: StageRun, started: number): AiUsage {
    const primary = run.primary ?? run.results[0] ?? null;
    let cost = run.failed.costUsd;
    let inTok = run.failed.inputTokens;
    let outTok = run.failed.outputTokens;
    for (const r of run.results) {
      cost += r.usage.costUsd ?? 0;
      inTok += r.usage.promptTokens;
      outTok += r.usage.completionTokens;
    }
    const lastCall = primary ? primary.calls[primary.calls.length - 1] : undefined;
    return {
      provider: this.provider,
      model: primary?.model ?? run.opts.model ?? 'none',
      generationId: lastCall?.generationId ?? null,
      inputTokens: inTok,
      outputTokens: outTok,
      costUsd: cost,
      latencyMs: Date.now() - started,
    };
  }

  private rawText(run: StageRun): string {
    if (run.results.length === 1) return run.results[0]?.raw ?? '';
    return JSON.stringify(run.results.map((r) => ({ prompt: r.promptId, raw: r.raw })));
  }

  private promptRef(run: StageRun): { id: string; version: number; hash: string } {
    const primary = run.primary ?? run.results[0];
    if (!primary) {
      const task = run.failed.task;
      if (!task) return { id: `${run.stage}.none`, version: 0, hash: '' };
      let version = 0;
      try {
        version = this.service.prompts.load(task).meta.version;
      } catch {
        // The id alone still names the prompt.
      }
      return { id: task, version, hash: '' };
    }
    const ids = [...new Set(run.results.map((r) => r.promptId))];
    if (ids.length === 1) return { id: primary.promptId, version: primary.promptVersion, hash: primary.promptHash };
    return {
      id: ids.join('+').slice(0, 255),
      version: primary.promptVersion,
      hash: sha256Hex(run.results.map((r) => r.promptHash).join(':')),
    };
  }

  /**
   * Sources come only from url_citation annotations (the package builds them from nothing else). A citation whose
   * title is missing or only the domain takes the short title research.title-research v2 gave for that page in
   * sourceNotes (matched by URL, else by S<n> id). No page is fetched (D-020).
   */
  private sources(run: StageRun): AiSource[] {
    const out: AiSource[] = [];
    const notes = list(rec(run.primary?.output)['sourceNotes']).filter(isRec);
    for (const r of run.results) {
      for (const s of r.sources) {
        if (out.some((x) => x.url === s.url)) continue;
        out.push({
          url: s.url,
          title: betterTitle(text(s.title), s.url, s.domain ?? null, notes, `S${out.length + 1}`),
          excerpt: text(s.snippet),
          startIndex: s.startIndex ?? null,
          endIndex: s.endIndex ?? null,
          domain: s.domain ?? null,
          redirectUrl: s.redirectUrl ?? null,
          unresolved: s.unresolved === true,
        });
      }
    }
    return out;
  }

  // ----- per stage plans -----

  private async runPlan(run: StageRun): Promise<unknown> {
    const v = run.input.variables;
    switch (run.stage) {
      case 'research': {
        const r = await run.call('research.title-research', baseInput(v), { primary: true, pinVersion: true });
        return researchOut(rec(r.output));
      }
      case 'titles':
        return this.titles(run, v);
      case 'blueprint': {
        const r = await run.call(taskFor('blueprint.blueprint', v), blueprintInput(v), { primary: true, pinVersion: true });
        return blueprintOut(rec(r.output));
      }
      case 'blueprint_part':
        return this.blueprintPart(run, v);
      case 'writing':
        return this.writing(run, v);
      case 'summarise': {
        const r = await run.call('checks.summarise-and-ledger', summariseInput(v), { primary: true, pinVersion: true });
        return summariseOut(rec(r.output));
      }
      case 'checks':
        return this.checks(run, v);
      case 'editing':
        return this.editing(run, v);
      case 'weave':
        return this.weave(run, v);
      case 'matter_metadata':
        return this.matter(run, v);
      case 'cover_brief':
        return this.coverBrief(run, v);
      case 'marketing':
        return this.marketing(run, v);
      case 'picture_story':
      case 'scene_prompts':
      case 'character_reference': {
        const r = await run.call(CHILDREN_TASKS[run.stage], childrenInput(v), { primary: true, pinVersion: true });
        return r.output;
      }
    }
  }

  private async titles(run: StageRun, v: Rec): Promise<unknown> {
    let directions: Rec[];
    if (isRec(v['direction'])) {
      directions = [v['direction']];
    } else {
      const d = await run.call('titles.topic-directions', baseInput(v), { primary: true, pinVersion: true });
      directions = list(rec(d.output)['directions']).filter(isRec);
    }
    const chosen = directions[0];
    if (!chosen) return { directions: [], options: [] };
    const instruction = text(v['instruction']);
    const t = await run.call(
      'titles.title-options',
      { ...baseInput(v), direction: instruction ? { ...chosen, ownerInstruction: instruction } : chosen },
      { primary: true },
    );
    const mapped = directions.map(directionOut);
    const key = mapped[0]?.['key'] ?? '';
    return {
      directions: mapped,
      options: list(rec(t.output)['options'])
        .filter(isRec)
        .map((o) => ({ title: o['title'], subtitle: firstText(o['subtitle']) ?? '', direction_key: key })),
    };
  }

  private async blueprintPart(run: StageRun, v: Rec): Promise<unknown> {
    const part = text(v['part']) ?? 'summary';
    const r = await run.call(taskFor('blueprint.regenerate-part', v), blueprintPartInput(v, part), { primary: true, pinVersion: true });
    const value = rec(r.output)['value'];
    const val = rec(value);
    let data: unknown;
    let check: z.ZodType | null = null;
    if (part === 'summary') {
      data = { summary: typeof value === 'string' ? value : firstText(val['summary']) };
      check = z.object({ summary: z.string() });
    } else if (part === 'chapters') {
      data = { chapters: (Array.isArray(value) ? value : list(val['chapters'])).map((c, i) => chapterOut(c, i + 1)) };
      check = z.object({ chapters: z.array(BlueprintChapterSchema).min(1) });
    } else if (part.startsWith('chapter:')) {
      const n = Number(part.split(':')[1]);
      data = chapterOut(value, n);
      check = BlueprintChapterSchema;
    } else if (part === 'front' || part === 'back') {
      data = value;
      check = z.record(z.string(), z.unknown());
    } else if (part === 'listing') {
      data = {
        back_blurb: firstText(val['back_blurb'], val['backCoverBlurb']) ?? '',
        description_draft: firstText(val['description_draft'], val['amazonDescriptionDraft']) ?? '',
        categories: strList(val['categories']),
        keywords: strList(val['keywords']),
      };
    } else {
      data = value;
    }
    if (check) {
      const ok = check.safeParse(data);
      if (!ok.success)
        throw new AiOutputMismatchError(
          'blueprint_part',
          ok.error.issues.map((i) => `data.${i.path.join('.')}: ${i.message}`),
        );
    }
    return { part, data };
  }

  private async writing(run: StageRun, v: Rec): Promise<unknown> {
    const plan = writingPlan(v, run.input.promptId);
    if (plan.task === 'writing.front-matter' || plan.task === 'writing.back-matter') {
      const r = await run.call(plan.task, plan.input, { primary: true, pinVersion: true });
      const o = rec(r.output);
      const field = plan.field ?? '';
      let markdown: string | null = null;
      const value = o[field];
      if (typeof value === 'string') markdown = value;
      else if (field === 'glossary') {
        const items = list(value).filter(isRec);
        if (items.length) markdown = items.map((g) => `**${plain(g['term'])}**: ${plain(g['definition'])}`).join('\n\n');
      } else if (field === 'resources') {
        markdown = resourcesMarkdown(list(value).filter(isRec), sourcesInput(v['sources']));
      }
      if (markdown) emitInChunks(run.opts.onDelta, markdown);
      return { markdown };
    }
    const r = await run.call(plan.task, plan.input, { primary: true, pinVersion: true, stream: true });
    return { markdown: r.output };
  }

  private async checks(run: StageRun, v: Rec): Promise<unknown> {
    const markdown = typeof v['markdown'] === 'string' ? v['markdown'] : '';
    const [claimsIn, consistencyIn] = checksInputs(v);
    const claims = await run.call('checks.claims', claimsIn, { primary: true, pinVersion: true });
    const consistency = await run.call('checks.consistency', consistencyIn);
    const c = rec(consistency.output);
    const issues: Rec[] = list(c['issues'])
      .filter(isRec)
      .map((i) => ({
        issue: [firstText(i['detail']), text(i['fix']) ? `Fix: ${String(i['fix'])}` : null].filter(Boolean).join(' '),
        chapters: [],
        excerpt: firstText(i['quote']) ?? '',
      }));
    for (const s of strList(c['subheadingIssues'])) issues.push({ issue: s, chapters: [], excerpt: '' });
    // Consistency v2: references to scenes or details no earlier summary or ledger entry holds ("after the chat by the van").
    for (const u of list(c['unknownReferences']).filter(isRec)) {
      const ref = firstText(u['reference'], u['quote']) ?? '';
      issues.push({
        issue:
          `Refers back to something the book never showed: "${ref}". ${firstText(u['detail']) ?? ''} Fix: write the earlier scene, or cut the reference.`.trim(),
        chapters: [],
        excerpt: firstText(u['quote']) ?? '',
      });
    }
    if (c['promiseKept'] === 'no' || c['promiseKept'] === 'partly') {
      issues.push({ issue: firstText(c['promiseNote']) ?? `The chapter promise is ${String(c['promiseKept'])} kept.`, chapters: [], excerpt: '' });
    }
    return {
      claims: list(rec(claims.output)['claims'])
        .filter(isRec)
        .map((q) => {
          const quote = text(q['quote']);
          // Personal claims (checks.claims v2) are statements about the author the profile facts do not support.
          const personal = q['type'] === 'personal';
          const regulatory = q['type'] === 'named-entity-regulatory';
          const check = firstText(q['check']) ?? '';
          return {
            sentence: q['quote'],
            category: CLAIM_TYPE_TO_CATEGORY[String(q['type'])] ?? 'other_fact',
            check_needed: personal
              ? `Personal claim not in the author profile. ${check}`.trim()
              : regulatory
                ? `Names a firm, product or person with a regulatory or safety status. Blocks the pack until verified. ${check}`.trim()
                : check,
            softer: firstText(q['softerVersion']),
            ...span(markdown, quote),
          };
        }),
      consistency: issues,
    };
  }

  private async editing(run: StageRun, v: Rec): Promise<unknown> {
    const markdown = typeof v['markdown'] === 'string' ? v['markdown'] : '';
    const plan = editingPlan(v, run.input.promptId);
    const r = await run.call(plan.task, plan.input, { primary: true, pinVersion: true });
    const o = rec(r.output);
    let suggestions: Rec[];
    switch (plan.task) {
      case 'editing.structural':
        suggestions = list(o['problems'])
          .filter(isRec)
          .map((p) =>
            suggestion(markdown, firstText(p['quote'], p['where']), p['suggestedChange'], `${plain(p['priority'])}: ${plain(p['detail'])}`.replace(/^: /, '')),
          );
        break;
      case 'editing.voice':
        suggestions = list(o['oddSentences'])
          .filter(isRec)
          .map((s) => suggestion(markdown, text(s['before']), s['plainer'], 'Closer to the author’s voice.'));
        break;
      case 'writing.rewrite-selection': {
        const sel = plan.selection;
        suggestions = [
          { original: sel?.text ?? '', proposed: o['text'], reason: firstText(o['changeNote']) ?? '', start: sel?.start ?? null, end: sel?.end ?? null },
        ];
        break;
      }
      default:
        suggestions = list(o['changes'])
          .filter(isRec)
          .map((c) => suggestion(markdown, text(c['before']), c['after'], [text(c['why']), text(c['kind'])].filter(Boolean).join(' ')));
    }
    return { suggestions };
  }

  private async weave(run: StageRun, v: Rec): Promise<unknown> {
    let markdown = typeof v['markdown'] === 'string' ? v['markdown'] : '';
    const original = markdown;
    const section = rec(v['section']);
    const notes = list(v['notes'])
      .filter(isRec)
      .map((n) => ({ id: firstText(n['id']), note: firstText(n['note'], n['text']), at: insertionPoint(original, n) }))
      .filter((n): n is { id: string | null; note: string; at: number } => n.note !== null)
      .sort((a, b) => b.at - a.at);
    const woven: string[] = [];
    let first = true;
    // expand: each note becomes a new subsection (a subheading and 2 to 4 paragraphs) instead of woven prose.
    const expand = v['mode'] === 'expand';
    for (const n of notes) {
      const r = await run.call(expand ? 'writing.expand-note' : 'writing.weave-note', weaveInput(v, section, markdown, n), {
        primary: first,
        pinVersion: true,
      });
      first = false;
      const o = rec(r.output);
      const body = text(o['text']);
      const heading = expand
        ? text(o['heading'])
            ?.replace(/^#+\s*/, '')
            .trim()
        : null;
      const passage = body && heading ? `## ${heading}\n\n${body.trim()}` : body;
      if (!passage) continue;
      const head = markdown.slice(0, n.at).replace(/\s+$/, '');
      const tail = markdown.slice(n.at).replace(/^\s+/, '');
      markdown = [head, passage.trim(), tail].filter((p) => p.length > 0).join('\n\n');
      if (n.id) woven.push(n.id);
    }
    emitInChunks(run.opts.onDelta, markdown);
    return { markdown, woven_note_ids: woven.reverse() };
  }

  private async matter(run: StageRun, v: Rec): Promise<unknown> {
    const out: Rec = {
      dedication: '',
      acknowledgements: '',
      review_request: '',
      newsletter_line: '',
      back_blurb: '',
      description_html: '',
      keywords: [],
      categories: [],
    };
    let first = true;
    for (const task of matterTasks(run.input.promptId)) {
      const r = await run.call(task, matterInput(v), { primary: first, pinVersion: first });
      first = false;
      const o = rec(r.output);
      if (task === 'matter.amazon-description') {
        out['description_html'] = o['html'];
        out['description_text'] = firstText(o['plainText']) ?? '';
      } else if (task === 'matter.keywords-categories') {
        out['keywords'] = strList(o['keywords']);
        out['categories'] = list(o['categories'])
          .map((c) => (isRec(c) ? c['path'] : c))
          .filter((x): x is string => typeof x === 'string');
        out['keyword_reasons'] = strList(o['keywordReasons']);
      } else {
        const blurb = rec(o['blurb']);
        out['back_blurb'] = [text(blurb['headline']), text(blurb['body'])].filter(Boolean).join('\n\n');
        out['short_bio'] = firstText(rec(o['shortBio'])['text']) ?? '';
        if (isRec(o['spineText'])) out['spine_text'] = o['spineText'];
      }
    }
    return out;
  }

  private async coverBrief(run: StageRun, v: Rec): Promise<unknown> {
    const r = await run.call('cover.cover-brief', coverBriefInput(v), { primary: true, pinVersion: true });
    const o = rec(r.output);
    const brief = rec(o['brief']);
    // Each concept becomes one paid image: keep only as many as the book asked for (1 to 4, default 3).
    const concepts = list(o['concepts']).filter(isRec).slice(0, conceptCountOf(v));
    // OpenRouter's images endpoint accepts 2:3 but not 5:8; the export fits 2:3 art to 1600 x 2560.
    const aspectRatio = firstText(v['aspectRatio']) ?? COVER_ASPECT_RATIO;
    const outConcepts: Rec[] = [];
    for (const c of concepts) {
      const img = await run.call('cover.cover-image', coverImageInput(v, brief, c, aspectRatio));
      const io = rec(img.output);
      const avoid = strList(io['negativeNotes']);
      const prompt = text(io['imagePrompt']);
      outConcepts.push({
        name: c['name'],
        image_prompt: prompt && avoid.length ? `${prompt}\n\nAvoid: ${avoid.join(', ')}.` : io['imagePrompt'],
        why: firstText(c['whyItFits']) ?? '',
      });
    }
    const palette = list(brief['palette']);
    return {
      brief: {
        mood: firstText(brief['mood']) ?? '',
        audience: firstText(bookInput(v)['audience']) ?? '',
        palette: palette.map((p) => (isRec(p) ? p['hex'] : p)).filter((x): x is string => typeof x === 'string'),
        composition: firstText(brief['textSafeArea']) ?? '',
        use: [],
        avoid: strList(brief['avoid']),
        category_signal: firstText(brief['categorySignal']) ?? '',
        palette_roles: palette.filter(isRec),
        typography: rec(brief['typography']),
        back_cover: brief['backCover'] ?? null,
        spine_text: brief['spineText'] ?? null,
      },
      concepts: outConcepts,
    };
  }

  private async marketing(run: StageRun, v: Rec): Promise<unknown> {
    const plan = marketingPlan(v);
    const out: Rec = { tiktok: [], instagram: [], email: null };
    let first = true;
    for (const step of plan) {
      const r = await run.call(step.task, step.input, { primary: first, pinVersion: first });
      first = false;
      const o = rec(r.output);
      if (step.task === 'marketing.tiktok-scripts') {
        out['tiktok'] = list(o['scripts'])
          .filter(isRec)
          .map((s) => {
            const beats = list(s['beats']).filter(isRec);
            return {
              hook: firstText(...strList(s['hooks']), s['title']),
              beats: beats.map((b) => `${plain(b['second'])}: ${plain(b['say'])}`.replace(/^: /, '')),
              on_screen: [text(s['onScreenTextHook']), ...beats.map((b) => text(b['show']))].filter((x): x is string => x !== null),
              cta: firstText(s['cta']) ?? '',
              seconds: Math.round(firstNum(step.input['lengthSeconds']) ?? 30),
              hashtags: strList(s['hashtags']),
            };
          });
      } else if (step.task === 'marketing.instagram-captions') {
        out['instagram'] = list(o['captions'])
          .filter(isRec)
          .map((c) => ({
            caption: [text(c['firstLine']), text(c['body'])].filter(Boolean).join('\n\n'),
            hashtags: strList(c['hashtags']),
            cta: firstText(c['cta']) ?? '',
            image_idea: firstText(c['imageIdea']) ?? '',
          }));
      } else {
        out['email'] = {
          subjects: strList(o['subjectLines']),
          preview: firstText(o['previewText']) ?? '',
          body: typeof o['body'] === 'string' ? dropNoneLines(o['body']) : o['body'],
        };
      }
    }
    return out;
  }

  // ----- estimate -----

  async estimate(stage: AiStage, input: AiStageInput, opts: { model?: string } = {}): Promise<AiCostEstimate> {
    const steps = estimatePlan(stage, input);
    let result = this.sumEstimates(steps, opts.model);
    if (result.unknown && (await this.ensureModelList())) result = this.sumEstimates(steps, opts.model);
    return { lowUsd: result.low, highUsd: result.high * (HIGH_ESTIMATE_MARGIN[stage] ?? 1) };
  }

  private sumEstimates(steps: { task: string; input: Rec; times: number }[], model: string | undefined): { low: number; high: number; unknown: boolean } {
    let low = 0;
    let high = 0;
    let unknown = false;
    for (const s of steps) {
      try {
        const est = estimateTask(this.service, s.task, this.prepare(s.task, s.input, undefined), model ? { model } : {});
        if (est.estimateUsd === null) unknown = true;
        low += (est.estimateUsd ?? 0) * s.times;
        high += (est.highUsd ?? est.estimateUsd ?? 0) * s.times;
      } catch {
        // An input the prompt cannot render fails clearly in runStage; the estimate stays at what is known.
        unknown = true;
      }
    }
    return { low, high, unknown };
  }

  /**
   * One picture at the configured resolution (stage cover_image), priced from the model list: the request price when
   * the model has one, else its image output price times the tokens one image uses. Low is the chosen model, high the
   * dearest of it and its fallbacks (a fallback can be used after a failure).
   */
  async estimateImage(opts: { model?: string } = {}): Promise<AiImageEstimate> {
    await this.ensureModelList();
    const registry = this.service.registry;
    const resolved = registry.resolve('cover_image', opts.model ? { model: opts.model } : {});
    const resolution = resolved.image.resolution ?? '1K';
    const priceOf = (slug: string): number | null => imagePriceUsd(registry.pricing(slug), resolution);
    const own = priceOf(resolved.model);
    const all = [own, ...resolved.fallbacks.map(priceOf)].filter((x): x is number => x !== null);
    if (all.length === 0) return { lowUsd: 0, highUsd: 0, model: resolved.model, priced: false };
    const high = Math.max(...all);
    return { lowUsd: own ?? Math.min(...all), highUsd: high, model: resolved.model, priced: true };
  }

  /** Prices come from the OpenRouter model list (cached by the package for 24 hours). */
  private async ensureModelList(): Promise<boolean> {
    if (this.modelsLoadedAt !== null) return false;
    if (Date.now() - this.modelsTriedAt < this.modelListRetryMs) return false;
    this.modelsTriedAt = Date.now();
    try {
      await this.service.listModels();
      this.modelsLoadedAt = Date.now();
      return true;
    } catch {
      return false;
    }
  }

  /** OpenRouter's GET /key result (valid false for a rejected key). The key itself never leaves the package. */
  keyStatus(signal?: AbortSignal): Promise<VolumeAiKeyStatus> {
    return this.service.keyStatus(signal);
  }

  /** Credit on the key from OpenRouter's key status. Null for the mock provider or a rejected key. */
  async credit(signal?: AbortSignal): Promise<AiCredit | null> {
    if (this.provider !== 'openrouter') return null;
    const k = await this.service.keyStatus(signal);
    if (!k.valid) return null;
    return { limitRemainingUsd: k.limitRemainingUsd, limitUsd: k.limitUsd, usageUsd: k.usageUsd, isFreeTier: k.isFreeTier };
  }

  // ----- images -----

  async generateImage(prompt: string, opts: GenerateImageOptions = {}): Promise<AiImageResult> {
    if (opts.signal?.aborted) throw abortError();
    // One image per call: only the first is used, so asking for more would pay for images that are thrown away.
    const o: VolumeAiImageOptions = { n: 1 };
    if (opts.beforeCall) o.beforeCall = opts.beforeCall;
    if (opts.model) o.model = opts.model;
    if (opts.aspectRatio) o.aspectRatio = opts.aspectRatio;
    if (opts.purpose) o.purpose = opts.purpose;
    if (opts.inputReferences?.length) o.inputReferences = opts.inputReferences.map((r) => ({ data: r.data, mediaType: r.mediaType }));
    if (opts.seed !== undefined) o.seed = opts.seed;
    if (opts.signal) o.signal = opts.signal;
    if (opts.scenario && this.provider === 'mock' && isMockScenario(opts.scenario)) o.scenario = opts.scenario;
    let r: VolumeAiImageResult;
    try {
      r = await this.service.generateImage(prompt, o);
    } catch (e) {
      throw mapVolumeAiError(e, { stage: 'cover_image', model: opts.model });
    }
    const img = r.images[0];
    if (!img) throw new JobFailed('The image model returned no image. Try again or pick another image model.', 'invalid_output');
    const data = new Uint8Array(img.data);
    const size = pngSize(data);
    return {
      mime: img.mediaType,
      data,
      width: size?.width ?? null,
      height: size?.height ?? null,
      usage: {
        provider: this.provider,
        model: r.model,
        generationId: null,
        inputTokens: r.usage.promptTokens,
        outputTokens: r.usage.completionTokens,
        costUsd: r.usage.costUsd ?? 0,
        latencyMs: r.latencyMs,
      },
      mock: r.provider === 'mock',
      notes: [...r.notes],
    };
  }
}

// ---------- image prices ----------

/**
 * Output tokens one image uses, by resolution: the largest figure Google gives for the Gemini image models in
 * config/models.defaults.json (gemini-2.5-flash-image 1290 at 1K, gemini-3.1-flash-image 1680 at 2K and 2520 at 4K),
 * https://ai.google.dev/gemini-api/docs/pricing, read 2026-10-17. Used only when a model has no per-request price.
 */
export const IMAGE_OUTPUT_TOKENS: Readonly<Record<string, number>> = { '0.5K': 747, '1K': 1290, '2K': 1680, '4K': 2520 };

/** USD for one image from the model list prices, or null when the list gives none. */
export function imagePriceUsd(p: ModelPricing | undefined, resolution: string): number | null {
  if (!p) return null;
  if (p.perRequest !== null && p.perRequest > 0) return p.perRequest;
  if (p.imageOutputPerMillion !== null && p.imageOutputPerMillion > 0) {
    const tokens = IMAGE_OUTPUT_TOKENS[resolution] ?? IMAGE_OUTPUT_TOKENS['4K'] ?? 2520;
    return (tokens * p.imageOutputPerMillion) / 1_000_000;
  }
  return null;
}

// ---------- per stage input plans (shared by runStage and estimate) ----------

function blueprintInput(v: Rec): Rec {
  const instruction = text(v['instruction']);
  return { ...baseInput(v), direction: v['direction'] ?? (instruction ? { instruction } : null) };
}

function blueprintPartTarget(blueprint: Rec, part: string): string {
  if (part.startsWith('chapter:')) {
    const n = Number(part.split(':')[1]);
    const idx = list(blueprint['chapters']).findIndex((c) => rec(c)['number'] === n);
    return `chapters[${idx >= 0 ? idx : Math.max(0, n - 1)}]`;
  }
  if (part === 'listing') return 'back_blurb, description_draft, categories and keywords (return one object with these four keys)';
  return part;
}

function blueprintPartInput(v: Rec, part: string): Rec {
  return {
    ...baseInput(v),
    blueprint: v['blueprint'] ?? null,
    regenerate: { target: blueprintPartTarget(rec(v['blueprint']), part), instruction: text(v['instruction']) },
  };
}

function writingPlan(v: Rec, promptId: string | undefined): { task: string; input: Rec; field?: string } {
  const section = rec(v['section']);
  const kind = (text(section['kind']) ?? 'chapter').replace(/-/g, '_');
  const base = baseInput(v);
  const instruction = text(v['instruction']);
  const front = FRONT_MATTER[kind];
  // Front and back matter pages are short: their word target (or a small default) drives the cost estimate.
  const pageWords = firstNum(section['wordTarget'], section['word_target']) ?? MATTER_WORDS[kind] ?? 300;
  if (front) return { task: 'writing.front-matter', input: { ...base, sections: [kind], expectedWords: pageWords }, field: front };
  const back = BACK_MATTER[kind];
  if (back) {
    const input: Rec = { ...base, sections: [kind], expectedWords: pageWords };
    if (v['glossaryTerms'] !== undefined) input['glossaryTerms'] = v['glossaryTerms'];
    return { task: 'writing.back-matter', input, field: back };
  }
  if (promptId === 'writing.extend-section') {
    const markdown = typeof v['markdown'] === 'string' ? v['markdown'] : '';
    return {
      task: taskFor('writing.extend-section', v),
      input: { ...base, chapter: chapterInput(section), text: markdown, currentWords: firstNum(v['currentWords']) ?? wordsIn(markdown) },
    };
  }
  // The introduction and conclusion carry their own plan and word target as a chapter entry (v3 prompts).
  if (kind === 'introduction' || kind === 'conclusion') return { task: `writing.${kind}`, input: { ...base, chapter: chapterInput(section, instruction) } };
  const chapter: Rec = { ...base, chapter: chapterInput(section, instruction) };
  if (isRec(v['nextChapter'])) chapter['nextChapter'] = { title: text(v['nextChapter']['title']), summary: text(v['nextChapter']['summary']) };
  if (promptId === 'writing.introduction' || promptId === 'writing.conclusion')
    return { task: promptId, input: { ...base, chapter: chapterInput(section, instruction) } };
  return { task: taskFor('writing.chapter', v), input: chapter };
}

/** The @volume/ai task of each picture-book stage. */
const CHILDREN_TASKS = {
  picture_story: 'children.picture-book-story',
  scene_prompts: 'children.scene-prompts',
  character_reference: 'children.character-reference',
} as const;

/** Input for the picture-book tasks: story settings, the finished story and the scene prompts when there are any. */
function childrenInput(v: Rec): Rec {
  const out: Rec = { ...baseInput(v), story: rec(v['story']) };
  if (v['storyResult'] !== undefined) out['storyResult'] = v['storyResult'];
  if (v['scenePrompts'] !== undefined) out['scenePrompts'] = v['scenePrompts'];
  return out;
}

function summariseInput(v: Rec): Rec {
  return { ...baseInput(v), text: typeof v['markdown'] === 'string' ? v['markdown'] : '', chapter: chapterInput(rec(v['section'])) };
}

function checksInputs(v: Rec): [Rec, Rec] {
  const section = rec(v['section']);
  const markdown = typeof v['markdown'] === 'string' ? v['markdown'] : '';
  const base = baseInput(v);
  return [
    {
      ...base,
      text: markdown,
      section: { id: firstText(section['id']) ?? 'section', title: firstText(section['title']) ?? 'Untitled section' },
      mode: v['mode'] === 'children' ? 'children' : 'standard',
    },
    { ...base, text: markdown, chapter: chapterInput(section) },
  ];
}

interface Selection {
  text: string;
  start: number;
  end: number;
}

function editingPlan(v: Rec, promptId: string | undefined): { task: string; input: Rec; selection?: Selection } {
  const markdown = typeof v['markdown'] === 'string' ? v['markdown'] : '';
  const pass = (firstText(v['pass']) ?? (promptId?.startsWith('editing.') ? promptId.slice('editing.'.length) : null) ?? 'line').toLowerCase();
  const base = baseInput(v);
  if (pass === 'structure' || pass === 'structural')
    return { task: 'editing.structural', input: { ...base, text: markdown, scope: v['scope'] === 'book' ? 'book' : 'chapter' } };
  if (pass === 'voice') return { task: 'editing.voice', input: { ...base, text: markdown } };
  if (pass === 'selection' || pass === 'rewrite' || pass === 'rewrite-selection') {
    const sel = rec(v['selection']);
    const start = firstNum(sel['start']);
    const end = firstNum(sel['end']);
    if (start === null || end === null || end <= start) throw new JobFailed('Select some text before asking for a rewrite.', 'invalid_input');
    const selected = markdown.slice(start, end);
    const instruction = text(v['instruction']);
    return {
      task: 'writing.rewrite-selection',
      input: {
        ...base,
        selection: { text: selected, before: markdown.slice(Math.max(0, start - 800), start), after: markdown.slice(end, end + 800) },
        rewrite: { mode: instruction ? 'custom' : 'rephrase', instruction },
      },
      selection: { text: selected, start, end },
    };
  }
  return { task: 'editing.line-edit-uk', input: { ...base, text: markdown } };
}

/** Where a note's passage goes: after the paragraph holding its position or anchor text, else at the end. */
function insertionPoint(markdown: string, note: Rec): number {
  let p = firstNum(note['position']);
  if (p === null) {
    const anchor = text(note['anchorText']);
    if (anchor) {
      const i = markdown.indexOf(anchor);
      if (i >= 0) p = i + anchor.length;
    }
  }
  if (p === null) return markdown.length;
  const at = Math.min(Math.max(0, Math.round(p)), markdown.length);
  const next = markdown.indexOf('\n\n', at);
  return next === -1 ? markdown.length : next;
}

function weaveInput(v: Rec, section: Rec, markdown: string, n: { note: string; at: number }): Rec {
  return {
    ...baseInput(v),
    note: { text: n.note },
    weave: { before: markdown.slice(Math.max(0, n.at - 2000), n.at), after: markdown.slice(n.at, n.at + 2000) },
    chapter: chapterInput(section),
  };
}

function matterTasks(promptId: string | undefined): string[] {
  const all = STAGE_TASKS.matter_metadata;
  return promptId && all.includes(promptId) ? [promptId] : [...all];
}

function matterInput(v: Rec): Rec {
  const input = baseInput(v);
  if (v['categoriesSeen'] !== undefined) input['categoriesSeen'] = v['categoriesSeen'];
  put(input, 'pageCount', firstNum(v['pageCount']));
  return input;
}

function coverBriefInput(v: Rec): Rec {
  const stored = rec(v['brief']);
  const style = text(v['coverStyleId']);
  const ideas = firstText(v['ownerIdeas'], stored['ownerIdeas']);
  const cover: Rec = {
    ownerIdeas: [ideas, style ? `Cover style: ${style}` : null].filter(Boolean).join('\n') || null,
    shelfNotes: firstText(v['shelfNotes'], stored['shelfNotes']),
    formats: strList(v['formats']).length ? strList(v['formats']) : ['ebook', 'paperback'],
    conceptCount: conceptCountOf(v),
  };
  const input: Rec = { ...baseInput(v), cover };
  put(input, 'pageCount', firstNum(v['pageCount']));
  return input;
}

/** Cover concepts to write and paint: the book setting coverConcepts, 1 to 4, default 3. */
export function conceptCountOf(v: Rec): number {
  const n = firstNum(v['conceptCount'], rec(v['settings'])['coverConcepts']);
  return n === null ? 3 : Math.min(4, Math.max(1, Math.round(n)));
}

function coverImageInput(v: Rec, brief: unknown, concept: unknown, aspectRatio: string): Rec {
  return { book: bookInput(v), brief, concept, cover: { target: 'ebook front cover', aspectRatio } };
}

/** TikTok scripts and Instagram captions when the job names no count (AC12.1, AC12.2; the job sends the template's). */
const MARKETING_COUNT_DEFAULT = 5;

/** The launch email's link line when the book has no link yet: the owner pastes the Amazon link over it. */
export const BOOK_LINK_PLACEHOLDER = '[Amazon link]';
export const LAUNCH_DATE_NOT_SET = 'launch day (the date is not set yet)';
export const KDP_SELECT_NOT_SET = 'not chosen yet';

/** Drops lines that hold only "None" (an empty prompt value the model copied into its answer). */
export function dropNoneLines(s: string): string {
  return s
    .replace(/^[ \t]*None\.?[ \t]*(?:\r?\n|$)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function marketingPlan(v: Rec): { task: string; input: Rec }[] {
  const kinds = Array.isArray(v['kinds']) ? strList(v['kinds']) : ['tiktok_script', 'instagram_caption', 'launch_email'];
  const base = baseInput(v);
  const steps: { task: string; input: Rec }[] = [];
  if (kinds.includes('tiktok_script')) {
    steps.push({
      task: 'marketing.tiktok-scripts',
      input: { ...base, count: firstNum(v['tiktokCount'], v['count']) ?? MARKETING_COUNT_DEFAULT, lengthSeconds: firstNum(v['lengthSeconds']) ?? 30 },
    });
  }
  if (kinds.includes('instagram_caption')) {
    steps.push({ task: 'marketing.instagram-captions', input: { ...base, count: firstNum(v['instagramCount'], v['count']) ?? MARKETING_COUNT_DEFAULT } });
  }
  if (kinds.includes('launch_email')) {
    const kdp = v['kdpSelect'];
    steps.push({
      task: 'marketing.launch-email',
      input: {
        ...base,
        description: firstText(v['description'], v['summary']) ?? '',
        // An empty value renders as "None", which the model copied into the email (live acceptance run, 18 October
        // 2026): unknown launch facts go as plain words, and the link as a placeholder the owner replaces.
        launchDate: firstText(v['launchDate']) ?? LAUNCH_DATE_NOT_SET,
        bookLink: firstText(v['bookLink']) ?? BOOK_LINK_PLACEHOLDER,
        kdpSelect: typeof kdp === 'boolean' ? kdp : KDP_SELECT_NOT_SET,
      },
    });
  }
  return steps;
}

/** The calls a stage will make, for the budget check. Later calls that need earlier answers use placeholders. */
export function estimatePlan(stage: AiStage, input: AiStageInput): { task: string; input: Rec; times: number }[] {
  const v = input.variables;
  switch (stage) {
    case 'research':
      return [{ task: 'research.title-research', input: baseInput(v), times: 1 }];
    case 'titles':
      return [
        ...(isRec(v['direction']) ? [] : [{ task: 'titles.topic-directions', input: baseInput(v), times: 1 }]),
        { task: 'titles.title-options', input: { ...baseInput(v), direction: v['direction'] ?? null }, times: 1 },
      ];
    case 'blueprint':
      return [{ task: taskFor('blueprint.blueprint', v), input: blueprintInput(v), times: 1 }];
    case 'blueprint_part':
      return [{ task: taskFor('blueprint.regenerate-part', v), input: blueprintPartInput(v, text(v['part']) ?? 'summary'), times: 1 }];
    case 'writing': {
      const p = writingPlan(v, input.promptId);
      return [{ task: p.task, input: p.input, times: 1 }];
    }
    case 'summarise':
      return [{ task: 'checks.summarise-and-ledger', input: { ...summariseInput(v), expectedWords: SUMMARY_WORDS }, times: 1 }];
    case 'checks': {
      const [a, b] = checksInputs(v);
      return [
        { task: 'checks.claims', input: { ...a, expectedWords: CHECKS_WORDS }, times: 1 },
        { task: 'checks.consistency', input: { ...b, expectedWords: CHECKS_WORDS }, times: 1 },
      ];
    }
    case 'editing': {
      try {
        const p = editingPlan(v, input.promptId);
        return [{ task: p.task, input: p.input, times: 1 }];
      } catch {
        return [];
      }
    }
    case 'weave': {
      const notes = list(v['notes']).filter(isRec).length;
      const md = typeof v['markdown'] === 'string' ? v['markdown'] : '';
      const task = v['mode'] === 'expand' ? 'writing.expand-note' : 'writing.weave-note';
      return [{ task, input: weaveInput(v, rec(v['section']), md, { note: '', at: md.length }), times: Math.max(1, notes) }];
    }
    case 'matter_metadata':
      return matterTasks(input.promptId).map((task) => ({ task, input: matterInput(v), times: 1 }));
    case 'cover_brief':
      return [
        { task: 'cover.cover-brief', input: coverBriefInput(v), times: 1 },
        { task: 'cover.cover-image', input: coverImageInput(v, null, null, COVER_ASPECT_RATIO), times: conceptCountOf(v) },
      ];
    case 'marketing':
      return marketingPlan(v).map((s) => ({ ...s, times: 1 }));
    case 'picture_story':
    case 'scene_prompts':
    case 'character_reference':
      return [{ task: CHILDREN_TASKS[stage], input: childrenInput(v), times: 1 }];
  }
}

// ---------- resources and source titles ----------

/** A title that is only the page's domain (or empty) says nothing; "sidehustleschool.com" is one. */
export function isDomainTitle(title: string | null, url: string, domain: string | null): boolean {
  if (!title || !title.trim()) return true;
  const t = title
    .trim()
    .toLowerCase()
    .replace(/^www\./, '');
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    host = '';
  }
  return t === host || t === (domain ?? '').toLowerCase().replace(/^www\./, '') || /^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(t);
}

const normUrl = (u: string) =>
  u
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');

/** The citation's own title, or the research notes' title for that page when the citation's is only a domain. */
export function betterTitle(title: string | null, url: string, domain: string | null, notes: Rec[], id: string): string | null {
  if (!isDomainTitle(title, url, domain)) return title;
  const byUrl = notes.find((n) => typeof n['url'] === 'string' && normUrl(n['url']) === normUrl(url));
  const byId = notes.find((n) => n['id'] === id && typeof n['url'] !== 'string');
  const t = firstText(byUrl?.['title'], byId?.['title']);
  return t && !isDomainTitle(t, url, domain) ? t.trim() : title;
}

/** Placeholder text a model can return in a list item ("x", "TBD", "lorem", "n/a"). */
const JUNK_TEXT = /^(?:[\p{L}\p{N}]{1,2}|tbd|tbc|todo|n\/?a|none|lorem.*|placeholder|\.{2,}|-+)$/iu;

/**
 * Resources from the ticked research sources, every one of them in list order: the model's description for a
 * source when it gave a real one, the source title otherwise. Entries for ids not in the list and placeholder
 * text (live run 3 returned "- x: x") are dropped. Null when there are no ticked sources.
 */
export function resourcesMarkdown(items: Rec[], sources: Rec[]): string | null {
  if (sources.length === 0) return null;
  const lines = sources.map((src, i) => {
    const id = firstText(src['id']) ?? `S${i + 1}`;
    const url = plain(src['url']);
    const item = items.find((x) => x['sourceId'] === id);
    const sourceTitle = firstText(src['title']);
    let host = url;
    try {
      host = new URL(url).hostname.replace(/^www\./, '');
    } catch {
      // keep the url as written
    }
    const named = firstText(item?.['name']);
    const name = named && !JUNK_TEXT.test(named.trim()) && !isDomainTitle(named, url, null) ? named.trim() : (sourceTitle ?? host);
    const said = firstText(item?.['description']);
    const description = said && !JUNK_TEXT.test(said.trim()) ? said.trim() : null;
    const label = name.toLowerCase().includes(host.toLowerCase()) ? name : `${name} (${host})`;
    return `- ${label}${description ? `: ${description}` : ''}`;
  });
  return lines.join('\n');
}

// ---------- construction and provider selection ----------

export interface CreateOpenRouterAiOptions {
  apiKey?: string | undefined;
  promptsDir: string;
  configDir: string;
  /** RESOLVE_SOURCE_REDIRECTS from the server's config. Undefined (unset or blank) keeps the package default (off). */
  resolveSourceRedirects?: boolean | undefined;
  /** Tests: a ready-made @volume/ai provider (MockProvider or a fake). */
  provider?: AiProvider | undefined;
  adapter?: OpenRouterAiOptions;
}

export function createOpenRouterAi(opts: CreateOpenRouterAiOptions): Promise<OpenRouterAiAdapter> {
  const serviceOpts: CreateAiServiceOptions = { promptsDir: opts.promptsDir, configDir: opts.configDir };
  if (opts.apiKey) serviceOpts.apiKey = opts.apiKey;
  // Passed explicitly so the server's config (not a stray process variable) decides; undefined keeps the default.
  serviceOpts.resolveSourceRedirects = opts.resolveSourceRedirects ?? false;
  if (opts.provider !== undefined) serviceOpts.provider = opts.provider;
  return Promise.resolve(new OpenRouterAiAdapter(createAiService(serviceOpts), opts.adapter));
}

export interface SelectAiAdapterOptions {
  /** AI_PROVIDER: mock, openrouter, or auto (unset). */
  choice: 'mock' | 'openrouter' | 'auto';
  /** OPENROUTER_API_KEY. Never logged. */
  apiKey: string | undefined;
  promptsDir: string;
  configDir: string;
  /** RESOLVE_SOURCE_REDIRECTS from the server's config (undefined when unset or blank). */
  resolveSourceRedirects?: boolean | undefined;
  /** MOCK_STREAM_DELAY_MS: delay between streamed chunks when the mock is used (demos and UI tests). */
  mockStreamDelayMs?: number | undefined;
  /** MOCK_FAIL_NEXT_WRITING: the writing call the mock fails once (null or undefined: none). */
  mockFailNextWriting?: number | null | undefined;
  /** Receives exactly one line describing the choice. */
  log: (message: string) => void;
  /** Tests: a ready-made @volume/ai provider. */
  provider?: AiProvider | undefined;
  keyCheckTimeoutMs?: number;
}

export interface SelectedAi {
  ai: AiPort;
  provider: 'mock' | 'openrouter';
}

/**
 * AI_PROVIDER=mock always uses the mock. AI_PROVIDER=openrouter needs the key and uses OpenRouter.
 * Unset (auto): OpenRouter only when the key is set and OpenRouter's key status accepts it; otherwise
 * the mock, with one log line saying why.
 */
function mockFrom(o: SelectAiAdapterOptions): MockAiAdapter {
  return new MockAiAdapter({ streamDelayMs: o.mockStreamDelayMs ?? 0, failWritingCall: o.mockFailNextWriting ?? null });
}

export async function selectAiAdapter(o: SelectAiAdapterOptions): Promise<SelectedAi> {
  const apiKey = o.apiKey?.trim() ?? '';
  if (o.choice === 'mock') {
    o.log('AI provider: mock (AI_PROVIDER=mock). No AI calls are made.');
    return { ai: mockFrom(o), provider: 'mock' };
  }
  if (!apiKey) {
    if (o.choice === 'openrouter') throw new ConfigError('AI_PROVIDER=openrouter needs OPENROUTER_API_KEY in .env.');
    o.log('OPENROUTER_API_KEY is not set, so Volume uses the mock AI provider. No AI calls are made.');
    return { ai: mockFrom(o), provider: 'mock' };
  }
  const create: CreateOpenRouterAiOptions = { apiKey, promptsDir: o.promptsDir, configDir: o.configDir, resolveSourceRedirects: o.resolveSourceRedirects };
  if (o.provider !== undefined) create.provider = o.provider;
  const adapter = await createOpenRouterAi(create);
  if (o.choice === 'openrouter') {
    o.log('AI provider: OpenRouter (AI_PROVIDER=openrouter).');
    return { ai: adapter, provider: adapter.provider };
  }
  try {
    const status = await adapter.keyStatus(AbortSignal.timeout(o.keyCheckTimeoutMs ?? 10_000));
    if (status.valid) {
      o.log('AI provider: OpenRouter (the API key was accepted).');
      return { ai: adapter, provider: adapter.provider };
    }
    o.log('OpenRouter did not accept OPENROUTER_API_KEY, so Volume uses the mock AI provider. Check the key in .env.');
  } catch (e) {
    const reason = e instanceof Error ? e.name : 'unknown error';
    o.log(
      `Could not check OPENROUTER_API_KEY with OpenRouter (${reason}), so Volume uses the mock AI provider. Set AI_PROVIDER=openrouter to skip this check.`,
    );
  }
  return { ai: mockFrom(o), provider: 'mock' };
}

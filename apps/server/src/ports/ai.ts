import { z } from 'zod';
import type { OpenString } from '../lib/util.js';

/**
 * AiPort: the only way job handlers reach a model. The server ships a mock
 * adapter (src/adapters/mock-ai.ts); the lead swaps in @volume/ai later by
 * writing an adapter that implements this interface. Outputs are validated by
 * the server with the zod schemas below, whichever adapter produced them.
 */

export const AI_STAGES = [
  'research',
  'titles',
  'blueprint',
  'blueprint_part',
  'writing',
  'summarise',
  'checks',
  'editing',
  'weave',
  'matter_metadata',
  'cover_brief',
  'marketing',
  // Picture books (phase 7, D-044, D-045): the story, the scene prompts and one reference prompt per main character.
  'picture_story',
  'scene_prompts',
  'character_reference',
  // Fix options for one sentence on the claims-to-verify report (editing.claim-fix, editing model).
  'claim_fix',
] as const;
export type AiStage = (typeof AI_STAGES)[number];

// ---------- stage output schemas (the server's contract) ----------

export const ResearchOutputSchema = z.object({
  audience: z.object({ who: z.string(), situation: z.string().default(''), level: z.string().default('') }),
  problems: z.array(z.string()).default([]),
  angles: z.array(z.object({ angle: z.string(), why: z.string().default('') })).default([]),
  competing_themes: z.array(z.string()).default([]),
  gaps: z.array(z.string()).default([]),
  keyword_ideas: z.array(z.string()).default([]),
  notes: z.string().default(''),
});

export const TitlesOutputSchema = z.object({
  directions: z.array(
    z.object({ key: z.string(), label: z.string(), angle: z.string().default(''), audience: z.string().default(''), promise: z.string().default('') }),
  ),
  options: z.array(z.object({ title: z.string(), subtitle: z.string().default(''), direction_key: z.string().default('') })),
});

/** Exercise kinds of the workbook template (same list as @volume/core EXERCISE_KINDS and config/book-templates/workbook.json). */
export const EXERCISE_KINDS = ['reflection', 'checklist', 'fill-in', 'tracker', 'scenario'] as const;

/** One planned exercise in a workbook chapter (blueprint.blueprint-workbook). */
export const ExercisePlanSchema = z.object({
  kind: z.enum(EXERCISE_KINDS),
  title: z.string(),
  purpose: z.string().default(''),
  lines: z.number().int().nullable().default(null),
});

/** The fiction story bible (D-043), kept in the blueprint data as `storyBible`. No table of its own. */
export const StoryBibleSchema = z.looseObject({
  logline: z.string().default(''),
  themes: z.array(z.string()).default([]),
  characters: z
    .array(
      z.looseObject({
        name: z.string(),
        role: z.string().default(''),
        want: z.string().default(''),
        need: z.string().default(''),
        flaw: z.string().default(''),
        voiceNotes: z.string().default(''),
        appearance: z.string().default(''),
      }),
    )
    .default([]),
  settings: z.array(z.looseObject({ name: z.string(), description: z.string().default('') })).default([]),
  timeline: z.array(z.string()).default([]),
  worldRules: z.array(z.string()).default([]),
  povPlan: z.string().default(''),
  ending: z.string().default(''),
});

export const BlueprintChapterSchema = z.looseObject({
  number: z.number().int(),
  title: z.string(),
  part: z.number().int().nullable().optional(),
  subheadings: z.array(z.string()).default([]),
  summary: z.string().default(''),
  word_target: z.number().int().positive().default(3000),
  key_points: z.array(z.string()).default([]),
  takeaways: z.boolean().default(false),
  bridge_note: z.string().default(''),
  /** Workbook: 2 to 4 planned exercises (blueprint.blueprint-workbook). */
  exercises: z.array(ExercisePlanSchema).optional(),
  /** Fiction: viewpoint character, main setting and scene beats in order (blueprint.blueprint-fiction). */
  povCharacter: z.string().optional(),
  setting: z.string().optional(),
  scenes: z.array(z.string()).optional(),
});

export const BlueprintSchema = z.looseObject({
  title: z.string(),
  subtitle: z.string().default(''),
  summary: z.string().default(''),
  audience: z.string().default(''),
  usps: z.array(z.string()).default([]),
  tone_notes: z.string().default(''),
  hook_style: z.string().default('question'),
  parts: z.array(z.object({ number: z.number().int(), title: z.string() })).default([]),
  chapters: z.array(BlueprintChapterSchema),
  front: z.record(z.string(), z.unknown()).default({}),
  back: z.record(z.string(), z.unknown()).default({}),
  back_blurb: z.string().default(''),
  description_draft: z.string().default(''),
  categories: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  /** Fiction only (D-043). */
  storyBible: StoryBibleSchema.optional(),
});
export type Blueprint = z.infer<typeof BlueprintSchema>;

export const BLUEPRINT_PARTS = ['summary', 'chapters', 'front', 'back', 'listing'] as const;
export const BlueprintPartKeySchema = z.union([z.enum(BLUEPRINT_PARTS), z.string().regex(/^chapter:\d+$/)]);

export const BlueprintPartOutputSchema = z.object({
  part: BlueprintPartKeySchema,
  /** For 'summary': {summary}; 'chapters': {chapters}; 'chapter:n': one chapter; 'front' / 'back': the object; 'listing': {back_blurb, description_draft, categories, keywords}. */
  data: z.unknown(),
});

export const WritingOutputSchema = z.object({ markdown: z.string().min(1) });

/**
 * Story ledger kinds. No CHECK constraint exists on story_ledger.kind, so the list is enforced here (plan PHASES-6-8,
 * P6-4). character and setting are fiction entries (D-043); person, place, anecdote and promise are older names.
 */
export const LEDGER_KINDS = [
  'story',
  'example',
  'metaphor',
  'quote',
  'phrase',
  'warning',
  'fact',
  'name',
  'term',
  'character',
  'setting',
  'person',
  'place',
  'anecdote',
  'promise',
] as const;

export const SummariseOutputSchema = z.object({
  summary: z.string(),
  ledger: z.array(z.object({ kind: z.enum(LEDGER_KINDS), key: z.string(), detail: z.string().default('') })).default([]),
});

/** personal: about the author, not in the profile (preflight warns). regulatory: a named firm or person given a regulatory or safety status (preflight blocks until verified). */
export const CLAIM_CATEGORIES = ['medical', 'clinical', 'legal', 'safety', 'statistical', 'financial', 'other_fact', 'personal', 'regulatory'] as const;

export const ChecksOutputSchema = z.object({
  claims: z
    .array(
      z.object({
        sentence: z.string(),
        category: z.enum(CLAIM_CATEGORIES),
        check_needed: z.string().default(''),
        start: z.number().int().nullable().default(null),
        end: z.number().int().nullable().default(null),
        /** A softer wording of the sentence, when the checks stage offers one. */
        softer: z.string().nullable().default(null),
        /** The checker's risk rating and whether the claim would do harm if wrong (claim tiers); null when not given. */
        risk: z.enum(['low', 'medium', 'high']).nullable().default(null),
        harmIfWrong: z.boolean().nullable().default(null),
      }),
    )
    .default([]),
  consistency: z.array(z.object({ issue: z.string(), chapters: z.array(z.number()).default([]), excerpt: z.string().default('') })).default([]),
});

export const EditingOutputSchema = z.object({
  suggestions: z.array(
    z.object({
      original: z.string(),
      proposed: z.string(),
      reason: z.string().default(''),
      start: z.number().int().nullable().default(null),
      end: z.number().int().nullable().default(null),
    }),
  ),
});

/** How a claim fix changes the sentence (editing.claim-fix). */
export const CLAIM_FIX_APPROACHES = ['soften', 'generalise', 'attribute', 'reframe', 'remove'] as const;
export type ClaimFixApproach = (typeof CLAIM_FIX_APPROACHES)[number];

export const ClaimFixOutputSchema = z.object({
  options: z.array(z.object({ text: z.string(), approach: z.enum(CLAIM_FIX_APPROACHES), rationale: z.string().default(''), needsSource: z.boolean() })),
});

export const WeaveOutputSchema = z.object({
  markdown: z.string().min(1),
  /** Ids of the notes the model actually used. */
  woven_note_ids: z.array(z.string()).default([]),
});

export const MatterOutputSchema = z.looseObject({
  dedication: z.string().default(''),
  acknowledgements: z.string().default(''),
  review_request: z.string().default(''),
  newsletter_line: z.string().default(''),
  back_blurb: z.string().default(''),
  description_html: z.string().default(''),
  keywords: z.array(z.string()).default([]),
  categories: z.array(z.string()).default([]),
});

export const CoverBriefOutputSchema = z.object({
  brief: z.looseObject({
    mood: z.string().default(''),
    audience: z.string().default(''),
    palette: z.array(z.string()).default([]),
    composition: z.string().default(''),
    use: z.array(z.string()).default([]),
    avoid: z.array(z.string()).default([]),
  }),
  concepts: z.array(z.object({ name: z.string(), image_prompt: z.string(), why: z.string().default('') })).min(1),
});

export const MarketingOutputSchema = z.object({
  tiktok: z
    .array(
      z.object({
        hook: z.string(),
        beats: z.array(z.string()).default([]),
        on_screen: z.array(z.string()).default([]),
        cta: z.string().default(''),
        seconds: z.number().int().default(30),
        hashtags: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  instagram: z
    .array(z.object({ caption: z.string(), hashtags: z.array(z.string()).default([]), cta: z.string().default(''), image_idea: z.string().default('') }))
    .default([]),
  email: z
    .object({ subjects: z.array(z.string()).default([]), preview: z.string().default(''), body: z.string() })
    .nullable()
    .default(null),
});

/** children.picture-book-story, checked loosely: the AI layer validates the full shape. */
export const PictureStoryOutputSchema = z.looseObject({
  title: z.string(),
  characters: z.array(z.looseObject({ name: z.string() })).default([]),
  spreads: z.array(z.looseObject({ n: z.number().int(), text: z.string(), sceneSummary: z.string().default('') })),
  safetyCheck: z.object({ passed: z.boolean(), notes: z.array(z.string()).default([]) }),
});

export const ScenePromptsOutputSchema = z.looseObject({
  characterSheets: z.array(z.object({ name: z.string(), prompt: z.string() })).default([]),
  styleLine: z.string().default(''),
  scenes: z.array(
    z.looseObject({
      spread: z.number().int(),
      imagePrompt: z.string(),
      layout: z.enum(['text-left', 'text-right', 'text-top', 'text-bottom']),
      characters: z.array(z.string()).default([]),
    }),
  ),
  cover: z.looseObject({ imagePrompt: z.string() }).optional(),
});

export const CharacterReferenceOutputSchema = z.object({
  references: z.array(z.object({ name: z.string(), imagePrompt: z.string() })),
});

export interface AiStageOutputMap {
  research: z.infer<typeof ResearchOutputSchema>;
  titles: z.infer<typeof TitlesOutputSchema>;
  blueprint: z.infer<typeof BlueprintSchema>;
  blueprint_part: z.infer<typeof BlueprintPartOutputSchema>;
  writing: z.infer<typeof WritingOutputSchema>;
  summarise: z.infer<typeof SummariseOutputSchema>;
  checks: z.infer<typeof ChecksOutputSchema>;
  editing: z.infer<typeof EditingOutputSchema>;
  weave: z.infer<typeof WeaveOutputSchema>;
  matter_metadata: z.infer<typeof MatterOutputSchema>;
  cover_brief: z.infer<typeof CoverBriefOutputSchema>;
  marketing: z.infer<typeof MarketingOutputSchema>;
  picture_story: z.infer<typeof PictureStoryOutputSchema>;
  scene_prompts: z.infer<typeof ScenePromptsOutputSchema>;
  character_reference: z.infer<typeof CharacterReferenceOutputSchema>;
  claim_fix: z.infer<typeof ClaimFixOutputSchema>;
}

export const AI_OUTPUT_SCHEMAS: { [S in AiStage]: z.ZodType<AiStageOutputMap[S]> } = {
  research: ResearchOutputSchema,
  titles: TitlesOutputSchema,
  blueprint: BlueprintSchema,
  blueprint_part: BlueprintPartOutputSchema,
  writing: WritingOutputSchema,
  summarise: SummariseOutputSchema,
  checks: ChecksOutputSchema,
  editing: EditingOutputSchema,
  weave: WeaveOutputSchema,
  matter_metadata: MatterOutputSchema,
  cover_brief: CoverBriefOutputSchema,
  marketing: MarketingOutputSchema,
  picture_story: PictureStoryOutputSchema,
  scene_prompts: ScenePromptsOutputSchema,
  character_reference: CharacterReferenceOutputSchema,
  claim_fix: ClaimFixOutputSchema,
};

// ---------- port types ----------

/** What the stage needs. `variables` are named prompt inputs; the adapter packs context. */
export interface AiStageInput {
  /** Prompt id such as 'writing.chapter'. Adapters pick the default for the stage when omitted. */
  promptId?: string;
  /** Pin a prompt version; latest when omitted. */
  promptVersion?: number;
  /** Named inputs for the prompt template (book, chapter plan, profile summary, notes, and so on). */
  variables: Record<string, unknown>;
  /** Book and workspace the run belongs to (for logging and budgets only). */
  projectId?: string | null;
}

export interface RunStageOptions {
  /** Paid cost so far in this stage and the next request estimate. */
  beforeCall?: (spentUsd: number, estimateUsd: number | null) => Promise<void>;
  /** OpenRouter model slug; the adapter's stage default when omitted. */
  model?: string;
  signal?: AbortSignal;
  /** Streamed text deltas (writing and weave stages). */
  onDelta?: (text: string) => void;
  maxTokens?: number;
  temperature?: number;
  /** Mock adapter only: fault injection scenario name. */
  scenario?: string;
}

export interface AiUsage {
  provider: 'mock' | 'openrouter';
  /** The model that actually answered. */
  model: string;
  generationId: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  latencyMs: number;
}

/** A web source from url_citation annotations (research only). */
export interface AiSource {
  url: string;
  title: string | null;
  excerpt: string | null;
  startIndex: number | null;
  endIndex: number | null;
  /** Host of `url` without "www.". Null while a redirect link is unresolved. Worked out from the URL when left out. */
  domain?: string | null;
  /** The search grounding redirect link `url` was resolved from. */
  redirectUrl?: string | null;
  /** True when `url` is still a grounding redirect that could not be resolved. */
  unresolved?: boolean;
}

/** One guardrail hit (from @volume/ai GuardrailHit). */
export interface AiGuardrailHit {
  rule: string;
  severity: string;
  message: string;
  match: string;
  /** JSON path of the string ('' for a plain text answer). */
  path?: string;
  /** For banned-phrase hits: the listed phrase that matched. */
  phrase?: string;
}

/** One rule that hit, so the UI can name it without walking every list. */
export interface AiGuardrailRule {
  rule: string;
  list: 'blocking' | 'needsAttention' | 'claims' | 'autofix' | 'warnings' | OpenString;
  count: number;
  message: string;
  matches: string[];
}

/** The guardrail report of one stage, stored on prompt_runs.guardrails. */
export interface AiGuardrails {
  /** True when nothing blocking and nothing needing attention was found. */
  passed: boolean;
  blocking: AiGuardrailHit[];
  /** Banned phrases left after the one automatic style rewrite: shown as "needs attention". */
  needsAttention: AiGuardrailHit[];
  rules: AiGuardrailRule[];
  styleRewrite: { phrases: string[]; applied: boolean; cleared: boolean; note: string } | null;
}

export interface AiStageResult<S extends AiStage = AiStage> {
  stage: S;
  output: AiStageOutputMap[S];
  /** Raw text returned by the model (kept in prompt_runs.output for audit). */
  rawText: string;
  usage: AiUsage;
  prompt: { id: string; version: number; hash: string };
  sources: AiSource[];
  /** True for the deterministic mock adapter. */
  mock: boolean;
  /** The stage's guardrail report, when the adapter ran guardrails. Stored on prompt_runs.guardrails. */
  guardrails?: AiGuardrails | null;
}

export interface GenerateImageOptions {
  beforeCall?: (spentUsd: number, estimateUsd: number | null) => Promise<void>;
  model?: string;
  /** For example '5:8' or '2:3'. Left out: the purpose picks it from config/models.defaults.json. */
  aspectRatio?: string;
  /** What the image is for (default 'cover'). */
  purpose?: 'cover' | 'spread' | 'character-reference';
  /** Reference images (character references on every spread, D-045). Sent only to models that take image input. */
  inputReferences?: { data: Uint8Array; mediaType: string }[];
  /** Fixed seed (0 to 2147483647), sent only when the model supports it. */
  seed?: number;
  signal?: AbortSignal;
  scenario?: string;
}

export interface AiImageResult {
  mime: string;
  data: Uint8Array;
  width: number | null;
  height: number | null;
  usage: AiUsage;
  mock: boolean;
  /** Why a reference or seed was left out (from the AI layer), for the job log. Empty when nothing was left out. */
  notes?: string[];
}

export interface AiCostEstimate {
  lowUsd: number;
  highUsd: number;
}

/** What one picture would cost before it is made (picture-book estimates). */
export interface AiImageEstimate extends AiCostEstimate {
  /** The image model the estimate priced (the chosen one; the high end covers its fallbacks). */
  model: string | null;
  /** False when the model list gave no price for any of the models: the caller falls back to its budget reservation. */
  priced: boolean;
}

export interface AiPort {
  readonly provider: 'mock' | 'openrouter';
  /** Anthropic key in use, and when it last said the balance was empty. Optional for test doubles. */
  anthropicStatus?(): { configured: boolean; outOfFundsAt: number | null };
  /**
   * Runs one stage. A stage that makes several calls and fails part way attaches what it already
   * spent to the thrown error (attachPartialUsage); the runner records it with partialUsageOf.
   */
  runStage<S extends AiStage>(stage: S, input: AiStageInput, opts?: RunStageOptions): Promise<AiStageResult<S>>;
  generateImage(prompt: string, opts?: GenerateImageOptions): Promise<AiImageResult>;
  /** Cost estimate before a call, for budget checks. */
  estimate(stage: AiStage, input: AiStageInput, opts?: { model?: string }): Promise<AiCostEstimate>;
  /** Cost of one picture from the model list prices (chosen model low, dearest fallback high). Optional for test doubles. */
  estimateImage?(opts?: { model?: string }): Promise<AiImageEstimate>;
  /** OpenRouter credit left on the key (USD), or null when unknown or not offered. Never the key itself. */
  credit?(signal?: AbortSignal): Promise<AiCredit | null>;
}

/** What GET /settings shows about OpenRouter credit (from OpenRouter's key status). */
export interface AiCredit {
  /** USD left before the key's limit; null when the key has no limit. */
  limitRemainingUsd: number | null;
  limitUsd: number | null;
  usageUsd: number | null;
  isFreeTier: boolean | null;
}

/** What a failed stage had already spent, carried on the thrown error. The happy path is unchanged. */
export interface AiPartialUsage {
  usage: AiUsage;
  prompt: { id: string; version: number; hash: string } | null;
}

const PARTIAL_USAGE = Symbol.for('volume.ai.partialUsage');

/** Attaches spend so far to an error a stage throws (first attachment wins). Non-objects are left alone. */
export function attachPartialUsage(err: unknown, partial: AiPartialUsage): void {
  if (typeof err !== 'object' || err === null || PARTIAL_USAGE in err) return;
  Object.defineProperty(err, PARTIAL_USAGE, { value: partial, enumerable: false });
}

/** The spend a failed stage attached, or null. */
export function partialUsageOf(err: unknown): AiPartialUsage | null {
  if (typeof err !== 'object' || err === null || !(PARTIAL_USAGE in err)) return null;
  return (err as { [PARTIAL_USAGE]: AiPartialUsage })[PARTIAL_USAGE];
}

/** Thrown by adapters for errors worth retrying (network, 5xx, 408, 429). */
export class AiRetryableError extends Error {
  override name = 'AiRetryableError';
  constructor(
    message: string,
    readonly retryAfterMs: number | null = null,
  ) {
    super(message);
  }
}

/** Thrown when the chosen model is gone (404) or unavailable. Never retried silently with another model. */
export class AiModelUnavailableError extends Error {
  override name = 'AiModelUnavailableError';
  /** The stage whose model failed, and the next fallback the owner can switch to (null when none is listed). */
  readonly stage: string | null;
  readonly nextFallback: string | null;
  constructor(
    message: string,
    readonly model: string,
    extra: { stage?: string | null; nextFallback?: string | null } = {},
  ) {
    super(message);
    this.stage = extra.stage ?? null;
    this.nextFallback = extra.nextFallback ?? null;
  }
}

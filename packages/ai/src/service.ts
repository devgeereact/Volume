// createAiService: the one entry point the server calls. It wires the provider (OpenRouter or mock),
// the model registry, the prompt loader, the context packer, structured output, guardrails and cost
// accounting into runStage() and generateImage().

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { z } from 'zod';
import { loadConfig, type ConfigBundle, type ModelsDefaults } from './config.ts';
import { assignSourceIds, formatProfileFacts, packAndRender } from './context.ts';
import { AbortedError, AiError, BadRequestError, BudgetError, ModelUnavailableError, OutputTruncatedError, StreamCutError } from './errors.ts';
import {
  authorAnecdoteApplies,
  describeOpeners,
  emptyReport,
  finaliseReport,
  formatPatternHits,
  runGuardrails,
  scaffoldingOpeners,
  type GuardrailContext,
  type GuardrailHit,
  type GuardrailReport,
} from './guardrails.ts';
import { assertSeed, modelTakesReferences, modelTakesSeed, toImageReference, type ImagePurpose, type ImageReferenceInput } from './images.ts';
import { MockProvider, mockModelInfo, type MockProviderOptions } from './provider/mock.ts';
import { OpenRouterClient, providerSlug } from './provider/openrouter.ts';
import type { RetryOptions } from './provider/retry.ts';
import { PromptLoader } from './prompts.ts';
import { ModelRegistry, type ModelOverrides, type ResolvedStage } from './registry.ts';
import { parseBooleanSetting, resolveSources, RESOLVE_SOURCE_REDIRECTS_SETTING } from './sources.ts';
import { chatStructured, responseFormatFor, validateJson } from './structured.ts';
import type { SourceInput } from './stages/inputs.ts';
import { TASKS, isTaskId, type TaskId, type TaskInput, type TaskOutput } from './stages/tasks.ts';
import {
  addUsage,
  emptyUsage,
  type AiProvider,
  type ChatRequest,
  type ChatResult,
  type GeneratedImage,
  type KeyStatus,
  type MockScenario,
  type ModelInfo,
  type ModelPricing,
  type Source,
  type Usage,
  type WebSearchOptions,
} from './types.ts';
import { asObject, asString, sha256, stableStringify, wordCount } from './util.ts';

export interface CreateAiServiceOptions {
  /** OPENROUTER_API_KEY, read by the server from its environment. Leave empty to get the mock provider. */
  apiKey?: string | undefined;
  /** Parsed config/models.defaults.json. Loaded from configDir when left out. */
  defaults?: ModelsDefaults | undefined;
  /** The owner's model choices (model_choices rows): workspace, profile, book. */
  overrides?: ModelOverrides | undefined;
  /** Absolute path to prompts/. */
  promptsDir: string;
  /** Absolute path to config/ (models.defaults.json, house-style.json, kdp-rules/). */
  configDir: string;
  /** true or options: use the mock provider even when a key is given. */
  mock?: boolean | MockProviderOptions | undefined;
  /** Pin a KDP rules file, for example '2026-10-03'. Default: the newest. */
  kdpRulesVersion?: string | undefined;
  /** Attribution headers. */
  appUrl?: string | undefined;
  appTitle?: string | undefined;
  baseUrl?: string | undefined;
  timeoutMs?: number | undefined;
  idleTimeoutMs?: number | undefined;
  retry?: RetryOptions | undefined;
  /** Model list cache lifetime (default 24 hours). */
  modelsTtlMs?: number | undefined;
  /** Custom fetch, for tests. */
  fetch?: typeof fetch | undefined;
  /**
   * fetch used only to read the Location header of search grounding redirect links (allow-listed hosts in
   * sources.ts). Default: global fetch. Tests stub it.
   */
  sourceFetch?: typeof fetch | undefined;
  /** Timeout for each redirect lookup in ms (default 5 s). */
  sourceTimeoutMs?: number | undefined;
  /**
   * Look up search grounding redirect links (default false). When left out, the setting
   * RESOLVE_SOURCE_REDIRECTS (true or false; blank counts as unset) is read from the environment. When
   * off, no lookup is sent: redirect links are kept and marked unresolved.
   */
  resolveSourceRedirects?: boolean | undefined;
  /** A ready-made provider (tests). Overrides apiKey and mock. */
  provider?: AiProvider | undefined;
}

export interface BudgetLimit {
  /** USD left before the book, job or monthly cap is reached. A call whose estimate passes it is not sent. */
  remainingUsd: number;
}

export interface RunStageOptions {
  /** Called before every provider request, including repairs and retries. */
  beforeCall?: ((spentUsd: number, estimateUsd: number | null) => Promise<void>) | undefined;
  signal?: AbortSignal | undefined;
  /** Stream the answer; each text fragment arrives here. */
  onDelta?: ((text: string) => void) | undefined;
  /**
   * Called when the text streamed so far must be discarded: a cut stream that restarts, or an automatic
   * style rewrite whose answer replaces the first one (the rewritten text then arrives in one onDelta call).
   */
  onReset?: (() => void) | undefined;
  /** Per-call model choices, layered on top of the service overrides. */
  overrides?: ModelOverrides | undefined;
  /** An explicit model for this call (the owner picked it, for example after a fallback offer). */
  model?: string | undefined;
  /** The owner has agreed to use the next available fallback if the model is unavailable. Default false. */
  allowFallback?: boolean | undefined;
  /** Pin a prompt version (books pin versions). */
  promptVersion?: number | undefined;
  budget?: BudgetLimit | undefined;
  /** Expected output tokens for the estimate (default: word target x 1.4, else a quarter of max tokens). */
  expectedOutputTokens?: number | undefined;
  timeoutMs?: number | undefined;
  /** Mock provider fault scenario. Ignored by OpenRouter. */
  scenario?: MockScenario | undefined;
}

export interface CallRecord {
  model: string;
  usage: Usage;
  latencyMs: number;
  generationId: string | null;
  finishReason: string | null;
  provider: 'openrouter' | 'mock';
}

export interface CostEstimate {
  model: string;
  inputTokens: number;
  expectedOutputTokens: number;
  /** Null when the model's prices are unknown (call listModels first). */
  estimateUsd: number | null;
  /**
   * The high end: the full output allowance (max tokens, or the stage's observed worst case, which covers
   * reasoning tokens) plus the web searches a search stage may run.
   */
  highUsd: number | null;
}

export interface StageResult<T> {
  task: TaskId;
  output: T;
  /** The model's raw text for the answer that was kept (the style rewrite's when it was applied). */
  raw: string;
  usage: Usage;
  calls: CallRecord[];
  /** The model that answered, as reported by OpenRouter. */
  model: string;
  /** The model the call was sent to (an alias such as ~anthropic/claude-sonnet-latest). */
  sentModel: string;
  /** The model the settings chose (differs from sentModel only when a fallback was used). */
  requestedModel: string;
  provider: 'openrouter' | 'mock';
  stage: string;
  promptId: string;
  promptVersion: number;
  promptHash: string;
  fallbackUsed: boolean;
  fallbackFrom: string | undefined;
  repaired: boolean;
  /**
   * Sources from url_citation annotations (web search stages only). Search grounding redirect links are
   * resolved to the real page (domain set, redirectUrl kept) or marked unresolved; duplicates of the same
   * final URL are merged and ids renumbered S1, S2...
   */
  sources: Source[];
  guardrails: GuardrailReport;
  estimate: CostEstimate;
  /** Notes such as trimmed context, a downgraded response format, or no sources from search. */
  notes: string[];
}

export interface GenerateImageOptions {
  beforeCall?: ((spentUsd: number, estimateUsd: number | null) => Promise<void>) | undefined;
  model?: string | undefined;
  overrides?: ModelOverrides | undefined;
  allowFallback?: boolean | undefined;
  n?: number | undefined;
  /**
   * What the image is for (default 'cover'). Picks the aspect ratio from `cover_image.aspectRatios` in
   * config/models.defaults.json; an explicit `aspectRatio` wins.
   */
  purpose?: ImagePurpose | undefined;
  aspectRatio?: string | undefined;
  resolution?: string | undefined;
  outputFormat?: 'png' | 'jpeg' | 'webp' | undefined;
  /**
   * Reference images sent as OpenRouter `input_references`, for example one character reference per main
   * character on every spread (D-045). Left out, with a note, when the model list shows no image input.
   */
  inputReferences?: ImageReferenceInput[] | undefined;
  /** Fixed seed (0 to 2147483647). Sent only when the model lists `seed` in supported_parameters; otherwise a note. */
  seed?: number | undefined;
  signal?: AbortSignal | undefined;
  budget?: BudgetLimit | undefined;
  timeoutMs?: number | undefined;
  scenario?: MockScenario | undefined;
}

export interface GenerateImageResult {
  images: GeneratedImage[];
  usage: Usage;
  model: string;
  requestedModel: string;
  fallbackUsed: boolean;
  fallbackFrom: string | undefined;
  latencyMs: number;
  provider: 'openrouter' | 'mock';
  /** The aspect ratio asked for. */
  aspectRatio: string | undefined;
  /** Reference images sent with the request (0 when none were given or the model takes no image input). */
  referencesSent: number;
  /** True when the seed was sent. */
  seedSent: boolean;
  /** Why a reference or seed was left out, for the job log and the UI. */
  notes: string[];
}

export interface AiService {
  readonly provider: AiProvider;
  readonly registry: ModelRegistry;
  readonly prompts: PromptLoader;
  readonly config: ConfigBundle;
  readonly tasks: readonly TaskId[];
  runStage<T extends TaskId>(task: T, input: TaskInput<T>, opts?: RunStageOptions): Promise<StageResult<TaskOutput<T>>>;
  estimate<T extends TaskId>(task: T, input: TaskInput<T>, opts?: RunStageOptions): CostEstimate;
  generateImage(prompt: string, opts?: GenerateImageOptions): Promise<GenerateImageResult>;
  /** GET /api/v1/models, cached for modelsTtlMs, and fed to the registry for prices and availability. */
  listModels(opts?: { refresh?: boolean | undefined; signal?: AbortSignal | undefined }): Promise<ModelInfo[]>;
  keyStatus(signal?: AbortSignal): Promise<KeyStatus>;
}

const DEFAULT_CONTEXT = 128_000;
export const STYLE_REWRITE_PROMPT_ID = 'system.style-rewrite';

/** Group banned-phrase hits by listed phrase, for the style rewrite prompt and the notes. */
function describeBanned(hits: GuardrailHit[]): { phrases: string[]; text: string } {
  const byPhrase = new Map<string, { forms: Set<string>; count: number; paths: Set<string> }>();
  for (const h of hits) {
    const key = h.phrase ?? h.match;
    const e = byPhrase.get(key) ?? { forms: new Set<string>(), count: 0, paths: new Set<string>() };
    e.forms.add(h.match);
    e.count += 1;
    if (h.path) e.paths.add(h.path);
    byPhrase.set(key, e);
  }
  const lines = [...byPhrase].map(([phrase, e]) => {
    const forms = [...e.forms].map((f) => `"${f}"`).join(', ');
    const where = e.paths.size ? ` in ${[...e.paths].slice(0, 6).join(', ')}` : '';
    return `- "${phrase}": written as ${forms}, ${e.count} ${e.count === 1 ? 'time' : 'times'}${where}`;
  });
  return { phrases: [...byPhrase.keys()], text: lines.join('\n') };
}

/** Heading levels in order, so a Markdown rewrite can be checked for the same structure. */
function headingLevels(markdown: string): string {
  return [...markdown.matchAll(/^(#{1,6})\s+\S/gm)].map((m) => m[1]?.length ?? 0).join(',');
}

function packageFixturesDirs(promptsDir: string): string[] {
  const root = resolve(promptsDir, '..');
  const dirs = [join(root, 'tests', 'fixtures', 'ai'), join(root, 'packages', 'ai', 'test', 'fixtures')];
  return dirs.filter((d) => existsSync(d));
}

function stripMarkdownFence(text: string): string {
  const m = /^\s*```(?:markdown|md)?\s*\n([\s\S]*?)\n```\s*$/i.exec(text);
  return m?.[1] !== undefined ? m[1] : text.trim();
}

export function createAiService(options: CreateAiServiceOptions): AiService {
  const config = loadConfig(options.configDir, { kdpVersion: options.kdpRulesVersion, defaults: options.defaults });
  const registry = new ModelRegistry(config.defaults, options.overrides ?? {});
  const prompts = new PromptLoader(options.promptsDir);
  const modelsTtl = options.modelsTtlMs ?? 24 * 60 * 60 * 1000;
  const resolveSourceRedirects =
    options.resolveSourceRedirects ?? parseBooleanSetting(RESOLVE_SOURCE_REDIRECTS_SETTING, process.env[RESOLVE_SOURCE_REDIRECTS_SETTING]) ?? false;

  let provider: AiProvider;
  if (options.provider) {
    provider = options.provider;
  } else if (options.mock || !options.apiKey) {
    const mockOpts: MockProviderOptions = typeof options.mock === 'object' ? options.mock : {};
    const slugs = [...registry.configuredSlugs().keys()];
    provider = new MockProvider({
      fixturesDirs: packageFixturesDirs(options.promptsDir),
      models: slugs.map((s) => mockModelInfo(s)),
      ...mockOpts,
    });
  } else {
    provider = new OpenRouterClient({
      apiKey: options.apiKey,
      baseUrl: options.baseUrl ?? config.defaults.endpoints?.baseUrl,
      appUrl: options.appUrl ?? config.defaults.headers?.['HTTP-Referer'],
      appTitle: options.appTitle ?? config.defaults.headers?.['X-OpenRouter-Title'],
      timeoutMs: options.timeoutMs,
      idleTimeoutMs: options.idleTimeoutMs,
      retry: options.retry,
      fetch: options.fetch,
      pricingLookup: (slug) => registry.pricing(slug),
    });
  }

  let modelsCache: ModelInfo[] = [];

  async function listModels(opts: { refresh?: boolean | undefined; signal?: AbortSignal | undefined } = {}): Promise<ModelInfo[]> {
    const age = registry.modelListAgeMs();
    if (!opts.refresh && age !== null && age < modelsTtl) return [...modelsCache];
    const models = await provider.listModels(opts.signal);
    modelsCache = models;
    registry.setModels(models);
    return [...models];
  }
  function resolveStage(
    stage: string,
    opts: { overrides?: ModelOverrides | undefined; model?: string | undefined; allowFallback?: boolean | undefined },
  ): ResolvedStage {
    return registry.resolve(stage, {
      overrides: opts.overrides,
      model: opts.model,
      allowFallback: opts.allowFallback,
      isAvailable: registry.hasModelList() ? (slug) => registry.isListed(slug) : undefined,
    });
  }

  /** Words the call is expected to write, when the input says: a chapter target, a rewrite target or expectedWords. */
  function targetWords(input: Record<string, unknown>): number | null {
    const chapter = asObject(input['chapter']);
    const rewrite = asObject(input['rewrite']);
    for (const t of [chapter?.['wordTarget'], rewrite?.['targetWords'], input['expectedWords']]) {
      if (typeof t === 'number' && Number.isFinite(t) && t > 0) return t;
    }
    return null;
  }

  function expectedOutput(input: Record<string, unknown>, resolved: ResolvedStage, opts: RunStageOptions): number {
    if (opts.expectedOutputTokens !== undefined) return opts.expectedOutputTokens;
    const target = targetWords(input);
    // Reasoning models think before they write, so the text alone understates the output tokens.
    const reasoningShare = resolved.expectedOutputTokens !== null ? 1 : 1.5;
    if (target !== null) return Math.ceil(target * 1.4 * reasoningShare);
    if (resolved.expectedOutputTokens !== null) return resolved.expectedOutputTokens;
    return Math.ceil(((resolved.maxTokens ?? 4000) / 4) * reasoningShare);
  }

  /**
   * Output tokens for the high estimate. With a word target (a section, a rewrite, a front matter page) the high end
   * is twice the expected output, which covers a long answer plus heavy reasoning, capped at max tokens (the hard
   * ceiling on the call itself). Without one it is the stage's full allowance, as before (research, blueprint).
   */
  function highOutput(input: Record<string, unknown>, resolved: ResolvedStage, expected: number, opts: RunStageOptions): number | null {
    if (opts.expectedOutputTokens === undefined && targetWords(input) !== null) {
      const ceiling = resolved.maxTokens ?? Number.POSITIVE_INFINITY;
      return Math.min(ceiling, expected * 2);
    }
    return resolved.highOutputTokens;
  }

  /** USD for the web search of one call: the engine's own price when it is not native, else the model's. */
  function webSearchCost(p: ModelPricing | undefined, web: WebSearchOptions | undefined, searches: number): number {
    if (!web) return 0;
    const engine = web.engine ?? 'native';
    const enginePrice = config.defaults.webSearch?.enginePricePerCall?.[engine];
    const per = engine !== 'native' && enginePrice !== undefined ? enginePrice : (p?.webSearchPerRequest ?? enginePrice ?? 0);
    return per * searches;
  }

  function costEstimate(
    model: string,
    inputTokens: number,
    outputTokens: number,
    highOutputTokens: number | null,
    web: WebSearchOptions | undefined,
  ): CostEstimate {
    const p = registry.pricing(model);
    let estimateUsd: number | null = null;
    let highUsd: number | null = null;
    if (p && p.inputPerMillion !== null && p.outputPerMillion !== null) {
      const input = (inputTokens * p.inputPerMillion) / 1_000_000;
      const fixed = p.perRequest ?? 0;
      estimateUsd = input + (outputTokens * p.outputPerMillion) / 1_000_000 + webSearchCost(p, web, 1) + fixed;
      const highOut = Math.max(highOutputTokens ?? 0, outputTokens);
      const searches = config.defaults.webSearch?.highSearchesPerCall ?? 1;
      highUsd = input + (highOut * p.outputPerMillion) / 1_000_000 + webSearchCost(p, web, Math.max(1, searches)) + fixed;
      if (highUsd < estimateUsd * 1.5) highUsd = estimateUsd * 1.5;
    }
    return { model, inputTokens, expectedOutputTokens: outputTokens, estimateUsd, highUsd };
  }

  interface Prepared {
    def: (typeof TASKS)[TaskId];
    input: Record<string, unknown>;
    resolved: ResolvedStage;
    packed: ReturnType<typeof packAndRender>;
    estimate: CostEstimate;
    inputHash: string;
  }

  function prepare(task: TaskId, rawInput: unknown, opts: RunStageOptions): Prepared {
    if (!isTaskId(task)) throw new BadRequestError(`Unknown task ${String(task)}`);
    const def = TASKS[task];
    const parsed = def.input.safeParse(rawInput);
    if (!parsed.success) {
      throw new BadRequestError(`Input for ${task} is not valid: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
    }
    const input = parsed.data as Record<string, unknown>;
    const file = prompts.load(def.promptId, opts.promptVersion);
    const resolved = resolveStage(file.meta.stage, opts);
    const info = registry.modelInfo(resolved.model);
    const contextLength = info?.contextLength ?? DEFAULT_CONTEXT;
    const extraValues: Record<string, unknown> = {};
    if (task === 'checks.claims' && input['patternHits'] === undefined) {
      extraValues['patternHits'] = formatPatternHits(asString(input['text']) ?? '', config.houseStyle, guardrailContext(input));
    }
    const packed = packAndRender(prompts, def.promptId, input, config, {
      limitTokens: Math.floor(contextLength * 0.6),
      version: opts.promptVersion,
      extraValues,
    });
    const expected = expectedOutput(input, resolved, opts);
    const estimate = costEstimate(resolved.model, packed.estimatedTokens, expected, highOutput(input, resolved, expected, opts), resolved.webSearch);
    return { def, input, resolved, packed, estimate, inputHash: sha256(stableStringify(input)).slice(0, 12) };
  }

  function guardrailContext(input: Record<string, unknown>): GuardrailContext {
    const profile = asObject(input['profile']) ?? {};
    const book = asObject(input['book']) ?? {};
    const links = profile['links'];
    const allowedUrls = [
      ...(Array.isArray(links) ? links.map(String) : typeof links === 'string' ? links.split(/\s+/) : []),
      ...(typeof input['bookLink'] === 'string' ? [input['bookLink']] : []),
    ];
    const extraBanned = Array.isArray(profile['bannedPhrases']) ? profile['bannedPhrases'].map(String) : [];
    // The author-anecdote check needs the facts the text may state: the profile facts block and the owner's brief.
    const brief = [book['idea'], book['authorBrief'], book['notes'], book['brief']].filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    // Poetry, memoir and biography (and stories) are exempt by template or book type: no facts, no check.
    const anecdotes = authorAnecdoteApplies({ template: book['template'], type: book['type'] });
    const authorFacts = anecdotes && asObject(input['profile']) ? [formatProfileFacts(profile) ?? '', ...brief].join('\n') : undefined;
    return {
      sources: input['sources'] !== undefined ? assignSourceIds(input['sources'] as SourceInput[] | null) : undefined,
      allowedUrls,
      allowedIsbns: Array.isArray(book['isbns']) ? book['isbns'].map(String) : [],
      bannedPhrases: [...config.houseStyle.bannedPhrases, ...extraBanned],
      authorFacts,
    };
  }

  function checkBudget(budget: BudgetLimit | undefined, spent: number, estimateUsd: number | null): void {
    if (!budget) return;
    const remaining = budget.remainingUsd - spent;
    if (remaining <= 0) {
      throw new BudgetError('The budget is used up; the call was not sent.', 'cap', { estimateUsd: estimateUsd ?? undefined, remainingUsd: remaining });
    }
    if (estimateUsd !== null && estimateUsd > remaining) {
      throw new BudgetError(
        `This call is estimated at $${estimateUsd.toFixed(4)} but only $${remaining.toFixed(4)} of the budget is left; it was not sent.`,
        'cap',
        { estimateUsd, remainingUsd: remaining },
      );
    }
  }

  async function runStage<T extends TaskId>(task: T, rawInput: TaskInput<T>, opts: RunStageOptions = {}): Promise<StageResult<TaskOutput<T>>> {
    const prep = prepare(task, rawInput, opts);
    const { def, input, packed } = prep;
    let resolved = prep.resolved;
    const notes: string[] = [];
    if (packed.trimmed.length) notes.push(`Context trimmed: ${packed.trimmed.join(', ')}.`);
    if (resolved.fallbackUsed) notes.push(`Fallback used: ${resolved.fallbackFrom ?? '?'} was unavailable, ${resolved.model} answered.`);

    let fallbackUsed = resolved.fallbackUsed;
    let fallbackFrom = resolved.fallbackFrom;
    const calls: ChatResult[] = [];
    let spent = 0;
    let formatMode: 'json_schema' | 'json_object' | 'none' = 'json_schema';

    for (;;) {
      const model = resolved.model;
      const info = registry.modelInfo(model);
      if (info && def.kind === 'json') {
        formatMode = info.supportedParameters.includes('structured_outputs')
          ? 'json_schema'
          : info.supportedParameters.includes('response_format')
            ? 'json_object'
            : 'none';
      }
      // Leave out settings the model refuses: config modelRules (for example Claude Opus 5.5 rejects any
      // non-default temperature) and, when the model list is loaded, parameters it does not list.
      const omit = registry.omittedParams(model);
      const dropTemperature = omit.has('temperature') || (info !== undefined && !info.supportedParameters.includes('temperature'));
      const stream = opts.onDelta !== undefined || (def.kind === 'markdown' && resolved.stream);
      const baseReq: ChatRequest = {
        model,
        messages: packed.rendered.messages,
        temperature: dropTemperature ? undefined : resolved.temperature,
        maxTokens: resolved.maxTokens,
        responseFormat: def.kind === 'json' && formatMode !== 'none' ? responseFormatFor(def.promptId, def.output, formatMode) : undefined,
        webSearch: resolved.webSearch,
        stream,
        onDelta: opts.onDelta,
        signal: opts.signal,
        timeoutMs: opts.timeoutMs,
        meta: {
          promptId: def.promptId,
          stage: resolved.stage,
          inputHash: prep.inputHash,
          scenario: opts.scenario,
          itemCount: typeof input['count'] === 'number' ? input['count'] : undefined,
        },
      };

      // One call, with the budget check, one restart after a cut stream, one retry without response_format
      // if the provider rejects it, one retry without a parameter a 400 names, and one retry with more room
      // when the answer is cut off at max tokens.
      const runOne = async (req: ChatRequest): Promise<ChatResult> => {
        let attemptReq = req;
        let restarted = false;
        let downgraded = false;
        let paramDropped = false;
        let widened = false;
        let providerSkipped = false;
        for (;;) {
          const output = attemptReq.maxTokens ?? prep.estimate.expectedOutputTokens;
          const quote = costEstimate(attemptReq.model, Math.ceil(JSON.stringify(attemptReq.messages).length / 4), output, output, attemptReq.webSearch).highUsd;
          checkBudget(opts.budget, spent, quote);
          await opts.beforeCall?.(spent, quote);
          try {
            const r = await provider.chat(attemptReq);
            spent += r.usage.costUsd ?? 0;
            calls.push(r);
            return r;
          } catch (e) {
            if (e instanceof OutputTruncatedError) {
              // The cut-off call was paid for; its text is never parsed, repaired or saved.
              if (e.usage) {
                spent += e.usage.costUsd ?? 0;
                calls.push(truncatedCall(e, attemptReq, provider.name));
              }
              if (attemptReq.stream && attemptReq.onDelta) opts.onReset?.();
              const retry = widened ? null : widerRequest(attemptReq, e);
              if (retry) {
                widened = true;
                notes.push(retry.note);
                attemptReq = retry.req;
                continue;
              }
              throw new OutputTruncatedError(
                `${e.message} ${widened ? 'It was still cut off after one retry with more room. ' : ''}Raise max tokens for the ${resolved.stage} stage in Settings, or pick another model.`,
                { partialText: '', maxTokens: e.maxTokens, finishReason: e.finishReason, nativeFinishReason: e.nativeFinishReason },
                { status: e.status },
              );
            }
            if (e instanceof StreamCutError && !restarted) {
              restarted = true;
              opts.onReset?.();
              notes.push('The stream was cut once and restarted.');
              attemptReq = { ...attemptReq, meta: { ...attemptReq.meta, attempt: (attemptReq.meta?.attempt ?? 0) + 1 } };
              continue;
            }
            // Some providers refuse a large schema (live, 5 October 2026: "Azure said: The compiled grammar is
            // too large ... Simplify your tool schemas"). First ask OpenRouter to route around that provider
            // and keep the schema; if that fails too, ask for JSON by instruction (the repair sends the schema).
            const schemaRefused =
              e instanceof BadRequestError &&
              attemptReq.responseFormat !== undefined &&
              /response_format|json_schema|structured|grammar|schema/i.test(e.message);
            const refusedBy = schemaRefused ? asString(e.details?.['provider_name']) : undefined;
            if (schemaRefused && refusedBy && !providerSkipped) {
              providerSkipped = true;
              const slug = providerSlug(refusedBy);
              notes.push(`${refusedBy} refused the JSON schema; sent again with OpenRouter told to skip that provider.`);
              attemptReq = { ...attemptReq, providerIgnore: [...(attemptReq.providerIgnore ?? []), slug] };
              continue;
            }
            if (schemaRefused && !downgraded) {
              downgraded = true;
              notes.push('The provider rejected the JSON schema; asked for JSON by instruction instead.');
              attemptReq = { ...attemptReq, responseFormat: undefined };
              continue;
            }
            const named = e instanceof BadRequestError && !paramDropped ? unsupportedParam(e.message, attemptReq) : null;
            if (named) {
              paramDropped = true;
              notes.push(`The provider rejected the ${named} setting for ${attemptReq.model}; sent again without it.`);
              attemptReq = { ...attemptReq, [named]: undefined };
              continue;
            }
            throw e;
          }
        }
      };

      /** One more try after a cut-off answer: twice the room (within the model's limit) and less reasoning. */
      const widerRequest = (req: ChatRequest, e: OutputTruncatedError): { req: ChatRequest; note: string } | null => {
        const info = registry.modelInfo(req.model);
        const current = req.maxTokens ?? e.maxTokens ?? null;
        const cap = info?.maxCompletionTokens ?? null;
        let next = current === null ? null : current * 2;
        if (next !== null && cap !== null) next = Math.min(next, cap);
        const supportsReasoning =
          info !== undefined && (info.supportedParameters.includes('reasoning') || info.supportedParameters.includes('reasoning_effort'));
        const lowerReasoning = supportsReasoning && !omit.has('reasoning') && req.reasoning?.effort !== 'low';
        const moreRoom = next !== null && current !== null && next > current;
        if (!moreRoom && !lowerReasoning) return null;
        const out: ChatRequest = { ...req, meta: { ...req.meta, attempt: (req.meta?.attempt ?? 0) + 1 } };
        if (moreRoom) out.maxTokens = next;
        if (lowerReasoning) out.reasoning = { ...req.reasoning, effort: 'low' };
        const parts = [moreRoom ? `max tokens ${current} to ${next}` : '', lowerReasoning ? 'reasoning effort low' : ''].filter(Boolean);
        return { req: out, note: `The answer was cut off at the output limit; tried once more with ${parts.join(' and ')}.` };
      };

      const answer = async (req: ChatRequest): Promise<{ output: unknown; repaired: boolean }> => {
        if (def.kind === 'json') {
          const r = await chatStructured(provider, req, def.output as z.ZodType<unknown>, prompts, { run: runOne });
          return { output: r.data, repaired: r.repaired };
        }
        const r = await runOne(req);
        const text = stripMarkdownFence(r.text);
        const v = (def.output as z.ZodType<unknown>).safeParse(text);
        if (!v.success) throw new BadRequestError(`The model returned an empty answer for ${task}.`);
        return { output: v.data, repaired: false };
      };
      const citedSources = (): Source[] => {
        const out: Source[] = [];
        for (const c of calls) for (const src of c.sources) if (!out.some((x) => x.url === src.url)) out.push({ ...src, id: `S${out.length + 1}` });
        return out;
      };

      try {
        let { output, repaired } = await answer(baseReq);
        let sources = citedSources();

        // A search call with no url_citation sources leaves every claim unsupported. Try once more with the
        // configured engine (Exa always searches and always returns citations), keeping the first answer if
        // that try fails.
        const retryEngine = config.defaults.webSearch?.retryEngineWhenNoSources;
        if (resolved.webSearch && sources.length === 0 && retryEngine && (resolved.webSearch.engine ?? 'native') !== retryEngine) {
          try {
            opts.onReset?.();
            const second = await answer({
              ...baseReq,
              webSearch: { ...resolved.webSearch, engine: retryEngine },
              meta: { ...baseReq.meta, attempt: (baseReq.meta?.attempt ?? 0) + 1 },
            });
            output = second.output;
            repaired = second.repaired;
            sources = citedSources();
            notes.push(
              `Web search (${resolved.webSearch.engine ?? 'native'}) returned no url_citation sources; searched again with ${retryEngine} and found ${sources.length}.`,
            );
          } catch (e) {
            if (!(e instanceof AiError) || e instanceof AbortedError) throw e;
            notes.push(`Web search returned no url_citation sources and the second search with ${retryEngine} failed (${e.message}).`);
          }
        }

        const last = calls[calls.length - 1] as ChatResult;
        let rawText = last.text;
        if (resolved.webSearch && sources.length === 0) notes.push('Web search returned no url_citation sources.');
        if (sources.length > 0) {
          const rs = await resolveSources(sources, {
            fetch: options.sourceFetch,
            timeoutMs: options.sourceTimeoutMs,
            signal: opts.signal,
            resolveRedirects: resolveSourceRedirects,
          });
          if (opts.signal?.aborted) throw new AbortedError();
          sources = rs.sources;
          const redirects = rs.resolved + rs.unresolved;
          if (redirects > 0 && !rs.lookedUp) {
            notes.push(
              `${redirects} search redirect ${redirects === 1 ? 'link was' : 'links were'} kept as given and marked unresolved, because redirect lookups are switched off (${RESOLVE_SOURCE_REDIRECTS_SETTING}=false).`,
            );
          } else if (redirects > 0) {
            notes.push(
              `Resolved ${rs.resolved} of ${redirects} search redirect links to the real page${rs.unresolved ? `; ${rs.unresolved} could not be resolved and are marked unresolved` : ''}.`,
            );
          }
          if (rs.merged > 0) notes.push(`Merged ${rs.merged} duplicate ${rs.merged === 1 ? 'source' : 'sources'} that led to the same page.`);
        }

        let guardrails = emptyReport();
        if (def.guardrails !== 'none') {
          const ctx = guardrailContext(input);
          if (task === 'research.title-research') ctx.sources = sources;
          if (def.guardrails === 'facts') ctx.bannedPhrases = [];
          if (def.skipRules) ctx.skipRules = def.skipRules;
          guardrails = runGuardrails(output, config.houseStyle, ctx);

          // Banned phrases: one automatic style rewrite on the same model, then needs attention. Internal
          // notes (research) get no rewrite; their banned phrases are reported as warnings.
          const banned = guardrails.blocking.filter((h) => h.rule === 'banned-phrase');
          // Scaffolding openers over the house-style limit in a written section get the same one rewrite (live run 3:
          // five "Here's the" openers in one section).
          const openersBefore =
            def.kind === 'markdown' && def.styleRewrite !== false && task.startsWith('writing.') && typeof output === 'string'
              ? scaffoldingOpeners(output, config.houseStyle)
              : null;
          const openerFix = openersBefore?.excess === true;
          if (banned.length > 0 && def.styleRewrite === false) {
            guardrails.blocking = guardrails.blocking.filter((h) => h.rule !== 'banned-phrase');
            guardrails.warnings.push(...banned.map((h) => ({ ...h, severity: 'warn' as const })));
            notes.push(`Banned phrases in internal notes, reported without a rewrite: ${describeBanned(banned).phrases.join(', ')}.`);
          } else if (banned.length > 0 || openerFix) {
            const found = describeBanned(banned);
            const rewritePrompt = prompts.render(STYLE_REWRITE_PROMPT_ID, {
              'styleRewrite.found': found.text || 'None',
              'styleRewrite.openers': openersBefore ? describeOpeners(openersBefore) : 'None',
              'styleRewrite.format': def.kind === 'json' ? 'a JSON object' : 'Markdown',
              'houseStyle.bannedPhrases': (ctx.bannedPhrases ?? []).join(', '),
            });
            let note = '';
            let candidate: { output: unknown; text: string; report: GuardrailReport } | null = null;
            try {
              const r = await runOne({
                ...baseReq,
                webSearch: undefined,
                stream: false,
                onDelta: undefined,
                messages: [
                  ...baseReq.messages,
                  { role: 'assistant', content: rawText },
                  { role: 'user', content: rewritePrompt.messages.map((m) => m.content).join('\n\n') },
                ],
                meta: { ...baseReq.meta, attempt: (baseReq.meta?.attempt ?? 0) + 1, purpose: 'style-rewrite' },
              });
              let next: unknown;
              if (def.kind === 'json') {
                const v = validateJson(def.output as z.ZodType<unknown>, r.text);
                if (v.ok) next = v.data;
                else note = `The style rewrite did not match the output contract (${v.issues.slice(0, 3).join('; ')}), so the first answer was kept.`;
              } else {
                const text = stripMarkdownFence(r.text);
                const v = (def.output as z.ZodType<unknown>).safeParse(text);
                if (!v.success) note = 'The style rewrite came back empty, so the first answer was kept.';
                else if (headingLevels(text) !== headingLevels(String(output))) note = 'The style rewrite changed the headings, so the first answer was kept.';
                else next = v.data;
              }
              if (next !== undefined) {
                const report = runGuardrails(next, config.houseStyle, ctx);
                const left = report.blocking.filter((h) => h.rule === 'banned-phrase').length;
                const openersAfter = openerFix && typeof next === 'string' ? scaffoldingOpeners(next, config.houseStyle).hits.length : 0;
                if (left > banned.length) note = 'The style rewrite used more banned phrases than the first answer, so the first answer was kept.';
                else if (openerFix && banned.length === 0 && openersAfter >= (openersBefore?.hits.length ?? 0))
                  note = 'The style rewrite did not reduce the scaffolding openers, so the first answer was kept.';
                else candidate = { output: next, text: r.text, report };
              }
            } catch (e) {
              if (!(e instanceof AiError) || e instanceof AbortedError) throw e;
              note = `The style rewrite call failed (${e.message}), so the first answer was kept.`;
            }
            if (candidate) {
              output = candidate.output;
              rawText = candidate.text;
              guardrails = candidate.report;
              if (opts.onDelta) {
                opts.onReset?.();
                opts.onDelta(def.kind === 'markdown' ? String(output) : rawText);
              }
            }
            const left = guardrails.blocking.filter((h) => h.rule === 'banned-phrase');
            guardrails.blocking = guardrails.blocking.filter((h) => h.rule !== 'banned-phrase');
            guardrails.needsAttention = left;
            guardrails.styleRewrite = { phrases: found.phrases, applied: candidate !== null, cleared: left.length === 0, note };
            if (openerFix && openersBefore) {
              guardrails.styleRewrite.openers = [...new Set(openersBefore.hits.map((h) => h.label))];
              const after = typeof output === 'string' ? scaffoldingOpeners(output, config.houseStyle).hits.length : openersBefore.hits.length;
              notes.push(
                candidate
                  ? `Style rewrite: scaffolding openers ${openersBefore.hits.length} to ${after} (limit ${openersBefore.max}).`
                  : `Style rewrite: ${openersBefore.hits.length} scaffolding openers left (limit ${openersBefore.max}).${note ? ` ${note}` : ''}`,
              );
            }
            if (found.phrases.length > 0)
              notes.push(
                left.length === 0
                  ? `Style rewrite: removed ${found.phrases.length === 1 ? 'a banned phrase' : `${found.phrases.length} banned phrases`} (${found.phrases.join(', ')}).`
                  : `Style rewrite: ${left.length} banned ${left.length === 1 ? 'phrase is' : 'phrases are'} left (${describeBanned(left).phrases.join(', ')}), marked needs attention.${note ? ` ${note}` : ''}`,
              );
          }
        }
        if (task === 'research.title-research') guardrails.warnings.push(...researchEvidenceWarnings(output, sources));
        finaliseReport(guardrails);
        if (def.kind === 'markdown' && typeof output === 'string') {
          const target = asObject(input['chapter'])?.['wordTarget'];
          if (typeof target === 'number') {
            const words = wordCount(output);
            if (Math.abs(words - target) > target * 0.15) notes.push(`Word count ${words} is outside 15% of the target ${target}.`);
          }
        }

        const usage = calls.reduce((u, c) => addUsage(u, c.usage), emptyUsage());
        return {
          task,
          output: output as TaskOutput<T>,
          raw: rawText,
          usage,
          calls: calls.map((c) => ({
            model: c.model,
            usage: c.usage,
            latencyMs: c.latencyMs,
            generationId: c.generationId,
            finishReason: c.finishReason,
            provider: c.provider,
          })),
          model: last.model,
          sentModel: model,
          requestedModel: resolved.requestedModel,
          provider: last.provider,
          stage: resolved.stage,
          promptId: packed.rendered.promptId,
          promptVersion: packed.rendered.promptVersion,
          promptHash: packed.rendered.promptHash,
          fallbackUsed,
          fallbackFrom,
          repaired,
          sources,
          guardrails,
          estimate: prep.estimate,
          notes,
        };
      } catch (e) {
        if (e instanceof ModelUnavailableError) {
          const next = resolved.fallbacks.find((f) => registry.isListed(f));
          if (opts.allowFallback && next) {
            notes.push(`Fallback used: ${model} was unavailable (${e.message}), switched to ${next} with the owner's permission.`);
            fallbackFrom = fallbackFrom ?? model;
            fallbackUsed = true;
            resolved = { ...resolved, model: next, fallbacks: resolved.fallbacks.filter((f) => f !== next) };
            continue;
          }
          throw new ModelUnavailableError(
            next ? `${e.message} Next fallback to offer the owner: ${next}.` : e.message,
            model,
            { stage: resolved.stage, nextFallback: next },
            { status: e.status, cause: e, usage: calls.length > 0 ? calls.reduce((u, c) => addUsage(u, c.usage), emptyUsage()) : undefined },
          );
        }
        // Every call made for this step was paid for, including cut-off answers and repairs: the error keeps
        // its own type and carries the total so the server can record the spend.
        if (e instanceof Error && calls.length > 0) Object.assign(e, { usage: calls.reduce((u, c) => addUsage(u, c.usage), emptyUsage()) });
        throw e;
      }
    }
  }

  async function generateImage(prompt: string, opts: GenerateImageOptions = {}): Promise<GenerateImageResult> {
    if (!prompt.trim()) throw new BadRequestError('The image prompt is empty.');
    if (opts.seed !== undefined) assertSeed(opts.seed);
    const references = (opts.inputReferences ?? []).map(toImageReference);
    const purpose = opts.purpose ?? 'cover';
    const purposeRatio = registry.stageConfig('cover_image').aspectRatios?.[purpose];
    let resolved = resolveStage('cover_image', opts);
    let fallbackUsed = resolved.fallbackUsed;
    let fallbackFrom = resolved.fallbackFrom;
    for (;;) {
      const model = resolved.model;
      const n = opts.n ?? resolved.image.n ?? 1;
      const p = registry.pricing(model);
      if (opts.budget) {
        const perImage = p?.perRequest ?? null;
        checkBudget(opts.budget, 0, perImage === null ? null : perImage * n);
      }
      await opts.beforeCall?.(0, p?.perRequest === null || p?.perRequest === undefined ? null : p.perRequest * n);
      const info = registry.modelInfo(model);
      const notes: string[] = [];
      const sendRefs = references.length > 0 && modelTakesReferences(info);
      if (references.length > 0 && !sendRefs) {
        notes.push(`${model} takes no image input, so the ${references.length} reference image(s) were not sent; the character sheet text still applies.`);
      }
      const sendSeed = opts.seed !== undefined && modelTakesSeed(info, registry.omittedParams(model));
      if (opts.seed !== undefined && !sendSeed) {
        notes.push(`${model} does not list seed in its supported parameters${info ? '' : ' (no model list loaded)'}, so no seed was sent.`);
      }
      const aspectRatio = opts.aspectRatio ?? purposeRatio ?? resolved.image.aspectRatio;
      try {
        const r = await provider.generateImage({
          model,
          prompt,
          n,
          inputReferences: sendRefs ? references : undefined,
          seed: sendSeed ? opts.seed : undefined,
          aspectRatio,
          resolution: opts.resolution ?? resolved.image.resolution,
          outputFormat: opts.outputFormat ?? (resolved.image.outputFormat as 'png' | 'jpeg' | 'webp' | undefined),
          signal: opts.signal,
          timeoutMs: opts.timeoutMs,
          meta: { stage: 'cover_image', scenario: opts.scenario },
        });
        return {
          images: r.images,
          usage: r.usage,
          model: r.model,
          requestedModel: resolved.requestedModel,
          fallbackUsed,
          fallbackFrom,
          latencyMs: r.latencyMs,
          provider: r.provider,
          aspectRatio,
          referencesSent: sendRefs ? references.length : 0,
          seedSent: sendSeed,
          notes,
        };
      } catch (e) {
        if (e instanceof ModelUnavailableError) {
          const next = resolved.fallbacks.find((f) => registry.isListed(f));
          if (opts.allowFallback && next) {
            fallbackFrom = fallbackFrom ?? model;
            fallbackUsed = true;
            resolved = { ...resolved, model: next, fallbacks: resolved.fallbacks.filter((f) => f !== next) };
            continue;
          }
          throw new ModelUnavailableError(e.message, model, { stage: 'cover_image', nextFallback: next }, { status: e.status, cause: e });
        }
        throw e;
      }
    }
  }

  return {
    provider,
    registry,
    prompts,
    config,
    tasks: Object.keys(TASKS) as TaskId[],
    runStage,
    estimate: (task, input, opts = {}) => prepare(task, input, opts).estimate,
    generateImage,
    listModels,
    keyStatus: (signal) => provider.keyStatus(signal),
  };
}

/** Research evidence ids that point at no url_citation source are reported as warnings. */
function researchEvidenceWarnings(output: unknown, sources: Source[]): GuardrailHit[] {
  const ids = new Set(sources.map((s) => s.id));
  const hits: GuardrailHit[] = [];
  const text = JSON.stringify(output);
  for (const m of text.matchAll(/"(S\d+)"/g)) {
    const id = m[1] ?? '';
    if (!ids.has(id) && !hits.some((h) => h.match === id)) {
      hits.push({
        rule: 'evidence-id-not-a-source',
        severity: 'warn',
        message: `Evidence id ${id} does not match a url_citation source; treat that point as inference.`,
        match: id,
        index: m.index ?? 0,
        path: '',
      });
    }
  }
  return hits;
}

/** A ChatResult that records a cut-off call's spend (its text is dropped on purpose). */
function truncatedCall(e: OutputTruncatedError, req: ChatRequest, provider: 'openrouter' | 'mock'): ChatResult {
  return {
    text: '',
    model: req.model,
    finishReason: e.finishReason ?? 'length',
    nativeFinishReason: e.nativeFinishReason,
    usage: e.usage ?? emptyUsage(),
    sources: [],
    generationId: null,
    latencyMs: 0,
    provider,
  };
}

/** The request setting a 400 names as unsupported, when the request sent it. */
export function unsupportedParam(message: string, req: ChatRequest): 'temperature' | 'reasoning' | null {
  if (req.temperature !== undefined && req.temperature !== null && /\b(temperature|top_p|top_k|sampling)\b/i.test(message)) return 'temperature';
  if (req.reasoning !== undefined && /\b(reasoning|thinking|effort|budget_tokens)\b/i.test(message)) return 'reasoning';
  return null;
}

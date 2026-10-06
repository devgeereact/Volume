// Model registry: config/models.defaults.json merged with the owner's choices (workspace, then profile,
// then book), plus the cached model list for prices and context lengths. Fallbacks are never used silently:
// resolve() either throws ModelUnavailableError naming the next fallback, or (when the owner has allowed
// it) returns the fallback with fallbackUsed = true.

import type { ModelsDefaults, StageConfig } from './config.ts';
import { ConfigError, ModelUnavailableError } from './errors.ts';
import type { ModelInfo, ModelPricing, WebSearchOptions } from './types.ts';

export interface StageChoice {
  model?: string | undefined;
  fallbacks?: string[] | undefined;
  params?:
    | {
        temperature?: number | null | undefined;
        maxTokens?: number | null | undefined;
        web?: { engine?: string | undefined; maxResults?: number | undefined } | undefined;
      }
    | undefined;
}

/** Stage key (research, titles, blueprint, writing, summarise, checks, editing, matter_metadata, cover_brief, cover_image, marketing) to choice. */
export type StageOverrides = Partial<Record<string, StageChoice>>;

/** The `model_choices` rows for one request, by scope. Applied workspace, then profile, then book. */
export interface ModelOverrides {
  workspace?: StageOverrides | undefined;
  profile?: StageOverrides | undefined;
  book?: StageOverrides | undefined;
}

export type ChoiceSource = 'default' | 'workspace' | 'profile' | 'book' | 'explicit';

export interface ResolvedStage {
  stage: string;
  tier: string;
  /** The model to call. */
  model: string;
  /** The model the settings asked for (differs from `model` only when a fallback was used). */
  requestedModel: string;
  /** Remaining fallbacks, in order, without the model itself. */
  fallbacks: string[];
  fallbackUsed: boolean;
  fallbackFrom: string | undefined;
  source: ChoiceSource;
  temperature: number | null;
  maxTokens: number | null;
  webSearch: WebSearchOptions | undefined;
  stream: boolean;
  responseFormat: string | undefined;
  image: { aspectRatio?: string | undefined; resolution?: string | undefined; outputFormat?: string | undefined; n?: number | undefined };
  /** Output tokens for the high estimate (config highOutputTokens, else max tokens). */
  highOutputTokens: number | null;
  /** Output tokens for the expected estimate (config expectedOutputTokens), when the config gives one. */
  expectedOutputTokens: number | null;
}

export interface ResolveOptions {
  /** Per-call choices, layered on top of the registry's own overrides. */
  overrides?: ModelOverrides | undefined;
  /** An explicit model picked by the owner for this call. */
  model?: string | undefined;
  /** Availability check (for example from the cached model list). Without it every slug counts as available. */
  isAvailable?: ((slug: string) => boolean) | undefined;
  /** The owner has accepted switching to the next available fallback for this call. */
  allowFallback?: boolean | undefined;
}

const LAYERS = ['workspace', 'profile', 'book'] as const;

export function mergeOverrides(...list: Array<ModelOverrides | undefined>): ModelOverrides {
  const out: ModelOverrides = {};
  for (const o of list) {
    if (!o) continue;
    for (const layer of LAYERS) {
      const add = o[layer];
      if (!add) continue;
      const base: StageOverrides = { ...(out[layer] ?? {}) };
      for (const [stage, choice] of Object.entries(add)) {
        if (!choice) continue;
        const prev = base[stage] ?? {};
        base[stage] = {
          ...prev,
          ...choice,
          params: { ...(prev.params ?? {}), ...(choice.params ?? {}) },
        };
      }
      out[layer] = base;
    }
  }
  return out;
}

function dedupe(list: string[], without: string): string[] {
  const seen = new Set<string>([without]);
  const out: string[] = [];
  for (const s of list) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

export class ModelRegistry {
  readonly defaults: ModelsDefaults;
  private overrides: ModelOverrides;
  private models = new Map<string, ModelInfo>();
  private modelsLoadedAt: number | null = null;

  constructor(defaults: ModelsDefaults, overrides: ModelOverrides = {}) {
    this.defaults = defaults;
    this.overrides = overrides;
  }

  stages(): string[] {
    return Object.keys(this.defaults.stages);
  }

  stageConfig(stage: string): StageConfig {
    const s = this.defaults.stages[stage];
    if (!s) throw new ConfigError(`Unknown stage "${stage}". Known: ${this.stages().join(', ')}`);
    return s;
  }

  setOverrides(overrides: ModelOverrides): void {
    this.overrides = overrides;
  }

  /** Cache the model list (from listModels) for prices, context lengths and availability. */
  setModels(models: ModelInfo[], at = Date.now()): void {
    this.models = new Map(models.map((m) => [m.slug, m]));
    this.modelsLoadedAt = at;
  }

  hasModelList(): boolean {
    return this.modelsLoadedAt !== null;
  }

  modelListAgeMs(now = Date.now()): number | null {
    return this.modelsLoadedAt === null ? null : now - this.modelsLoadedAt;
  }

  modelInfo(slug: string): ModelInfo | undefined {
    return this.models.get(slug) ?? this.models.get(slug.replace(/:online$/, ''));
  }

  /** Prices for a slug. A concrete slug an alias resolved to falls back to the alias entry. */
  pricing(slug: string): ModelPricing | undefined {
    const direct = this.modelInfo(slug);
    if (direct) return direct.pricing;
    for (const m of this.models.values()) if (m.aliasTarget === slug) return m.pricing;
    return undefined;
  }

  /** True when the cached list includes the slug, or no list is cached yet. */
  isListed(slug: string): boolean {
    return this.modelsLoadedAt === null || this.modelInfo(slug) !== undefined;
  }

  resolve(stage: string, opts: ResolveOptions = {}): ResolvedStage {
    const base = this.stageConfig(stage);
    const merged = mergeOverrides(this.overrides, opts.overrides);
    let model = base.defaultModel;
    let fallbacks = [...base.fallbacks];
    let temperature: number | null = base.temperature ?? null;
    let maxTokens: number | null = base.maxTokens ?? null;
    const plugin = this.defaults.webSearch?.plugin;
    let web: WebSearchOptions | undefined = base.webSearch ? { engine: plugin?.engine, maxResults: plugin?.max_results } : undefined;
    let source: ChoiceSource = 'default';

    for (const layer of LAYERS) {
      const choice = merged[layer]?.[stage];
      if (!choice) continue;
      if (choice.model) {
        // Keep the previous model as the first fallback so nothing is lost.
        fallbacks = [model, ...fallbacks];
        model = choice.model;
        source = layer;
      }
      if (choice.fallbacks) fallbacks = [...choice.fallbacks];
      const p = choice.params;
      if (p?.temperature !== undefined) temperature = p.temperature;
      if (p?.maxTokens !== undefined) maxTokens = p.maxTokens;
      if (p?.web && web) web = { engine: p.web.engine ?? web.engine, maxResults: p.web.maxResults ?? web.maxResults };
    }
    if (opts.model) {
      fallbacks = [model, ...fallbacks];
      model = opts.model;
      source = 'explicit';
    }
    fallbacks = dedupe(fallbacks, model);

    const requestedModel = model;
    let fallbackUsed = false;
    let fallbackFrom: string | undefined;
    const available = opts.isAvailable;
    if (available && !available(model)) {
      const next = fallbacks.find((f) => available(f));
      if (!opts.allowFallback || !next) {
        throw new ModelUnavailableError(
          next
            ? `Model ${model} for stage ${stage} is not in the OpenRouter model list. Next fallback to offer: ${next}.`
            : `Model ${model} for stage ${stage} is not in the OpenRouter model list and no fallback is available.`,
          model,
          { stage, nextFallback: next },
        );
      }
      fallbackUsed = true;
      fallbackFrom = model;
      model = next;
      fallbacks = fallbacks.filter((f) => f !== next);
    }

    return {
      stage,
      tier: base.tier,
      model,
      requestedModel,
      fallbacks,
      fallbackUsed,
      fallbackFrom,
      source,
      temperature,
      maxTokens,
      webSearch: web,
      stream: base.stream ?? false,
      responseFormat: base.responseFormat,
      image: { aspectRatio: base.aspectRatio, resolution: base.resolution, outputFormat: base.outputFormat, n: base.n },
      highOutputTokens: Math.max(base.highOutputTokens ?? 0, maxTokens ?? 0) || null,
      expectedOutputTokens: base.expectedOutputTokens ?? null,
    };
  }

  /**
   * Request parameters a model refuses (config modelRules), checked against the slug, the slug without
   * ':online' and the concrete model an alias points at in the cached list.
   */
  omittedParams(slug: string): Set<string> {
    const out = new Set<string>();
    const names = [slug, slug.replace(/:online$/, '')];
    const target = this.modelInfo(slug)?.aliasTarget;
    if (target) names.push(target);
    for (const rule of this.defaults.modelRules ?? []) {
      let re: RegExp;
      try {
        re = new RegExp(rule.match);
      } catch {
        continue;
      }
      if (names.some((n) => re.test(n))) for (const p of rule.omitParams) out.add(p);
    }
    return out;
  }

  /** Every default and fallback slug in the config, with the stages that use it. */
  configuredSlugs(): Map<string, string[]> {
    const out = new Map<string, string[]>();
    for (const [stage, s] of Object.entries(this.defaults.stages)) {
      for (const slug of [s.defaultModel, ...s.fallbacks]) out.set(slug, [...(out.get(slug) ?? []), stage]);
    }
    return out;
  }
}

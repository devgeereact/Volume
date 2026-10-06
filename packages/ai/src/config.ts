// Loads config/models.defaults.json, config/house-style.json and the latest config/kdp-rules/<date>.json,
// and builds the {{houseStyle.*}} and {{kdp.*}} prompt variables. KDP numbers come only from the rules file.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ConfigError } from './errors.ts';
import { asObject, type OpenString } from './util.ts';

const nullableNumber = z.number().nullable().optional();

export const StageConfigSchema = z.looseObject({
  tier: z.string(),
  defaultModel: z.string(),
  fallbacks: z.array(z.string()).default([]),
  webSearch: z.boolean().optional(),
  maxTokens: nullableNumber,
  temperature: nullableNumber,
  stream: z.boolean().optional(),
  responseFormat: z.string().optional(),
  endpoint: z.string().optional(),
  aspectRatio: z.string().optional(),
  resolution: z.string().optional(),
  outputFormat: z.string().optional(),
  n: z.number().optional(),
  prompts: z.array(z.string()).default([]),
  /** Output tokens to assume for the high cost estimate (observed worst case); max tokens when left out. */
  highOutputTokens: z.number().optional(),
  /** Output tokens to assume for the expected cost estimate (observed average). */
  expectedOutputTokens: z.number().optional(),
});
export type StageConfig = z.infer<typeof StageConfigSchema>;

export const ModelsDefaultsSchema = z.looseObject({
  version: z.number(),
  headers: z.record(z.string(), z.string()).optional(),
  endpoints: z.looseObject({ baseUrl: z.string() }).optional(),
  webSearch: z
    .looseObject({
      plugin: z.looseObject({ id: z.string(), engine: z.string().optional(), max_results: z.number().optional() }),
      /** Engine for one more try when a search call brings back no url_citation sources. */
      retryEngineWhenNoSources: z.string().optional(),
      /** Searches to assume per call in the high estimate (native search can run several queries). */
      highSearchesPerCall: z.number().optional(),
      /** USD per call for an engine OpenRouter prices itself (for example exa), used when the model has no web search price. */
      enginePricePerCall: z.record(z.string(), z.number()).optional(),
    })
    .optional(),
  /**
   * Request settings some models refuse. `match` is a regular expression tried on the slug and on the
   * concrete model an alias points at; `omitParams` are left out of every request to a matching model.
   */
  modelRules: z.array(z.looseObject({ match: z.string(), omitParams: z.array(z.string()).default([]), note: z.string().optional() })).optional(),
  budgets: z.looseObject({ perBookDefaultUSD: z.number().optional(), perCallWarnUSD: z.number().optional() }).optional(),
  stages: z.record(z.string(), StageConfigSchema),
});
export type ModelsDefaults = z.infer<typeof ModelsDefaultsSchema>;

export interface GuardrailPattern {
  id: string;
  pattern: string;
  flags?: string | undefined;
  message: string;
  action: 'block' | 'claims-report' | 'autofix' | OpenString;
}

export const HouseStyleSchema = z.looseObject({
  rules: z.array(z.looseObject({ id: z.string(), description: z.string() })),
  bannedPhrases: z.array(z.string()),
  guardrailPatterns: z.array(
    z.looseObject({
      id: z.string(),
      pattern: z.string(),
      flags: z.string().optional(),
      message: z.string(),
      action: z.string(),
    }),
  ),
});
export type HouseStyle = z.infer<typeof HouseStyleSchema>;

export const KdpRulesSchema = z.looseObject({
  version: z.string(),
  rules: z.array(
    z.looseObject({
      id: z.string(),
      value: z.unknown().optional(),
      values: z.unknown().optional(),
      status: z.string().optional(),
      source: z.string().optional(),
    }),
  ),
});
export type KdpRules = z.infer<typeof KdpRulesSchema>;

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    throw new ConfigError(`Could not read ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function parseWith<T>(schema: z.ZodType<T>, value: unknown, label: string): T {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ConfigError(`${label} is not valid: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return r.data;
}

export function loadModelsDefaults(configDir: string): ModelsDefaults {
  return parseWith(ModelsDefaultsSchema, readJson(join(configDir, 'models.defaults.json')), 'config/models.defaults.json');
}

export function loadHouseStyle(configDir: string): HouseStyle {
  return parseWith(HouseStyleSchema, readJson(join(configDir, 'house-style.json')), 'config/house-style.json');
}

/** Load a dated KDP rules file; the newest (by file name) unless a version such as '2026-10-03' is pinned. */
export function loadKdpRules(configDir: string, version?: string): KdpRules {
  const dir = join(configDir, 'kdp-rules');
  let file: string | undefined;
  if (version) {
    file = `${version}.json`;
  } else {
    const files = readdirSync(dir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
    file = files[files.length - 1];
  }
  if (!file) throw new ConfigError(`No dated KDP rules file in ${dir}`);
  return parseWith(KdpRulesSchema, readJson(join(dir, file)), `config/kdp-rules/${file}`);
}

function rule(rules: KdpRules, id: string): { value?: unknown; values?: unknown } {
  const r = rules.rules.find((x) => x.id === id);
  if (!r) throw new ConfigError(`KDP rule ${id} is missing from config/kdp-rules/${rules.version}.json`);
  return r;
}

function ruleNumber(rules: KdpRules, id: string, key?: string): number {
  const r = rule(rules, id);
  const v = key ? asObject(r.values)?.[key] : r.value;
  if (typeof v !== 'number') throw new ConfigError(`KDP rule ${id}${key ? `.${key}` : ''} is not a number`);
  return v;
}

export interface ConfigBundle {
  defaults: ModelsDefaults;
  houseStyle: HouseStyle;
  kdp: KdpRules;
}

export function loadConfig(configDir: string, opts: { kdpVersion?: string | undefined; defaults?: ModelsDefaults | undefined } = {}): ConfigBundle {
  return {
    defaults: opts.defaults ?? loadModelsDefaults(configDir),
    houseStyle: loadHouseStyle(configDir),
    kdp: loadKdpRules(configDir, opts.kdpVersion),
  };
}

/** Variables injected into every prompt that asks for them: houseStyle.* and kdp.* (plus goLiveNote). */
export function configVariables(bundle: ConfigBundle, extraBannedPhrases: string[] = []): Record<string, string> {
  const { houseStyle, kdp } = bundle;
  const banned = [...new Set([...houseStyle.bannedPhrases, ...extraBannedPhrases.map((p) => p.trim()).filter(Boolean)])];
  const keywords = asObject(rule(kdp, 'listing.keywords').values) ?? {};
  const avoid = Array.isArray(keywords['avoid']) ? keywords['avoid'].map(String) : [];
  const formatting = asObject(rule(kdp, 'listing.description.allowedFormatting').values) ?? {};
  const fmtList = Array.isArray(formatting['formatting']) ? formatting['formatting'].map(String) : [];
  const tags = Array.isArray(formatting['assumedTags']) ? formatting['assumedTags'].map(String) : [];
  const timing = asObject(rule(kdp, 'publish.goLiveTiming').values) ?? {};
  const liveDays = timing['liveAfterSubmitBusinessDays'];
  const ebookHours = timing['ebookDetailPageHoursMax'];
  return {
    'houseStyle.bannedPhrases': banned.join(', '),
    'houseStyle.rules': houseStyle.rules.map((r) => `- ${r.description}`).join('\n'),
    'kdp.titleSubtitleMaxChars': String(ruleNumber(kdp, 'listing.titleSubtitle.maxChars', 'maxAllowed')),
    'kdp.descriptionMaxChars': String(ruleNumber(kdp, 'listing.description.maxChars')),
    'kdp.descriptionFormatting': `${fmtList.join(', ')}${tags.length ? ` (HTML tags: ${tags.join(', ')})` : ''}`,
    'kdp.keywordsMax': String(ruleNumber(kdp, 'listing.keywords', 'max')),
    'kdp.keywordsAvoid': avoid.join('; '),
    'kdp.categoriesMax': String(ruleNumber(kdp, 'listing.categories')),
    'kdp.spineTextMinPages': String(ruleNumber(kdp, 'paperback.spine.textMinPages')),
    goLiveNote:
      typeof liveDays === 'number' && typeof ebookHours === 'number'
        ? `KDP says a book is usually live within ${liveDays} business days of submission, and an eBook detail page can take up to ${ebookHours} hours to appear.`
        : '',
  };
}

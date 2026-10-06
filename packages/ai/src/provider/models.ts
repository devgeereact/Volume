import type { ModelInfo, ModelPricing, Usage } from '../types.ts';
import { asArray, asNumber, asObject, asString } from '../util.ts';

function perMillion(v: unknown): number | null {
  const n = asNumber(v);
  return n === undefined ? null : Math.round(n * 1_000_000 * 1e6) / 1e6;
}

function plain(v: unknown): number | null {
  const n = asNumber(v);
  return n === undefined ? null : n;
}

/** Map one entry of GET /api/v1/models `data[]` to ModelInfo. Prices there are USD per token (strings). */
export function mapModel(raw: unknown): ModelInfo | undefined {
  const m = asObject(raw);
  if (!m) return undefined;
  const slug = asString(m['id']);
  if (!slug) return undefined;
  const pricing = asObject(m['pricing']) ?? {};
  const arch = asObject(m['architecture']) ?? {};
  const top = asObject(m['top_provider']) ?? {};
  const params = asArray(m['supported_parameters']).filter((p): p is string => typeof p === 'string');
  const outputs = asArray(arch['output_modalities']).filter((p): p is string => typeof p === 'string');
  const inputs = asArray(arch['input_modalities']).filter((p): p is string => typeof p === 'string');
  const alias = asObject(m['alias_target']);
  const p: ModelPricing = {
    inputPerMillion: perMillion(pricing['prompt']),
    outputPerMillion: perMillion(pricing['completion']),
    imageInputPerMillion: perMillion(pricing['image']),
    imageOutputPerMillion: perMillion(pricing['image_output']),
    webSearchPerRequest: plain(pricing['web_search']),
    perRequest: plain(pricing['request']),
  };
  return {
    slug,
    name: asString(m['name']) ?? slug,
    contextLength: asNumber(m['context_length']) ?? asNumber(top['context_length']) ?? null,
    maxCompletionTokens: asNumber(top['max_completion_tokens']) ?? null,
    pricing: p,
    inputModalities: inputs,
    outputModalities: outputs,
    supportedParameters: params,
    supportsTools: params.includes('tools'),
    supportsStructured: params.includes('structured_outputs') || params.includes('response_format'),
    supportsSearch: p.webSearchPerRequest !== null || params.includes('web_search_options'),
    supportsImageOutput: outputs.includes('image'),
    aliasTarget: alias ? (asString(alias['slug']) ?? null) : null,
  };
}

/** Compute a cost from registry prices when OpenRouter did not report one. */
export function computeCost(usage: Pick<Usage, 'promptTokens' | 'completionTokens'>, pricing: ModelPricing | undefined): number | null {
  if (!pricing || pricing.inputPerMillion === null || pricing.outputPerMillion === null) return null;
  return (usage.promptTokens * pricing.inputPerMillion + usage.completionTokens * pricing.outputPerMillion) / 1_000_000;
}

/** Map an OpenRouter usage object (chat or images) to Usage. */
export function mapUsage(raw: unknown, pricing?: ModelPricing): Usage {
  const u = asObject(raw) ?? {};
  const completionDetails = asObject(u['completion_tokens_details']) ?? {};
  const promptDetails = asObject(u['prompt_tokens_details']) ?? {};
  const promptTokens = asNumber(u['prompt_tokens']) ?? 0;
  const completionTokens = asNumber(u['completion_tokens']) ?? 0;
  const reported = asNumber(u['cost']);
  let costUsd: number | null = reported ?? null;
  let costSource: Usage['costSource'] = reported !== undefined ? 'openrouter' : 'unknown';
  if (reported === undefined) {
    const computed = computeCost({ promptTokens, completionTokens }, pricing);
    if (computed !== null) {
      costUsd = computed;
      costSource = 'computed';
    }
  }
  return {
    promptTokens,
    completionTokens,
    totalTokens: asNumber(u['total_tokens']) ?? promptTokens + completionTokens,
    reasoningTokens: asNumber(completionDetails['reasoning_tokens']) ?? 0,
    cachedTokens: asNumber(promptDetails['cached_tokens']) ?? 0,
    costUsd,
    costSource,
  };
}

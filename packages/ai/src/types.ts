// Shared types for the Volume AI layer. Server side only.

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** A research source. Built only from OpenRouter url_citation annotations, never from model text. */
export interface Source {
  /** Stable marker id, S1, S2... in order of first citation. */
  id: string;
  /** The page link. For a resolved grounding redirect this is the final URL from its Location header. */
  url: string;
  title: string;
  /** The annotation `content` excerpt (may be empty). */
  snippet: string;
  startIndex?: number | undefined;
  endIndex?: number | undefined;
  /** Host of `url` without "www." (left out while a redirect link is unresolved). */
  domain?: string | undefined;
  /** The grounding redirect link the citation came with, when `url` was resolved from it. */
  redirectUrl?: string | undefined;
  /** True when `url` is still a grounding redirect that could not be resolved; the UI should say so. */
  unresolved?: boolean | undefined;
}

export type CostSource = 'openrouter' | 'computed' | 'mock' | 'unknown';

export interface Usage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  reasoningTokens: number;
  cachedTokens: number;
  /** USD. Null only when neither OpenRouter nor the registry prices could give a figure. */
  costUsd: number | null;
  costSource: CostSource;
}

export type ResponseFormat = { type: 'json_schema'; name: string; schema: Record<string, unknown>; strict?: boolean | undefined } | { type: 'json_object' };

export interface WebSearchOptions {
  engine?: string | undefined;
  maxResults?: number | undefined;
  searchPrompt?: string | undefined;
}

/** Optional metadata the mock provider uses to pick fixtures and fault scenarios. Never sent to OpenRouter. */
export interface RequestMeta {
  promptId?: string | undefined;
  stage?: string | undefined;
  inputHash?: string | undefined;
  scenario?: MockScenario | undefined;
  attempt?: number | undefined;
  /** Why the call was sent: the first answer, a JSON repair, or the automatic style rewrite. */
  purpose?: 'answer' | 'json-repair' | 'style-rewrite' | undefined;
}

export type MockScenario =
  'rate_limit' | 'server_error' | 'invalid_json' | 'invalid_json_always' | 'stream_cut' | 'refusal' | 'model_missing' | 'slow' | 'no_sources';

/** OpenRouter's `reasoning` request object (https://openrouter.ai/docs/guides/best-practices/reasoning-tokens). */
export interface ReasoningOptions {
  effort?: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max' | undefined;
  maxTokens?: number | undefined;
  /** Keep reasoning out of the answer (it is still billed). */
  exclude?: boolean | undefined;
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number | null | undefined;
  /** Hard limit on output tokens. On most providers reasoning tokens count against it too. */
  maxTokens?: number | null | undefined;
  reasoning?: ReasoningOptions | undefined;
  /** OpenRouter provider slugs to skip for this request (provider.ignore). */
  providerIgnore?: string[] | undefined;
  responseFormat?: ResponseFormat | undefined;
  webSearch?: WebSearchOptions | undefined;
  /** Stream the answer. onDelta receives each text fragment. */
  stream?: boolean | undefined;
  onDelta?: ((text: string) => void) | undefined;
  signal?: AbortSignal | undefined;
  /** Whole-request timeout in ms (default 10 minutes). */
  timeoutMs?: number | undefined;
  /** Stream idle timeout in ms: no chunk for this long aborts the call (default 120 s). */
  idleTimeoutMs?: number | undefined;
  meta?: RequestMeta | undefined;
}

export interface ChatResult {
  text: string;
  /** The model that actually answered, as reported by OpenRouter (an alias resolves to a concrete slug). */
  model: string;
  finishReason: string | null;
  /** The provider's own stop reason (for example end_turn or max_tokens), best effort. */
  nativeFinishReason?: string | null | undefined;
  usage: Usage;
  sources: Source[];
  generationId: string | null;
  latencyMs: number;
  provider: 'openrouter' | 'mock';
}

export interface ImageRequest {
  model: string;
  prompt: string;
  n?: number | undefined;
  aspectRatio?: string | undefined;
  resolution?: string | undefined;
  outputFormat?: 'png' | 'jpeg' | 'webp' | undefined;
  signal?: AbortSignal | undefined;
  timeoutMs?: number | undefined;
  meta?: RequestMeta | undefined;
}

export interface GeneratedImage {
  data: Buffer;
  mediaType: string;
}

export interface ImageResult {
  images: GeneratedImage[];
  model: string;
  usage: Usage;
  latencyMs: number;
  provider: 'openrouter' | 'mock';
}

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMillion: number | null;
  /** USD per million output tokens. */
  outputPerMillion: number | null;
  /** USD per million input image tokens (OpenRouter `pricing.image`). */
  imageInputPerMillion: number | null;
  /** USD per million output image tokens (OpenRouter `pricing.image_output`). */
  imageOutputPerMillion: number | null;
  /** USD per web search request (OpenRouter `pricing.web_search`). */
  webSearchPerRequest: number | null;
  /** USD per request (OpenRouter `pricing.request`). */
  perRequest: number | null;
}

export interface ModelInfo {
  slug: string;
  name: string;
  contextLength: number | null;
  maxCompletionTokens: number | null;
  pricing: ModelPricing;
  inputModalities: string[];
  outputModalities: string[];
  supportedParameters: string[];
  supportsTools: boolean;
  supportsStructured: boolean;
  /** Native web search priced by OpenRouter for this model. The web plugin gives any model search through Exa. */
  supportsSearch: boolean;
  supportsImageOutput: boolean;
  /** For '~' aliases: the concrete model the alias points at today. */
  aliasTarget: string | null;
}

export interface KeyStatus {
  valid: boolean;
  label: string | null;
  limitUsd: number | null;
  limitRemainingUsd: number | null;
  usageUsd: number | null;
  isFreeTier: boolean | null;
}

/** The interface both OpenRouterClient and MockProvider implement. */
export interface AiProvider {
  readonly name: 'openrouter' | 'mock';
  chat(req: ChatRequest): Promise<ChatResult>;
  generateImage(req: ImageRequest): Promise<ImageResult>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  keyStatus(signal?: AbortSignal): Promise<KeyStatus>;
}

export function emptyUsage(): Usage {
  return {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    reasoningTokens: 0,
    cachedTokens: 0,
    costUsd: 0,
    costSource: 'unknown',
  };
}

export function addUsage(a: Usage, b: Usage): Usage {
  const cost = a.costUsd === null || b.costUsd === null ? null : a.costUsd + b.costUsd;
  return {
    promptTokens: a.promptTokens + b.promptTokens,
    completionTokens: a.completionTokens + b.completionTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    reasoningTokens: a.reasoningTokens + b.reasoningTokens,
    cachedTokens: a.cachedTokens + b.cachedTokens,
    costUsd: cost,
    costSource: a.costSource === 'unknown' ? b.costSource : a.costSource,
  };
}

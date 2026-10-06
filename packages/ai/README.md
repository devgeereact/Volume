# @volume/ai

Volume's AI layer, server side only (`apps/web` must never import it). It holds the OpenRouter client, a mock provider, the model registry, the prompt loader and renderer, the context packer, structured JSON output with one repair, guardrail post-checks, cost accounting and one runner per prompt.

- Source is TypeScript with `.ts` import paths and erasable syntax only, so it runs under Node 26 directly, under `tsx`, and in Vitest. `exports["."]` points at `src/index.ts`.
- The API key is passed in by the caller. This package never reads `.env` (only `scripts/live-smoke.ts` loads it, inside Node, and prints only "key present: yes/no").
- Prompts are files in `prompts/`; no prompt text lives in code. The JSON repair request is `prompts/system/json-repair.v1.md`.

## Scripts

| Command | What it does |
|---|---|
| `npm run typecheck -w packages/ai` | `tsc -p tsconfig.json` (strict, no emit) |
| `npm run test -w packages/ai` | Vitest. No network: mock provider and a local fake HTTP server |
| `LIVE_AI=1 npm run smoke:live -w packages/ai` | Live OpenRouter smoke test, budget cap 0.50 USD. Needs `LIVE_AI=1` in the command's environment and `OPENROUTER_API_KEY` in the project `.env`. No image call unless `LIVE_AI_IMAGES=1` |

## For the server: the one call you need

```ts
import { createAiService } from '@volume/ai';

const ai = createAiService({
  apiKey: process.env.OPENROUTER_API_KEY,      // empty or missing: mock provider
  promptsDir: '/abs/path/volume/prompts',
  configDir: '/abs/path/volume/config',
  overrides: { workspace: {...}, profile: {...}, book: {...} }, // optional, from model_choices
});

const r = await ai.runStage('writing.chapter', input, {
  onDelta: (text) => sse.send('section.delta', text),
  onReset: () => sse.send('section.reset'),   // a cut stream restarted: discard text so far
  signal: job.abortSignal,
  budget: { remainingUsd: book.budgetLeft },
});
// r.output, r.usage.costUsd, r.model, r.promptId, r.promptVersion, r.promptHash, r.fallbackUsed, r.guardrails
```

### Exact signatures

```ts
function createAiService(options: CreateAiServiceOptions): AiService;

interface CreateAiServiceOptions {
  apiKey?: string;                     // OPENROUTER_API_KEY; empty -> MockProvider
  defaults?: ModelsDefaults;           // parsed config/models.defaults.json; loaded from configDir if left out
  overrides?: ModelOverrides;          // owner's model choices
  promptsDir: string;
  configDir: string;
  mock?: boolean | MockProviderOptions; // force the mock even with a key
  kdpRulesVersion?: string;            // pin config/kdp-rules/<date>.json; default newest
  appUrl?: string;                     // HTTP-Referer (default from config headers)
  appTitle?: string;                   // X-OpenRouter-Title (default from config headers)
  baseUrl?: string;                    // default https://openrouter.ai/api/v1
  timeoutMs?: number;                  // whole request, default 600000
  idleTimeoutMs?: number;              // stream idle, default 120000
  retry?: RetryOptions;                // default 3 retries at 2 s, 10 s, 60 s with 20% jitter; Retry-After wins
  modelsTtlMs?: number;                // model list cache, default 24 h
  fetch?: typeof fetch;                // tests
  provider?: AiProvider;               // tests: inject a provider
}

interface AiService {
  readonly provider: AiProvider;
  readonly registry: ModelRegistry;
  readonly prompts: PromptLoader;
  readonly config: ConfigBundle;       // { defaults, houseStyle, kdp }
  readonly tasks: readonly TaskId[];
  runStage<T extends TaskId>(task: T, input: TaskInput<T>, opts?: RunStageOptions): Promise<StageResult<TaskOutput<T>>>;
  estimate<T extends TaskId>(task: T, input: TaskInput<T>, opts?: RunStageOptions): CostEstimate;
  generateImage(prompt: string, opts?: GenerateImageOptions): Promise<GenerateImageResult>;
  listModels(opts?: { refresh?: boolean; signal?: AbortSignal }): Promise<ModelInfo[]>;
  keyStatus(signal?: AbortSignal): Promise<KeyStatus>;
}

interface RunStageOptions {
  signal?: AbortSignal;
  onDelta?: (text: string) => void;    // streams when given (writing stages stream by default)
  onReset?: () => void;                // called once if a stream is cut and restarted
  overrides?: ModelOverrides;          // per call, on top of the service overrides
  model?: string;                      // explicit owner choice (for example after a fallback offer)
  allowFallback?: boolean;             // default false: never switch model silently
  promptVersion?: number;              // pin a prompt version
  budget?: { remainingUsd: number };   // a call whose estimate passes this is not sent (BudgetError)
  expectedOutputTokens?: number;       // for the estimate; default word target x 1.4, else maxTokens / 4
  timeoutMs?: number;
  scenario?: MockScenario;             // mock only
}

interface StageResult<T> {
  task: TaskId;
  output: T;                           // zod-validated output (string for markdown tasks)
  raw: string;                         // last call's raw text, for prompt_runs.output
  usage: Usage;                        // summed over every call (repair included)
  calls: CallRecord[];                 // one per HTTP call: model, usage, latencyMs, generationId, finishReason, provider
  model: string;                       // model that answered (an alias resolves to a concrete slug)
  sentModel: string;                   // model the request was sent to
  requestedModel: string;              // model the settings chose
  provider: 'openrouter' | 'mock';
  stage: string;                       // models.defaults.json stage key from the prompt front matter
  promptId: string; promptVersion: number; promptHash: string;
  fallbackUsed: boolean; fallbackFrom: string | undefined;
  repaired: boolean;                   // one JSON repair request was needed
  sources: Source[];                   // url_citation sources only (research); redirects resolved, domain, unresolved flag
  guardrails: GuardrailReport;         // { passed, blocking[], needsAttention[], styleRewrite?, claims[], autofix[], warnings[], rules[] }
  estimate: CostEstimate;              // { model, inputTokens, expectedOutputTokens, estimateUsd, highUsd }
  notes: string[];                     // trimmed context, restarted stream, downgraded format, no sources...
}

interface GenerateImageOptions {
  model?: string; overrides?: ModelOverrides; allowFallback?: boolean;
  n?: number; aspectRatio?: string; resolution?: string; outputFormat?: 'png' | 'jpeg' | 'webp';
  signal?: AbortSignal; budget?: { remainingUsd: number }; timeoutMs?: number; scenario?: MockScenario;
}
interface GenerateImageResult {
  images: { data: Buffer; mediaType: string }[];
  usage: Usage; model: string; requestedModel: string;
  fallbackUsed: boolean; fallbackFrom: string | undefined; latencyMs: number; provider: 'openrouter' | 'mock';
}

interface Usage {
  promptTokens: number; completionTokens: number; totalTokens: number;
  reasoningTokens: number; cachedTokens: number;
  costUsd: number | null;              // OpenRouter's usage.cost, else computed from registry prices
  costSource: 'openrouter' | 'computed' | 'mock' | 'unknown';
}

type ModelOverrides = { workspace?: StageOverrides; profile?: StageOverrides; book?: StageOverrides };
type StageOverrides = Partial<Record<string /* stage key */, StageChoice>>;
interface StageChoice {
  model?: string; fallbacks?: string[];
  params?: { temperature?: number | null; maxTokens?: number | null; web?: { engine?: string; maxResults?: number } };
}
```

`model_choices` rows map straight onto `ModelOverrides`: `scope` is the layer, `stage` the key, `model_slug` is `model`, `fallback_slugs` is `fallbacks`, `params` is `params` (rename `max_tokens` to `maxTokens`, `web.max_results` to `web.maxResults`).

### Tasks (`TaskId`)

29 runners, one per prompt. The model stage comes from the prompt's front matter.

| Task | Output | Model stage |
|---|---|---|
| `research.title-research` | JSON research; `sources` from url_citation | research (web plugin) |
| `titles.topic-directions`, `titles.title-options` | JSON | titles |
| `blueprint.blueprint`, `blueprint.regenerate-part` | JSON | blueprint |
| `writing.chapter`, `writing.introduction`, `writing.conclusion` | Markdown string (streamed) | writing |
| `writing.front-matter`, `writing.back-matter`, `writing.rewrite-selection`, `writing.weave-note`, `writing.expand-note` | JSON | writing |
| `checks.claims`, `checks.consistency` | JSON | checks |
| `checks.summarise-and-ledger` | JSON | summarise |
| `editing.structural`, `editing.line-edit-uk`, `editing.voice` | JSON | editing |
| `matter.amazon-description`, `matter.keywords-categories`, `matter.back-cover` | JSON | matter_metadata |
| `cover.cover-brief`, `cover.cover-image` | JSON | cover_brief |
| `marketing.tiktok-scripts`, `marketing.instagram-captions`, `marketing.launch-email` | JSON | marketing |
| `children.picture-book-story` | JSON | writing |
| `children.scene-prompts` | JSON | cover_brief |

Input and output schemas are exported as `StageInputs.*` and `StageOutputs.*` (zod), and per task as `TASKS[task].input` / `.output`. Inputs are nested objects: `profile`, `book`, `blueprint`, `template`, `research`, `sources` (ticked research sources), `previousSummaries`, `ledger`, `cta`, plus task fields such as `chapter`, `nextChapter`, `selection`, `rewrite`, `note`, `weave`, `text`, `section`, `cover`, `brief`, `concept`, `story`, `storyResult`. The packer maps them to prompt variables (`{{chapter.title}}`, `{{research.sources}}`...). Notes:

- A prompt variable you leave out throws `MissingVariableError` naming every missing variable. Pass `null` or `''` for a value that is genuinely empty; it is sent as "None". Variables marked "(may be empty)" in the prompt may be left out.
- `{{houseStyle.*}}`, `{{kdp.*}}` and `{{goLiveNote}}` come from `config/`; `{{patternHits}}` for `checks.claims` is computed from the house-style guardrail patterns when left out.
- `profile.voice` may be a string or voice DNA `{ notes, characteristics[], soundsLike[] (up to 2 sent), notLike, memory[] }`.
- Owner text and web content (`text`, `selection.*`, `note.*`, `weave.*`, `research`, `research.sources`, `book.idea`, `book.quotes`...) are sent inside `<data label="...">` tags.

## Behaviour

- **Streaming:** writing stages stream by default; any task streams when `onDelta` is given. A stream cut after text arrived raises `StreamCutError` in the client; `runStage` calls `onReset` and restarts once.
- **Structured output:** JSON tasks send `response_format: json_schema` (strict false) built from the zod schema when the model lists `structured_outputs`, `json_object` when it lists only `response_format`. If the provider rejects the schema (400), the call is repeated once without it. Answers are validated with zod; one repair request with the zod errors follows a failure, then `InvalidOutputError`.
- **Web search:** stages with `webSearch: true` send the `web` plugin from `config/models.defaults.json` (`engine: native`, `max_results: 8`). Sources come only from `url_citation` annotations (`url`, `title`, `content` as snippet), deduplicated by URL and numbered S1.. in order. Links on a search grounding redirect host (only `vertexaisearch.cloud.google.com`, see `src/sources.ts`) are resolved with one GET per link, `redirect: 'manual'`, a 5 s timeout and only the `Location` header read; the target page is never fetched. A resolved source gets the final `url`, its `domain` and the original `redirectUrl`, and keeps the annotation title; a failed lookup keeps the original link with `unresolved: true`. The setting `RESOLVE_SOURCE_REDIRECTS=false` (or the service option `resolveSourceRedirects: false`, which wins) switches lookups off: redirect links are kept and marked unresolved. Blank counts as unset (on); a value other than true or false fails when the service is created. Sources are then merged by final URL and renumbered S1... Research evidence ids that match no source are reported as warnings.
- **Fallbacks:** never silent. An unavailable model throws `ModelUnavailableError` with `nextFallback` to offer the owner. With `allowFallback: true` the next fallback is used and `fallbackUsed` is true.
- **Context packing:** if the rendered request passes 60% of the model's context length, source excerpts go first, then older chapter summaries shrink to 40 words, then voice samples drop to one; then `ContextTooLargeError`. Token count is estimated at four characters per token.
- **Cost:** `usage.cost` from OpenRouter, else computed from cached model prices. Estimates need the model list (`listModels()`), otherwise `estimateUsd` is null and the budget check cannot block on price.
- **Retries:** network errors, 408, 429, 5xx and 502/503: up to 3 retries at 2 s, 10 s and 60 s with jitter; `Retry-After` wins. The OpenAI SDK's own retries are off.
- **Errors** (`AiError.kind`): `auth` (401), `budget` (402 credits, or a budget cap), `refusal` (403, content filter), `model_unavailable` (404, invalid model 400, 502/503 after retries), `rate_limit`, `timeout`, `network`, `server`, `bad_request`, `invalid_output`, `stream_cut`, `aborted`, `context_too_large`, `missing_variable`, `prompt`, `config`. A failure after some calls carries `details.usage` so the cost can still be logged.
<!-- house-style:off -->
- **Guardrails** (`StageResult.guardrails`): house-style `guardrailPatterns` (claims-report patterns go to `claims`, ISBN/award/bestseller/review/guarantee to `blocking`, dashes to `autofix`), ISBNs other than `book.isbns`, links that are not research sources or profile links, `[[S<n>]]` markers with no source, and banned phrases with inflections. Check prompts and the structural edit skip guardrails; cover and scene prompts skip the banned phrase check.
- **Style rewrite:** when the guardrails find banned phrases, `runStage` sends one more call on the same model (`prompts/system/style-rewrite.v<N>.md`, no web search, not streamed) naming the exact phrases and asking for the same structure. A JSON answer must pass the stage schema; a Markdown answer must keep its heading levels; otherwise the first answer is kept. Guardrails run again; banned phrases left move from `blocking` to `needsAttention` (the stage does not fail) and `styleRewrite` says what happened. The extra call counts in `usage` and `calls`. When the rewrite is used and `onDelta` is set, `onReset` fires and the new text arrives in one `onDelta`. Research is internal notes (`styleRewrite: false` in `TASKS`): it gets no rewrite, and its banned phrases are reported in `warnings`. `guardrails.rules` lists every rule that hit (rule id, list, count, message, up to 10 matches) so the UI can name them.
<!-- house-style:on -->

## Lower-level exports

`OpenRouterClient` (chat, generateImage, listModels, keyStatus), `MockProvider`, `ModelRegistry`, `PromptLoader`, `chatStructured`, `runGuardrails`, `checkText`, `packAndRender`, `buildVariables`, `loadConfig`, `configVariables`, `mapModel`, `withRetry` and the error classes. See `src/index.ts`.

The provider interface:

```ts
interface AiProvider {
  readonly name: 'openrouter' | 'mock';
  chat(req: ChatRequest): Promise<ChatResult>;   // stream: true + onDelta for streaming
  generateImage(req: ImageRequest): Promise<ImageResult>;
  listModels(signal?: AbortSignal): Promise<ModelInfo[]>;
  keyStatus(signal?: AbortSignal): Promise<KeyStatus>;
}
```

This differs from the sketch in `docs/02-ARCHITECTURE.md` (separate `stream()` method): streaming is `chat({ stream: true, onDelta })`.

`ModelInfo`: `{ slug, name, contextLength, maxCompletionTokens, pricing: { inputPerMillion, outputPerMillion, imageInputPerMillion, imageOutputPerMillion, webSearchPerRequest, perRequest }, inputModalities, outputModalities, supportedParameters, supportsTools, supportsStructured, supportsSearch, supportsImageOutput, aliasTarget }`. `supportsSearch` means native search is priced for the model; the web plugin gives any model search through Exa.

## Mock provider

Used in tests and whenever no key is set. Fixtures are looked up in `tests/fixtures/ai/` (if present) and `packages/ai/test/fixtures/` as `<promptId>.<inputHash>.json`, `<promptId>.json` or `<stage>/<promptId>.json`, shaped `{ "content": string | object, "annotations"?: [{ url, title, content }], "model"?: string }`. The style rewrite call first looks for `<promptId>.style-rewrite.json`; without it the mock repeats the first answer. Without a fixture it answers with a minimal valid object built from the request's JSON schema, or neutral Markdown. Streams in chunks. Fixed cost 0.0001 USD per call, 0.001 per image. Fault scenarios: `rate_limit` and `server_error` (first call per prompt), `invalid_json` (first call), `invalid_json_always`, `stream_cut` (first call), `refusal`, `model_missing`, `slow`, `no_sources`.

## Documentation checked (4 October 2026)

- Context7 `/openrouterteam/docs`: web search plugin and url_citation annotations, POST /api/v1/images, usage accounting and the final usage chunk in streams.
- Context7 `/websites/developers_openai_api`: OpenAI SDK client and chat completions.
- https://openrouter.ai/docs/features/web-search (plugin fields `id`, `engine`, `max_results`, `search_prompt`; `:online` suffix; annotation shape `{ type: 'url_citation', url_citation: { url, title, content, start_index, end_index } }`).
- https://openrouter.ai/docs/api-reference/overview (headers `HTTP-Referer` and `X-OpenRouter-Title`, `X-Title` still accepted; `response_format` json_schema).
- https://openrouter.ai/docs/api-reference/errors (400, 401, 402, 403, 408, 429, 502, 503; mid-stream error chunk with `finish_reason: 'error'`).
- https://openrouter.ai/docs/api-reference/streaming (`: OPENROUTER PROCESSING` comments, usage in the final chunk, cancellation only for some providers).
- https://openrouter.ai/docs/api-reference/limits (honour `Retry-After`, exponential backoff, GET /api/v1/key).
- https://openrouter.ai/docs/features/structured-outputs (json_schema with `strict`; support varies by provider).
- https://openrouter.ai/docs/features/multimodal/image-generation (POST /api/v1/images: `model`, `prompt`, `n`, `aspect_ratio`, `resolution`, `output_format`; `data[].b64_json`, `media_type`, `usage.cost`; failed generations are not billed).
- https://openrouter.ai/api/v1/models (public list, read without a key: 466 models; every default and fallback slug in `config/models.defaults.json` was listed).

SDK in use: `openai` 7.28.0 for chat completions (base URL set to OpenRouter, SDK retries off). Images, models and key status use `fetch`, because those endpoints are OpenRouter-only.

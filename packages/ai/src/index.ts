// Public API of @volume/ai. Server side only: apps/web must never import this package.

export { createAiService, STYLE_REWRITE_PROMPT_ID } from './service.ts';
export type {
  AiService,
  BudgetLimit,
  CallRecord,
  CostEstimate,
  CreateAiServiceOptions,
  GenerateImageOptions,
  GenerateImageResult,
  RunStageOptions,
  StageResult,
} from './service.ts';

export { OpenRouterClient, OPENROUTER_BASE_URL, errorFromStatus, sourcesFromAnnotations } from './provider/openrouter.ts';
export type { OpenRouterClientOptions } from './provider/openrouter.ts';
export { MockProvider, mockModelInfo } from './provider/mock.ts';
export type { MockProviderOptions } from './provider/mock.ts';
export { mapModel, mapUsage, computeCost } from './provider/models.ts';
export { withRetry, parseRetryAfter, DEFAULT_DELAYS_MS } from './provider/retry.ts';
export type { RetryOptions } from './provider/retry.ts';
export { sampleFromSchema } from './provider/sample.ts';

export { ModelRegistry, mergeOverrides } from './registry.ts';
export type { ChoiceSource, ModelOverrides, ResolveOptions, ResolvedStage, StageChoice, StageOverrides } from './registry.ts';

export { PromptLoader, parsePromptFile, renderTemplate, toPromptValue } from './prompts.ts';
export type { PromptFile, PromptMeta, RenderOptions, RenderedPrompt } from './prompts.ts';

export { loadConfig, loadModelsDefaults, loadHouseStyle, loadKdpRules, configVariables, ModelsDefaultsSchema } from './config.ts';
export type { ConfigBundle, HouseStyle, KdpRules, ModelsDefaults, StageConfig } from './config.ts';

export {
  buildVariables,
  packAndRender,
  assignSourceIds,
  formatSources,
  formatSummaries,
  formatLedger,
  formatProfileFacts,
  formatProfileField,
  formatVoice,
  formatExercisePlan,
  FENCED_VARIABLES,
  PACK_LEVELS,
} from './context.ts';
export type { PackLevel, PackedPrompt } from './context.ts';

export {
  runGuardrails,
  checkText,
  formatPatternHits,
  compilePatterns,
  emptyReport,
  finaliseReport,
  savedTextReport,
  scaffoldingOpeners,
  describeOpeners,
  authorAnecdoteApplies,
} from './guardrails.ts';
export type {
  GuardrailContext,
  GuardrailHit,
  GuardrailReport,
  GuardrailRuleSummary,
  GuardrailSeverity,
  OpenerHit,
  OpenerReport,
  StyleRewriteReport,
} from './guardrails.ts';

export {
  resolveSources,
  resolveRedirect,
  parseBooleanSetting,
  RESOLVE_SOURCE_REDIRECTS_SETTING,
  isGroundingRedirect,
  domainOf,
  GROUNDING_REDIRECT_HOSTS,
  DEFAULT_RESOLVE_TIMEOUT_MS,
} from './sources.ts';
export type { ResolveSourcesOptions, ResolveSourcesResult } from './sources.ts';

export { chatStructured, extractJson, validateJson, jsonSchemaOf, responseFormatFor, JSON_REPAIR_PROMPT_ID } from './structured.ts';
export type { StructuredResult, Validation } from './structured.ts';

export { TASKS, TASK_IDS, TEMPLATE_TASKS, isTaskId, taskForTemplate } from './stages/tasks.ts';
export type { GuardrailMode, TaskDef, TaskId, TaskInput, TaskOutput } from './stages/tasks.ts';
export * as StageInputs from './stages/inputs.ts';
export * as StageOutputs from './stages/outputs.ts';

export { IMAGE_PURPOSES, MAX_IMAGE_SEED, assertSeed, modelTakesReferences, modelTakesSeed, seedFromKey, toImageReference } from './images.ts';
export type { ImagePurpose, ImageReferenceInput } from './images.ts';

export * from './errors.ts';
export * from './types.ts';

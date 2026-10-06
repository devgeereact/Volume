// Typed errors. Every error the AI layer throws is an AiError with a `kind` the server can switch on.

import type { Usage } from './types.ts';

export type AiErrorKind =
  | 'auth'
  | 'rate_limit'
  | 'budget'
  | 'invalid_output'
  | 'model_unavailable'
  | 'timeout'
  | 'network'
  | 'server'
  | 'bad_request'
  | 'refusal'
  | 'aborted'
  | 'stream_cut'
  | 'output_truncated'
  | 'context_too_large'
  | 'missing_variable'
  | 'prompt'
  | 'config';

export interface AiErrorInit {
  status?: number | undefined;
  retryable?: boolean | undefined;
  details?: Record<string, unknown> | undefined;
  cause?: unknown;
  /** What the calls made before this error cost (paid even though the step failed). */
  usage?: Usage | undefined;
}

export class AiError extends Error {
  readonly kind: AiErrorKind;
  readonly status: number | undefined;
  readonly retryable: boolean;
  readonly details: Record<string, unknown> | undefined;
  /**
   * The usage of every call made for this step before it failed (first answer, repair, retries). Set by
   * the layer that knows the calls, so the server can record the spend of a failed step.
   */
  usage: Usage | undefined;

  constructor(kind: AiErrorKind, message: string, init: AiErrorInit = {}) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'AiError';
    this.kind = kind;
    this.status = init.status;
    this.retryable = init.retryable ?? false;
    this.details = init.details;
    this.usage = init.usage;
  }
}

export class AuthError extends AiError {
  constructor(message = 'OpenRouter rejected the API key.', init: AiErrorInit = {}) {
    super('auth', message, init);
    this.name = 'AuthError';
  }
}

export class RateLimitError extends AiError {
  readonly retryAfterMs: number | undefined;
  constructor(message: string, retryAfterMs: number | undefined, init: AiErrorInit = {}) {
    super('rate_limit', message, { ...init, retryable: true });
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

/** A budget cap would be passed (reason 'cap'), or OpenRouter reports too few credits (reason 'credits', HTTP 402). */
export class BudgetError extends AiError {
  readonly reason: 'cap' | 'credits';
  readonly estimateUsd: number | undefined;
  readonly remainingUsd: number | undefined;
  constructor(
    message: string,
    reason: 'cap' | 'credits',
    extra: { estimateUsd?: number | undefined; remainingUsd?: number | undefined } = {},
    init: AiErrorInit = {},
  ) {
    super('budget', message, init);
    this.name = 'BudgetError';
    this.reason = reason;
    this.estimateUsd = extra.estimateUsd;
    this.remainingUsd = extra.remainingUsd;
  }
}

export class InvalidOutputError extends AiError {
  readonly issues: string[];
  readonly raw: string;
  constructor(message: string, issues: string[], raw: string, init: AiErrorInit = {}) {
    super('invalid_output', message, init);
    this.name = 'InvalidOutputError';
    this.issues = issues;
    this.raw = raw;
  }
}

/** The model is missing, gone or has no provider. `nextFallback` is offered to the owner; the app never switches silently. */
export class ModelUnavailableError extends AiError {
  readonly model: string;
  readonly stage: string | undefined;
  readonly nextFallback: string | undefined;
  constructor(message: string, model: string, extra: { stage?: string | undefined; nextFallback?: string | undefined } = {}, init: AiErrorInit = {}) {
    super('model_unavailable', message, init);
    this.name = 'ModelUnavailableError';
    this.model = model;
    this.stage = extra.stage;
    this.nextFallback = extra.nextFallback;
  }
}

export class TimeoutError extends AiError {
  constructor(message = 'The request timed out.', init: AiErrorInit = {}) {
    super('timeout', message, { ...init, retryable: true });
    this.name = 'TimeoutError';
  }
}

export class NetworkError extends AiError {
  constructor(message: string, init: AiErrorInit = {}) {
    super('network', message, { ...init, retryable: true });
    this.name = 'NetworkError';
  }
}

export class ServerError extends AiError {
  constructor(message: string, init: AiErrorInit = {}) {
    super('server', message, { ...init, retryable: true });
    this.name = 'ServerError';
  }
}

export class BadRequestError extends AiError {
  constructor(message: string, init: AiErrorInit = {}) {
    super('bad_request', message, init);
    this.name = 'BadRequestError';
  }
}

/** Moderation block (HTTP 403) or a content refusal from the model. */
export class RefusalError extends AiError {
  constructor(message: string, init: AiErrorInit = {}) {
    super('refusal', message, init);
    this.name = 'RefusalError';
  }
}

export class AbortedError extends AiError {
  constructor(message = 'The request was cancelled.', init: AiErrorInit = {}) {
    super('aborted', message, init);
    this.name = 'AbortedError';
  }
}

/** The stream stopped after text had arrived. Discard the partial text and retry. */
export class StreamCutError extends AiError {
  readonly partialText: string;
  constructor(message: string, partialText: string, init: AiErrorInit = {}) {
    super('stream_cut', message, { ...init, retryable: true });
    this.name = 'StreamCutError';
    this.partialText = partialText;
  }
}

/**
 * The answer hit max_tokens (finish_reason "length"), often because reasoning used up the room. The text
 * is incomplete, so it is never parsed, repaired or saved. `usage` is what the cut-off call cost.
 */
export class OutputTruncatedError extends AiError {
  readonly partialText: string;
  readonly maxTokens: number | null;
  readonly finishReason: string | null;
  readonly nativeFinishReason: string | null;
  constructor(
    message: string,
    extra: { partialText: string; maxTokens: number | null; finishReason: string | null; nativeFinishReason: string | null },
    init: AiErrorInit = {},
  ) {
    super('output_truncated', message, init);
    this.name = 'OutputTruncatedError';
    this.partialText = extra.partialText;
    this.maxTokens = extra.maxTokens;
    this.finishReason = extra.finishReason;
    this.nativeFinishReason = extra.nativeFinishReason;
  }
}

export class ContextTooLargeError extends AiError {
  readonly estimatedTokens: number;
  readonly limitTokens: number;
  constructor(estimatedTokens: number, limitTokens: number) {
    super(
      'context_too_large',
      `The packed request needs about ${estimatedTokens} tokens but the model allows ${limitTokens} for input. Pick a model with a larger context.`,
    );
    this.name = 'ContextTooLargeError';
    this.estimatedTokens = estimatedTokens;
    this.limitTokens = limitTokens;
  }
}

export class MissingVariableError extends AiError {
  readonly variables: string[];
  readonly promptId: string;
  constructor(promptId: string, variables: string[]) {
    super('missing_variable', `Prompt ${promptId} is missing required variables: ${variables.join(', ')}`);
    this.name = 'MissingVariableError';
    this.promptId = promptId;
    this.variables = variables;
  }
}

export class PromptError extends AiError {
  constructor(message: string) {
    super('prompt', message);
    this.name = 'PromptError';
  }
}

export class ConfigError extends AiError {
  constructor(message: string) {
    super('config', message);
    this.name = 'ConfigError';
  }
}

export function isAiError(e: unknown): e is AiError {
  return e instanceof AiError;
}

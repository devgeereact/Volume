import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export type ErrorCode =
  | 'validation_failed'
  | 'not_found'
  | 'conflict'
  | 'unauthorized'
  | 'forbidden'
  | 'rate_limited'
  | 'bad_host'
  | 'bad_origin'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'budget_exceeded'
  | 'model_unavailable'
  | 'provider_error'
  | 'invalid_state'
  | 'title_limit'
  | 'quality_gate'
  | 'not_implemented'
  | 'internal_error';

const STATUS: Record<ErrorCode, number> = {
  validation_failed: 400,
  not_found: 404,
  conflict: 409,
  unauthorized: 401,
  forbidden: 403,
  rate_limited: 429,
  bad_host: 421,
  bad_origin: 403,
  payload_too_large: 413,
  unsupported_media_type: 415,
  budget_exceeded: 402,
  model_unavailable: 503,
  provider_error: 502,
  invalid_state: 409,
  // Volume mode (P8-2): a slot over KDP's weekly title limit, and a book that has not passed preflight and claims review.
  title_limit: 409,
  quality_gate: 409,
  not_implemented: 501,
  internal_error: 500,
};

export class AppError extends Error {
  readonly statusCode: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = STATUS[code];
  }
}

export function notFound(what: string): AppError {
  return new AppError('not_found', `${what} was not found.`);
}

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function errorBody(code: string, message: string, details?: unknown): ErrorBody {
  return details === undefined ? { error: { code, message } } : { error: { code, message, details } };
}

/** Validates input with zod and turns failures into a typed 400. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new AppError(
      'validation_failed',
      'Some fields are missing or not valid.',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** Answers a not-found GET with the web app shell when it can (hosted mode); returns false to fall through to 404. */
export type NotFoundFallback = (req: FastifyRequest, reply: FastifyReply) => boolean;

export function registerErrorHandling(app: FastifyInstance, fallback?: NotFoundFallback): void {
  app.setNotFoundHandler((req, reply) => {
    if (fallback?.(req, reply)) return;
    void reply.code(404).send(errorBody('not_found', 'There is nothing at this address.'));
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      void reply.code(err.statusCode).send(errorBody(err.code, err.message, err.details));
      return;
    }
    if (err instanceof z.ZodError) {
      void reply.code(400).send(
        errorBody(
          'validation_failed',
          'Some fields are missing or not valid.',
          err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    const fe = err as FastifyError;
    if (fe.code === 'FST_ERR_CTP_BODY_TOO_LARGE') {
      void reply.code(413).send(errorBody('payload_too_large', 'The upload is larger than the allowed size.'));
      return;
    }
    if (fe.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      void reply.code(415).send(errorBody('unsupported_media_type', 'Send JSON with Content-Type: application/json.'));
      return;
    }
    if (fe.statusCode === 429) {
      void reply.code(429).send(errorBody('rate_limited', 'Too many requests. Wait a minute, then try again.'));
      return;
    }
    if (typeof fe.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
      void reply.code(fe.statusCode).send(errorBody('validation_failed', 'The request could not be read.'));
      return;
    }
    // Log the error without the request body or headers. The response never carries the stack or the message.
    req.log.error({ err: { message: err.message, name: err.name, stack: err.stack } }, 'request failed');
    void reply.code(500).send(errorBody('internal_error', 'Something went wrong on the server. Try again.'));
  });
}

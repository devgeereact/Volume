import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { assertCanWrite, assertRole, hasRole } from '../auth/context.js';
import { AppError, parse } from '../http/errors.js';
import type { Job } from '../jobs/queue.js';

export const IdParams = z.object({ id: z.string().min(1).max(64) });

export function idOf(req: FastifyRequest): string {
  return parse(IdParams, req.params).id;
}

export function writer(req: FastifyRequest): void {
  assertCanWrite(req.ctx);
}

/** Owner-only actions: settings, budgets, members and pen name bios (D-047). */
export function owner(req: FastifyRequest): void {
  assertRole(req.ctx, 'owner');
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === 'object') {
    return Object.fromEntries(
      Object.keys(v)
        .sort()
        .map((k) => [k, stable((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** True for the workspace owner. */
export function isOwner(req: FastifyRequest): boolean {
  return hasRole(req.ctx, 'owner');
}

/** True when two JSON values are the same, whatever the key order. */
export function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(stable(a ?? null)) === JSON.stringify(stable(b ?? null));
}

/**
 * Model choice spends the owner's key, so it is the owner's (AUTH-MODEL, audit M2). An editor's value is kept as it
 * is: a request that leaves it out or repeats it passes (forms send the whole object); one that changes it is refused.
 * Returns the value to store.
 */
export function guardModels(req: FastifyRequest, next: unknown, current: unknown): unknown {
  if (isOwner(req)) return next;
  if (next === undefined || sameJson(next, current)) return current;
  throw new AppError('forbidden', 'Only the workspace owner can choose AI models.');
}

/** Long work returns 202 with the job (docs/02, request flow step 5). */
export function accepted(reply: FastifyReply, job: Job): { jobId: string; job: Job } {
  void reply.code(202);
  return { jobId: job.id, job };
}

export const EmptyBody = z.object({}).strict().optional();

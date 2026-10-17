import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { assertCanWrite, assertRole } from '../auth/context.js';
import { parse } from '../http/errors.js';
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

/** Long work returns 202 with the job (docs/02, request flow step 5). */
export function accepted(reply: FastifyReply, job: Job): { jobId: string; job: Job } {
  void reply.code(202);
  return { jobId: job.id, job };
}

export const EmptyBody = z.object({}).strict().optional();

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { parse } from '../http/errors.js';
import { JobInsights } from '../jobs/eta.js';
import { openSseStream } from '../sse/stream.js';
import { idOf, writer } from './common.js';

/** How often an open event stream re-checks that the caller is still a member of the workspace. */
export const SSE_MEMBERSHIP_RECHECK_MS = 60_000;

export function jobRoutes(app: FastifyInstance, s: AppServices): void {
  const insights = new JobInsights(s.db, s.runner);

  app.get('/jobs/:id', async (req) => {
    const job = await s.queue.require(req.ctx, idOf(req));
    const children = await s.queue.list(req.ctx, { parentId: job.id, limit: 1000 });
    // etaMs and model are filled for writing jobs (write_book and write_section); null otherwise.
    const extras = await insights.forJobs(req.ctx, [job, ...children]);
    const none = { etaMs: null, model: null };
    return {
      ...job,
      ...(extras.get(job.id) ?? none),
      children: children.map((c) => ({
        id: c.id,
        kind: c.kind,
        status: c.status,
        progress: c.progress,
        error: c.error,
        errorCode: c.errorCode,
        ...(extras.get(c.id) ?? none),
      })),
    };
  });

  app.get('/books/:id/jobs', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const q = parse(z.object({ status: z.string().max(32).optional(), limit: z.coerce.number().int().min(1).max(500).default(50) }), req.query);
    const filter: { projectId: string; status?: string; limit: number } = { projectId: id, limit: q.limit };
    if (q.status) filter.status = q.status;
    const items = await s.queue.list(req.ctx, filter);
    const extras = await insights.forJobs(req.ctx, items);
    return { items: items.map((j) => ({ ...j, ...(extras.get(j.id) ?? { etaMs: null, model: null }) })) };
  });

  app.post('/jobs/:id/cancel', async (req) => {
    writer(req);
    return s.queue.cancel(req.ctx, idOf(req));
  });

  app.post('/jobs/:id/pause', async (req) => {
    writer(req);
    return s.queue.pause(req.ctx, idOf(req));
  });

  app.post('/jobs/:id/resume', async (req) => {
    writer(req);
    return s.queue.resume(req.ctx, idOf(req));
  });

  // ---------- SSE ----------

  const stream = async (req: FastifyRequest, reply: FastifyReply, projectId: string | null): Promise<void> => {
    const q = parse(z.object({ lastEventId: z.string().max(64).optional() }), req.query);
    const header = req.headers['last-event-id'];
    const lastEventId = (typeof header === 'string' ? header : undefined) ?? q.lastEventId ?? null;
    reply.hijack();
    const ctx = req.ctx;
    await openSseStream(reply.raw, {
      bus: s.bus,
      workspaceId: ctx.workspaceId,
      projectId,
      lastEventId,
      // A long-lived stream outlives the per-request membership check: re-check it, and close for a removed member.
      stillAllowed: () => s.repos.members.isMember(ctx),
      recheckMs: SSE_MEMBERSHIP_RECHECK_MS,
    });
  };

  app.get('/books/:id/events', async (req, reply) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    await stream(req, reply, id);
  });

  app.get('/events', async (req, reply) => {
    const q = parse(z.object({ projectId: z.string().max(64).optional(), lastEventId: z.string().max(64).optional() }), req.query);
    if (q.projectId) await s.repos.books.require(req.ctx, q.projectId);
    await stream(req, reply, q.projectId ?? null);
  });
}

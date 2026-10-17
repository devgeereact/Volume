import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { parse } from '../http/errors.js';
import { MemoryInputSchema, MemoryPatchSchema, ProfileInputSchema, ProfilePatchSchema, SampleInputSchema, SamplePatchSchema } from '../repos/profiles.js';
import { idOf, owner, writer } from './common.js';

const SubParams = z.object({ id: z.string().min(1).max(64), subId: z.string().min(1).max(64) });

/** Pen name bios are the owner's words (About the author is printed word for word), so only the owner sets them (D-047). */
function touchesBio(body: { bioThirdPerson?: unknown; shortBio?: unknown; bioStatus?: unknown }): boolean {
  return body.bioThirdPerson !== undefined || body.shortBio !== undefined || body.bioStatus !== undefined;
}

export function profileRoutes(app: FastifyInstance, s: AppServices): void {
  const r = s.repos.profiles;

  app.get('/profiles', async (req) => {
    const q = parse(z.object({ status: z.enum(['active', 'archived']).optional(), includeArchived: z.enum(['true', 'false']).optional() }), req.query);
    const opts: { includeArchived?: boolean; status?: string } = { includeArchived: q.includeArchived === 'true' };
    if (q.status) opts.status = q.status;
    return { items: await r.list(req.ctx, opts) };
  });

  app.post('/profiles', async (req, reply) => {
    writer(req);
    const body = parse(ProfileInputSchema, req.body);
    if (touchesBio(body)) owner(req);
    void reply.code(201);
    return r.create(req.ctx, body);
  });

  app.get('/profiles/:id', async (req) => r.require(req.ctx, idOf(req)));

  app.patch('/profiles/:id', async (req) => {
    writer(req);
    const patch = parse(ProfilePatchSchema, req.body);
    if (touchesBio(patch)) owner(req);
    return r.update(req.ctx, idOf(req), patch);
  });

  app.post('/profiles/:id/archive', async (req) => {
    writer(req);
    return r.setStatus(req.ctx, idOf(req), 'archived');
  });

  app.post('/profiles/:id/restore', async (req) => {
    writer(req);
    return r.setStatus(req.ctx, idOf(req), 'active');
  });

  // Owner-confirmed delete: archived first, no books, body { confirm: "<exact pen name>" }. 409 otherwise.
  app.delete('/profiles/:id', async (req, reply) => {
    writer(req);
    const body = parse(z.object({ confirm: z.string().max(300).default('') }), req.body ?? {});
    await r.deleteArchived(req.ctx, idOf(req), body.confirm);
    return reply.code(204).send();
  });

  // samples
  app.get('/profiles/:id/samples', async (req) => ({ items: await r.listSamples(req.ctx, idOf(req)) }));
  app.post('/profiles/:id/samples', async (req, reply) => {
    writer(req);
    void reply.code(201);
    return r.addSample(req.ctx, idOf(req), parse(SampleInputSchema, req.body));
  });
  app.patch('/profiles/:id/samples/:subId', async (req) => {
    writer(req);
    const p = parse(SubParams, req.params);
    return r.updateSample(req.ctx, p.id, p.subId, parse(SamplePatchSchema, req.body));
  });
  app.delete('/profiles/:id/samples/:subId', async (req, reply) => {
    writer(req);
    const p = parse(SubParams, req.params);
    await r.deleteSample(req.ctx, p.id, p.subId);
    return reply.code(204).send();
  });

  // memory
  app.get('/profiles/:id/memory', async (req) => ({ items: await r.listMemory(req.ctx, idOf(req)) }));
  app.post('/profiles/:id/memory', async (req, reply) => {
    writer(req);
    void reply.code(201);
    return r.addMemory(req.ctx, idOf(req), parse(MemoryInputSchema, req.body));
  });
  app.delete('/profiles/:id/memory/:subId', async (req, reply) => {
    writer(req);
    const p = parse(SubParams, req.params);
    await r.deleteMemory(req.ctx, p.id, p.subId);
    return reply.code(204).send();
  });
  app.patch('/profiles/:id/memory/:subId', async (req) => {
    writer(req);
    const p = parse(SubParams, req.params);
    return r.updateMemory(req.ctx, p.id, p.subId, parse(MemoryPatchSchema, req.body));
  });
}

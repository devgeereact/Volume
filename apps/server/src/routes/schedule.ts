import type { FastifyInstance } from 'fastify';
import type { AppServices } from '../app.js';
import { loadTitleLimit } from '../config/kdp-rules.js';
import { parse } from '../http/errors.js';
import { assertQualityGate } from '../jobs/quality-gate.js';
import { ScheduleQuerySchema, SlotInputSchema } from '../repos/schedule.js';
import { idOf, writer } from './common.js';

/**
 * The title schedule (P8-2, D-046). One workspace is one KDP account: every pen name in it shares KDP's limit of new
 * titles per format per period, read from config/kdp-rules (rule titles.creationLimit), never typed in.
 */
export function scheduleRoutes(app: FastifyInstance, s: AppServices): void {
  const r = s.repos.schedule;

  app.get('/schedule', async (req) => {
    const q = parse(ScheduleQuerySchema, req.query);
    const limit = await loadTitleLimit(s.configDir);
    return { from: q.from ?? null, to: q.to ?? null, limit, items: await r.list(req.ctx, q) };
  });

  // 201 with the slot, or 409 title_limit with the conflicting slots and the next free time.
  app.post('/schedule/slots', async (req, reply) => {
    writer(req);
    const body = parse(SlotInputSchema, req.body);
    const slot = await r.add(req.ctx, body, await loadTitleLimit(s.configDir));
    void reply.code(201);
    return slot;
  });

  // Confirms a planned release only after the quality gate (409 quality_gate otherwise).
  app.post('/schedule/slots/:id/confirm', async (req) => {
    writer(req);
    const slot = await r.require(req.ctx, idOf(req));
    await assertQualityGate(s, req.ctx, slot.bookId, 'scheduled');
    return r.confirm(req.ctx, slot.id);
  });

  app.delete('/schedule/slots/:id', async (req, reply) => {
    writer(req);
    await r.remove(req.ctx, idOf(req));
    return reply.code(204).send();
  });
}

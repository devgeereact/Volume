import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { AppError, parse } from '../http/errors.js';
import { zipStream } from '../lib/zip.js';
import { WorkspaceData } from '../repos/workspace-data.js';
import { owner } from './common.js';

/** Typed confirmations for the data-rights actions (D-050). The web app asks the person to type them. */
export const CONFIRM = { leave: 'LEAVE', removeMember: 'REMOVE', deleteWorkspace: 'DELETE' } as const;

export const ConfirmBody = z.object({ confirm: z.string().max(100) }).strict();

export function assertConfirmed(body: unknown, expected: string): void {
  const { confirm } = parse(ConfirmBody, body ?? {});
  if (confirm.trim() !== expected) throw new AppError('invalid_state', `Type ${expected} to confirm.`);
}

/** Whole-workspace exports per client IP per minute (on top of the global limit). */
export const WORKSPACE_EXPORT_RATE = { max: 2, timeWindow: 60_000 };

/** Data rights (D-050): a full copy of the workspace, leaving a workspace, and deleting a guest workspace. */
export function accountRoutes(app: FastifyInstance, s: AppServices): void {
  const data = new WorkspaceData(s.db, s.blobs);
  /** One export at a time per workspace, so a stuck download cannot stack up database reads. */
  const exporting = new Set<string>();

  // Owner only. A zip streamed as it is built: workspace.json, tables/<table>.json and files/<id>/<name>.
  app.get('/workspace/export', { config: { rateLimit: WORKSPACE_EXPORT_RATE } }, async (req, reply) => {
    owner(req);
    const ctx = req.ctx;
    if (exporting.has(ctx.workspaceId)) throw new AppError('conflict', 'An export of this workspace is already running. Wait for it to finish.');
    exporting.add(ctx.workspaceId);
    const release = (): void => {
      exporting.delete(ctx.workspaceId);
    };
    let body: Readable;
    try {
      const stream = zipStream(data.exportEntries(ctx));
      body = Readable.from(
        (async function* () {
          try {
            yield* stream;
          } finally {
            release();
          }
        })(),
      );
    } catch (err) {
      release();
      throw err;
    }
    // If the client goes away before the stream starts, the generator never runs its finally.
    reply.raw.once('close', release);
    const day = new Date().toISOString().slice(0, 10);
    return reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="volume-workspace-${day}.zip"`).send(body);
  });

  // An invited editor or viewer leaves the workspace; their account goes when no membership is left.
  app.post('/me/leave', async (req, reply) => {
    assertConfirmed(req.body, CONFIRM.leave);
    await s.repos.members.leave(req.ctx);
    return reply.code(204).send();
  });

  // The owner of a guest (self-publisher) workspace deletes it with every row, file and member account in it.
  app.delete('/workspace', async (req, reply) => {
    owner(req);
    assertConfirmed(req.body, CONFIRM.deleteWorkspace);
    await data.deleteWorkspace(req.ctx, s.ownerCtx.workspaceId);
    return reply.code(204).send();
  });
}

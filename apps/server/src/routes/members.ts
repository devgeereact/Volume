import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import { assertInstanceOwner, isInstanceOwner } from '../auth/context.js';
import { AppError, parse } from '../http/errors.js';
import { InvitationInputSchema, MemberPatchSchema } from '../repos/members.js';
import { idOf, owner } from './common.js';

const UserParams = z.object({ userId: z.string().min(1).max(64) });

/** Accounts and roles (P8-3, D-047). Everything but GET /me is for the workspace owner. */
export function memberRoutes(app: FastifyInstance, s: AppServices): void {
  const r = s.repos.members;
  const mode = s.config.accountsMode;

  // Who is calling, so the web app can hide controls a role cannot use. No other account's details.
  app.get('/me', (req) =>
    Promise.resolve({
      userId: req.ctx.userId,
      workspaceId: req.ctx.workspaceId,
      role: req.ctx.role,
      instanceOwner: isInstanceOwner(req.ctx, s.ownerCtx),
      accountsMode: mode,
    }),
  );

  app.get('/members', async (req) => {
    owner(req);
    return { accountsMode: mode, items: await r.listMembers(req.ctx), invitations: await r.listInvitations(req.ctx, 'pending') };
  });

  app.post('/invitations', async (req, reply) => {
    owner(req);
    if (mode !== 'invite') throw new AppError('invalid_state', 'Invitations are off. Set ACCOUNTS_MODE=invite on the server to turn them on.');
    const body = parse(InvitationInputSchema, req.body);
    // A new self-publisher gets a workspace of their own; only the owner of this Volume can create one.
    if (body.role === 'owner') assertInstanceOwner(req.ctx, s.ownerCtx);
    void reply.code(201);
    return r.invite(req.ctx, body);
  });

  app.delete('/invitations/:id', async (req, reply) => {
    owner(req);
    await r.revokeInvitation(req.ctx, idOf(req));
    return reply.code(204).send();
  });

  app.patch('/members/:userId', async (req) => {
    owner(req);
    const { userId } = parse(UserParams, req.params);
    return r.setRole(req.ctx, userId, parse(MemberPatchSchema, req.body).role);
  });

  app.delete('/members/:userId', async (req, reply) => {
    owner(req);
    const { userId } = parse(UserParams, req.params);
    await r.remove(req.ctx, userId);
    return reply.code(204).send();
  });
}

import type { FastifyRequest } from 'fastify';
import type { Db } from '../db/connect.js';
import { AppError } from '../http/errors.js';
import { newId, now } from '../lib/util.js';

export type Role = 'owner' | 'editor' | 'viewer';

/** Attached to every request and passed to every repository call. */
export interface RequestCtx {
  workspaceId: string;
  userId: string;
  role: Role;
}

/**
 * Resolves who is calling. v1 uses the stub (one owner, one workspace).
 * Phase 8 swaps in a session provider; routes and repos stay the same.
 */
export interface AuthProvider {
  resolve(request: FastifyRequest): Promise<RequestCtx | null>;
}

export class StubAuthProvider implements AuthProvider {
  constructor(private readonly ctx: RequestCtx) {}
  resolve(): Promise<RequestCtx> {
    return Promise.resolve(this.ctx);
  }
}

export function assertCanWrite(ctx: RequestCtx): void {
  if (ctx.role === 'viewer') throw new AppError('forbidden', 'You can view this workspace but not change it.');
}

export const DEFAULT_WORKSPACE_SLUG = 'default';

/** Creates (once) the single owner user and workspace, and returns their context. */
export async function ensureOwner(db: Db, slug = DEFAULT_WORKSPACE_SLUG, name = 'My workspace'): Promise<RequestCtx> {
  const existing = await db.selectFrom('workspaces').select(['id']).where('slug', '=', slug).executeTakeFirst();
  if (existing) {
    const m = await db
      .selectFrom('memberships')
      .select(['userId', 'role'])
      .where('workspaceId', '=', existing.id)
      .where('role', '=', 'owner')
      .orderBy('createdAt')
      .executeTakeFirst();
    if (m) return { workspaceId: existing.id, userId: m.userId, role: 'owner' };
  }
  const t = now();
  const workspaceId = existing?.id ?? newId();
  const userId = newId();
  await db.transaction().execute(async (trx) => {
    if (!existing) {
      await trx.insertInto('workspaces').values({ id: workspaceId, name, slug, createdAt: t, updatedAt: t }).execute();
    }
    await trx
      .insertInto('users')
      .values({
        id: userId,
        email: null,
        displayName: 'Owner',
        authProvider: 'local',
        passwordHash: null,
        lastSeenAt: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    await trx.insertInto('memberships').values({ id: newId(), workspaceId, userId, role: 'owner', createdAt: t, updatedAt: t }).execute();
  });
  return { workspaceId, userId, role: 'owner' };
}

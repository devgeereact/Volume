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

export const ROLES = ['owner', 'editor', 'viewer'] as const satisfies readonly Role[];

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** True when the caller's role is at least `min` (owner > editor > viewer). Unknown roles count as viewer. */
export function hasRole(ctx: RequestCtx, min: Role): boolean {
  return (RANK[ctx.role] ?? 0) >= RANK[min];
}

/**
 * Role check for a route (D-047): owner does everything; editor writes books but not settings, budgets, members or
 * pen name bios; viewer reads only.
 */
export function assertRole(ctx: RequestCtx, min: Role): void {
  if (hasRole(ctx, min)) return;
  throw new AppError('forbidden', min === 'owner' ? 'Only the workspace owner can do this.' : 'You can view this workspace but not change it.');
}

export function assertCanWrite(ctx: RequestCtx): void {
  assertRole(ctx, 'editor');
}

/**
 * Instance-wide actions (whole-database backups, the owner's OpenRouter key): only an owner of the owner's own
 * workspace, never the owner of another self-publisher's workspace.
 */
export function isInstanceOwner(ctx: RequestCtx, instanceOwner: RequestCtx): boolean {
  return ctx.role === 'owner' && ctx.workspaceId === instanceOwner.workspaceId;
}

export function assertInstanceOwner(ctx: RequestCtx, instanceOwner: RequestCtx): void {
  if (!isInstanceOwner(ctx, instanceOwner)) throw new AppError('forbidden', 'Only the owner of this Volume can do this.');
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
        clerkUserId: null,
        createdAt: t,
        updatedAt: t,
      })
      .execute();
    await trx.insertInto('memberships').values({ id: newId(), workspaceId, userId, role: 'owner', createdAt: t, updatedAt: t }).execute();
  });
  return { workspaceId, userId, role: 'owner' };
}

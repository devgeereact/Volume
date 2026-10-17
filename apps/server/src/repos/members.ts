import { z } from 'zod';
import type { RequestCtx, Role } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import { AppError } from '../http/errors.js';
import { newId, now } from '../lib/util.js';

/** editor or viewer joins the inviting workspace; owner is a separate self-publisher with a new workspace (D-047). */
export const INVITE_ROLES = ['owner', 'editor', 'viewer'] as const;
export const MEMBER_ROLES = ['editor', 'viewer'] as const;
export const INVITATION_STATUSES = ['pending', 'accepted', 'revoked'] as const;

export const InvitationInputSchema = z
  .object({
    email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
    role: z.enum(INVITE_ROLES),
  })
  .strict();

export const MemberPatchSchema = z.object({ role: z.enum(MEMBER_ROLES) }).strict();

export interface Member {
  userId: string;
  role: Role;
  displayName: string;
  /** The address the member was invited with, or null (the owner's own accounts). */
  email: string | null;
  /** True once a Clerk account is bound to this user. */
  signedIn: boolean;
  isYou: boolean;
  joinedAt: number;
}

export interface Invitation {
  id: string;
  email: string;
  role: (typeof INVITE_ROLES)[number];
  status: (typeof INVITATION_STATUSES)[number];
  createdAt: number;
  acceptedAt: number | null;
}

type InvitationRow = { id: string; email: string; role: string; status: string; createdAt: number; acceptedAt: number | null };

function toInvitation(r: InvitationRow): Invitation {
  return {
    id: r.id,
    email: r.email,
    role: r.role as Invitation['role'],
    status: r.status as Invitation['status'],
    createdAt: Number(r.createdAt),
    acceptedAt: r.acceptedAt === null ? null : Number(r.acceptedAt),
  };
}

/** Members and invitations. Every method that takes ctx stays inside ctx.workspaceId. */
export class MembersRepo {
  constructor(private readonly db: Db) {}

  async listMembers(ctx: RequestCtx): Promise<Member[]> {
    const rows = await this.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.userId')
      .select(['memberships.userId', 'memberships.role', 'memberships.createdAt', 'users.displayName', 'users.clerkUserId'])
      .where('memberships.workspaceId', '=', ctx.workspaceId)
      .orderBy('memberships.createdAt')
      .execute();
    const invited = await this.db
      .selectFrom('invitations')
      .select(['acceptedUserId', 'email'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('status', '=', 'accepted')
      .execute();
    const emailOf = new Map(invited.filter((i) => i.acceptedUserId !== null).map((i) => [i.acceptedUserId as string, i.email]));
    return rows.map((r) => ({
      userId: r.userId,
      role: r.role as Role,
      displayName: r.displayName,
      email: emailOf.get(r.userId) ?? null,
      signedIn: r.clerkUserId !== null,
      isYou: r.userId === ctx.userId,
      joinedAt: Number(r.createdAt),
    }));
  }

  /** True while ctx.userId still holds a membership in ctx.workspaceId (open event streams re-check this). */
  async isMember(ctx: RequestCtx): Promise<boolean> {
    const row = await this.db
      .selectFrom('memberships')
      .select('id')
      .where('workspaceId', '=', ctx.workspaceId)
      .where('userId', '=', ctx.userId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async listInvitations(ctx: RequestCtx, status?: Invitation['status']): Promise<Invitation[]> {
    let q = this.db.selectFrom('invitations').select(['id', 'email', 'role', 'status', 'createdAt', 'acceptedAt']).where('workspaceId', '=', ctx.workspaceId);
    if (status) q = q.where('status', '=', status);
    return (await q.orderBy('createdAt', 'desc').execute()).map(toInvitation);
  }

  /**
   * One pending invitation per address per workspace: inviting again updates its role. The check and the insert run
   * in one transaction, and the unique (workspace_id, pending_email) index refuses a second pending row if two
   * requests still race; the loser then updates the winner's row.
   */
  async invite(ctx: RequestCtx, input: z.infer<typeof InvitationInputSchema>): Promise<Invitation> {
    const write = (): Promise<string> =>
      this.db.transaction().execute(async (trx) => {
        const t = now();
        const pending = await trx
          .selectFrom('invitations')
          .select(['id'])
          .where('workspaceId', '=', ctx.workspaceId)
          .where('pendingEmail', '=', input.email)
          .executeTakeFirst();
        if (pending) {
          await trx
            .updateTable('invitations')
            .set({ role: input.role, updatedAt: t })
            .where('id', '=', pending.id)
            .where('workspaceId', '=', ctx.workspaceId)
            .execute();
          return pending.id;
        }
        const id = newId();
        await trx
          .insertInto('invitations')
          .values({
            id,
            workspaceId: ctx.workspaceId,
            email: input.email,
            pendingEmail: input.email,
            role: input.role,
            status: 'pending',
            invitedBy: ctx.userId,
            acceptedUserId: null,
            acceptedAt: null,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
        return id;
      });
    let id: string;
    try {
      id = await write();
    } catch {
      // A parallel invite of the same address won the unique index: update its row instead.
      id = await write();
    }
    return this.requireInvitation(ctx, id);
  }

  async requireInvitation(ctx: RequestCtx, id: string): Promise<Invitation> {
    const row = await this.db
      .selectFrom('invitations')
      .select(['id', 'email', 'role', 'status', 'createdAt', 'acceptedAt'])
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirst();
    if (!row) throw new AppError('not_found', 'Invitation not found.');
    return toInvitation(row);
  }

  async revokeInvitation(ctx: RequestCtx, id: string): Promise<void> {
    const inv = await this.requireInvitation(ctx, id);
    if (inv.status !== 'pending') throw new AppError('invalid_state', 'Only a pending invitation can be withdrawn. Remove the member instead.');
    await this.db
      .updateTable('invitations')
      .set({ status: 'revoked', pendingEmail: null, updatedAt: now() })
      .where('id', '=', id)
      .where('workspaceId', '=', ctx.workspaceId)
      .execute();
  }

  private async requireOtherMember(ctx: RequestCtx, userId: string): Promise<{ role: Role }> {
    if (userId === ctx.userId) throw new AppError('invalid_state', 'You cannot change or remove your own membership.');
    const row = await this.db
      .selectFrom('memberships')
      .select(['role'])
      .where('workspaceId', '=', ctx.workspaceId)
      .where('userId', '=', userId)
      .executeTakeFirst();
    if (!row) throw new AppError('not_found', 'Member not found.');
    if (row.role === 'owner') throw new AppError('invalid_state', "An owner's account is set by the owner allowlist, not here.");
    return { role: row.role as Role };
  }

  async setRole(ctx: RequestCtx, userId: string, role: (typeof MEMBER_ROLES)[number]): Promise<Member> {
    await this.requireOtherMember(ctx, userId);
    await this.db.updateTable('memberships').set({ role, updatedAt: now() }).where('workspaceId', '=', ctx.workspaceId).where('userId', '=', userId).execute();
    const m = (await this.listMembers(ctx)).find((x) => x.userId === userId);
    if (!m) throw new AppError('not_found', 'Member not found.');
    return m;
  }

  /** Removes the membership; the accepted invitation is marked revoked so it can never admit the account again. */
  async remove(ctx: RequestCtx, userId: string): Promise<void> {
    await this.requireOtherMember(ctx, userId);
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('memberships').where('workspaceId', '=', ctx.workspaceId).where('userId', '=', userId).execute();
      await trx
        .updateTable('invitations')
        .set({ status: 'revoked', pendingEmail: null, updatedAt: now() })
        .where('workspaceId', '=', ctx.workspaceId)
        .where('acceptedUserId', '=', userId)
        .execute();
    });
  }
}

/**
 * Sign-in side of invitations (no request ctx yet: the caller is identified by Clerk and verified email addresses).
 * Used only by the Clerk auth provider when ACCOUNTS_MODE=invite, and only for an account with no membership yet:
 * one Volume account has one membership (D-047). When the addresses match pending invitations from several
 * workspaces, the instance owner's workspace (`preferWorkspaceId`) wins, then the oldest invitation. The others stay
 * pending and never admit the account while it has a membership.
 */
export async function acceptInvitation(db: Db, clerkUserId: string, emails: string[], preferWorkspaceId?: string): Promise<RequestCtx | null> {
  const lower = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (lower.length === 0) return null;
  const pendingFor = (workspaceId?: string) => {
    let q = db.selectFrom('invitations').select(['id', 'workspaceId', 'role', 'email']).where('status', '=', 'pending').where('email', 'in', lower);
    if (workspaceId) q = q.where('workspaceId', '=', workspaceId);
    return q.orderBy('createdAt').orderBy('id').executeTakeFirst();
  };
  const inv = (preferWorkspaceId ? await pendingFor(preferWorkspaceId) : undefined) ?? (await pendingFor());
  if (!inv) return null;
  const role = inv.role as Role;
  const t = now();
  return db.transaction().execute(async (trx) => {
    // Claim the invitation first, so two racing sign-ins cannot both use it.
    const claimed = await trx
      .updateTable('invitations')
      .set({ status: 'accepted', pendingEmail: null, acceptedAt: t, updatedAt: t })
      .where('id', '=', inv.id)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (Number(claimed.numUpdatedRows) !== 1) return null;
    const existing = await trx.selectFrom('users').select(['id']).where('clerkUserId', '=', clerkUserId).executeTakeFirst();
    const userId = existing?.id ?? newId();
    if (!existing) {
      await trx
        .insertInto('users')
        .values({
          id: userId,
          email: null,
          displayName: role === 'owner' ? 'Owner' : 'Member',
          authProvider: 'clerk',
          passwordHash: null,
          lastSeenAt: null,
          clerkUserId,
          createdAt: t,
          updatedAt: t,
        })
        .execute();
    }
    let workspaceId = inv.workspaceId;
    if (role === 'owner') {
      // A separate self-publisher: a workspace of their own, never the inviting one.
      workspaceId = newId();
      await trx
        .insertInto('workspaces')
        .values({ id: workspaceId, name: 'My workspace', slug: `ws-${workspaceId.toLowerCase()}`, createdAt: t, updatedAt: t })
        .execute();
    }
    await trx.insertInto('memberships').values({ id: newId(), workspaceId, userId, role, createdAt: t, updatedAt: t }).execute();
    await trx.updateTable('invitations').set({ acceptedUserId: userId }).where('id', '=', inv.id).execute();
    return { workspaceId, userId, role };
  });
}

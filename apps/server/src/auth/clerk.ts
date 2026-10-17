import { createClerkClient } from '@clerk/backend';
import type { FastifyRequest } from 'fastify';
import type { ClerkSettings } from '../config/env.js';
import type { Db } from '../db/connect.js';
import { AppError } from '../http/errors.js';
import { newId, now } from '../lib/util.js';
import { acceptInvitation } from '../repos/members.js';
import type { AuthProvider, RequestCtx, Role } from './context.js';

/** Checks the Clerk session token on a request. Null means signed out (missing, expired or invalid token). */
export interface ClerkVerifier {
  verify(request: FastifyRequest): Promise<{ userId: string } | null>;
}

/** Looks up a Clerk user's verified email addresses (Clerk Backend API). Used when OWNER_EMAILS is set or ACCOUNTS_MODE=invite. */
export interface ClerkUserLookup {
  verifiedEmails(userId: string): Promise<string[]>;
}

export interface ClerkKeys {
  publishableKey: string;
  secretKey?: string | undefined;
  /** PEM public key for networkless verification. */
  jwtKey?: string | undefined;
}

/** Builds a WHATWG Request from the Fastify request: the headers (cookie, authorization) are all Clerk reads. */
function toFetchRequest(req: FastifyRequest, origin: string): Request {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Request(new URL(req.url, origin), { method: 'GET', headers });
}

/** The real verifier: @clerk/backend authenticateRequest, networkless when CLERK_JWT_KEY is set. */
export function createClerkVerifier(keys: ClerkKeys, settings: ClerkSettings, origin: string): ClerkVerifier {
  const client = createClerkClient({
    publishableKey: keys.publishableKey,
    telemetry: { disabled: true },
    ...(keys.secretKey ? { secretKey: keys.secretKey } : {}),
    ...(keys.jwtKey ? { jwtKey: keys.jwtKey } : {}),
  });
  return {
    async verify(req) {
      const state = await client.authenticateRequest(toFetchRequest(req, origin), {
        authorizedParties: settings.authorizedParties,
        ...(keys.jwtKey ? { jwtKey: keys.jwtKey } : {}),
      });
      if (!state.isAuthenticated) return null;
      const auth = state.toAuth();
      const userId = auth && 'userId' in auth ? auth.userId : null;
      return typeof userId === 'string' && userId.length > 0 ? { userId } : null;
    },
  };
}

/** The real email lookup through the Clerk Backend API (needs CLERK_SECRET_KEY). */
export function createClerkUserLookup(keys: { publishableKey: string; secretKey: string }): ClerkUserLookup {
  const client = createClerkClient({ publishableKey: keys.publishableKey, secretKey: keys.secretKey, telemetry: { disabled: true } });
  return {
    async verifiedEmails(userId) {
      const user = await client.users.getUser(userId);
      return user.emailAddresses.filter((e) => e.verification?.status === 'verified').map((e) => e.emailAddress.toLowerCase());
    },
  };
}

const ALLOW_TTL_MS = 10 * 60 * 1000;

/**
 * Hosted sign-in. Every /api request carries a Clerk session (Bearer token or the __session cookie).
 * - No valid session: null, which the app answers with 401.
 * - Signed in but not on the allowlist (CLERK_ALLOWED_USER_IDS, OWNER_EMAILS): 403.
 * - Allowed: the Volume user bound to that Clerk user. The first allowed sign-in binds the existing local owner,
 *   so the owner's library stays theirs; a further allowed Clerk user gets its own user row with owner rights in the
 *   same workspace. The allowlist names the owner's own accounts only (D-047).
 * - ACCOUNTS_MODE=invite (D-047): an account that is not on the allowlist gets in only through the owner's invitation,
 *   matched on a verified email address. It lands in the invited workspace with the invited role (or, for an owner
 *   invitation, in a new workspace of its own), never as an owner of the owner's workspace. Its membership is read
 *   on every request and never cached, so a removed member gets 403 on the next request.
 */
export class ClerkAuthProvider implements AuthProvider {
  private readonly emailCache = new Map<string, { emails: string[]; at: number }>();
  private readonly ctxCache = new Map<string, RequestCtx>();

  constructor(
    private readonly db: Db,
    private readonly owner: RequestCtx,
    private readonly settings: ClerkSettings,
    private readonly verifier: ClerkVerifier,
    private readonly lookup: ClerkUserLookup | null,
    private readonly accountsMode: 'owner-only' | 'invite' = 'owner-only',
  ) {}

  async resolve(req: FastifyRequest): Promise<RequestCtx | null> {
    let session: { userId: string } | null;
    try {
      session = await this.verifier.verify(req);
    } catch (err) {
      req.log.warn({ err: { message: err instanceof Error ? err.message : 'unknown' } }, 'Clerk token check failed');
      session = null;
    }
    if (!session) return null;
    if (await this.isAllowed(session.userId, req)) {
      const cached = this.ctxCache.get(session.userId);
      if (cached) return cached;
      const ctx = await this.bind(session.userId);
      this.ctxCache.set(session.userId, ctx);
      return ctx;
    }
    if (this.accountsMode === 'invite') {
      const invited = await this.invitedCtx(session.userId, req);
      if (invited) return invited;
    }
    throw new AppError('forbidden', 'This account is not allowed to use Volume.');
  }

  private async isAllowed(userId: string, req: FastifyRequest): Promise<boolean> {
    if (this.settings.allowedUserIds.includes(userId)) return true;
    if (this.settings.ownerEmails.length === 0) return false;
    const emails = await this.emailsOf(userId, req);
    return emails !== null && emails.some((e) => this.settings.ownerEmails.includes(e));
  }

  /** Verified addresses, cached for ten minutes. Null when Clerk could not be asked (not cached, so the next request asks again). */
  private async emailsOf(userId: string, req: FastifyRequest): Promise<string[] | null> {
    if (!this.lookup) return null;
    const hit = this.emailCache.get(userId);
    if (hit && Date.now() - hit.at < ALLOW_TTL_MS) return hit.emails;
    let emails: string[];
    try {
      emails = (await this.lookup.verifiedEmails(userId)).map((e) => e.toLowerCase());
    } catch (err) {
      req.log.warn({ err: { message: err instanceof Error ? err.message : 'unknown' } }, 'Clerk user lookup failed');
      return null;
    }
    this.emailCache.set(userId, { emails, at: Date.now() });
    return emails;
  }

  /** An invited account: its current membership, or the first sign-in that accepts a pending invitation. */
  private async invitedCtx(clerkUserId: string, req: FastifyRequest): Promise<RequestCtx | null> {
    const member = await this.ctxFor(clerkUserId);
    if (member) return member;
    const emails = await this.emailsOf(clerkUserId, req);
    if (!emails || emails.length === 0) return null;
    // The instance owner's own invitation wins over any other workspace's (one membership per account, D-047).
    const accepted = await acceptInvitation(this.db, clerkUserId, emails, this.owner.workspaceId);
    // null also when a parallel request claimed the same invitation first; that request created the membership.
    return accepted ?? (await this.ctxFor(clerkUserId));
  }

  /**
   * The account's membership. One Volume account has one membership (D-047): sign-in only accepts an invitation for
   * an account without one. Should older data hold several, the instance owner's workspace wins, then the oldest.
   */
  private async ctxFor(userId: string): Promise<RequestCtx | null> {
    const rows = await this.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.userId')
      .select(['memberships.workspaceId', 'memberships.userId', 'memberships.role'])
      .where('users.clerkUserId', '=', userId)
      .orderBy('memberships.createdAt')
      .limit(20)
      .execute();
    const row = rows.find((r) => r.workspaceId === this.owner.workspaceId) ?? rows[0];
    return row ? { workspaceId: row.workspaceId, userId: row.userId, role: row.role as Role } : null;
  }

  private async bind(clerkUserId: string): Promise<RequestCtx> {
    const known = await this.ctxFor(clerkUserId);
    if (known) return known;
    const t = now();
    // First allowed sign-in: bind the local owner (only while unbound, so two racing requests cannot both bind it).
    await this.db
      .updateTable('users')
      .set({ clerkUserId, authProvider: 'clerk', updatedAt: t })
      .where('id', '=', this.owner.userId)
      .where('clerkUserId', 'is', null)
      .execute();
    const bound = await this.ctxFor(clerkUserId);
    if (bound) return bound;
    const userId = newId();
    try {
      await this.db.transaction().execute(async (trx) => {
        await trx
          .insertInto('users')
          .values({
            id: userId,
            email: null,
            displayName: 'Owner',
            authProvider: 'clerk',
            passwordHash: null,
            lastSeenAt: null,
            clerkUserId,
            createdAt: t,
            updatedAt: t,
          })
          .execute();
        await trx
          .insertInto('memberships')
          .values({ id: newId(), workspaceId: this.owner.workspaceId, userId, role: 'owner', createdAt: t, updatedAt: t })
          .execute();
      });
    } catch (err) {
      // A parallel request created it first (unique clerk_user_id).
      const raced = await this.ctxFor(clerkUserId);
      if (raced) return raced;
      throw err;
    }
    return { workspaceId: this.owner.workspaceId, userId, role: 'owner' };
  }
}

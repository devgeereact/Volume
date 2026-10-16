import { createClerkClient } from '@clerk/backend';
import type { FastifyRequest } from 'fastify';
import type { ClerkSettings } from '../config/env.js';
import type { Db } from '../db/connect.js';
import { AppError } from '../http/errors.js';
import { newId, now } from '../lib/util.js';
import type { AuthProvider, RequestCtx, Role } from './context.js';

/** Checks the Clerk session token on a request. Null means signed out (missing, expired or invalid token). */
export interface ClerkVerifier {
  verify(request: FastifyRequest): Promise<{ userId: string } | null>;
}

/** Looks up a Clerk user's verified email addresses (Clerk Backend API). Only used when OWNER_EMAILS is set. */
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
 *   same workspace. Workspaces and roles stay as they are, ready for more self-publishers later.
 */
export class ClerkAuthProvider implements AuthProvider {
  private readonly allowCache = new Map<string, { allowed: boolean; at: number }>();
  private readonly ctxCache = new Map<string, RequestCtx>();

  constructor(
    private readonly db: Db,
    private readonly owner: RequestCtx,
    private readonly settings: ClerkSettings,
    private readonly verifier: ClerkVerifier,
    private readonly lookup: ClerkUserLookup | null,
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
    if (!(await this.isAllowed(session.userId, req))) {
      throw new AppError('forbidden', 'This account is not allowed to use Volume.');
    }
    const cached = this.ctxCache.get(session.userId);
    if (cached) return cached;
    const ctx = await this.bind(session.userId);
    this.ctxCache.set(session.userId, ctx);
    return ctx;
  }

  private async isAllowed(userId: string, req: FastifyRequest): Promise<boolean> {
    if (this.settings.allowedUserIds.includes(userId)) return true;
    if (this.settings.ownerEmails.length === 0 || !this.lookup) return false;
    const hit = this.allowCache.get(userId);
    if (hit && Date.now() - hit.at < ALLOW_TTL_MS) return hit.allowed;
    let emails: string[];
    try {
      emails = await this.lookup.verifiedEmails(userId);
    } catch (err) {
      // Clerk unreachable: refuse this time, without caching, so the next request asks again.
      req.log.warn({ err: { message: err instanceof Error ? err.message : 'unknown' } }, 'Clerk user lookup failed');
      return false;
    }
    const allowed = emails.some((e) => this.settings.ownerEmails.includes(e));
    this.allowCache.set(userId, { allowed, at: Date.now() });
    return allowed;
  }

  private async ctxFor(userId: string): Promise<RequestCtx | null> {
    const row = await this.db
      .selectFrom('memberships')
      .innerJoin('users', 'users.id', 'memberships.userId')
      .select(['memberships.workspaceId', 'memberships.userId', 'memberships.role'])
      .where('users.clerkUserId', '=', userId)
      .orderBy('memberships.createdAt')
      .executeTakeFirst();
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

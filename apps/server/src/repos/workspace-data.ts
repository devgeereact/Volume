import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { Database } from '../db/schema.js';
import type { BlobStore } from '../files/blob-store.js';
import { AppError } from '../http/errors.js';
import { now } from '../lib/util.js';
import type { ZipStreamEntry } from '../lib/zip.js';
import { CHILD_TABLES } from './transfer.js';

/**
 * Data rights for a whole workspace (D-050): a full copy for its owner (GET /workspace/export) and erasure of a
 * guest workspace or a departing account. Every query is scoped to the caller's workspace.
 */

/**
 * Every table that holds workspace rows (all have workspace_id and id), in an order that respects their foreign
 * keys: parents first. Deletion runs it backwards. asset_chunks (no id) is handled with assets. A test checks that
 * this list covers every migrated table with a workspace_id column.
 */
export const WORKSPACE_TABLES = [
  'settings',
  'memberships',
  'invitations',
  'authorProfiles',
  'profileSamples',
  'profileMemory',
  'projects',
  ...CHILD_TABLES,
  'assets',
  'batches',
  'batchItems',
  'titleSlots',
  'jobs',
  'jobEvents',
  'promptRuns',
] as const satisfies readonly (keyof Database)[];
export type WorkspaceTable = (typeof WORKSPACE_TABLES)[number];

export const WORKSPACE_EXPORT_FORMAT = 'volume-workspace';
export const WORKSPACE_EXPORT_VERSION = 1;
const PAGE = 500;

/** Statuses of a job that is still going (deleting under it would break it). */
const ACTIVE_JOB = ['queued', 'running', 'waiting', 'paused_budget'];

/** A file name safe inside a zip: no folders, no dot segments, no control characters. */
function safeName(name: string): string {
  const base = name
    .replace(/[\\/]/g, '_')
    .replace(/[^\p{L}\p{N}._ -]/gu, '_')
    .replace(/^\.+/, '_')
    .trim();
  return base.slice(0, 120) || 'file';
}

export class WorkspaceData {
  constructor(
    private readonly db: Db,
    private readonly blobs: BlobStore,
  ) {}

  /** The rows of one table in this workspace as a JSON array, written a page at a time. */
  private async *tableJson(ctx: RequestCtx, table: WorkspaceTable): AsyncGenerator<string> {
    yield '[';
    let after = '';
    let first = true;
    for (;;) {
      const rows = (await this.db
        .selectFrom(table)
        .selectAll()
        .where('workspaceId', '=', ctx.workspaceId)
        .where('id', '>', after)
        .orderBy('id')
        .limit(PAGE)
        .execute()) as { id: string }[];
      for (const r of rows) {
        yield `${first ? '' : ','}\n${JSON.stringify(r)}`;
        first = false;
      }
      const last = rows[rows.length - 1];
      if (rows.length < PAGE || !last) break;
      after = last.id;
    }
    yield '\n]\n';
  }

  /**
   * The zip entries of a full workspace copy: workspace.json (format, the workspace and the caller's own user row),
   * tables/<table>.json for every workspace table, and files/<asset id>/<file name> for every stored file. It
   * includes the private profile fields (legal name, location, real-person flag): this is the owner's own copy of
   * their data, unlike a project zip.
   */
  async *exportEntries(ctx: RequestCtx): AsyncGenerator<ZipStreamEntry> {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select(['id', 'name', 'slug', 'createdAt', 'updatedAt'])
      .where('id', '=', ctx.workspaceId)
      .executeTakeFirstOrThrow();
    const you = await this.db
      .selectFrom('users')
      .select(['id', 'displayName', 'authProvider', 'clerkUserId', 'lastSeenAt', 'createdAt', 'updatedAt'])
      .where('id', '=', ctx.userId)
      .executeTakeFirst();
    const manifest = {
      format: WORKSPACE_EXPORT_FORMAT,
      version: WORKSPACE_EXPORT_VERSION,
      exportedAt: now(),
      workspace,
      you: you ? { ...you, role: ctx.role } : null,
      tables: WORKSPACE_TABLES.map((t) => `tables/${t}.json`),
      files: 'files/<asset id>/<file name>; metadata in tables/assets.json',
    };
    yield { name: 'workspace.json', source: () => [Buffer.from(JSON.stringify(manifest, null, 2))] };
    for (const table of WORKSPACE_TABLES) yield { name: `tables/${table}.json`, source: () => this.tableJson(ctx, table) };
    let after = '';
    for (;;) {
      const assets = await this.db
        .selectFrom('assets')
        .select(['id', 'filename'])
        .where('workspaceId', '=', ctx.workspaceId)
        .where('status', '=', 'ready')
        .where('id', '>', after)
        .orderBy('id')
        .limit(PAGE)
        .execute();
      for (const a of assets) {
        const blobs = this.blobs;
        yield {
          name: `files/${a.id}/${safeName(a.filename)}`,
          source: async function* () {
            const { body } = await blobs.stream(ctx, a.id);
            for await (const chunk of body) yield chunk as Buffer;
          },
        };
      }
      const last = assets[assets.length - 1];
      if (assets.length < PAGE || !last) break;
      after = last.id;
    }
  }

  /** Refuses while a job of this workspace is still queued or running. */
  async assertNoActiveJobs(ctx: RequestCtx): Promise<void> {
    const active = await this.db
      .selectFrom('jobs')
      .select('id')
      .where('workspaceId', '=', ctx.workspaceId)
      .where('status', 'in', ACTIVE_JOB)
      .executeTakeFirst();
    if (active) throw new AppError('invalid_state', 'A job is still running in this workspace. Cancel it, then try again.');
  }

  /**
   * Deletes a whole workspace and every row and file in it, then the accounts of its members that belong to no
   * other workspace. Invitations they accepted elsewhere are marked revoked so they can never admit them again.
   * The caller checks who may do this; the instance owner's workspace is refused here as a second lock.
   */
  async deleteWorkspace(ctx: RequestCtx, instanceWorkspaceId: string): Promise<{ deletedUsers: number }> {
    if (ctx.workspaceId === instanceWorkspaceId) throw new AppError('forbidden', "The owner's own workspace cannot be deleted.");
    await this.assertNoActiveJobs(ctx);
    const w = ctx.workspaceId;
    return this.db.transaction().execute(async (trx) => {
      const members = (await trx.selectFrom('memberships').select('userId').where('workspaceId', '=', w).execute()).map((m) => m.userId);
      await trx.deleteFrom('assetChunks').where('workspaceId', '=', w).execute();
      for (const table of [...WORKSPACE_TABLES].reverse()) await trx.deleteFrom(table).where('workspaceId', '=', w).execute();
      const deletedUsers = await eraseOrphanAccounts(trx, members);
      await trx.deleteFrom('workspaces').where('id', '=', w).execute();
      return { deletedUsers };
    });
  }
}

/**
 * Deletes the user rows among `userIds` that hold no membership any more (account deletion, D-050), and marks the
 * invitations they accepted as revoked. Returns how many accounts were deleted.
 */
export async function eraseOrphanAccounts(db: Db, userIds: readonly string[]): Promise<number> {
  let deleted = 0;
  for (const userId of new Set(userIds)) {
    const still = await db.selectFrom('memberships').select('id').where('userId', '=', userId).executeTakeFirst();
    if (still) continue;
    await db.updateTable('invitations').set({ status: 'revoked', pendingEmail: null, updatedAt: now() }).where('acceptedUserId', '=', userId).execute();
    const res = await db.deleteFrom('users').where('id', '=', userId).executeTakeFirst();
    deleted += Number(res.numDeletedRows);
  }
  return deleted;
}

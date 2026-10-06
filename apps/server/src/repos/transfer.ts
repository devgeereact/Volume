import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { Database } from '../db/schema.js';
import type { BlobStore } from '../files/blob-store.js';
import { AppError, notFound } from '../http/errors.js';
import { readZip, writeZip, type ZipEntry } from '../lib/zip.js';
import { newId, now } from '../lib/util.js';

/**
 * Moving a book between Volume databases: POST /books/:id/export-project writes a zip with project.json (the book,
 * its pen name and every row under it) and assets/<id> (the files), and POST /projects/import loads one into the
 * caller's workspace with new ids. Jobs, job events and AI call records are not moved; ids that point at them are
 * cleared.
 */

export const PROJECT_FORMAT = 'volume-project';
export const PROJECT_FORMAT_VERSION = 1;

/** Tables under a book, in an order that respects their foreign keys. */
const CHILD_TABLES = [
  'researchRuns',
  'researchSources',
  'titleSets',
  'blueprints',
  'sections',
  'sectionVersions',
  'suggestions',
  'authorNotes',
  'storyLedger',
  'checkResults',
  'claims',
  'covers',
  'listings',
  'marketingItems',
  'exports',
] as const satisfies readonly (keyof Database)[];
type ChildTable = (typeof CHILD_TABLES)[number];

type Row = Record<string, unknown>;

interface ProjectFile {
  format: string;
  version: number;
  exportedAt: number;
  project: Row;
  profile: Row;
  tables: Partial<Record<ChildTable, Row[]>>;
  assets: Row[];
}

/** Config ids (book types, themes, cover styles) stay as they are. */
const KEEP_IDS = new Set(['bookTypeId', 'interiorThemeId', 'coverStyleId', 'defaultBookTypeId']);
/** JSON columns that may hold row ids (asset ids in cover concepts, ids in job payload-like data). */
const JSON_KEYS = new Set([
  'concepts',
  'brief',
  'typography',
  'wrapSpec',
  'preflight',
  'location',
  'input',
  'output',
  'options',
  'directions',
  'data',
  'plan',
  'settings',
  'extras',
]);
const ULID = /[0-9A-HJKMNP-TV-Z]{26}/g;

export interface ImportResult {
  bookId: string;
  profileId: string;
  profileCreated: boolean;
  rows: number;
  assets: number;
}

export class ProjectTransfer {
  constructor(
    private readonly db: Db,
    private readonly blobs: BlobStore,
  ) {}

  async exportProject(ctx: RequestCtx, bookId: string): Promise<{ filename: string; zip: Buffer }> {
    const project = await this.db.selectFrom('projects').selectAll().where('id', '=', bookId).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    if (!project) throw notFound('Book');
    const profile = await this.db
      .selectFrom('authorProfiles')
      .selectAll()
      .where('id', '=', project.profileId)
      .where('workspaceId', '=', ctx.workspaceId)
      .executeTakeFirstOrThrow();
    const tables: ProjectFile['tables'] = {};
    for (const t of CHILD_TABLES) {
      // Every child table has project_id and workspace_id (see the migrations).
      tables[t] = await this.db.selectFrom(t).selectAll().where('projectId', '=', bookId).where('workspaceId', '=', ctx.workspaceId).execute();
    }
    const assets = await this.db.selectFrom('assets').selectAll().where('projectId', '=', bookId).where('workspaceId', '=', ctx.workspaceId).execute();
    const entries: ZipEntry[] = [];
    for (const a of assets) {
      const { data } = await this.blobs.read(ctx, a.id);
      entries.push({ name: `assets/${a.id}`, data });
    }
    const file: ProjectFile = {
      format: PROJECT_FORMAT,
      version: PROJECT_FORMAT_VERSION,
      exportedAt: now(),
      project: project,
      profile: profile,
      tables,
      assets: assets,
    };
    entries.unshift({ name: 'project.json', data: Buffer.from(JSON.stringify(file)) });
    const slug =
      (project.title ?? project.idea ?? 'book')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'book';
    return { filename: `${slug}.volume-project.zip`, zip: writeZip(entries) };
  }

  /** An active profile in this workspace that is the same pen name as the exported one, if any. */
  private async findMatchingProfile(ctx: RequestCtx, exported: Row): Promise<string | null> {
    const base = () => this.db.selectFrom('authorProfiles').select('id').where('workspaceId', '=', ctx.workspaceId).where('status', '=', 'active');
    const id = typeof exported['id'] === 'string' ? exported['id'] : null;
    if (id) {
      const p = await base().where('id', '=', id).executeTakeFirst();
      if (p) return p.id;
    }
    const sourceKey = typeof exported['sourceKey'] === 'string' && exported['sourceKey'] ? exported['sourceKey'] : null;
    if (sourceKey) {
      const p = await base().where('sourceKey', '=', sourceKey).executeTakeFirst();
      if (p) return p.id;
    }
    const penName = typeof exported['penName'] === 'string' ? exported['penName'].trim() : '';
    if (penName) {
      const rows = await base().where('penName', '=', penName).execute();
      if (rows.length === 1 && rows[0]) return rows[0].id;
    }
    return null;
  }

  async importProject(ctx: RequestCtx, zip: Buffer, opts: { profileId?: string | null } = {}): Promise<ImportResult> {
    let entries: ZipEntry[];
    try {
      entries = readZip(zip);
    } catch (e) {
      throw new AppError('validation_failed', e instanceof Error ? e.message : 'This is not a Volume project file.');
    }
    const manifest = entries.find((e) => e.name === 'project.json');
    let file: ProjectFile;
    try {
      file = JSON.parse(Buffer.from(manifest?.data ?? new Uint8Array()).toString('utf8')) as ProjectFile;
    } catch {
      throw new AppError('validation_failed', 'This is not a Volume project file (project.json is missing or unreadable).');
    }
    if (file?.format !== PROJECT_FORMAT || typeof file.project !== 'object' || typeof file.profile !== 'object')
      throw new AppError('validation_failed', 'This is not a Volume project file.');
    if (file.version > PROJECT_FORMAT_VERSION)
      throw new AppError('validation_failed', 'This project file comes from a newer Volume. Update Volume, then import it.');

    const ids = new Map<string, string>();
    const files = new Map(entries.map((e) => [e.name, e.data]));

    // Pen name: an existing one when asked; else the matching active one in this workspace
    // (same id, then same seeded source key, then same pen name); else a copy of the exported one.
    let profileId: string;
    let profileCreated = false;
    if (opts.profileId) {
      const p = await this.db
        .selectFrom('authorProfiles')
        .select('id')
        .where('id', '=', opts.profileId)
        .where('workspaceId', '=', ctx.workspaceId)
        .executeTakeFirst();
      if (!p) throw notFound('Profile');
      profileId = p.id;
    } else {
      const match = await this.findMatchingProfile(ctx, file.profile);
      if (match) {
        profileId = match;
      } else {
        profileId = newId();
        profileCreated = true;
      }
    }
    ids.set(String(file.profile['id']), profileId);
    const bookId = newId();
    ids.set(String(file.project['id']), bookId);
    for (const t of CHILD_TABLES) for (const r of file.tables[t] ?? []) ids.set(String(r['id']), newId());

    const t = now();
    let rows = 0;
    let assetCount = 0;
    const map = (row: Row): Row => this.remap(row, ids, ctx, t);
    await this.db.transaction().execute(async (trx) => {
      if (profileCreated) {
        const profile: Row = { ...map(file.profile), sourceKey: null, status: 'active', archivedAt: null };
        await trx
          .insertInto('authorProfiles')
          .values(profile as never)
          .execute();
      }
      const project: Row = {
        ...map(file.project),
        profileId,
        status: file.project['status'] === 'archived' ? 'active' : file.project['status'],
        archivedAt: null,
      };
      await trx
        .insertInto('projects')
        .values(project as never)
        .execute();
    });
    // Files first (the blob store gives them their ids), then every row that may point at them.
    for (const a of file.assets ?? []) {
      const data = files.get(`assets/${String(a['id'])}`);
      if (!data) continue;
      const meta = await this.blobs.put(
        ctx,
        {
          kind: typeof a['kind'] === 'string' ? a['kind'] : 'other',
          filename: typeof a['filename'] === 'string' ? a['filename'] : 'file',
          mime: typeof a['mime'] === 'string' ? a['mime'] : 'application/octet-stream',
          projectId: bookId,
          aiGenerated: Number(a['aiGenerated']) === 1,
          width: typeof a['width'] === 'number' ? a['width'] : null,
          height: typeof a['height'] === 'number' ? a['height'] : null,
          dpi: typeof a['dpi'] === 'number' ? a['dpi'] : null,
        },
        data,
      );
      ids.set(String(a['id']), meta.id);
      assetCount += 1;
    }
    await this.db.transaction().execute(async (trx) => {
      for (const table of CHILD_TABLES) {
        for (const r of file.tables[table] ?? []) {
          await trx
            .insertInto(table)
            .values(map(r) as never)
            .execute();
          rows += 1;
        }
      }
    });
    return { bookId, profileId, profileCreated, rows: rows + 1, assets: assetCount };
  }

  /** New ids, this workspace, and links to rows that were not moved cleared. */
  private remap(row: Row, ids: Map<string, string>, ctx: RequestCtx, t: number): Row {
    const out: Row = {};
    for (const [k, v] of Object.entries(row)) {
      if (k === 'workspaceId') out[k] = ctx.workspaceId;
      else if (k === 'id') out[k] = ids.get(String(v)) ?? newId();
      else if (k.endsWith('Id') && !KEEP_IDS.has(k)) out[k] = typeof v === 'string' ? (ids.get(v) ?? null) : null;
      else if (k === 'approvedBy') out[k] = v === null ? null : ctx.userId;
      else if (JSON_KEYS.has(k) && typeof v === 'string') out[k] = v.replace(ULID, (m) => ids.get(m) ?? m);
      else out[k] = v;
    }
    out['updatedAt'] = t;
    return out;
  }
}

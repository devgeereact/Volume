import { z } from 'zod';
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
export const CHILD_TABLES = [
  'researchRuns',
  'researchSources',
  'titleSets',
  'blueprints',
  'sections',
  // Picture books (migration 0006): character sheets and their reference pictures.
  'pictureCharacters',
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

/**
 * Private profile fields that never leave the server in a project zip (D-050, DATA-MODEL: the legal name is never
 * exported). An import without them gets the column defaults (no legal name or location, not a real person).
 */
export const PRIVATE_PROFILE_FIELDS = ['legalName', 'location', 'isRealPerson'] as const;

/** The profile row as a project zip carries it: the private fields removed. */
export function exportableProfile(profile: Row): Row {
  const out: Row = { ...profile };
  for (const key of PRIVATE_PROFILE_FIELDS) delete out[key];
  return out;
}

const RowSchema = z.record(z.string(), z.union([z.string(), z.number().finite(), z.null()]));
const ProjectFileSchema = z
  .object({
    format: z.literal(PROJECT_FORMAT),
    version: z.number().int().min(1),
    exportedAt: z.number().finite(),
    project: RowSchema,
    profile: RowSchema,
    tables: z.object(Object.fromEntries(CHILD_TABLES.map((table) => [table, z.array(RowSchema).max(100000).optional()]))).strict(),
    assets: z.array(RowSchema).max(10000),
  })
  .strict();
const camel = (name: string): string => name.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());

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
  'brand',
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
    const brand: unknown = JSON.parse(profile.brand);
    const photoId =
      typeof brand === 'object' && brand !== null && 'photoAssetId' in brand && typeof brand.photoAssetId === 'string' ? brand.photoAssetId : null;
    if (photoId && !assets.some((asset) => asset.id === photoId)) {
      const photo = await this.db
        .selectFrom('assets')
        .selectAll()
        .where('id', '=', photoId)
        .where('profileId', '=', profile.id)
        .where('workspaceId', '=', ctx.workspaceId)
        .executeTakeFirst();
      if (photo) assets.push(photo);
    }
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
      profile: exportableProfile(profile),
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
    let raw: unknown;
    try {
      if (!manifest || manifest.data.byteLength > 8 * 1024 * 1024) throw new Error('Invalid manifest');
      raw = JSON.parse(Buffer.from(manifest.data).toString('utf8'));
    } catch {
      throw new AppError('validation_failed', 'This is not a Volume project file (project.json is missing or unreadable).');
    }
    const parsed = ProjectFileSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('validation_failed', 'This project file has invalid data.');
    const file = parsed.data as ProjectFile;
    if (file.version > PROJECT_FORMAT_VERSION)
      throw new AppError('validation_failed', 'This project file comes from a newer Volume. Update Volume, then import it.');
    await this.validateRows(file);

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
        // Only the owner confirms a bio (D-047): a pen name an editor brings in waits for the owner's confirmation.
        if (ctx.role !== 'owner') profile['bioStatus'] = 'to_confirm';
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
      // Use the same connection for every write, including the file metadata and chunks.
      const blobs = this.blobs.withTransaction(trx);
      // Files first (the blob store gives them their ids), then every row that may point at them.
      for (const a of file.assets ?? []) {
        const data = files.get(`assets/${String(a['id'])}`);
        if (!data) throw new AppError('validation_failed', 'The project file is missing an attached file.');
        const meta = await blobs.put(
          ctx,
          {
            kind: typeof a['kind'] === 'string' ? a['kind'] : 'other',
            filename: typeof a['filename'] === 'string' ? a['filename'] : 'file',
            mime: typeof a['mime'] === 'string' ? a['mime'] : 'application/octet-stream',
            projectId: a['projectId'] === null ? null : bookId,
            profileId: a['profileId'] ? profileId : null,
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
      if (profileCreated) {
        const brand = map(file.profile)['brand'];
        if (typeof brand === 'string') await trx.updateTable('authorProfiles').set({ brand }).where('id', '=', profileId).execute();
      }
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

  /** Validate against the actual migrated columns before opening a write transaction. */
  private async validateRows(file: ProjectFile): Promise<void> {
    const tables = await this.db.introspection.getTables();
    const ids = new Set<string>();
    const groups = [
      { name: 'authorProfiles', rows: [file.profile] },
      { name: 'projects', rows: [file.project] },
      { name: 'assets', rows: file.assets },
      ...CHILD_TABLES.map((name) => ({ name, rows: file.tables[name] ?? [] })),
    ];
    for (const group of groups) {
      const table = tables.find((entry) => camel(entry.name) === group.name);
      if (!table) throw new AppError('validation_failed', 'This project uses an unsupported table.');
      const shape: Record<string, z.ZodType> = {};
      for (const column of table.columns) {
        let field: z.ZodType = /int|real|double|float|decimal|numeric/i.test(column.dataType) ? z.number().finite() : z.string();
        if (column.isNullable) field = field.nullable();
        if (column.hasDefaultValue || column.isAutoIncrementing || column.isNullable) field = field.optional();
        shape[camel(column.name)] = field;
      }
      const schema = z.object(shape).strict();
      for (const row of group.rows) {
        if (!schema.safeParse(row).success || typeof row['id'] !== 'string' || !row['id'] || ids.has(row['id']))
          throw new AppError('validation_failed', `This project has invalid ${group.name} data.`);
        ids.add(row['id']);
        if (
          group.name !== 'authorProfiles' &&
          group.name !== 'projects' &&
          row['projectId'] !== file.project['id'] &&
          !(group.name === 'assets' && row['projectId'] === null && row['profileId'] === file.profile['id'])
        )
          throw new AppError('validation_failed', 'This project contains rows from a different book.');
      }
    }
    if (file.project['profileId'] !== file.profile['id']) throw new AppError('validation_failed', 'This project has an invalid author reference.');
    for (const group of groups)
      for (const row of group.rows)
        for (const [key, value] of Object.entries(row)) {
          if (
            key.endsWith('Id') &&
            !KEEP_IDS.has(key) &&
            key !== 'workspaceId' &&
            key !== 'promptRunId' &&
            key !== 'jobId' &&
            key !== 'parentJobId' &&
            key !== 'promptId' &&
            key !== 'generationId' &&
            key !== 'userId' &&
            value !== null &&
            value !== undefined &&
            (typeof value !== 'string' || !ids.has(value))
          )
            throw new AppError('validation_failed', `This project has an invalid ${key} reference.`);
        }
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

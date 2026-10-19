import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { Database } from '../db/schema.js';
import type { BlobStore } from '../files/blob-store.js';
import { IMAGE_KINDS, sniffed } from '../files/magic.js';
import { AppError, notFound } from '../http/errors.js';
import { readZip, writeZip, type ZipEntry, type ZipReadLimits } from '../lib/zip.js';
import { newId, now } from '../lib/util.js';
import { APP_VERSION } from '../lib/version.js';

/**
 * Moving a book between Volume databases (D-051): POST /books/:id/export-project writes a zip with manifest.json
 * (format version, app version, pen name, a sha256 and size per file), project.json (the book, its pen name without
 * the private fields and every row under it) and assets/<id> (the files). POST /books/import-project loads one into
 * the caller's workspace under a chosen pen name, with new ids; POST /projects/import is the older route that can
 * also copy the pen name. Jobs, job events, AI call records, spend and built export files are not moved; ids that
 * point at them are cleared.
 */

export const PROJECT_FORMAT = 'volume-project';
export const PROJECT_FORMAT_VERSION = 1;
/** manifest.json format. Raise it when the zip layout changes; an older Volume refuses a newer manifest. */
export const MANIFEST_FORMAT_VERSION = 1;

/**
 * Limits on an uploaded project zip (zip bombs): at most 5,000 entries, 128 MB per expanded file and 256 MB expanded
 * in total. The compressed upload is capped separately by MAX_UPLOAD_BYTES.
 */
export const PROJECT_ZIP_LIMITS: Required<ZipReadLimits> = {
  maxEntries: 5000,
  maxEntryBytes: 128 * 1024 * 1024,
  maxTotalBytes: 256 * 1024 * 1024,
};

/** File types an imported asset may declare. PNG, JPEG, WebP, PDF and zip are checked against their first bytes. */
const IMPORT_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/markdown',
  'text/plain',
  'application/octet-stream',
  'application/zip',
  'application/epub+zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Entry names a project zip may hold; anything else is refused. */
const ENTRY_NAME = /^(manifest\.json|project\.json|assets\/[0-9A-Za-z_-]{1,64})$/;

const ManifestSchema = z
  .object({
    format: z.literal(PROJECT_FORMAT),
    formatVersion: z.number().int().min(1),
    appVersion: z.string().max(64),
    exportedAt: z.number().finite(),
    source: z.object({ penName: z.string().max(500) }).strict(),
    files: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            bytes: z.number().int().min(0),
            sha256: z.string().regex(/^[0-9a-f]{64}$/),
          })
          .strict(),
      )
      .max(PROJECT_ZIP_LIMITS.maxEntries),
  })
  .strict();
export type ProjectManifest = z.infer<typeof ManifestSchema>;

const sha256 = (data: Uint8Array): string => createHash('sha256').update(data).digest('hex');

/** The origin note an imported book carries in its settings, for example "Moved from another Volume on 19 October 2026." */
export function originNote(at: number): string {
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(at);
  return `Moved from another Volume on ${date}.`;
}

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

/** Links to jobs and AI call records, which never move: cleared on export. */
const RUN_LINKS = ['promptRunId', 'jobId', 'parentJobId'] as const;
function withoutRunLinks(row: Row): Row {
  const out: Row = { ...row };
  for (const key of RUN_LINKS) if (key in out) out[key] = null;
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

export interface ImportOptions {
  /** Put the book under this pen name in the caller's workspace (404 when it is not there). */
  profileId?: string | null;
  /** Refuse a zip without manifest.json (POST /books/import-project). A manifest that is present is always checked. */
  requireManifest?: boolean;
}

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
    private readonly limits: Required<ZipReadLimits> = PROJECT_ZIP_LIMITS,
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
      // Built export files are made again on the other Volume; their rows and files stay here.
      if (t === 'exports') continue;
      // Every child table has project_id and workspace_id (see the migrations).
      const rows: Row[] = await this.db.selectFrom(t).selectAll().where('projectId', '=', bookId).where('workspaceId', '=', ctx.workspaceId).execute();
      tables[t] = rows.map(withoutRunLinks);
    }
    const assets: Row[] = (
      await this.db
        .selectFrom('assets')
        .selectAll()
        .where('projectId', '=', bookId)
        .where('workspaceId', '=', ctx.workspaceId)
        .where('kind', '!=', 'export')
        .execute()
    ).map(withoutRunLinks);
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
      if (photo) assets.push(withoutRunLinks(photo));
    }
    const entries: ZipEntry[] = [];
    for (const a of assets) {
      const { data } = await this.blobs.read(ctx, String(a['id']));
      entries.push({ name: `assets/${String(a['id'])}`, data });
    }
    const exportedAt = now();
    const file: ProjectFile = {
      format: PROJECT_FORMAT,
      version: PROJECT_FORMAT_VERSION,
      exportedAt,
      // Spend stays with the Volume that paid for it.
      project: { ...project, costToDateUsd: 0 },
      profile: exportableProfile(profile),
      tables,
      assets,
    };
    entries.unshift({ name: 'project.json', data: Buffer.from(JSON.stringify(file)) });
    const manifest: ProjectManifest = {
      format: PROJECT_FORMAT,
      formatVersion: MANIFEST_FORMAT_VERSION,
      appVersion: APP_VERSION,
      exportedAt,
      // The pen name only: never the legal name, location or real-person flag (D-050).
      source: { penName: profile.penName },
      files: entries.map((e) => ({ name: e.name, bytes: e.data.byteLength, sha256: sha256(e.data) })),
    };
    entries.unshift({ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) });
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

  /**
   * Checks manifest.json against the zip: the format version, and one listed size and sha256 for every other entry,
   * with nothing unlisted and nothing missing.
   */
  private verifyManifest(entries: readonly ZipEntry[], required: boolean): void {
    const entry = entries.find((e) => e.name === 'manifest.json');
    if (!entry) {
      if (required) throw new AppError('validation_failed', 'This is not a Volume project file (manifest.json is missing).');
      return;
    }
    let raw: unknown;
    try {
      if (entry.data.byteLength > 4 * 1024 * 1024) throw new Error('Invalid manifest');
      raw = JSON.parse(Buffer.from(entry.data).toString('utf8'));
    } catch {
      throw new AppError('validation_failed', 'This project file has an unreadable manifest.');
    }
    const parsed = ManifestSchema.safeParse(raw);
    if (!parsed.success) throw new AppError('validation_failed', 'This project file has an invalid manifest.');
    if (parsed.data.formatVersion > MANIFEST_FORMAT_VERSION)
      throw new AppError('validation_failed', 'This project file comes from a newer Volume. Update Volume, then import it.');
    const listed = new Map(parsed.data.files.map((f) => [f.name, f]));
    const others = entries.filter((e) => e !== entry);
    if (listed.size !== parsed.data.files.length || listed.size !== others.length)
      throw new AppError('validation_failed', 'This project file does not match its manifest.');
    for (const e of others) {
      const f = listed.get(e.name);
      if (!f || f.bytes !== e.data.byteLength || f.sha256 !== sha256(e.data))
        throw new AppError('validation_failed', 'This project file failed its checksum check. Export it again.');
    }
  }

  async importProject(ctx: RequestCtx, zip: Buffer, opts: ImportOptions = {}): Promise<ImportResult> {
    let entries: ZipEntry[];
    try {
      entries = readZip(zip, this.limits);
    } catch (e) {
      throw new AppError('validation_failed', e instanceof Error ? e.message : 'This is not a Volume project file.');
    }
    // Zip-slip and stray files: only manifest.json, project.json and assets/<id> may be in a project zip.
    if (entries.some((e) => !ENTRY_NAME.test(e.name))) throw new AppError('validation_failed', 'This project file contains an unexpected file.');
    this.verifyManifest(entries, opts.requireManifest === true);
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
    // Files that belong to the pen name and not the book (the author photo) come only with a copied pen name.
    const assetRows = file.assets.filter((a) => profileCreated || a['projectId'] !== null);
    for (const a of assetRows) this.checkAsset(a, files.get(`assets/${String(a['id'])}`));
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
        // Spend stays with the Volume that paid for it; the budget cap starts again here.
        costToDateUsd: 0,
        settings: withOrigin(file.project['settings'], t),
      };
      await trx
        .insertInto('projects')
        .values(project as never)
        .execute();
      // Use the same connection for every write, including the file metadata and chunks.
      const blobs = this.blobs.withTransaction(trx);
      // Files first (the blob store gives them their ids), then every row that may point at them.
      for (const a of assetRows) {
        const data = files.get(`assets/${String(a['id'])}`);
        if (!data) throw new AppError('validation_failed', 'The project file is missing an attached file.');
        const mime = String(a['mime']);
        const meta = await blobs.put(
          ctx,
          {
            kind: typeof a['kind'] === 'string' ? a['kind'] : 'other',
            filename: typeof a['filename'] === 'string' ? a['filename'] : 'file',
            mime,
            projectId: a['projectId'] === null ? null : bookId,
            profileId: a['profileId'] ? profileId : null,
            aiGenerated: Number(a['aiGenerated']) === 1,
            width: typeof a['width'] === 'number' ? a['width'] : null,
            height: typeof a['height'] === 'number' ? a['height'] : null,
            dpi: typeof a['dpi'] === 'number' ? a['dpi'] : null,
          },
          // D-050: a PNG, JPEG, WebP, PDF or zip must start with its type's signature, or nothing is stored (415).
          sniffed(mime, once(data)),
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

  /** An attached file must be present, of an allowed type, and match its row's size and sha256. */
  private checkAsset(a: Row, data: Uint8Array | undefined): void {
    if (!data) throw new AppError('validation_failed', 'The project file is missing an attached file.');
    const mime = a['mime'];
    const kind = a['kind'];
    if (typeof mime !== 'string' || !IMPORT_MIME.has(mime))
      throw new AppError('unsupported_media_type', 'The project file contains a file type Volume does not accept.');
    if (typeof kind !== 'string' || !/^[a-z_]{1,40}$/.test(kind)) throw new AppError('validation_failed', 'The project file has an invalid file record.');
    if (IMAGE_KINDS.has(kind) && !mime.startsWith('image/'))
      throw new AppError('unsupported_media_type', 'A picture in the project file is not a PNG, JPEG or WebP image.');
    if ((typeof a['bytes'] === 'number' && a['bytes'] !== data.byteLength) || (typeof a['sha256'] === 'string' && a['sha256'] !== sha256(data)))
      throw new AppError('validation_failed', 'A file in the project does not match its record. Export it again.');
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

/** The book's settings with the origin note added (or replaced), so the owner can see where it came from. */
function withOrigin(settings: unknown, at: number): string {
  let parsed: unknown;
  try {
    parsed = typeof settings === 'string' ? JSON.parse(settings) : {};
  } catch {
    parsed = {};
  }
  const base = typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  return JSON.stringify({ ...base, origin: { note: originNote(at), movedAt: at } });
}

async function* once(data: Uint8Array): AsyncGenerator<Uint8Array> {
  await Promise.resolve();
  yield data;
}

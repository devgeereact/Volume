import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { Transaction } from 'kysely';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { AssetsTable, Database } from '../db/schema.js';
import { AppError, notFound } from '../http/errors.js';
import { bool, newId, now } from '../lib/util.js';

/**
 * Files live in the database (D-015): one assets row plus 1 MB rows in
 * asset_chunks, with a sha256 over the whole file. Uploads stream in and are
 * written chunk by chunk; downloads stream chunk by chunk, so memory stays
 * near one chunk whatever the file size. MySQL max_allowed_packet must be
 * larger than the chunk size (see README).
 */

export const DEFAULT_CHUNK_BYTES = 1024 * 1024;

export interface PutAssetInput {
  kind: string;
  filename: string;
  mime: string;
  projectId?: string | null;
  profileId?: string | null;
  aiGenerated?: boolean;
  promptRunId?: string | null;
  width?: number | null;
  height?: number | null;
  dpi?: number | null;
  /** Reject the upload when it grows past this many bytes. */
  maxBytes?: number;
}

export interface AssetMeta {
  id: string;
  kind: string;
  filename: string;
  mime: string;
  bytes: number;
  sha256: string | null;
  chunkCount: number;
  chunkSize: number;
  projectId: string | null;
  profileId: string | null;
  aiGenerated: boolean;
  width: number | null;
  height: number | null;
  status: string;
  createdAt: number;
}

function toMeta(r: AssetsTable): AssetMeta {
  return {
    id: r.id,
    kind: r.kind,
    filename: r.filename,
    mime: r.mime,
    bytes: Number(r.bytes),
    sha256: r.sha256,
    chunkCount: r.chunkCount,
    chunkSize: r.chunkSize,
    projectId: r.projectId,
    profileId: r.profileId,
    aiGenerated: bool(r.aiGenerated),
    width: r.width,
    height: r.height,
    status: r.status,
    createdAt: Number(r.createdAt),
  };
}

type ByteSource = Uint8Array | AsyncIterable<Uint8Array | string> | Iterable<Uint8Array>;

async function* iterate(source: ByteSource): AsyncGenerator<Uint8Array> {
  if (source instanceof Uint8Array) {
    yield source;
    return;
  }
  for await (const piece of source as AsyncIterable<Uint8Array | string>) {
    yield typeof piece === 'string' ? Buffer.from(piece) : piece;
  }
}

export class BlobStore {
  constructor(
    private readonly db: Db,
    private readonly chunkBytes: number = DEFAULT_CHUNK_BYTES,
  ) {}

  /** Use the caller's transaction so asset metadata and chunks commit with the rest of an import. */
  withTransaction(transaction: Transaction<Database>): BlobStore {
    return new BlobStore(transaction, this.chunkBytes);
  }

  async put(ctx: RequestCtx, input: PutAssetInput, source: ByteSource): Promise<AssetMeta> {
    const id = newId();
    const t = now();
    const chunkSize = this.chunkBytes;
    await this.db
      .insertInto('assets')
      .values({
        id,
        workspaceId: ctx.workspaceId,
        projectId: input.projectId ?? null,
        profileId: input.profileId ?? null,
        kind: input.kind,
        filename: input.filename.slice(0, 255),
        mime: input.mime.slice(0, 255),
        bytes: 0,
        chunkSize,
        chunkCount: 0,
        sha256: null,
        width: input.width ?? null,
        height: input.height ?? null,
        dpi: input.dpi ?? null,
        aiGenerated: input.aiGenerated ? 1 : 0,
        promptRunId: input.promptRunId ?? null,
        status: 'uploading',
        createdAt: t,
        updatedAt: t,
      })
      .execute();

    const hash = createHash('sha256');
    let total = 0;
    let index = 0;
    let buf = Buffer.alloc(chunkSize);
    let fill = 0;

    const flush = async (): Promise<void> => {
      if (fill === 0) return;
      const data = Buffer.from(buf.subarray(0, fill));
      await this.db
        .insertInto('assetChunks')
        .values({ assetId: id, chunkIndex: index, workspaceId: ctx.workspaceId, bytes: fill, data, createdAt: now() })
        .execute();
      index += 1;
      fill = 0;
      buf = Buffer.alloc(chunkSize);
    };

    try {
      for await (const piece of iterate(source)) {
        total += piece.byteLength;
        if (input.maxBytes !== undefined && total > input.maxBytes) {
          throw new AppError('payload_too_large', 'The upload is larger than the allowed size.');
        }
        hash.update(piece);
        let offset = 0;
        while (offset < piece.byteLength) {
          const take = Math.min(chunkSize - fill, piece.byteLength - offset);
          buf.set(piece.subarray(offset, offset + take), fill);
          fill += take;
          offset += take;
          if (fill === chunkSize) await flush();
        }
      }
      await flush();
      const sha256 = hash.digest('hex');
      await this.db
        .updateTable('assets')
        .set({ bytes: total, chunkCount: index, sha256, status: 'ready', updatedAt: now() })
        .where('id', '=', id)
        .where('workspaceId', '=', ctx.workspaceId)
        .execute();
    } catch (err) {
      await this.db.deleteFrom('assetChunks').where('assetId', '=', id).execute();
      await this.db.deleteFrom('assets').where('id', '=', id).execute();
      throw err;
    }
    const meta = await this.get(ctx, id);
    if (!meta) throw new Error('asset vanished after upload');
    return meta;
  }

  async get(ctx: RequestCtx, id: string): Promise<AssetMeta | null> {
    const row = await this.db.selectFrom('assets').selectAll().where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).executeTakeFirst();
    return row ? toMeta(row) : null;
  }

  async require(ctx: RequestCtx, id: string): Promise<AssetMeta> {
    const meta = await this.get(ctx, id);
    if (!meta || meta.status !== 'ready') throw notFound('File');
    return meta;
  }

  /** Streams the file chunk by chunk. Only one chunk is held in memory at a time. */
  async stream(ctx: RequestCtx, id: string): Promise<{ meta: AssetMeta; body: Readable }> {
    const meta = await this.require(ctx, id);
    const db = this.db;
    const workspaceId = ctx.workspaceId;
    async function* chunks(): AsyncGenerator<Buffer> {
      for (let i = 0; i < meta.chunkCount; i += 1) {
        const row = await db
          .selectFrom('assetChunks')
          .select(['data'])
          .where('assetId', '=', id)
          .where('workspaceId', '=', workspaceId)
          .where('chunkIndex', '=', i)
          .executeTakeFirst();
        if (!row) throw new Error(`asset ${id} is missing chunk ${i}`);
        yield Buffer.from(row.data);
      }
    }
    return { meta, body: Readable.from(chunks()) };
  }

  /** Reads the whole file and checks its sha256. For small files and exports only. */
  async read(ctx: RequestCtx, id: string): Promise<{ meta: AssetMeta; data: Buffer }> {
    const { meta, body } = await this.stream(ctx, id);
    const parts: Buffer[] = [];
    for await (const c of body) parts.push(c as Buffer);
    const data = Buffer.concat(parts);
    const sha = createHash('sha256').update(data).digest('hex');
    if (meta.sha256 && sha !== meta.sha256) throw new Error(`asset ${id} failed its sha256 check`);
    return { meta, data };
  }

  async delete(ctx: RequestCtx, id: string): Promise<boolean> {
    const meta = await this.get(ctx, id);
    if (!meta) return false;
    await this.db.deleteFrom('assetChunks').where('assetId', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    await this.db.deleteFrom('assets').where('id', '=', id).where('workspaceId', '=', ctx.workspaceId).execute();
    return true;
  }
}

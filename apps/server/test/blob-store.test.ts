import { createHash, randomBytes } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { BlobStore } from '../src/files/blob-store.js';
import { memoryDb } from './helpers.js';

describe('blob store', () => {
  it('round-trips a 3 MB file across 1 MB chunks with a sha256 check', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const other = await ensureOwner(handle.db, 'other', 'Other');
    const store = new BlobStore(handle.db);
    const data = randomBytes(3 * 1024 * 1024 + 123);
    const expected = createHash('sha256').update(data).digest('hex');

    // Feed it as a stream of odd-sized pieces, like a network upload.
    const pieces: Buffer[] = [];
    for (let i = 0; i < data.length; i += 70_001) pieces.push(data.subarray(i, i + 70_001));
    const meta = await store.put(ctx, { kind: 'import', filename: 'big.bin', mime: 'application/octet-stream' }, Readable.from(pieces));

    expect(meta.bytes).toBe(data.length);
    expect(meta.chunkCount).toBe(4);
    expect(meta.sha256).toBe(expected);
    const rows = await handle.db.selectFrom('assetChunks').select(['chunkIndex', 'bytes']).where('assetId', '=', meta.id).orderBy('chunkIndex').execute();
    expect(rows.map((r) => r.bytes)).toEqual([1048576, 1048576, 1048576, 123]);

    const { data: back } = await store.read(ctx, meta.id);
    expect(Buffer.compare(back, data)).toBe(0);

    const { body } = await store.stream(ctx, meta.id);
    const h = createHash('sha256');
    for await (const c of body) h.update(c as Buffer);
    expect(h.digest('hex')).toBe(expected);

    // Another workspace cannot see it.
    expect(await store.get(other, meta.id)).toBeNull();
    await expect(store.stream(other, meta.id)).rejects.toMatchObject({ code: 'not_found' });

    expect(await store.delete(ctx, meta.id)).toBe(true);
    expect(await handle.db.selectFrom('assetChunks').select('assetId').where('assetId', '=', meta.id).execute()).toHaveLength(0);
    await handle.close();
  });

  it('rejects an upload over the size limit and leaves nothing behind', async () => {
    const handle = await memoryDb();
    const ctx = await ensureOwner(handle.db);
    const store = new BlobStore(handle.db, 1024);
    await expect(
      store.put(ctx, { kind: 'import', filename: 'x', mime: 'text/plain', maxBytes: 2000 }, Readable.from([Buffer.alloc(1500), Buffer.alloc(1500)])),
    ).rejects.toMatchObject({
      code: 'payload_too_large',
    });
    expect(await handle.db.selectFrom('assets').select('id').execute()).toHaveLength(0);
    expect(await handle.db.selectFrom('assetChunks').select('assetId').execute()).toHaveLength(0);
    await handle.close();
  });
});

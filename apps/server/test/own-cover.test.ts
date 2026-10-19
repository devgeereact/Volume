import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import { magicMatches } from '../src/routes/assets.js';
import type { ExportBook } from '../src/ports/export.js';
import { HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

// "Use my own cover" (live acceptance 18 October 2026, defect 4): there was no way to pack a book without a paid AI
// cover. The owner uploads an eBook cover (JPEG or TIFF) and a wrap PDF, attaches them, and preflight checks them.

type Obj = Record<string, unknown>;
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF = Buffer.from('%PDF-1.4\n%%EOF\n');

let t: TestApp;
let bookId: string;
beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Test Author', bioThirdPerson: 'Test Author writes plain books.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Calm mornings', title: 'Calm Mornings' });
  bookId = str(b.body['id']);
});
afterAll(async () => {
  await t.close();
});

async function upload(kind: string, filename: string, mime: string, payload: Buffer, projectId: string | null = bookId) {
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/v1/assets?kind=${kind}&filename=${filename}${projectId ? `&projectId=${projectId}` : ''}`,
    headers: { host: HOST, origin: ORIGIN, 'content-type': mime },
    payload,
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as Obj };
}

describe('own cover uploads', () => {
  it('checks the file signature, not the name', () => {
    expect(magicMatches('image/jpeg', JPEG)).toBe(true);
    expect(magicMatches('image/jpeg', PNG)).toBe(false);
    expect(magicMatches('image/tiff', Buffer.from([0x49, 0x49, 0x2a, 0x00]))).toBe(true);
    expect(magicMatches('image/tiff', Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe(true);
    expect(magicMatches('application/pdf', PDF)).toBe(true);
    expect(magicMatches('application/pdf', JPEG)).toBe(false);
  });

  it('refuses a PNG sent as a JPEG and removes it, and needs a book and the right type', async () => {
    const before = await t.handle.db.selectFrom('assets').select('id').execute();
    const bad = await upload('own_ebook_cover', 'cover.jpg', 'image/jpeg', PNG);
    expect(bad.status).toBe(415);
    expect((await t.handle.db.selectFrom('assets').select('id').execute()).length).toBe(before.length);
    expect((await upload('own_ebook_cover', 'cover.png', 'image/png', PNG)).status).toBe(400);
    expect((await upload('own_ebook_cover', 'cover.jpg', 'image/jpeg', JPEG, null)).status).toBe(400);
    expect((await upload('own_wrap_pdf', 'wrap.pdf', 'application/pdf', JPEG)).status).toBe(415);
  });

  it('attaches both, records them as the owner own, and takes one out again', async () => {
    const ebook = await upload('own_ebook_cover', 'cover.jpg', 'image/jpeg', JPEG);
    const wrap = await upload('own_wrap_pdf', 'wrap.pdf', 'application/pdf', PDF);
    expect([ebook.status, wrap.status]).toEqual([201, 201]);
    const ebookId = str(ebook.body['id']);
    const wrapId = str(wrap.body['id']);

    // An asset of the wrong kind is refused.
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/own`, { ebookAssetId: wrapId })).status).toBe(400);
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/own`, {})).status).toBe(400);

    const set = await t.call<{ cover: Obj }>('POST', `/api/v1/books/${bookId}/cover/own`, { ebookAssetId: ebookId, wrapAssetId: wrapId });
    expect(set.status).toBe(200);
    expect(set.body.cover).toMatchObject({ ebookAssetId: ebookId, wrapAssetId: wrapId, wrapSpec: { ownEbook: true, ownWrap: true } });
    const book = await buildExportBook(t.services.repos, t.owner, bookId, t.services.configDir, t.services.blobs);
    expect(book.ownCover).toEqual({ ebook: true, wrap: true });

    const off = await t.call<{ cover: Obj }>('POST', `/api/v1/books/${bookId}/cover/own`, { wrapAssetId: null });
    expect(off.body.cover).toMatchObject({ ebookAssetId: ebookId, wrapAssetId: null, wrapSpec: { ownEbook: true } });
    expect((off.body.cover['wrapSpec'] as Obj)['ownWrap']).toBeUndefined();
  });
});

describe('the final preflight on an own cover', () => {
  const exporter = new VolumeExportAdapter({ root: fileURLToPath(new URL('../../../', import.meta.url)), now: () => new Date(Date.UTC(2026, 9, 19, 12)) });
  afterAll(async () => {
    await exporter.close();
  });

  it('checks the uploaded eBook cover against the KDP rules, not the built size', async () => {
    const book = await buildExportBook(t.services.repos, t.owner, bookId, t.services.configDir, t.services.blobs);
    const own: ExportBook = { ...book, ownCover: { ebook: true, wrap: false } };
    const file = { filename: 'cover.jpg', mime: 'image/jpeg', data: new Uint8Array(JPEG), pageCount: null, mock: false, role: 'ebook_cover' as const };
    const report = await exporter.finalPreflight(own, [file]);
    const item = report.items.find((i) => i.id === 'ebook.cover');
    expect(item?.message).toContain('eBook cover (your own)');
    expect(item?.severity).toBe('block'); // ten bytes are not a readable image
  });
});

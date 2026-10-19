import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { VolumeExportAdapter } from '../src/adapters/volume-export.js';
import { buildExportBook } from '../src/jobs/book-data.js';
import { matchesSignature } from '../src/files/magic.js';
import type { ExportBook } from '../src/ports/export.js';
import { buildCovers, HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

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
    expect(matchesSignature('image/jpeg', JPEG)).toBe(true);
    expect(matchesSignature('image/jpeg', PNG)).toBe(false);
    expect(matchesSignature('image/tiff', Buffer.from([0x49, 0x49, 0x2a, 0x00]))).toBe(true);
    expect(matchesSignature('image/tiff', Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))).toBe(true);
    expect(matchesSignature('application/pdf', PDF)).toBe(true);
    expect(matchesSignature('application/pdf', JPEG)).toBe(false);
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

describe('which assets can be attached', () => {
  it('refuses an asset of another book, of the wrong kind and of another workspace', async () => {
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Other Author', bioThirdPerson: 'Other Author writes too.' });
    const other = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Quiet evenings', title: 'Quiet Evenings' });
    const otherBook = str(other.body['id']);
    const foreign = await upload('own_ebook_cover', 'cover.jpg', 'image/jpeg', JPEG, otherBook);
    expect(foreign.status).toBe(201);
    const refused = await t.call<Obj>('POST', `/api/v1/books/${bookId}/cover/own`, { ebookAssetId: str(foreign.body['id']) });
    expect(refused.status).toBe(400);

    const photo = await upload('interior_image', 'pic.jpg', 'image/jpeg', JPEG);
    expect(photo.status).toBe(201);
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/own`, { ebookAssetId: str(photo.body['id']) })).status).toBe(400);

    // Same book id, but stored under another workspace: the owner's workspace cannot see it.
    const ws = '01OTHERWORKSPACE0000000000';
    const at = Date.now();
    await t.handle.db.insertInto('workspaces').values({ id: ws, name: 'Other', slug: 'other-own-cover', createdAt: at, updatedAt: at }).execute();
    const elsewhere = await t.services.blobs.put(
      { ...t.owner, workspaceId: ws },
      { kind: 'own_ebook_cover', filename: 'cover.jpg', mime: 'image/jpeg', projectId: bookId },
      JPEG,
    );
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/own`, { ebookAssetId: elsewhere.id })).status).toBe(400);
    const cover = await t.call<{ cover: Obj }>('GET', `/api/v1/books/${bookId}/cover`);
    expect(cover.body.cover['ebookAssetId']).not.toBe(elsewhere.id);
  });
});

describe('a cover build next to an own cover', () => {
  it('keeps the owner eBook cover, builds only the wrap, and refuses when both are the owner own', async () => {
    const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Build Author', bioThirdPerson: 'Build Author writes.' });
    const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: p.body['id'], idea: 'Slow walks', title: 'Slow Walks' });
    const id = str(b.body['id']);
    const ebook = await upload('own_ebook_cover', 'cover.jpg', 'image/jpeg', JPEG, id);
    const ownId = str(ebook.body['id']);
    await t.call('POST', `/api/v1/books/${id}/cover/own`, { ebookAssetId: ownId });
    await buildCovers(t, id);
    const after = await t.call<{ cover: Obj }>('GET', `/api/v1/books/${id}/cover`);
    expect(after.body.cover).toMatchObject({ ebookAssetId: ownId, status: 'final', wrapSpec: { ownEbook: true } });
    expect(after.body.cover['wrapAssetId']).toBeTruthy();

    const wrap = await upload('own_wrap_pdf', 'wrap.pdf', 'application/pdf', PDF, id);
    await t.call('POST', `/api/v1/books/${id}/cover/own`, { wrapAssetId: str(wrap.body['id']) });
    expect((await t.call('POST', `/api/v1/books/${id}/cover/build`, {})).status).toBe(409);
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

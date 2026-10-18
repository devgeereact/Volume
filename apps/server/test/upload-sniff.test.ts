import { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { matchesSignature, sniffed } from '../src/files/magic.js';
import { HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

/** Image uploads are checked against their declared type's magic bytes (D-050). */

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32, 1)]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x20, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(24)]);
const HTML = Buffer.from('<html><script>alert(1)</script></html>');

let t: TestApp;
let profileId: string;
beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Record<string, unknown>>('POST', '/api/v1/profiles', { penName: 'Sniff Pen', bioThirdPerson: 'Writes.' });
  profileId = str(p.body['id']);
});
afterAll(async () => t.close());

async function upload(contentType: string, payload: Buffer, query = 'kind=logo&filename=f.img') {
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/v1/assets?${query}`,
    headers: { host: HOST, origin: ORIGIN, 'content-type': contentType },
    payload,
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as { error?: { code: string }; id?: string } };
}

describe('magic bytes', () => {
  it('knows PNG, JPEG and WebP and passes other types through', () => {
    expect(matchesSignature('image/png', PNG)).toBe(true);
    expect(matchesSignature('image/jpeg', JPEG)).toBe(true);
    expect(matchesSignature('image/webp', WEBP)).toBe(true);
    expect(matchesSignature('image/png', JPEG)).toBe(false);
    expect(matchesSignature('image/jpeg', PNG.subarray(0, 2))).toBe(false);
    expect(matchesSignature('text/markdown', HTML)).toBe(true);
  });

  it('checks a signature split across pieces and passes every byte on', async () => {
    const out: Uint8Array[] = [];
    const pieces = Readable.from([PNG.subarray(0, 3), PNG.subarray(3, 5), PNG.subarray(5)]) as AsyncIterable<Uint8Array>;
    for await (const b of sniffed('image/png', pieces)) out.push(b);
    expect(Buffer.concat(out).equals(PNG)).toBe(true);
  });
});

describe('POST /assets', () => {
  it('stores images whose bytes match their declared type', async () => {
    for (const [type, data] of [
      ['image/png', PNG],
      ['image/jpeg', JPEG],
      ['image/webp', WEBP],
    ] as const) {
      const res = await upload(type, data);
      expect(res.status, type).toBe(201);
    }
  });

  it('refuses an image whose bytes do not match, and stores nothing', async () => {
    const before = (await t.handle.db.selectFrom('assets').select('id').execute()).length;
    const cases: [string, Buffer, string?][] = [
      ['image/png', HTML],
      ['image/png', JPEG],
      ['image/jpeg', PNG],
      ['image/webp', PNG],
      ['image/png', Buffer.from([0x89, 0x50])],
      // The ?mime= override is checked the same way.
      ['application/octet-stream', HTML, 'kind=logo&filename=f.png&mime=image%2Fpng'],
    ];
    for (const [type, data, query] of cases) {
      const res = await upload(type, data, query);
      expect(res.status, `${type} ${query ?? ''}`).toBe(415);
      expect(res.body.error?.code).toBe('unsupported_media_type');
    }
    expect((await t.handle.db.selectFrom('assets').select('id').execute()).length).toBe(before);
    expect(
      (await t.handle.db.selectFrom('assetChunks').select('assetId').where('assetId', 'not in', t.handle.db.selectFrom('assets').select('id')).execute())
        .length,
    ).toBe(0);
  });

  it('refuses a fake author photo', async () => {
    const res = await upload('image/jpeg', HTML, `kind=author_photo&filename=me.jpg&profileId=${profileId}`);
    expect(res.status).toBe(415);
  });

  it('leaves Markdown imports alone', async () => {
    expect((await upload('text/markdown', Buffer.from('# Title\n\nText.'), 'kind=import&filename=book.md')).status).toBe(201);
  });
});

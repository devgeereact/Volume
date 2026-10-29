import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { CoverInput, ExportFile, WrapCoverInput } from '../src/ports/export.js';
import { HOST, ORIGIN, str, testApp, type TestApp } from './helpers.js';

/** Cover layers in the typography (background, artwork, shapes, spine, barcode box): validation, pictures, build. */

type Obj = Record<string, unknown>;
let t: TestApp;
let bookId: string;
let otherBookId: string;
let assetId: string;

/** A 1 by 1 PNG (signature, IHDR, IDAT, IEND). */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64');

async function upload(kind: string, projectId: string): Promise<string> {
  const res = await t.app.inject({
    method: 'POST',
    url: `/api/v1/assets?kind=${kind}&filename=back.png&projectId=${projectId}`,
    headers: { host: HOST, origin: ORIGIN, 'content-type': 'image/png' },
    payload: PNG,
  });
  expect(res.statusCode, res.body).toBe(201);
  return str((JSON.parse(res.body) as Obj)['id']);
}

beforeAll(async () => {
  t = await testApp();
  const p = await t.call<Obj>('POST', '/api/v1/profiles', { penName: 'Layer Pen', bioThirdPerson: 'Writes.' });
  const b = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Layers', title: 'Cover Layers', template: 'nonfiction' });
  bookId = str(b.body['id']);
  const o = await t.call<Obj>('POST', '/api/v1/books', { profileId: str(p.body['id']), idea: 'Other', title: 'Other Book', template: 'nonfiction' });
  otherBookId = str(o.body['id']);
  await t.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await t.call('POST', `/api/v1/books/${bookId}/cover/concepts`, {});
  await t.services.runner.runUntilIdle();
  const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${bookId}/cover`);
  assetId = str(cover.body.cover.concepts[0]?.assetId);
});
afterAll(async () => t.close());

const layers = (pictureId: string): Obj => ({
  background: {
    mode: 'image',
    span: 'wrap',
    image: {
      assetId: pictureId,
      opacity: 0.8,
      blend: 'multiply',
      scale: 1.2,
      focusX: 30,
      focusY: 60,
      blur: 4,
      greyscale: true,
      tint: { colour: '#112233', strength: 0.4 },
    },
  },
  artwork: { opacity: 0.7, rotation: -5, box: { x: 10, y: 20, w: 80, h: 80 } },
  shapes: [{ id: 'a', kind: 'star', surface: 'back', x: 10, y: 10, w: 20, h: 20, rotation: 15, colour: '#ffcc00', opacity: 0.9, layer: 'over' }],
  spine: { colour: '#C2185B', textColour: '#FFF59D', showBackground: false },
  showBarcodeBox: false,
});

describe('cover layers in the typography', () => {
  it('uploads a background picture through the existing asset route and saves every layer', async () => {
    const pic = await upload('cover_background', bookId);
    const typography = { styleId: 'serene-serif', ...layers(pic) };
    const res = await t.call<{ cover: { typography: Obj } }>('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.cover.typography).toEqual(typography);
    const g = { background: { mode: 'gradient', span: 'front', gradient: { type: 'radial', from: '#000', to: '#ffffff', centreX: 20, centreY: 80 } } };
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography: g })).status).toBe(200);
    const tex = { background: { mode: 'image', image: { texture: 'grain' } } };
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography: tex })).status).toBe(200);
  });

  it('accepts a picture id a project move set to null', async () => {
    const typography = { background: { mode: 'image', image: { assetId: null } } };
    expect((await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography })).status).toBe(200);
  });

  it('refuses layers outside the fixed lists and limits', async () => {
    const shape = { kind: 'circle', x: 0, y: 0, w: 10, h: 10, colour: '#ffffff' };
    const bad: Obj[] = [
      { background: { mode: 'pattern' } },
      { background: { mode: 'gradient', gradient: { type: 'conic', from: '#000', to: '#fff' } } },
      { background: { mode: 'image', image: { texture: 'wood' } } },
      { background: { mode: 'image', image: { texture: 'grain', blend: 'difference' } } },
      { background: { mode: 'image', image: { texture: 'grain', assetId: assetId } } },
      { background: { mode: 'image', image: { texture: 'grain', opacity: 2 } } },
      { background: { mode: 'image', image: { texture: 'grain', tint: { colour: '#000', strength: 1 } } } },
      { shapes: [{ ...shape, kind: 'hexagon' }] },
      { shapes: [{ ...shape, colour: 'red' }] },
      { shapes: [{ ...shape, onclick: 'x' }] },
      { shapes: Array.from({ length: 25 }, () => shape) },
      { artwork: { rotation: 400 } },
      { spine: { colour: '#12' } },
      { showBarcodeBox: 'no' },
    ];
    for (const typography of bad) {
      const res = await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography });
      expect(res.status, JSON.stringify(typography)).toBe(400);
    }
  });

  it('refuses a background picture from another book or of another kind', async () => {
    const foreign = await upload('cover_background', otherBookId);
    const res = await t.call<{ error: { message: string } }>('POST', `/api/v1/books/${bookId}/cover/choose`, {
      assetId,
      typography: { background: { mode: 'image', image: { assetId: foreign } } },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/background picture/);
    const logo = await upload('logo', bookId);
    expect(
      (await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography: { background: { mode: 'image', image: { assetId: logo } } } }))
        .status,
    ).toBe(400);
  });

  it('the preview and the build get the picture, the page count and the barcode switch', async () => {
    const pic = await upload('cover_background', bookId);
    const typography = layers(pic);
    const preview = vi.spyOn(t.services.exporter, 'coverPreviewHtml');
    const res = await t.call('POST', `/api/v1/books/${bookId}/cover/preview`, { kind: 'wrap', typography, pages: 140 });
    expect(res.status).toBe(200);
    const pIn = preview.mock.calls[0]?.[0];
    expect(pIn?.backgroundImage?.data.byteLength).toBe(PNG.length);
    expect(pIn?.typography['showBarcodeBox']).toBe(false);
    preview.mockRestore();

    await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId, typography });
    const real = t.services.exporter.buildEbookCover.bind(t.services.exporter);
    const seen: (CoverInput | WrapCoverInput)[] = [];
    const ebook = vi.spyOn(t.services.exporter, 'buildEbookCover').mockImplementation(async (input, o): Promise<ExportFile> => {
      seen.push(input);
      return { ...(await real(input, o)), warnings: ['The title reads at about 2.1 to 1 against what is behind it (3 to 1 wanted).'] };
    });
    await t.call('POST', `/api/v1/books/${bookId}/cover/build`, {});
    await t.services.runner.runUntilIdle();
    ebook.mockRestore();
    expect(seen[0]?.backgroundImage?.data.byteLength).toBe(PNG.length);
    expect(seen[0]?.pageCount).toBeGreaterThan(0);
    const cover = await t.call<{ cover: { wrapSpec: Obj } }>('GET', `/api/v1/books/${bookId}/cover`);
    expect(cover.body.cover.wrapSpec['warnings']).toEqual(['The title reads at about 2.1 to 1 against what is behind it (3 to 1 wanted).']);
  });
});

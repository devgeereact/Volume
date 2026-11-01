import { crc32, deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { MAX_INPUT_PIXELS, openImage } from '../src/index.ts';

/** A small PNG whose header claims width x height pixels (a few rows of real data): the shape of a decompression bomb. */
function pngClaiming(width: number, height: number): Buffer {
  const chunk = (type: string, data: Buffer): Buffer => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(2, 9); // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.alloc(4096))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

describe('image decode limit (audit L3, 1 November 2026)', () => {
  it('refuses to decode an image larger than the limit', async () => {
    expect(MAX_INPUT_PIXELS).toBe(100_000_000);
    await expect(openImage(pngClaiming(20_000, 20_000)).raw().toBuffer()).rejects.toThrow(/pixel limit/i);
  });

  it('still opens a normal picture', async () => {
    const small = await openImage({ create: { width: 4, height: 4, channels: 3, background: '#123456' } })
      .png()
      .toBuffer();
    expect((await openImage(small).metadata()).width).toBe(4);
  });
});

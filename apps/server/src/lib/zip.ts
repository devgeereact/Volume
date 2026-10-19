import { crc32, createDeflateRaw, deflateRawSync, inflateRawSync } from 'node:zlib';

/**
 * A small zip writer and reader (deflate or stored, no zip64, no encryption), enough for project files.
 * Uses node:zlib only, so the server needs no extra package.
 */

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

const MAX_ENTRY_BYTES = 128 * 1024 * 1024;
export interface ZipReadLimits {
  maxEntryBytes?: number;
  maxTotalBytes?: number;
  maxEntries?: number;
}

function dosTime(d: Date): { time: number; date: number } {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export function writeZip(entries: readonly ZipEntry[], at = new Date()): Buffer {
  const { time, date } = dosTime(at);
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const raw = Buffer.from(e.data.buffer, e.data.byteOffset, e.data.byteLength);
    const deflated = deflateRawSync(raw);
    const stored = deflated.length >= raw.length;
    const body = stored ? raw : deflated;
    const crc = crc32(raw) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0800, 6); // UTF-8 names
    head.writeUInt16LE(stored ? 0 : 8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt32LE(crc, 14);
    head.writeUInt32LE(body.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(name.length, 26);
    head.writeUInt16LE(0, 28);
    locals.push(head, name, body);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt16LE(stored ? 0 : 8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(body.length, 20);
    c.writeUInt32LE(raw.length, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, name);
    offset += head.length + name.length + body.length;
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, central, end]);
}

/** One entry of a streamed zip: its bytes arrive piece by piece, so a large file is never held whole in memory. */
export interface ZipStreamEntry {
  name: string;
  source: () => AsyncIterable<Uint8Array | string> | Iterable<Uint8Array | string>;
}

const ZIP32_MAX = 0xffffffff;

/**
 * Writes a zip as a stream of buffers (deflate, sizes in a data descriptor after each entry, no zip64): memory stays
 * near one input piece whatever the total size. Throws when the archive would pass the 4 GiB or 65,535 entry limits
 * of a zip without zip64, which ends the stream.
 */
export async function* zipStream(entries: AsyncIterable<ZipStreamEntry> | Iterable<ZipStreamEntry>, at = new Date()): AsyncGenerator<Buffer> {
  const { time, date } = dosTime(at);
  const centrals: Buffer[] = [];
  let offset = 0;
  let count = 0;
  for await (const e of entries) {
    count += 1;
    if (count > 0xffff) throw new Error('Too many files for one zip.');
    const name = Buffer.from(e.name, 'utf8');
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(0x0808, 6); // sizes in the data descriptor, UTF-8 names
    head.writeUInt16LE(8, 8);
    head.writeUInt16LE(time, 10);
    head.writeUInt16LE(date, 12);
    head.writeUInt16LE(name.length, 26);
    const localOffset = offset;
    yield Buffer.concat([head, name]);
    offset += head.length + name.length;

    let crc = 0;
    let rawSize = 0;
    let compSize = 0;
    const deflater = createDeflateRaw();
    const out: Buffer[] = [];
    deflater.on('data', (b: Buffer) => out.push(b));
    const ended = new Promise<void>((resolve, reject) => {
      deflater.once('end', resolve);
      deflater.once('error', reject);
    });
    const drain = (): Buffer | null => {
      if (out.length === 0) return null;
      const b = Buffer.concat(out.splice(0));
      compSize += b.length;
      return b;
    };
    for await (const piece of e.source()) {
      const b = typeof piece === 'string' ? Buffer.from(piece, 'utf8') : Buffer.from(piece.buffer, piece.byteOffset, piece.byteLength);
      if (b.length === 0) continue;
      crc = crc32(b, crc);
      rawSize += b.length;
      await new Promise<void>((resolve, reject) => deflater.write(b, (err) => (err ? reject(err) : resolve())));
      const chunk = drain();
      if (chunk) yield chunk;
    }
    deflater.end();
    await ended;
    const tail = drain();
    if (tail) yield tail;
    if (rawSize > ZIP32_MAX || compSize > ZIP32_MAX) throw new Error('A file is too large for a zip without zip64.');
    offset += compSize;
    const desc = Buffer.alloc(16);
    desc.writeUInt32LE(0x08074b50, 0);
    desc.writeUInt32LE(crc >>> 0, 4);
    desc.writeUInt32LE(compSize, 8);
    desc.writeUInt32LE(rawSize, 12);
    yield desc;
    offset += desc.length;
    if (offset > ZIP32_MAX) throw new Error('The zip is too large without zip64.');

    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0808, 8);
    c.writeUInt16LE(8, 10);
    c.writeUInt16LE(time, 12);
    c.writeUInt16LE(date, 14);
    c.writeUInt32LE(crc >>> 0, 16);
    c.writeUInt32LE(compSize, 20);
    c.writeUInt32LE(rawSize, 24);
    c.writeUInt16LE(name.length, 28);
    c.writeUInt32LE(localOffset, 42);
    centrals.push(c, name);
  }
  const central = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(count, 8);
  end.writeUInt16LE(count, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  yield Buffer.concat([central, end]);
}

/** Reads every entry. Throws a plain Error for anything that is not a zip this module can read. */
export function readZip(buf: Buffer, limits: ZipReadLimits = {}): ZipEntry[] {
  const maxEntryBytes = limits.maxEntryBytes ?? MAX_ENTRY_BYTES;
  const maxTotalBytes = limits.maxTotalBytes ?? 256 * 1024 * 1024;
  const names = new Set<string>();
  let total = 0;
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('This is not a zip file.');
  const count = buf.readUInt16LE(eocd + 10);
  if (count > (limits.maxEntries ?? 10000)) throw new Error('The zip contains too many files.');
  let p = buf.readUInt32LE(eocd + 16);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw new Error('The zip file is damaged.');
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const rawSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    p += 46 + nameLen + extraLen + commentLen;
    if (p > buf.length || names.has(name) || name.startsWith('/') || name.includes('\\') || name.split('/').some((part) => part === '..' || part === '.'))
      throw new Error('The zip contains an invalid or duplicate file name.');
    names.add(name);
    total += rawSize;
    if (total > maxTotalBytes) throw new Error('The expanded project is too large.');
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw new Error('The zip file is damaged.');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (rawSize > maxEntryBytes || start + size > buf.length) throw new Error('The zip file is damaged or too large.');
    const body = buf.subarray(start, start + size);
    let data: Buffer;
    if (method === 0) data = Buffer.from(body);
    // Inflate no further than the declared size (at least 1 byte, which zlib requires): a lying header stops here.
    else if (method === 8) data = inflateRawSync(body, { maxOutputLength: Math.max(1, rawSize) });
    else throw new Error('The zip file uses a compression this app cannot read.');
    if (data.length !== rawSize || crc32(data) >>> 0 !== crc) throw new Error(`The zip entry ${name} is damaged.`);
    out.push({ name, data });
  }
  return out;
}

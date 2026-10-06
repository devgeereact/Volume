import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';
import sharp from 'sharp';
import { beforeAll, describe, expect, it } from 'vitest';
import { exportEpub } from '../src/index.ts';
import { loadWindowsill } from './helpers.ts';

/** EPUBCheck runs only when Java and an EPUBCheck jar (EPUBCHECK_JAR) or an `epubcheck` command exist. */
function epubcheckCommand(): string[] | null {
  const java = spawnSync('java', ['-version']).status === 0;
  if (process.env.EPUBCHECK_JAR && java) return ['java', '-jar', process.env.EPUBCHECK_JAR];
  if (spawnSync('epubcheck', ['--version']).status === 0) return ['epubcheck'];
  return null;
}

describe('EPUB 3 (Windowsill Herbs)', () => {
  let buf: Buffer;
  let zip: JSZip;
  const { book } = loadWindowsill();
  beforeAll(async () => {
    buf = await exportEpub(book, undefined, {
      modified: new Date('2026-10-04T00:00:00Z'),
      coverJpeg: await sharp({ create: { width: 1600, height: 2560, channels: 3, background: '#eeeeee' } })
        .jpeg()
        .toBuffer(),
    });
    zip = await JSZip.loadAsync(buf);
  });

  it('stores mimetype first and uncompressed', () => {
    expect(buf.readUInt32LE(0)).toBe(0x04034b50);
    expect(buf.readUInt16LE(8)).toBe(0); // compression method: stored
    const nameLen = buf.readUInt16LE(26);
    expect(buf.subarray(30, 30 + nameLen).toString()).toBe('mimetype');
    expect(buf.subarray(30 + nameLen + buf.readUInt16LE(28), 30 + nameLen + buf.readUInt16LE(28) + 20).toString()).toBe('application/epub+zip');
  });

  it('has the container, OPF metadata, one XHTML file per section and a cover', async () => {
    expect(zip.file('META-INF/container.xml')).not.toBeNull();
    const opf = (await zip.file('OEBPS/content.opf')?.async('string')) ?? '';
    expect(opf).toContain('<dc:title id="title">Windowsill Herbs</dc:title>');
    expect(opf).toContain('<dc:creator id="author">Sam Rowe</dc:creator>');
    expect(opf).toContain('<dc:language>en-GB</dc:language>');
    expect(opf).toMatch(/<dc:identifier id="bookid">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/);
    expect(opf).toContain('<meta property="dcterms:modified">2026-10-04T00:00:00Z</meta>');
    expect(opf).toContain('properties="cover-image"');
    expect(opf).toContain('properties="nav"');
    const xhtml = Object.keys(zip.files).filter((f) => f.startsWith('OEBPS/text/') && f.endsWith('.xhtml'));
    expect(xhtml).toHaveLength(book.sections.length + 1);
  });

  it('lists every chapter (with its subheadings) in the nav', async () => {
    const nav = (await zip.file('OEBPS/nav.xhtml')?.async('string')) ?? '';
    for (const s of book.sections.filter((x) => x.kind === 'chapter')) expect(nav).toContain(`${s.kicker}: ${s.title}`);
    expect(nav).toContain('Why light matters more than anything else');
    expect(nav).toContain('epub:type="landmarks"');
  });

  const cmd = epubcheckCommand();
  it.skipIf(!cmd)('passes EPUBCheck', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'volume-epub-'));
    const file = path.join(dir, 'book.epub');
    writeFileSync(file, buf);
    const [bin, ...args] = cmd ?? [];
    expect(() => execFileSync(bin ?? 'epubcheck', [...args, file], { stdio: 'pipe' })).not.toThrow();
  });
});

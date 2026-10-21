import { describe, expect, it } from 'vitest';
import { pagesCopy } from '../src/adapters/volume-export.js';

// The pack's Apple Pages copy is opt-in: macOS and VOLUME_PAGES=1 only, and a failed conversion never stops the pack.
describe('pagesCopy (buildPack, opt-in Pages file)', () => {
  const docx = Buffer.from('docx');
  const made = Buffer.from('pages');
  const calls: string[] = [];
  const convert = (_d: Buffer, o: { name?: string } = {}): Promise<Buffer> => {
    calls.push(o.name ?? '');
    return Promise.resolve(made);
  };

  it('makes nothing unless the platform is macOS and VOLUME_PAGES is 1', async () => {
    expect(await pagesCopy(docx, 'book', { VOLUME_PAGES: '1' }, 'linux', convert)).toBeUndefined();
    expect(await pagesCopy(docx, 'book', {}, 'darwin', convert)).toBeUndefined();
    expect(await pagesCopy(docx, 'book', { VOLUME_PAGES: 'true' }, 'darwin', convert)).toBeUndefined();
    expect(await pagesCopy(undefined, 'book', { VOLUME_PAGES: '1' }, 'darwin', convert)).toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('converts the DOCX on a Mac that opted in', async () => {
    expect(await pagesCopy(docx, 'windowsill-herbs', { VOLUME_PAGES: '1' }, 'darwin', convert)).toBe(made);
    expect(calls).toEqual(['windowsill-herbs']);
  });

  it('leaves the copy out when Pages fails', async () => {
    const failing = (): Promise<Buffer> => Promise.reject(new Error('Pages did not finish within 90 s.'));
    const warnings: string[] = [];
    const onWarning = (w: Error) => warnings.push(w.message);
    process.on('warning', onWarning);
    try {
      expect(await pagesCopy(docx, 'book', { VOLUME_PAGES: '1' }, 'darwin', failing)).toBeUndefined();
      await new Promise((r) => setImmediate(r));
    } finally {
      process.off('warning', onWarning);
    }
    expect(warnings).toEqual(['Pages copy left out of the pack: Pages did not finish within 90 s.']);
  });
});

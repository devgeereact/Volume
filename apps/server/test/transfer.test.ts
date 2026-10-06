import { afterEach, describe, expect, it, vi } from 'vitest';
import { BlobStore } from '../src/files/blob-store.js';
import { readZip, writeZip } from '../src/lib/zip.js';
import { ProjectTransfer } from '../src/repos/transfer.js';
import { testApp, type TestApp } from './helpers.js';

const apps: TestApp[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) await app.close();
});

async function fixture() {
  const source = await testApp();
  const target = await testApp({ chunkBytes: 4 });
  apps.push(source, target);
  const profile = await source.services.repos.profiles.create(source.owner, { penName: 'Import author' });
  const book = await source.services.repos.books.create(
    source.owner,
    { profileId: profile.id, idea: 'Import rollback test' },
    { budgetUsd: 5, illustrativeLine: false },
  );
  for (const filename of ['first.txt', 'second.txt']) {
    await source.services.blobs.put(source.owner, { kind: 'other', filename, mime: 'text/plain', projectId: book.id }, Buffer.from(filename));
  }
  const existing = await target.services.repos.profiles.create(target.owner, { penName: 'Existing author' });
  const existingBook = await target.services.repos.books.create(
    target.owner,
    { profileId: existing.id, idea: 'Keep this book' },
    { budgetUsd: 5, illustrativeLine: false },
  );
  const existingAsset = await target.services.blobs.put(
    target.owner,
    { kind: 'other', filename: 'keep.txt', mime: 'text/plain', projectId: existingBook.id },
    Buffer.from('Keep this file'),
  );
  const transfer = new ProjectTransfer(source.handle.db, source.services.blobs);
  const { zip } = await transfer.exportProject(source.owner, book.id);
  return { target, existing, existingAsset, entries: readZip(zip), importer: new ProjectTransfer(target.handle.db, target.services.blobs) };
}

async function snapshot(app: TestApp) {
  return {
    profiles: await app.handle.db.selectFrom('authorProfiles').selectAll().orderBy('id').execute(),
    projects: await app.handle.db.selectFrom('projects').selectAll().orderBy('id').execute(),
    assets: await app.handle.db.selectFrom('assets').selectAll().orderBy('id').execute(),
    chunks: await app.handle.db.selectFrom('assetChunks').selectAll().orderBy('assetId').orderBy('chunkIndex').execute(),
    sections: await app.handle.db.selectFrom('sections').selectAll().orderBy('id').execute(),
  };
}

describe('project import rollback', () => {
  it('commits a complete import using the configured file chunk size', async () => {
    const { target, entries, importer } = await fixture();
    const result = await importer.importProject(target.owner, writeZip(entries));
    expect(result).toMatchObject({ profileCreated: true, assets: 2 });
    const assets = await target.handle.db.selectFrom('assets').selectAll().where('projectId', '=', result.bookId).execute();
    expect(assets).toHaveLength(2);
    for (const asset of assets) {
      expect(asset.chunkSize).toBe(4);
      expect(asset.chunkCount).toBe(Math.ceil(asset.bytes / 4));
      expect((await target.services.blobs.read(target.owner, asset.id)).data.toString()).toBe(asset.filename);
    }
  });

  it.each(['new', 'existing'] as const)('rolls back files and a book after a child-row failure with a %s profile', async (profileMode) => {
    const { target, existing, existingAsset, entries, importer } = await fixture();
    const manifest = entries.find((entry) => entry.name === 'project.json');
    if (!manifest) throw new Error('Missing fixture manifest');
    const file = JSON.parse(Buffer.from(manifest.data).toString()) as { tables: Record<string, unknown[]> };
    file.tables['sections'] = [{ id: 'broken-section', projectId: 'broken-project', workspaceId: 'broken-workspace', unexpectedColumn: 'invalid' }];
    manifest.data = Buffer.from(JSON.stringify(file));
    const before = await snapshot(target);
    await expect(importer.importProject(target.owner, writeZip(entries), profileMode === 'existing' ? { profileId: existing.id } : {})).rejects.toThrow();
    expect(await snapshot(target)).toEqual(before);
    expect((await target.services.blobs.read(target.owner, existingAsset.id)).data.toString()).toBe('Keep this file');
  });

  it('moves the author photo and remaps the copied profile reference', async () => {
    const source = await testApp();
    const target = await testApp();
    apps.push(source, target);
    const profile = await source.services.repos.profiles.create(source.owner, { penName: 'Portrait Author' });
    const photo = await source.services.blobs.put(
      source.owner,
      { kind: 'author_photo', filename: 'portrait.png', mime: 'image/png', profileId: profile.id },
      Buffer.from('synthetic portrait bytes'),
    );
    await source.services.repos.profiles.update(source.owner, profile.id, { brand: { photoAssetId: photo.id } });
    const book = await source.services.repos.books.create(
      source.owner,
      { profileId: profile.id, idea: 'A portrait book' },
      { budgetUsd: 5, illustrativeLine: false },
    );
    const exported = await new ProjectTransfer(source.handle.db, source.services.blobs).exportProject(source.owner, book.id);
    const imported = await new ProjectTransfer(target.handle.db, target.services.blobs).importProject(target.owner, exported.zip);
    const copy = await target.services.repos.profiles.require(target.owner, imported.profileId);
    const id = copy.brand['photoAssetId'];
    expect(typeof id).toBe('string');
    expect(id).not.toBe(photo.id);
    const file = await target.services.blobs.read(target.owner, String(id));
    expect(file.data.toString()).toBe('synthetic portrait bytes');
    expect(file.meta.profileId).toBe(imported.profileId);
  });

  it('rejects missing attached files without creating a book', async () => {
    const { target, entries, importer } = await fixture();
    const before = await snapshot(target);
    await expect(importer.importProject(target.owner, writeZip(entries.filter((entry) => !entry.name.startsWith('assets/'))))).rejects.toThrow(
      'missing an attached file',
    );
    expect(await snapshot(target)).toEqual(before);
  });

  it('rejects malformed manifests before changing the database', async () => {
    const { target, importer } = await fixture();
    const before = await snapshot(target);
    await expect(
      importer.importProject(
        target.owner,
        writeZip([{ name: 'project.json', data: Buffer.from(JSON.stringify({ format: 'volume-project', version: 1, project: null, profile: {} })) }]),
      ),
    ).rejects.toThrow('invalid data');
    expect(await snapshot(target)).toEqual(before);
  });

  it('limits total expanded ZIP bytes and rejects duplicate entries', () => {
    const entry = { name: 'first', data: Buffer.from('123456') };
    expect(() => readZip(writeZip([entry, { ...entry, name: 'second' }]), { maxTotalBytes: 10 })).toThrow('expanded project is too large');
    expect(() => readZip(writeZip([entry, entry]))).toThrow('duplicate');
  });

  it('rolls back earlier files when a later file upload fails', async () => {
    const { target, entries, importer } = await fixture();
    const before = await snapshot(target);
    // Preserve the implementation and explicitly rebind it to the transaction-backed store below.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = BlobStore.prototype.put;
    vi.spyOn(BlobStore.prototype, 'put')
      .mockImplementationOnce(function (this: BlobStore, ...args) {
        return original.apply(this, args);
      })
      .mockRejectedValueOnce(new Error('Simulated file failure'));
    await expect(importer.importProject(target.owner, writeZip(entries))).rejects.toThrow('Simulated file failure');
    expect(await snapshot(target)).toEqual(before);
  });
});

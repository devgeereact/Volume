// Moving a book to another Volume (D-051): export-project, then POST /books/import-project on a second app with its
// own SQLite database. Mock AI only, no live calls.
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { parseMultipart } from '../src/lib/multipart.js';
import { readZip, writeZip, type ZipEntry } from '../src/lib/zip.js';
import { newId, now } from '../src/lib/util.js';
import { ProjectTransfer, remapJson, type ProjectManifest } from '../src/repos/transfer.js';
import { buildCovers, HOST, ORIGIN, str, testApp, testConfig, type TestApp } from './helpers.js';

type Obj = Record<string, unknown>;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('own cover picture bytes')]);
const ULID = /[0-9A-HJKMNP-TV-Z]{26}/g;

let source: TestApp;
let target: TestApp;
let bookId: string;
let targetProfileId: string;
let zip: Buffer;
let client = 0;
/** A different client address per call, so the per-client import limit only bites in its own test. */
const nextIp = (): string => `10.0.${Math.floor(++client / 250)}.${(client % 250) + 1}`;

function form(fields: Record<string, string>, file?: { name: string; data: Buffer }): { payload: Buffer; type: string } {
  const boundary = `----volume${newId()}`;
  const chunks: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  if (file)
    chunks.push(
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: application/zip\r\n\r\n`),
      file.data,
      Buffer.from('\r\n'),
    );
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return { payload: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
}

async function importZip(t: TestApp, data: Buffer, profileId: string, remoteAddress = nextIp()): Promise<{ status: number; body: Obj }> {
  const { payload, type } = form({ profileId }, { name: 'book.volume-project.zip', data });
  const res = await t.app.inject({
    method: 'POST',
    url: '/api/v1/books/import-project',
    headers: { host: HOST, origin: ORIGIN, 'content-type': type },
    payload,
    remoteAddress,
  });
  return { status: res.statusCode, body: JSON.parse(res.body) as Obj };
}

function rezip(entries: ZipEntry[], change: (entries: ZipEntry[]) => ZipEntry[]): Buffer {
  return writeZip(change(entries.map((e) => ({ name: e.name, data: Buffer.from(e.data) }))));
}

/** Changes project.json (and, optionally, files) and writes a manifest that matches, as a careful forger would. */
function forge(change: (file: { project: Obj; tables: Record<string, Obj[]>; assets: Obj[] }, files: Map<string, Buffer>) => void): Buffer {
  const entries = readZip(zip);
  const files = new Map(entries.filter((e) => e.name.startsWith('assets/')).map((e) => [e.name, Buffer.from(e.data)]));
  const projectEntry = entries.find((e) => e.name === 'project.json');
  if (!projectEntry) throw new Error('No project.json');
  const file = JSON.parse(Buffer.from(projectEntry.data).toString()) as { project: Obj; tables: Record<string, Obj[]>; assets: Obj[] };
  change(file, files);
  const out: ZipEntry[] = [{ name: 'project.json', data: Buffer.from(JSON.stringify(file)) }, ...[...files].map(([name, data]) => ({ name, data }))];
  const manifest = JSON.parse(Buffer.from(entries.find((e) => e.name === 'manifest.json')?.data ?? []).toString()) as ProjectManifest;
  manifest.files = out.map((e) => ({ name: e.name, bytes: e.data.byteLength, sha256: createHash('sha256').update(e.data).digest('hex') }));
  return writeZip([{ name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest)) }, ...out]);
}

async function counts(t: TestApp): Promise<number[]> {
  const db = t.handle.db;
  return [
    (await db.selectFrom('projects').select('id').execute()).length,
    (await db.selectFrom('sections').select('id').execute()).length,
    (await db.selectFrom('sectionVersions').select('id').execute()).length,
    (await db.selectFrom('assets').select('id').execute()).length,
    (await db.selectFrom('assetChunks').select('assetId').execute()).length,
  ];
}

/** Rows of a book's table with ids, links, workspace and times taken out, so two Volumes can be compared. */
async function rowsOf(t: TestApp, table: string, projectId: string, drop: string[] = []): Promise<string[]> {
  const rows = (await t.handle.db
    .selectFrom(table as 'sections')
    .selectAll()
    .where('projectId', '=', projectId)
    .execute()) as unknown as Obj[];
  return rows
    .map((r) => {
      const out: Obj = {};
      for (const [k, v] of Object.entries(r)) {
        if (['id', 'workspaceId', 'updatedAt', 'promptRunId', 'jobId', 'parentJobId', ...drop].includes(k)) continue;
        if (k.endsWith('Id')) out[k] = v !== null;
        else out[k] = typeof v === 'string' ? v.replace(ULID, '<id>') : v;
      }
      return JSON.stringify(out);
    })
    .sort();
}

beforeAll(async () => {
  source = await testApp();
  target = await testApp();
  const s = source;
  const p = await s.call<Obj>('POST', '/api/v1/profiles', { penName: 'Moving Author', legalName: 'Jane Q Legal', location: 'Hackney, London' });
  const book = await s.call<Obj>('POST', '/api/v1/books', {
    profileId: str(p.body['id']),
    idea: 'Calm mornings',
    title: 'Calm Mornings',
    settings: { acknowledgements: 'Sam' },
  });
  bookId = str(book.body['id']);
  await s.call('POST', `/api/v1/books/${bookId}/research`, {});
  await s.services.runner.runUntilIdle();
  await s.call('POST', `/api/v1/books/${bookId}/title-sets`, {});
  await s.services.runner.runUntilIdle();
  await s.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await s.services.runner.runUntilIdle();
  await s.call('POST', `/api/v1/books/${bookId}/blueprints`, { chapterCount: 2 });
  await s.services.runner.runUntilIdle();
  await s.call('POST', `/api/v1/books/${bookId}/blueprint/approve`, {});
  await s.call('POST', `/api/v1/books/${bookId}/write`, {});
  await s.services.runner.runUntilIdle();
  const secs = await s.call<{ body: { id: string }[] }>('GET', `/api/v1/books/${bookId}/sections`);
  const sectionId = str(secs.body.body[0]?.id);
  // A second, owner-written version, so the history has more than one entry.
  expect((await s.call('POST', `/api/v1/sections/${sectionId}/versions`, { bodyMd: 'The owner rewrote this chapter by hand.' })).status).toBe(201);
  await buildCovers(s, bookId);
  // The owner's own cover picture.
  const own = await s.app.inject({
    method: 'POST',
    url: `/api/v1/assets?kind=cover_concept&filename=own.png&projectId=${bookId}`,
    headers: { host: HOST, origin: ORIGIN, 'content-type': 'image/png' },
    payload: PNG,
  });
  expect(own.statusCode).toBe(201);
  await s.call('POST', `/api/v1/books/${bookId}/exports`, {});
  await s.call('POST', `/api/v1/books/${bookId}/marketing`, {});
  await s.services.runner.runUntilIdle();
  const t = now();
  const ws = s.owner.workspaceId;
  // Writing now queues a listing job that makes the book's one listing; replace it with a known one.
  await s.handle.db.deleteFrom('listings').where('projectId', '=', bookId).execute();
  await s.handle.db
    .insertInto('listings')
    .values({
      id: newId(),
      workspaceId: ws,
      projectId: bookId,
      descriptionHtml: '<p>A calm book.</p>',
      backBlurb: 'Mornings, made calm.',
      shortBio: 'Moving Author writes plain books.',
      categories: '["Self-help"]',
      keywords: '["calm","mornings"]',
      aiDisclosureNote: null,
      pricing: '{}',
      kdpRulesVersion: null,
      createdAt: t,
      updatedAt: t,
    })
    .execute();
  await s.handle.db
    .insertInto('claims')
    .values({
      id: newId(),
      workspaceId: ws,
      projectId: bookId,
      sectionId,
      versionId: null,
      category: 'medical',
      sentence: 'Calm lowers stress.',
      location: '{}',
      checkNeeded: 'Find a source.',
      status: 'open',
      ownerNote: null,
      sourceUrl: null,
      resolvedAt: null,
      suggestedSoftening: null,
      createdAt: t,
      updatedAt: t,
    })
    .execute();
  const res = await s.app.inject({ method: 'POST', url: `/api/v1/books/${bookId}/export-project`, headers: { host: HOST, origin: ORIGIN } });
  expect(res.statusCode).toBe(200);
  zip = res.rawPayload;
  const tp = await target.call<Obj>('POST', '/api/v1/profiles', { penName: 'Hosted pen name' });
  targetProfileId = str(tp.body['id']);
}, 120_000);

afterAll(async () => {
  await source.close();
  await target.close();
});

describe('project zip export (D-051)', () => {
  it('carries a manifest with checksums, the pen name only, and no jobs, spend or built exports', () => {
    const entries = readZip(zip);
    const manifestEntry = entries.find((e) => e.name === 'manifest.json');
    if (!manifestEntry) throw new Error('No manifest');
    const manifest = JSON.parse(Buffer.from(manifestEntry.data).toString()) as ProjectManifest;
    expect(manifest).toMatchObject({ format: 'volume-project', formatVersion: 1, source: { penName: 'Moving Author' } });
    expect(manifest.appVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(manifest.files.map((f) => f.name).sort()).toEqual(
      entries
        .filter((e) => e !== manifestEntry)
        .map((e) => e.name)
        .sort(),
    );
    const all = entries.map((e) => Buffer.from(e.data).toString('latin1')).join('\n');
    expect(all).not.toContain('Jane Q Legal');
    expect(all).not.toContain('Hackney');
    const project = JSON.parse(Buffer.from(entries.find((e) => e.name === 'project.json')?.data ?? []).toString()) as {
      project: Obj;
      tables: Record<string, Obj[]>;
      assets: Obj[];
    };
    expect(project.project['costToDateUsd']).toBe(0);
    expect(project.tables['exports'] ?? []).toEqual([]);
    expect(project.assets.some((a) => a['kind'] === 'export')).toBe(false);
    expect(
      project.tables['sectionVersions']
        ?.map((v) => [v['promptRunId'], v['jobId']])
        .flat()
        .filter((v) => v !== null && v !== undefined),
    ).toEqual([]);
    expect(project.assets.map((a) => a['filename'])).toContain('own.png');
  });
});

describe('POST /books/import-project (D-051)', () => {
  it('round-trips the book: sections, versions, blueprint, listing, marketing, claims and covers', async () => {
    const before = await target.handle.db.selectFrom('projects').select('id').execute();
    const res = await importZip(target, zip, targetProfileId);
    expect(res.status).toBe(201);
    const newBook = str(res.body['bookId']);
    expect(newBook).not.toBe(bookId);
    expect(res.body['profileId']).toBe(targetProfileId);
    expect((await target.handle.db.selectFrom('projects').select('id').execute()).length).toBe(before.length + 1);

    const book = res.body['book'] as Obj;
    expect(book).toMatchObject({ title: 'Calm Mornings', profileId: targetProfileId, costToDateUsd: 0 });
    const settings = book['settings'] as { origin?: { note?: string }; acknowledgements?: string };
    expect(settings.acknowledgements).toBe('Sam');
    expect(settings.origin?.note).toMatch(/^Moved from another Volume on \d{1,2} [A-Z][a-z]+ \d{4}\.$/);

    for (const table of ['sections', 'sectionVersions', 'blueprints', 'listings', 'marketingItems', 'claims', 'covers', 'titleSets', 'researchRuns']) {
      const from = await rowsOf(source, table, bookId);
      expect(from.length, table).toBeGreaterThan(0);
      expect(await rowsOf(target, table, newBook), table).toEqual(from);
    }
    // Files: every non-export file, byte for byte, owned by the new book.
    const files = async (t: TestApp, id: string) =>
      (
        await t.handle.db
          .selectFrom('assets')
          .select(['kind', 'filename', 'mime', 'sha256', 'bytes'])
          .where('projectId', '=', id)
          .where('kind', '!=', 'export')
          .execute()
      )
        .map((a) => JSON.stringify(a))
        .sort();
    expect(await files(target, newBook)).toEqual(await files(source, bookId));
    const cover = await target.services.repos.production.getCover(target.owner, newBook);
    const original = await source.services.repos.production.getCover(source.owner, bookId);
    for (const key of ['chosenAssetId', 'ebookAssetId', 'wrapAssetId'] as const) {
      const id = cover?.[key];
      const was = original?.[key];
      if (!id || !was) throw new Error(`No ${key}`);
      expect((await target.services.blobs.read(target.owner, id)).data.equals((await source.services.blobs.read(source.owner, was)).data)).toBe(true);
    }
    // The approved blueprint points at the copied version.
    const approved = await target.handle.db.selectFrom('projects').select('approvedBlueprintId').where('id', '=', newBook).executeTakeFirstOrThrow();
    expect(
      await target.handle.db
        .selectFrom('blueprints')
        .select('id')
        .where('id', '=', str(approved.approvedBlueprintId))
        .where('projectId', '=', newBook)
        .executeTakeFirst(),
    ).toBeDefined();
  });

  it('always makes a new book, never overwriting one', async () => {
    const first = await importZip(target, zip, targetProfileId);
    const second = await importZip(target, zip, targetProfileId);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body['bookId']).not.toBe(second.body['bookId']);
  });

  it('refuses a viewer with 403', async () => {
    const viewer = await testApp({ auth: (owner) => ({ resolve: () => Promise.resolve({ ...owner, role: 'viewer' }) }) });
    try {
      const p = await viewer.services.repos.profiles.create(viewer.owner, { penName: 'Viewer pen' });
      const res = await importZip(viewer, zip, p.id);
      expect(res.status).toBe(403);
      expect(await viewer.handle.db.selectFrom('projects').select('id').execute()).toHaveLength(0);
    } finally {
      await viewer.close();
    }
  });

  it("answers 404 for another workspace's pen name", async () => {
    const other = await ensureOwner(target.handle.db, 'someone-else', 'Someone else');
    const theirs = await target.services.repos.profiles.create(other, { penName: 'Not yours' });
    const res = await importZip(target, zip, theirs.id);
    expect(res.status).toBe(404);
    expect(await target.handle.db.selectFrom('projects').select('id').where('profileId', '=', theirs.id).execute()).toHaveLength(0);
  });

  it('refuses a tampered checksum or a changed file with 400 and changes nothing', async () => {
    const entries = readZip(zip);
    const before = await target.handle.db.selectFrom('projects').select('id').execute();
    const badSum = rezip(entries, (es) =>
      es.map((e) => {
        if (e.name !== 'manifest.json') return e;
        const m = JSON.parse(Buffer.from(e.data).toString()) as ProjectManifest;
        const first = m.files[0];
        if (first) first.sha256 = '0'.repeat(64);
        return { name: e.name, data: Buffer.from(JSON.stringify(m)) };
      }),
    );
    const changedFile = rezip(entries, (es) =>
      es.map((e) => (e.name.startsWith('assets/') ? { name: e.name, data: Buffer.concat([Buffer.from(e.data), Buffer.from('x')]) } : e)),
    );
    const noManifest = rezip(entries, (es) => es.filter((e) => e.name !== 'manifest.json'));
    for (const data of [badSum, changedFile, noManifest]) {
      const res = await importZip(target, data, targetProfileId);
      expect(res.status).toBe(400);
      expect(res.body['error']).toMatchObject({ code: 'validation_failed' });
    }
    expect(await target.handle.db.selectFrom('projects').select('id').execute()).toHaveLength(before.length);
  });

  it('refuses zip-slip paths and stray files', async () => {
    const entries = readZip(zip);
    for (const name of ['../evil.txt', 'assets/../../evil.txt', '/etc/evil', 'notes/extra.txt']) {
      const res = await importZip(
        target,
        rezip(entries, (es) => [...es, { name, data: Buffer.from('evil') }]),
        targetProfileId,
      );
      expect(res.status, name).toBe(400);
    }
  });

  it('refuses a too-large entry, too many entries and a zip bomb', async () => {
    const importer = new ProjectTransfer(target.handle.db, target.services.blobs, { maxEntries: 50, maxEntryBytes: 64 * 1024, maxTotalBytes: 1024 * 1024 });
    const bomb = writeZip([{ name: 'assets/BOMB', data: Buffer.alloc(512 * 1024) }]);
    expect(bomb.length).toBeLessThan(4096);
    await expect(importer.importProject(target.owner, bomb, { profileId: targetProfileId, requireManifest: true })).rejects.toThrow(/too large/);
    const many = writeZip(Array.from({ length: 60 }, (_, i) => ({ name: `assets/F${i}`, data: Buffer.from('x') })));
    await expect(importer.importProject(target.owner, many, { profileId: targetProfileId, requireManifest: true })).rejects.toThrow(/too many/);
    const total = writeZip(Array.from({ length: 20 }, (_, i) => ({ name: `assets/T${i}`, data: Buffer.alloc(60 * 1024, i) })));
    await expect(importer.importProject(target.owner, total, { profileId: targetProfileId, requireManifest: true })).rejects.toThrow(/too large/);
  });

  it('answers 413 for an upload over MAX_UPLOAD_BYTES and 415 for a file that is not a zip', async () => {
    const small = await testApp({ config: testConfig({ MAX_UPLOAD_BYTES: '4096' }) });
    try {
      const p = await small.services.repos.profiles.create(small.owner, { penName: 'Small' });
      expect((await importZip(small, Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.alloc(200 * 1024)]), p.id)).status).toBe(413);
      expect((await importZip(small, Buffer.from('not a zip at all'), p.id)).status).toBe(415);
    } finally {
      await small.close();
    }
  });

  it('refuses a missing or unknown form field and a JSON body', async () => {
    const noProfile = form({}, { name: 'a.zip', data: zip });
    const extra = form({ profileId: targetProfileId, workspaceId: 'x' }, { name: 'a.zip', data: zip });
    for (const f of [noProfile, extra, form({ profileId: targetProfileId })]) {
      const res = await target.app.inject({
        method: 'POST',
        url: '/api/v1/books/import-project',
        headers: { host: HOST, origin: ORIGIN, 'content-type': f.type },
        payload: f.payload,
        remoteAddress: nextIp(),
      });
      expect(res.statusCode).toBe(400);
    }
    expect((await target.call('POST', '/api/v1/books/import-project', { profileId: targetProfileId })).status).toBe(415);
  });

  it('rate-limits imports per client', async () => {
    const t = await testApp();
    try {
      const statuses: number[] = [];
      for (let i = 0; i < 6; i += 1) statuses.push((await importZip(t, Buffer.from('nope'), 'missing', '192.0.2.7')).status);
      expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
      expect(statuses[5]).toBe(429);
    } finally {
      await t.close();
    }
  });
});

describe('import hardening (D-051 review)', () => {
  it("gives an editor's import the workspace default budget, and clamps the owner's", async () => {
    const huge = forge((f) => {
      f.project['budgetUsd'] = 999999;
    });
    const editor = await testApp({ auth: (owner) => ({ resolve: () => Promise.resolve({ ...owner, role: 'editor' }) }) });
    try {
      const p = await editor.services.repos.profiles.create(editor.owner, { penName: 'Editor pen' });
      const res = await importZip(editor, huge, p.id);
      expect(res.status).toBe(201);
      expect((res.body['book'] as Obj)['budgetUsd']).toBe((await editor.services.repos.settings.all(editor.owner))['budget.book_default_usd'] ?? 15);
    } finally {
      await editor.close();
    }
    const owner = await importZip(target, huge, targetProfileId);
    expect((owner.body['book'] as Obj)['budgetUsd']).toBe(10000);
  });

  it('refuses a book row that breaks the book rules or a link to the wrong kind of row', async () => {
    const before = await counts(target);
    const badStage = forge((f) => {
      f.project['stage'] = 'published-everywhere';
    });
    const badSettings = forge((f) => {
      f.project['settings'] = JSON.stringify({ coverConcepts: 99 });
    });
    const wrongLink = forge((f) => {
      f.project['approvedBlueprintId'] = f.tables['sections']?.[0]?.['id'] ?? null;
    });
    for (const data of [badStage, badSettings, wrongLink]) expect((await importZip(target, data, targetProfileId)).status).toBe(400);
    expect(await counts(target)).toEqual(before);
  });

  it('rolls back every row, file and chunk when a file fails its signature mid-import', async () => {
    const before = await counts(target);
    const fake = Buffer.from('this is not a PNG at all');
    const data = forge((f, files) => {
      const png = f.assets.find((a) => a['mime'] === 'image/png');
      if (!png) throw new Error('No PNG');
      files.set(`assets/${String(png['id'])}`, fake);
      png['bytes'] = fake.length;
      png['sha256'] = createHash('sha256').update(fake).digest('hex');
    });
    const res = await importZip(target, data, targetProfileId);
    expect(res.status).toBe(415);
    expect(await counts(target)).toEqual(before);
  });

  it('needs an Origin header or Sec-Fetch-Site same-origin', async () => {
    const { payload, type } = form({ profileId: targetProfileId }, { name: 'a.zip', data: zip });
    const send = (extra: Record<string, string>) =>
      target.app.inject({
        method: 'POST',
        url: '/api/v1/books/import-project',
        headers: { host: HOST, 'content-type': type, ...extra },
        payload,
        remoteAddress: nextIp(),
      });
    expect((await send({})).statusCode).toBe(403);
    expect((await send({ 'sec-fetch-site': 'cross-site' })).statusCode).toBe(403);
    expect((await send({ 'sec-fetch-site': 'same-origin' })).statusCode).toBe(201);
  });

  it('runs one import at a time per workspace', async () => {
    // Hold the first import open until the second has been answered.
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const original = ProjectTransfer.prototype.importProject;
    const spy = vi.spyOn(ProjectTransfer.prototype, 'importProject').mockImplementationOnce(async function (this: ProjectTransfer, ...args) {
      await held;
      return original.apply(this, args);
    });
    try {
      const first = importZip(target, zip, targetProfileId);
      await vi.waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
      expect((await importZip(target, zip, targetProfileId)).status).toBe(409);
      release();
      expect((await first).status).toBe(201);
      expect((await importZip(target, zip, targetProfileId)).status).toBe(201);
    } finally {
      release();
      spy.mockRestore();
    }
  });

  it('maps moved ids inside JSON and clears ids of rows that did not move', () => {
    const moved = newId();
    const gone = newId();
    const ids = new Map([[moved, 'NEW']]);
    const out = JSON.parse(
      remapJson(
        JSON.stringify([
          { assetId: moved, prompt: 'x' },
          { asset_id: gone, note: `kept ${gone}` },
        ]),
        ids,
      ),
    ) as Obj[];
    expect(out).toEqual([
      { assetId: 'NEW', prompt: 'x' },
      { asset_id: null, note: `kept ${gone}` },
    ]);
  });
});

describe('parseMultipart', () => {
  it('reads fields and a file, and refuses malformed bodies', () => {
    const f = form({ profileId: 'abc' }, { name: 'x.zip', data: Buffer.from('PK\u0003\u0004data\r\n--not-a-boundary') });
    const parts = parseMultipart(f.type, f.payload);
    expect(parts.map((p) => [p.name, p.filename])).toEqual([
      ['profileId', null],
      ['file', 'x.zip'],
    ]);
    expect(parts[1]?.data.toString()).toBe('PK\u0003\u0004data\r\n--not-a-boundary');
    expect(() => parseMultipart('multipart/form-data', f.payload)).toThrow();
    expect(() => parseMultipart(f.type, f.payload.subarray(0, f.payload.length - 40))).toThrow();
    expect(() => parseMultipart('application/json', f.payload)).toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { migrateToLatest, openMysql } from '../src/db/connect.js';
import { BlobStore } from '../src/files/blob-store.js';
import { createRepos } from '../src/repos/index.js';
import { readZip, zipStream } from '../src/lib/zip.js';
import { acceptInvitation } from '../src/repos/members.js';
import { ProjectTransfer } from '../src/repos/transfer.js';
import { WORKSPACE_TABLES, WorkspaceData } from '../src/repos/workspace-data.js';
import { EventBus } from '../src/sse/bus.js';
import { ulid } from 'ulid';

/**
 * Runs only when MYSQL_TEST_URL is set, for example
 *   MYSQL_TEST_URL=mysql://user:pass@host:3306/volume_test npm run test -w apps/server
 * Use an empty, throwaway database: the test creates tables in it.
 */
const url = process.env['MYSQL_TEST_URL'];

function open() {
  const u = new URL(url as string);
  return openMysql({
    host: u.hostname,
    port: Number(u.port || 3306),
    database: u.pathname.replace(/^\//, ''),
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    ssl: u.searchParams.get('ssl') === 'off' ? 'off' : 'verify',
    socketPath: null,
    sslCaPath: null,
    connectionLimit: 2,
  });
}

describe.skipIf(!url)('MySQL dialect (MYSQL_TEST_URL)', () => {
  it('migrates, runs repos and round-trips a blob', async () => {
    const handle = open();
    try {
      await migrateToLatest(handle);
      const ctx = await ensureOwner(handle.db, `t-${Date.now()}`, 'MySQL test');
      const repos = createRepos(handle.db);
      const p = await repos.profiles.create(ctx, { penName: 'MySQL Author', voice: { tone: ['dry'] } });
      expect((await repos.profiles.require(ctx, p.id)).voice).toEqual({ tone: ['dry'] });
      const store = new BlobStore(handle.db);
      const data = Buffer.alloc(2 * 1024 * 1024 + 5, 7);
      const meta = await store.put(ctx, { kind: 'import', filename: 'x.bin', mime: 'application/octet-stream' }, data);
      const back = await store.read(ctx, meta.id);
      expect(back.data.equals(data)).toBe(true);
      // 0009: an invitation is accepted into its workspace with its role.
      const email = `mysql-${Date.now()}@example.test`;
      await repos.members.invite(ctx, { email, role: 'viewer' });
      const joined = await acceptInvitation(handle.db, `user_mysql_${Date.now()}`, [email]);
      expect(joined).toMatchObject({ workspaceId: ctx.workspaceId, role: 'viewer' });
      expect((await repos.members.listMembers(ctx)).map((m) => m.email)).toContain(email);
      // Parallel invites of one address leave one pending row (unique workspace_id, pending_email).
      const twin = `twin-${Date.now()}@example.test`;
      const invites = await Promise.all([1, 2, 3].map(() => repos.members.invite(ctx, { email: twin, role: 'viewer' })));
      expect(new Set(invites.map((i) => i.id)).size).toBe(1);
      // Parallel slot adds: the workspace row lock lets only the limit through.
      const books = await Promise.all(
        [1, 2, 3].map((n) => repos.books.create(ctx, { profileId: p.id, idea: `Slot ${n}` }, { budgetUsd: 10, illustrativeLine: false })),
      );
      const limit = { maxNewTitlesPerFormat: 1, periodDays: 7, ruleId: 'titles.creationLimit', rulesVersion: 'test' };
      const at = Date.UTC(2027, 0, 10);
      const added = await Promise.allSettled(books.map((b) => repos.schedule.add(ctx, { bookId: b.id, format: 'ebook', plannedAt: at }, limit)));
      expect(added.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    } finally {
      await handle.close();
    }
  });

  it('exports, deletes a guest workspace and prunes old events (D-050)', async () => {
    const handle = open();
    try {
      await migrateToLatest(handle);
      const owner = await ensureOwner(handle.db, `o-${Date.now()}`, 'Instance');
      const guest = await ensureOwner(handle.db, `g-${Date.now()}`, 'Guest');
      const repos = createRepos(handle.db);
      const ownerBefore = await repos.profiles.create(owner, { penName: 'Owner Pen' });
      const p = await repos.profiles.create(guest, { penName: 'Guest Pen', legalName: 'Guest Legal' });
      const book = await repos.books.create(guest, { profileId: p.id, idea: 'Guest book' }, { budgetUsd: 5, illustrativeLine: false });
      const store = new BlobStore(handle.db, 64 * 1024);
      await store.put(guest, { kind: 'other', filename: 'big.bin', mime: 'application/octet-stream', projectId: book.id }, Buffer.alloc(300_000, 3));
      const data = new WorkspaceData(handle.db, store);
      const parts: Buffer[] = [];
      for await (const b of zipStream(data.exportEntries(guest))) parts.push(b);
      const names = readZip(Buffer.concat(parts)).map((e) => e.name);
      expect(names).toContain('tables/projects.json');
      expect(names.some((n) => n.startsWith('files/'))).toBe(true);

      await data.deleteWorkspace(guest, owner.workspaceId);
      for (const table of WORKSPACE_TABLES)
        expect(await handle.db.selectFrom(table).select('id').where('workspaceId', '=', guest.workspaceId).execute(), table).toEqual([]);
      expect(await handle.db.selectFrom('assetChunks').select('assetId').where('workspaceId', '=', guest.workspaceId).execute()).toEqual([]);
      expect(await handle.db.selectFrom('workspaces').select('id').where('id', '=', guest.workspaceId).execute()).toEqual([]);
      expect((await repos.profiles.require(owner, ownerBefore.id)).penName).toBe('Owner Pen');
      await expect(data.deleteWorkspace(owner, owner.workspaceId)).rejects.toThrow();

      const at = Date.now();
      const old = Array.from({ length: 5 }, (_, i) => ({
        id: ulid(at - (100 + i) * 86_400_000),
        workspaceId: owner.workspaceId,
        projectId: null,
        jobId: null,
        type: 'job.status',
        data: '{}',
        createdAt: at - (100 + i) * 86_400_000,
      }));
      const fresh = { ...old[0]!, id: ulid(at), createdAt: at };
      await handle.db
        .insertInto('jobEvents')
        .values([...old, fresh])
        .execute();
      expect(await new EventBus(handle.db).prune(90, at, 2)).toBeGreaterThanOrEqual(5);
      expect(await handle.db.selectFrom('jobEvents').select('id').where('id', '=', fresh.id).execute()).toHaveLength(1);
    } finally {
      await handle.close();
    }
  });

  it('moves a book to another workspace by project zip (D-051)', async () => {
    const handle = open();
    try {
      await migrateToLatest(handle);
      const from = await ensureOwner(handle.db, `mf-${Date.now()}`, 'From');
      const to = await ensureOwner(handle.db, `mt-${Date.now()}`, 'To');
      const repos = createRepos(handle.db);
      const p = await repos.profiles.create(from, { penName: 'Mover', legalName: 'Private Legal' });
      const book = await repos.books.create(from, { profileId: p.id, idea: 'Moving book', title: 'Moving Book' }, { budgetUsd: 5, illustrativeLine: false });
      const [section] = await repos.manuscript.addSections(from, book.id, [
        { kind: 'chapter', area: 'body', title: 'One', number: 1, enabled: true, partId: null },
      ]);
      if (!section) throw new Error('No section');
      await repos.manuscript.saveVersion(from, section.id, { bodyMd: 'First draft.', source: 'human', note: null });
      await repos.manuscript.saveVersion(from, section.id, { bodyMd: 'Second draft.', source: 'human', note: null });
      const store = new BlobStore(handle.db, 64 * 1024);
      const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200_000, 5)]);
      await store.put(from, { kind: 'cover_concept', filename: 'own.png', mime: 'image/png', projectId: book.id }, png);
      const { zip } = await new ProjectTransfer(handle.db, store).exportProject(from, book.id);
      const target = await repos.profiles.create(to, { penName: 'Hosted' });
      const result = await new ProjectTransfer(handle.db, store).importProject(to, zip, { profileId: target.id, requireManifest: true });
      expect(result).toMatchObject({ profileId: target.id, assets: 1 });
      const versions = await handle.db
        .selectFrom('sectionVersions')
        .select(['bodyMd', 'version'])
        .where('projectId', '=', result.bookId)
        .where('workspaceId', '=', to.workspaceId)
        .orderBy('version')
        .execute();
      expect(versions.map((v) => v.bodyMd)).toEqual(['First draft.', 'Second draft.']);
      const asset = await handle.db.selectFrom('assets').select('id').where('projectId', '=', result.bookId).executeTakeFirstOrThrow();
      expect((await store.read(to, asset.id)).data.equals(png)).toBe(true);
      expect((await repos.books.require(from, book.id)).title).toBe('Moving Book');
    } finally {
      await handle.close();
    }
  });
});

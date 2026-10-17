import { describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { migrateToLatest, openMysql } from '../src/db/connect.js';
import { BlobStore } from '../src/files/blob-store.js';
import { createRepos } from '../src/repos/index.js';
import { acceptInvitation } from '../src/repos/members.js';

/**
 * Runs only when MYSQL_TEST_URL is set, for example
 *   MYSQL_TEST_URL=mysql://user:pass@host:3306/volume_test npm run test -w apps/server
 * Use an empty, throwaway database: the test creates tables in it.
 */
const url = process.env['MYSQL_TEST_URL'];

describe.skipIf(!url)('MySQL dialect (MYSQL_TEST_URL)', () => {
  it('migrates, runs repos and round-trips a blob', async () => {
    const u = new URL(url as string);
    const handle = openMysql({
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
});

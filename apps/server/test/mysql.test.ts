import { describe, expect, it } from 'vitest';
import { ensureOwner } from '../src/auth/context.js';
import { migrateToLatest, openMysql } from '../src/db/connect.js';
import { BlobStore } from '../src/files/blob-store.js';
import { createRepos } from '../src/repos/index.js';

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
    } finally {
      await handle.close();
    }
  });
});

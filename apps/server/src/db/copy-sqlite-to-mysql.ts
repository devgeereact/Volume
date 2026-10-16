import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type SqliteDatabase from 'better-sqlite3';
import { Kysely, sql, SqliteDialect } from 'kysely';
import { loadConfig } from '../config/env.js';
import { migrateToLatest, openMysql, pendingMigrations, type DbHandle } from './connect.js';
import type { Database } from './schema.js';

/**
 * One-off copy of a local Volume library (SQLite file) into the hosted MySQL database. Run on the Mac, from the repo:
 *
 *   npm run db:copy-to-mysql -w apps/server -- --from <path to volume.sqlite> [--replace]
 *
 * MySQL comes from the environment (MYSQL_HOST, MYSQL_PORT, MYSQL_DATABASE, MYSQL_MIGRATE_USER and
 * MYSQL_MIGRATE_PASSWORD, or MYSQL_USER and MYSQL_PASSWORD), for example through an SSH tunnel to the host.
 * - The SQLite file is opened read-only and must be fully migrated (start the local app once if not).
 * - The target is migrated to the latest schema, then must be empty. --replace empties it first (destructive).
 * - Every table is copied as stored (files are BLOB chunks in the database), then row counts are compared.
 * It prints table names and counts only, never row contents.
 */

const SKIP = /^(kysely_migration|kysely_migration_lock|sqlite_)/;
/** Rows per INSERT; blob chunks (1 MB each) go a few at a time to stay under max_allowed_packet. */
const BATCH_ROWS = 200;
const BATCH_BLOB_ROWS = 4;

type Row = Record<string, unknown>;
type RawDb = Kysely<Record<string, Row>>;

function argValue(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function openSqliteReadOnly(path: string): DbHandle {
  const require = createRequire(import.meta.url);
  const Sqlite = require('better-sqlite3') as typeof SqliteDatabase;
  const db = new Kysely<Database>({ dialect: new SqliteDialect({ database: new Sqlite(path, { readonly: true, fileMustExist: true }) }) });
  return { db, dialect: 'sqlite', close: () => db.destroy() };
}

async function tableNames(db: RawDb): Promise<string[]> {
  const tables = await db.introspection.getTables();
  return tables.map((t) => t.name).filter((n) => !SKIP.test(n));
}

async function count(db: RawDb, table: string): Promise<number> {
  const r = await db
    .selectFrom(table)
    .select(sql<number>`count(*)`.as('n'))
    .executeTakeFirstOrThrow();
  return Number(r['n']);
}

async function run(): Promise<void> {
  const from = argValue('--from');
  const replace = process.argv.includes('--replace');
  if (!from) throw new Error('Pass --from <path to the SQLite file>.');
  const sqlitePath = resolve(from);
  if (!existsSync(sqlitePath)) throw new Error(`No SQLite file at ${sqlitePath}.`);

  const config = loadConfig({ env: { ...process.env, DB_CLIENT: 'mysql' } });
  if (config.db.client !== 'mysql') throw new Error('MySQL settings are missing.');
  const user = process.env['MYSQL_MIGRATE_USER']?.trim();
  const mysqlCfg = user ? { ...config.db.mysql, user, password: process.env['MYSQL_MIGRATE_PASSWORD'] ?? '' } : config.db.mysql;

  const source = openSqliteReadOnly(sqlitePath);
  const target = openMysql({ ...mysqlCfg, connectionLimit: 1 });
  try {
    const behind = await pendingMigrations(source);
    if (behind.length > 0) throw new Error(`The SQLite file is missing migrations (${behind.join(', ')}). Start the local app once, then retry.`);
    await migrateToLatest(target);

    const src = source.db.withoutPlugins() as unknown as RawDb;
    const dst = target.db.withoutPlugins() as unknown as RawDb;
    const tables = await tableNames(src);
    const targetTables = new Set(await tableNames(dst));
    const missing = tables.filter((t) => !targetTables.has(t));
    if (missing.length > 0) throw new Error(`MySQL lacks tables: ${missing.join(', ')}.`);

    await dst.connection().execute(async (conn) => {
      await sql`SET FOREIGN_KEY_CHECKS = 0`.execute(conn);
      try {
        const busy: string[] = [];
        for (const t of tables) if ((await count(conn, t)) > 0) busy.push(t);
        if (busy.length > 0 && !replace) {
          throw new Error(`MySQL already holds rows in ${busy.join(', ')}. Copy into an empty database, or pass --replace to empty it first.`);
        }
        if (replace) for (const t of busy) await conn.deleteFrom(t).execute();

        for (const t of tables) {
          const total = await count(src, t);
          const step = t === 'asset_chunks' ? BATCH_BLOB_ROWS : BATCH_ROWS;
          for (let offset = 0; offset < total; offset += step) {
            const rows = await src
              .selectFrom(t)
              .selectAll()
              .orderBy(sql`rowid`)
              .limit(step)
              .offset(offset)
              .execute();
            if (rows.length > 0) await conn.insertInto(t).values(rows).execute();
          }
          const copied = await count(conn, t);
          process.stdout.write(`${t}: ${total} -> ${copied}${copied === total ? '' : '  MISMATCH'}\n`);
          if (copied !== total) throw new Error(`Row counts differ for ${t}.`);
        }
      } finally {
        await sql`SET FOREIGN_KEY_CHECKS = 1`.execute(conn);
      }
    });
    process.stdout.write('Copy complete. Row counts match for every table.\n');
  } finally {
    await source.close();
    await target.close();
  }
}

run().catch((err: unknown) => {
  process.stderr.write(`Copy failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

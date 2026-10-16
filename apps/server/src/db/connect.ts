import { chmodSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import type SqliteDatabase from 'better-sqlite3';
import { CamelCasePlugin, Kysely, MysqlDialect, SqliteDialect } from 'kysely';
import { Migrator, type MigrationResultSet } from 'kysely/migration';
import { createPool, type PoolOptions } from 'mysql2';
import type { AppConfig, MysqlConfig } from '../config/env.js';
import { VolumeMigrationProvider } from './migrations/index.js';
import type { Dialect } from './migrations/types.js';
import type { Database } from './schema.js';

export type Db = Kysely<Database>;

export interface DbHandle {
  db: Db;
  dialect: Dialect;
  close(): Promise<void>;
}

function withPlugins(db: Kysely<Database>): Kysely<Database> {
  return db.withPlugin(new CamelCasePlugin());
}

/**
 * better-sqlite3 is loaded only when SQLite is used. It is a development dependency: the production host runs MySQL
 * and cannot load its prebuilt binary (glibc 2.28), and a production install leaves it out.
 */
function loadSqlite(): typeof SqliteDatabase {
  const require = createRequire(import.meta.url);
  try {
    return require('better-sqlite3') as typeof SqliteDatabase;
  } catch (err) {
    throw new Error('DB_CLIENT=sqlite needs better-sqlite3, a development dependency. Install with npm run setup, or use DB_CLIENT=mysql.', {
      cause: err,
    });
  }
}

/** Opens SQLite (file or ':memory:'), WAL mode, foreign keys on. */
export function openSqlite(path: string): DbHandle {
  const SqliteDatabase = loadSqlite();
  if (path !== ':memory:') {
    const dir = dirname(path);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
    }
  }
  const sqlite = new SqliteDatabase(path);
  if (path !== ':memory:') {
    sqlite.pragma('journal_mode = WAL');
    try {
      chmodSync(path, 0o600);
    } catch {
      // best effort on file permissions
    }
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  const db = withPlugins(new Kysely<Database>({ dialect: new SqliteDialect({ database: sqlite }) }));
  return { db, dialect: 'sqlite', close: () => db.destroy() };
}

export function mysqlPoolOptions(cfg: MysqlConfig): PoolOptions {
  const opts: PoolOptions = {
    ...(cfg.socketPath ? { socketPath: cfg.socketPath } : { host: cfg.host, port: cfg.port }),
    database: cfg.database,
    user: cfg.user,
    password: cfg.password,
    connectionLimit: cfg.connectionLimit,
    charset: 'utf8mb4',
    timezone: 'Z',
    // BIGINT millisecond times fit in a JS number; keep them numbers.
    supportBigNumbers: true,
    bigNumberStrings: false,
    connectTimeout: 15000,
    enableKeepAlive: true,
  };
  if (cfg.ssl === 'verify') {
    // Certificate is always verified. A host with a private CA supplies it via MYSQL_SSL_CA.
    opts.ssl = cfg.sslCaPath ? { ca: readFileSync(cfg.sslCaPath, 'utf8') } : {};
  }
  return opts;
}

export function openMysql(cfg: MysqlConfig): DbHandle {
  const pool = createPool(mysqlPoolOptions(cfg));
  const db = withPlugins(new Kysely<Database>({ dialect: new MysqlDialect({ pool }) }));
  return { db, dialect: 'mysql', close: () => db.destroy() };
}

export function openDatabase(config: AppConfig): DbHandle {
  return config.db.client === 'mysql' ? openMysql(config.db.mysql) : openSqlite(config.db.sqlitePath);
}

export async function migrateToLatest(handle: DbHandle): Promise<MigrationResultSet> {
  const result = await migrator(handle).migrateToLatest();
  if (result.error) {
    const err = result.error instanceof Error ? result.error : new Error('Kysely reported a migration error that is not an Error.', { cause: result.error });
    throw Object.assign(new Error(`Migration failed: ${err.message}`), { cause: err, results: result.results });
  }
  return result;
}

function migrator(handle: DbHandle): Migrator {
  return new Migrator({ db: handle.db.withoutPlugins(), provider: new VolumeMigrationProvider(handle.dialect) });
}

/** Names of migrations not yet applied. Needs SELECT only, so the runtime database user can call it. */
export async function pendingMigrations(handle: DbHandle): Promise<string[]> {
  const all = await migrator(handle).getMigrations();
  return all.filter((m) => m.executedAt === undefined).map((m) => m.name);
}

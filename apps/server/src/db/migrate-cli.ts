import { loadConfig, type AppConfig } from '../config/env.js';
import { migrateToLatest, openDatabase, pendingMigrations } from './connect.js';

/**
 * npm run migrate -w apps/server (or `node server/migrate.mjs` in a release): applies pending migrations.
 * `status` lists pending ones without changing anything.
 *
 * On MySQL it connects as MYSQL_MIGRATE_USER / MYSQL_MIGRATE_PASSWORD when they are set (the migration user, with
 * CREATE, ALTER, INDEX, DROP and REFERENCES). The running app uses MYSQL_USER, which only needs SELECT, INSERT,
 * UPDATE and DELETE.
 */
function withMigrationUser(config: AppConfig): AppConfig {
  if (config.db.client !== 'mysql') return config;
  const user = process.env['MYSQL_MIGRATE_USER']?.trim();
  if (!user) return config;
  return { ...config, db: { client: 'mysql', mysql: { ...config.db.mysql, user, password: process.env['MYSQL_MIGRATE_PASSWORD'] ?? '' } } };
}

async function run(): Promise<void> {
  const statusOnly = process.argv.slice(2).includes('status');
  const config = withMigrationUser(loadConfig());
  const handle = openDatabase(config);
  try {
    const m = config.db.client === 'mysql' ? config.db.mysql : null;
    const where = m ? `MySQL ${m.socketPath ?? `${m.host}:${m.port}`}/${m.database} as ${m.user}` : 'SQLite (local file)';
    process.stdout.write(`${statusOnly ? 'Checking' : 'Migrating'} ${where}\n`);
    if (statusOnly) {
      const pending = await pendingMigrations(handle);
      process.stdout.write(pending.length === 0 ? 'Up to date.\n' : `Pending: ${pending.join(', ')}\n`);
      if (pending.length > 0) process.exitCode = 2;
      return;
    }
    const res = await migrateToLatest(handle);
    const done = res.results ?? [];
    if (done.length === 0) process.stdout.write('Already up to date.\n');
    for (const r of done) process.stdout.write(`${r.status}: ${r.migrationName}\n`);
  } finally {
    await handle.close();
  }
}

run().catch((err: unknown) => {
  process.stderr.write(`Migration failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

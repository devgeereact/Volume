import { loadConfig } from '../config/env.js';
import { migrateToLatest, openDatabase } from './connect.js';

/** npm run migrate -w apps/server: applies pending migrations to the configured database. */
async function run(): Promise<void> {
  const config = loadConfig();
  const handle = openDatabase(config);
  try {
    const where = config.db.client === 'mysql' ? `MySQL ${config.db.mysql.host}:${config.db.mysql.port}/${config.db.mysql.database}` : 'SQLite (local file)';
    process.stdout.write(`Migrating ${where}\n`);
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

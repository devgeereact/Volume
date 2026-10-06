import { ensureOwner } from '../auth/context.js';
import { loadConfig } from '../config/env.js';
import { migrateToLatest, openDatabase } from '../db/connect.js';
import { createRepos } from '../repos/index.js';
import { seedProfiles } from './seed.js';

/** npm run seed -w apps/server: copies config/profiles/*.json into the database (new ones only). */
async function run(): Promise<void> {
  const config = loadConfig();
  const handle = openDatabase(config);
  try {
    await migrateToLatest(handle);
    const owner = await ensureOwner(handle.db);
    const report = await seedProfiles(createRepos(handle.db), owner, config.configDir);
    if (!report.folderFound) {
      process.stdout.write('config/profiles has no profile files: nothing seeded.\n');
      return;
    }
    process.stdout.write(`Created: ${report.created.join(', ') || 'none'}\nAlready present: ${report.skipped.join(', ') || 'none'}\n`);
    if (report.bioFilled.length) process.stdout.write(`Bio filled from config: ${report.bioFilled.join(', ')}\n`);
    for (const i of report.invalid) process.stdout.write(`Invalid ${i.file}: ${i.reason}\n`);
  } finally {
    await handle.close();
  }
}

run().catch((err: unknown) => {
  process.stderr.write(`Seed failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

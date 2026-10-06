import type { Migration, MigrationProvider } from 'kysely/migration';
import * as m0001 from './0001_initial.js';
import * as m0002 from './0002_gaps.js';
import * as m0003 from './0003_round2.js';
import * as m0004 from './0004_version_guardrails.js';
import { columnTypes, type Dialect, type MigrationContext, type MigrationDb } from './types.js';

interface DialectMigration {
  up: (m: MigrationContext) => Promise<void>;
  down?: (m: MigrationContext) => Promise<void>;
}

/** Ordered list. Names sort alphanumerically; add new files with the next number. */
const ALL: [string, DialectMigration][] = [
  ['0001_initial', m0001],
  ['0002_gaps', m0002],
  ['0003_round2', m0003],
  ['0004_version_guardrails', m0004],
];

/**
 * Static provider (no folder scanning), so the same migrations work from
 * src under tsx, from dist under node, and inside tests.
 */
export class VolumeMigrationProvider implements MigrationProvider {
  constructor(private readonly dialect: Dialect) {}

  getMigrations(): Promise<Record<string, Migration>> {
    const t = columnTypes(this.dialect);
    const out: Record<string, Migration> = {};
    for (const [name, mig] of ALL) {
      const migration: Migration = {
        up: (db: MigrationDb) => mig.up({ db, dialect: this.dialect, t }),
      };
      if (mig.down) {
        const down = mig.down;
        migration.down = (db: MigrationDb) => down({ db, dialect: this.dialect, t });
      }
      out[name] = migration;
    }
    return Promise.resolve(out);
  }
}

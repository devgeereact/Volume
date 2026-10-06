import type { MigrationContext } from './types.js';

/**
 * Round 2 fields (additive):
 * - claims.suggested_softening: a softer wording from the checks stage, offered as the default for "soften".
 * - marketing_items.extras: JSON for kind-specific fields (all launch email subject lines, Instagram image idea).
 */
export async function up(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('claims').addColumn('suggested_softening', m.t.text).execute();
  await m.db.schema.alterTable('marketing_items').addColumn('extras', m.t.json).execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('marketing_items').dropColumn('extras').execute();
  await m.db.schema.alterTable('claims').dropColumn('suggested_softening').execute();
}

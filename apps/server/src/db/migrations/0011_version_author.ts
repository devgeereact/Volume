import type { MigrationContext } from './types.js';

/**
 * Version author (claims and autosave, 19 October 2026), additive: section_versions.created_by is the user who saved
 * an owner version (explicit save, autosave, claim fix). Autosave coalesces only into the same user's own autosave.
 * AI, app and older rows have null.
 */
export async function up(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('section_versions').addColumn('created_by', m.t.id).execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('section_versions').dropColumn('created_by').execute();
}

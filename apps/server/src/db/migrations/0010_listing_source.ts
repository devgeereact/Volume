import type { MigrationContext } from './types.js';

/**
 * Listing source (second live acceptance run, 19 October 2026), additive: listings.source says who wrote the row's
 * text. The listing job (matter stage) writes `ai:matter`. Rows from before have null. The pack prefers the owner's
 * own blueprint edits to the description, keywords, categories and blurb over any `ai:matter` text.
 */
export async function up(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('listings').addColumn('source', m.t.short).execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('listings').dropColumn('source').execute();
}

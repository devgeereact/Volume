import type { MigrationContext } from './types.js';

/**
 * Round 5 (additive):
 * - section_versions.guardrails: the code guardrail report for that version's text (house-style patterns, banned
 *   phrases, links, ISBNs, source markers), worked out on every save, so what the screens show always matches the
 *   saved words (owner edits, replace, restore and accepted suggestions included).
 */
export async function up(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('section_versions').addColumn('guardrails', m.t.json).execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('section_versions').dropColumn('guardrails').execute();
}

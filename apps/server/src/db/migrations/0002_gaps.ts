import type { MigrationContext } from './types.js';

/**
 * Gap fields for the web screens (all additive, nothing renamed or removed):
 * - research_sources: redirect_url and unresolved from @volume/ai sources (domain already exists).
 * - prompt_runs: guardrails, the stage's guardrail report as JSON.
 * - projects: list_prices (owner-entered, pounds, JSON) and marketplace.
 * - author_profiles: bio_status (confirmed or to_confirm), filled for existing rows from the seeded status.
 *
 * Runs on SQLite and MySQL. JSON columns stay nullable (MySQL text columns cannot have a default).
 */

const NEW_COLUMNS: [table: string, column: string][] = [
  ['research_sources', 'redirect_url'],
  ['research_sources', 'unresolved'],
  ['prompt_runs', 'guardrails'],
  ['projects', 'list_prices'],
  ['projects', 'marketplace'],
  ['author_profiles', 'bio_status'],
];

/** Seeded profile files say status.bio = owner-to-confirm, confirmed or pen-name. */
export function bioStatusFromPublishing(publishingJson: string | null): 'confirmed' | 'to_confirm' | null {
  if (!publishingJson) return null;
  try {
    const p = JSON.parse(publishingJson) as { sourceStatus?: { bio?: unknown } | null };
    const bio = p.sourceStatus?.bio;
    if (typeof bio !== 'string') return null;
    return bio === 'owner-to-confirm' ? 'to_confirm' : 'confirmed';
  } catch {
    return null;
  }
}

export async function up(m: MigrationContext): Promise<void> {
  const { db, t } = m;
  await db.schema.alterTable('research_sources').addColumn('redirect_url', t.text).execute();
  await db.schema
    .alterTable('research_sources')
    .addColumn('unresolved', t.bool, (c) => c.notNull().defaultTo(0))
    .execute();
  await db.schema.alterTable('prompt_runs').addColumn('guardrails', t.json).execute();
  await db.schema.alterTable('projects').addColumn('list_prices', t.json).execute();
  await db.schema.alterTable('projects').addColumn('marketplace', t.str).execute();
  await db.schema.alterTable('author_profiles').addColumn('bio_status', t.short).execute();

  // Existing profiles: seeded ones keep their config status; profiles made in the app count as confirmed.
  const rows = (await db.selectFrom('author_profiles').select(['id', 'publishing']).execute()) as { id: string; publishing: string | null }[];
  for (const r of rows) {
    const status = bioStatusFromPublishing(r.publishing) ?? 'confirmed';
    await db.updateTable('author_profiles').set({ bio_status: status }).where('id', '=', r.id).execute();
  }
}

export async function down(m: MigrationContext): Promise<void> {
  for (const [table, column] of [...NEW_COLUMNS].reverse()) {
    await m.db.schema.alterTable(table).dropColumn(column).execute();
  }
}

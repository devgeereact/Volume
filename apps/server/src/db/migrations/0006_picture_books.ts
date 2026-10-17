import { tableEnd, type MigrationContext } from './types.js';

/**
 * Picture books (phase 7, P7-5, D-044, D-045), additive:
 * - sections.layout: where the text sits on a spread (text-left, text-right, text-top, text-bottom). Null for every
 *   other section kind. Spreads are sections of kind `spread` in the body; their text is the current version, and
 *   the scene (summary, image prompt, characters shown) is in sections.plan.
 * - sections.image_asset_id: the spread's 2:1 picture (an asset of kind spread_image). Null until it is made.
 * - picture_characters: one row per character sheet of a picture book. sheet is the character sheet repeated word for
 *   word in every scene prompt; main is 1 when the character appears in more than one spread; reference_prompt and
 *   reference_asset_id hold the neutral full-body reference picture sent as an input reference with every spread
 *   that shows the character (D-045).
 *
 * Number 0006 is reserved for this package by docs/08-change-management/plans/PHASES-6-8.md (0008 and 0009 already
 * exist; a fresh database applies them all in name order).
 */
export async function up(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('sections').addColumn('layout', m.t.short).execute();
  await m.db.schema.alterTable('sections').addColumn('image_asset_id', m.t.id).execute();

  await tableEnd(
    m.db.schema
      .createTable('picture_characters')
      .addColumn('id', m.t.id, (c) => c.primaryKey().notNull())
      .addColumn('workspace_id', m.t.id, (c) => c.notNull())
      .addColumn('project_id', m.t.id, (c) => c.notNull())
      .addColumn('name', m.t.str, (c) => c.notNull())
      .addColumn('position', m.t.int, (c) => c.notNull())
      .addColumn('sheet', m.t.text, (c) => c.notNull())
      .addColumn('main', m.t.bool, (c) => c.notNull())
      .addColumn('reference_prompt', m.t.text)
      .addColumn('reference_asset_id', m.t.id)
      .addColumn('created_at', m.t.ms, (c) => c.notNull())
      .addColumn('updated_at', m.t.ms, (c) => c.notNull())
      .addForeignKeyConstraint('fk_picture_characters_workspace_id', ['workspace_id'], 'workspaces', ['id'])
      .addForeignKeyConstraint('fk_picture_characters_project_id', ['project_id'], 'projects', ['id'], (c) => c.onDelete('cascade')),
    m.dialect,
  ).execute();
  await m.db.schema
    .createIndex('ix_picture_characters_workspace_project')
    .on('picture_characters')
    .columns(['workspace_id', 'project_id', 'position'])
    .execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.dropTable('picture_characters').execute();
  await m.db.schema.alterTable('sections').dropColumn('image_asset_id').execute();
  await m.db.schema.alterTable('sections').dropColumn('layout').execute();
}

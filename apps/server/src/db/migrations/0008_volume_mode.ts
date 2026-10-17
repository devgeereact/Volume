import { tableEnd, type MigrationContext } from './types.js';

/**
 * Volume mode (P8-2, D-046), additive:
 * - batches: a named group of books, usually across several pen names, run one book at a time by a batch_run job.
 *   job_id is the latest batch_run job; the batch status shown to the owner comes from that job.
 * - batch_items: one row per book in a batch. status is planned or ready (ready only after the quality gate:
 *   preflight without a block and no open claim). job_id is the latest batch_book job for that book.
 *   A book belongs to one batch at a time (unique workspace_id, project_id).
 * - title_slots: planned release dates per book and format (ebook, paperback, hardcover). The server refuses a slot
 *   that breaks KDP's weekly title creation limit (rule titles.creationLimit) in the workspace. status is planned or
 *   confirmed (confirmed only after the quality gate). One slot per book and format.
 *
 * - projects.batched_at: when the book first joined a batch. Set once and never cleared, so a book taken out of its
 *   batch still has to pass the quality gate before it is packed or marked published.
 *
 * Number 0008 is reserved for this package by docs/08-change-management/plans/PHASES-6-8.md.
 */
export async function up(m: MigrationContext): Promise<void> {
  await tableEnd(
    m.db.schema
      .createTable('batches')
      .addColumn('id', m.t.id, (c) => c.primaryKey().notNull())
      .addColumn('workspace_id', m.t.id, (c) => c.notNull())
      .addColumn('name', m.t.str, (c) => c.notNull())
      .addColumn('notes', m.t.text)
      .addColumn('job_id', m.t.id)
      .addColumn('created_by', m.t.id)
      .addColumn('started_at', m.t.ms)
      .addColumn('created_at', m.t.ms, (c) => c.notNull())
      .addColumn('updated_at', m.t.ms, (c) => c.notNull())
      .addForeignKeyConstraint('fk_batches_workspace_id', ['workspace_id'], 'workspaces', ['id']),
    m.dialect,
  ).execute();
  await m.db.schema.createIndex('ix_batches_workspace_created').on('batches').columns(['workspace_id', 'created_at']).execute();

  await tableEnd(
    m.db.schema
      .createTable('batch_items')
      .addColumn('id', m.t.id, (c) => c.primaryKey().notNull())
      .addColumn('workspace_id', m.t.id, (c) => c.notNull())
      .addColumn('batch_id', m.t.id, (c) => c.notNull())
      .addColumn('project_id', m.t.id, (c) => c.notNull())
      .addColumn('position', m.t.int, (c) => c.notNull())
      .addColumn('status', m.t.short, (c) => c.notNull())
      .addColumn('job_id', m.t.id)
      .addColumn('ready_at', m.t.ms)
      .addColumn('created_at', m.t.ms, (c) => c.notNull())
      .addColumn('updated_at', m.t.ms, (c) => c.notNull())
      .addForeignKeyConstraint('fk_batch_items_workspace_id', ['workspace_id'], 'workspaces', ['id'])
      .addForeignKeyConstraint('fk_batch_items_batch_id', ['batch_id'], 'batches', ['id'], (c) => c.onDelete('cascade'))
      .addForeignKeyConstraint('fk_batch_items_project_id', ['project_id'], 'projects', ['id'], (c) => c.onDelete('cascade')),
    m.dialect,
  ).execute();
  await m.db.schema.createIndex('ux_batch_items_workspace_project').on('batch_items').columns(['workspace_id', 'project_id']).unique().execute();
  await m.db.schema.createIndex('ix_batch_items_workspace_batch').on('batch_items').columns(['workspace_id', 'batch_id', 'position']).execute();

  await tableEnd(
    m.db.schema
      .createTable('title_slots')
      .addColumn('id', m.t.id, (c) => c.primaryKey().notNull())
      .addColumn('workspace_id', m.t.id, (c) => c.notNull())
      .addColumn('project_id', m.t.id, (c) => c.notNull())
      .addColumn('batch_id', m.t.id)
      .addColumn('format', m.t.short, (c) => c.notNull())
      .addColumn('planned_at', m.t.ms, (c) => c.notNull())
      .addColumn('status', m.t.short, (c) => c.notNull())
      .addColumn('confirmed_at', m.t.ms)
      .addColumn('created_by', m.t.id)
      .addColumn('created_at', m.t.ms, (c) => c.notNull())
      .addColumn('updated_at', m.t.ms, (c) => c.notNull())
      .addForeignKeyConstraint('fk_title_slots_workspace_id', ['workspace_id'], 'workspaces', ['id'])
      .addForeignKeyConstraint('fk_title_slots_project_id', ['project_id'], 'projects', ['id'], (c) => c.onDelete('cascade'))
      .addForeignKeyConstraint('fk_title_slots_batch_id', ['batch_id'], 'batches', ['id'], (c) => c.onDelete('set null')),
    m.dialect,
  ).execute();
  await m.db.schema
    .createIndex('ux_title_slots_workspace_project_format')
    .on('title_slots')
    .columns(['workspace_id', 'project_id', 'format'])
    .unique()
    .execute();
  await m.db.schema.createIndex('ix_title_slots_workspace_format_planned').on('title_slots').columns(['workspace_id', 'format', 'planned_at']).execute();
  await m.db.schema.alterTable('projects').addColumn('batched_at', m.t.ms).execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('projects').dropColumn('batched_at').execute();
  await m.db.schema.dropTable('title_slots').execute();
  await m.db.schema.dropTable('batch_items').execute();
  await m.db.schema.dropTable('batches').execute();
}

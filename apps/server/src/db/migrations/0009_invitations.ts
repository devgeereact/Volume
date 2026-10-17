import { tableEnd, type MigrationContext } from './types.js';

/**
 * Accounts (P8-3, D-047), additive:
 * - invitations: the owner invites an email address with a role. editor or viewer joins the inviting workspace;
 *   owner means a separate self-publisher who gets a new workspace of their own on first sign-in.
 *   status is pending, accepted or revoked. Emails are stored lower case. workspace_id is the inviting workspace.
 *   pending_email is the email while the invitation is pending and null after: the unique index on (workspace_id,
 *   pending_email) allows one pending invitation per address per workspace. SQLite and MySQL both let a unique index
 *   hold any number of nulls, so accepted and revoked rows never collide.
 *
 * Number 0009 is reserved for this package by docs/08-change-management/plans/PHASES-6-8.md (0006 to 0008 belong to
 * other packages). Kysely refuses unordered migrations by default, so 0009 must not reach a database before 0006 to 0008.
 */
export async function up(m: MigrationContext): Promise<void> {
  await tableEnd(
    m.db.schema
      .createTable('invitations')
      .addColumn('id', m.t.id, (c) => c.primaryKey().notNull())
      .addColumn('workspace_id', m.t.id, (c) => c.notNull())
      .addColumn('email', m.t.str, (c) => c.notNull())
      .addColumn('role', m.t.short, (c) => c.notNull())
      .addColumn('status', m.t.short, (c) => c.notNull())
      .addColumn('pending_email', m.t.str)
      .addColumn('invited_by', m.t.id)
      .addColumn('accepted_user_id', m.t.id)
      .addColumn('accepted_at', m.t.ms)
      .addColumn('created_at', m.t.ms, (c) => c.notNull())
      .addColumn('updated_at', m.t.ms, (c) => c.notNull())
      .addForeignKeyConstraint('fk_invitations_workspace_id', ['workspace_id'], 'workspaces', ['id']),
    m.dialect,
  ).execute();
  await m.db.schema.createIndex('ix_invitations_workspace_status').on('invitations').columns(['workspace_id', 'status']).execute();
  await m.db.schema.createIndex('ix_invitations_email_status').on('invitations').columns(['email', 'status']).execute();
  await m.db.schema.createIndex('ux_invitations_workspace_pending_email').on('invitations').columns(['workspace_id', 'pending_email']).unique().execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.dropTable('invitations').execute();
}

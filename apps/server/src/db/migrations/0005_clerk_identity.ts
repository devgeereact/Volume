import type { MigrationContext } from './types.js';

/**
 * Hosted sign-in (additive):
 * - users.clerk_user_id: the Clerk user (user_...) bound to this Volume user. Null for the local owner until the
 *   first Clerk sign-in binds it. Unique, so one Clerk user maps to one Volume user.
 */
export async function up(m: MigrationContext): Promise<void> {
  await m.db.schema.alterTable('users').addColumn('clerk_user_id', m.t.str).execute();
  await m.db.schema.createIndex('ux_users_clerk_user_id').on('users').column('clerk_user_id').unique().execute();
}

export async function down(m: MigrationContext): Promise<void> {
  const drop = m.db.schema.dropIndex('ux_users_clerk_user_id');
  // MySQL names the table in DROP INDEX; SQLite does not accept it.
  await (m.dialect === 'mysql' ? drop.on('users') : drop).execute();
  await m.db.schema.alterTable('users').dropColumn('clerk_user_id').execute();
}

import { DummyDriver, Kysely, MysqlAdapter, MysqlIntrospector, MysqlQueryCompiler } from 'kysely';
import { Migrator, type Migration, type MigrationProvider } from 'kysely/migration';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { migrateToLatest, openSqlite, pendingMigrations } from '../src/db/connect.js';
import * as m0006 from '../src/db/migrations/0006_picture_books.js';
import * as m0008 from '../src/db/migrations/0008_volume_mode.js';
import * as m0009 from '../src/db/migrations/0009_invitations.js';
import { VolumeMigrationProvider } from '../src/db/migrations/index.js';
import { columnTypes, type MigrationDb } from '../src/db/migrations/types.js';

/** Every migration in the order a fresh database applies them (0007 is reserved and not shipped). */
const ORDER = [
  '0001_initial',
  '0002_gaps',
  '0003_round2',
  '0004_version_guardrails',
  '0005_clerk_identity',
  '0006_picture_books',
  '0008_volume_mode',
  '0009_invitations',
  '0010_listing_source',
  '0011_version_author',
];

/** A compile-only MySQL Kysely (DummyDriver): no MySQL server is contacted. */
function mysqlCompiler(sqls: string[]): MigrationDb {
  return new Kysely({
    dialect: {
      createAdapter: () => new MysqlAdapter(),
      createDriver: () => new DummyDriver(),
      createIntrospector: (k) => new MysqlIntrospector(k),
      createQueryCompiler: () => new MysqlQueryCompiler(),
    },
    log: (e) => {
      if (e.level === 'query') sqls.push(e.query.sql);
    },
  });
}

const EXPECTED = [
  'workspaces',
  'users',
  'memberships',
  'settings',
  'author_profiles',
  'profile_samples',
  'profile_memory',
  'projects',
  'research_runs',
  'research_sources',
  'title_sets',
  'blueprints',
  'sections',
  'section_versions',
  'suggestions',
  'author_notes',
  'story_ledger',
  'check_results',
  'claims',
  'assets',
  'asset_chunks',
  'covers',
  'listings',
  'marketing_items',
  'exports',
  'prompt_runs',
  'jobs',
  'job_events',
  'invitations',
  'batches',
  'batch_items',
  'title_slots',
  'picture_characters',
];

describe('migrations on SQLite in memory', () => {
  it('create every table, are idempotent and roll back', async () => {
    const handle = openSqlite(':memory:');
    const first = await migrateToLatest(handle);
    expect(first.results?.every((r) => r.status === 'Success')).toBe(true);
    // A fresh database applies 0001..0011 in order.
    expect(first.results?.map((r) => r.migrationName)).toEqual(ORDER);
    const tables = await handle.db.introspection.getTables();
    const names = tables.map((t) => t.name);
    for (const t of EXPECTED) expect(names).toContain(t);
    const projects = tables.find((t) => t.name === 'projects');
    expect(projects?.columns.map((c) => c.name)).toEqual(
      expect.arrayContaining([
        'workspace_id',
        'profile_id',
        'book_type_id',
        'interior_theme_id',
        'cover_style_id',
        'stage',
        'settings',
        'budget_usd',
        'cost_to_date_usd',
        'published_at',
        'archived_at',
        'list_prices',
        'marketplace',
      ]),
    );
    // 0002: gap columns on both dialects' schema.
    const cols = (name: string) => tables.find((t) => t.name === name)?.columns.map((c) => c.name) ?? [];
    expect(cols('research_sources')).toEqual(expect.arrayContaining(['domain', 'redirect_url', 'unresolved']));
    expect(cols('prompt_runs')).toContain('guardrails');
    expect(cols('author_profiles')).toContain('bio_status');
    // 0003
    expect(cols('claims')).toContain('suggested_softening');
    expect(cols('marketing_items')).toContain('extras');
    // 0006: picture-book spreads and characters.
    expect(cols('sections')).toEqual(expect.arrayContaining(['layout', 'image_asset_id']));
    expect(cols('picture_characters')).toEqual(
      expect.arrayContaining(['workspace_id', 'project_id', 'name', 'sheet', 'main', 'reference_prompt', 'reference_asset_id']),
    );
    // 0004
    expect(cols('section_versions')).toContain('guardrails');
    // 0005
    expect(cols('users')).toContain('clerk_user_id');
    // 0009
    expect(cols('invitations')).toEqual(
      expect.arrayContaining([
        'id',
        'workspace_id',
        'email',
        'role',
        'status',
        'invited_by',
        'accepted_user_id',
        'accepted_at',
        'created_at',
        'updated_at',
        'pending_email',
      ]),
    );
    // 0008
    expect(cols('batches')).toEqual(expect.arrayContaining(['id', 'workspace_id', 'name', 'notes', 'job_id', 'created_by', 'started_at']));
    expect(cols('batch_items')).toEqual(expect.arrayContaining(['workspace_id', 'batch_id', 'project_id', 'position', 'status', 'job_id', 'ready_at']));
    expect(cols('projects')).toContain('batched_at');
    expect(cols('title_slots')).toEqual(
      expect.arrayContaining(['workspace_id', 'project_id', 'batch_id', 'format', 'planned_at', 'status', 'confirmed_at', 'created_by']),
    );
    // 0010
    expect(cols('listings')).toContain('source');
    // 0011
    expect(cols('section_versions')).toContain('created_by');
    expect(await pendingMigrations(handle)).toEqual([]);

    const second = await migrateToLatest(handle);
    expect(second.results).toEqual([]);

    const migrator = new Migrator({ db: handle.db.withoutPlugins(), provider: new VolumeMigrationProvider('sqlite') });
    const down11 = await migrator.migrateDown();
    expect(down11.error).toBeUndefined();
    expect((await handle.db.introspection.getTables()).find((t) => t.name === 'section_versions')?.columns.map((c) => c.name)).not.toContain('created_by');
    expect(await pendingMigrations(handle)).toEqual(['0011_version_author']);
    const down10 = await migrator.migrateDown();
    expect(down10.error).toBeUndefined();
    expect((await handle.db.introspection.getTables()).find((t) => t.name === 'listings')?.columns.map((c) => c.name)).not.toContain('source');
    expect(await pendingMigrations(handle)).toEqual(['0010_listing_source', '0011_version_author']);
    const down9 = await migrator.migrateDown();
    expect(down9.error).toBeUndefined();
    expect((await handle.db.introspection.getTables()).map((t) => t.name)).not.toContain('invitations');
    expect(await pendingMigrations(handle)).toEqual(['0009_invitations', '0010_listing_source', '0011_version_author']);
    const down8 = await migrator.migrateDown();
    expect(down8.error).toBeUndefined();
    const after8 = (await handle.db.introspection.getTables()).map((t) => t.name);
    for (const gone of ['batches', 'batch_items', 'title_slots']) expect(after8).not.toContain(gone);
    expect(await pendingMigrations(handle)).toEqual(['0008_volume_mode', '0009_invitations', '0010_listing_source', '0011_version_author']);
    const down6 = await migrator.migrateDown();
    expect(down6.error).toBeUndefined();
    const after6 = await handle.db.introspection.getTables();
    expect(after6.map((t) => t.name)).not.toContain('picture_characters');
    expect(after6.find((t) => t.name === 'sections')?.columns.map((c) => c.name)).not.toContain('image_asset_id');
    expect(await pendingMigrations(handle)).toEqual([
      '0006_picture_books',
      '0008_volume_mode',
      '0009_invitations',
      '0010_listing_source',
      '0011_version_author',
    ]);
    const down5 = await migrator.migrateDown();
    expect(down5.error).toBeUndefined();
    expect((await handle.db.introspection.getTables()).find((t) => t.name === 'users')?.columns.map((c) => c.name)).not.toContain('clerk_user_id');
    expect(await pendingMigrations(handle)).toEqual([
      '0005_clerk_identity',
      '0006_picture_books',
      '0008_volume_mode',
      '0009_invitations',
      '0010_listing_source',
      '0011_version_author',
    ]);
    const down4 = await migrator.migrateDown();
    expect(down4.error).toBeUndefined();
    const versionCols = (await handle.db.introspection.getTables()).find((t) => t.name === 'section_versions')?.columns.map((c) => c.name);
    expect(versionCols).not.toContain('guardrails');
    const down3 = await migrator.migrateDown();
    expect(down3.error).toBeUndefined();
    const claimsCols = (await handle.db.introspection.getTables()).find((t) => t.name === 'claims')?.columns.map((c) => c.name);
    expect(claimsCols).not.toContain('suggested_softening');
    const down2 = await migrator.migrateDown();
    expect(down2.error).toBeUndefined();
    const sources = (await handle.db.introspection.getTables()).find((t) => t.name === 'research_sources');
    expect(sources?.columns.map((c) => c.name)).not.toContain('redirect_url');
    const down = await migrator.migrateDown();
    expect(down.error).toBeUndefined();
    const after = (await handle.db.introspection.getTables()).map((t) => t.name);
    expect(after).not.toContain('projects');
    await handle.close();
  });

  it('refuses 0006 on a database that already applied 0008 and 0009 (they ship together, see DEPLOYMENT.md)', async () => {
    const handle = openSqlite(':memory:');
    const full = new VolumeMigrationProvider('sqlite');
    const without6: MigrationProvider = {
      getMigrations: async (): Promise<Record<string, Migration>> => {
        const all = await full.getMigrations();
        delete all['0006_picture_books'];
        return all;
      },
    };
    const partial = await new Migrator({ db: handle.db.withoutPlugins(), provider: without6 }).migrateToLatest();
    expect(partial.error).toBeUndefined();
    // Unordered migrations stay off on purpose: Kysely refuses rather than applying 0006 after 0009.
    await expect(migrateToLatest(handle)).rejects.toThrow(/Migration failed/);
    expect(await pendingMigrations(handle)).toEqual(['0006_picture_books']);
    await handle.close();
  });

  it('compiles every migration 0001..0009 for MySQL in order', async () => {
    const sqls: string[] = [];
    const db = mysqlCompiler(sqls);
    const migrations = await new VolumeMigrationProvider('mysql').getMigrations();
    expect(Object.keys(migrations)).toEqual(ORDER);
    for (const name of ORDER) {
      const before = sqls.length;
      await migrations[name]?.up(db);
      expect(sqls.length, name).toBeGreaterThan(before);
    }
    await db.destroy();
    for (const table of ['projects', 'picture_characters', 'batches', 'title_slots', 'invitations'])
      expect(
        sqls.some((q) => q.startsWith(`create table \`${table}\``)),
        table,
      ).toBe(true);
    for (const q of sqls.filter((x) => x.startsWith('create table'))) expect(q).toContain('engine=InnoDB default charset=utf8mb4');
  });

  it('refuses to bind anywhere but 127.0.0.1', () => {
    expect(() => loadConfig({ dotenv: false, env: { HOST: '0.0.0.0' } })).toThrow(/127\.0\.0\.1/);
    const cfg = loadConfig({ dotenv: false, env: {} });
    expect(cfg.host).toBe('127.0.0.1');
    expect(cfg.port).toBe(5181);
    expect(cfg.allowedHosts).toEqual(expect.arrayContaining(['127.0.0.1:5181', 'localhost:5181', '127.0.0.1:5180', 'localhost:5180']));
    expect(cfg.allowedOrigins).not.toContain('*');
  });

  it('needs the MySQL settings when DB_CLIENT=mysql', () => {
    expect(() => loadConfig({ dotenv: false, env: { DB_CLIENT: 'mysql' } })).toThrow(/MYSQL_HOST/);
    const cfg = loadConfig({
      dotenv: false,
      env: { DB_CLIENT: 'mysql', MYSQL_HOST: 'db.example.test', MYSQL_DATABASE: 'vol', MYSQL_USER: 'u', MYSQL_PASSWORD: 'p' },
    });
    expect(cfg.db.client).toBe('mysql');
    if (cfg.db.client === 'mysql') expect(cfg.db.mysql.ssl).toBe('verify');
  });

  it('compiles 0006 to MySQL DDL (spread columns, picture_characters with InnoDB, utf8mb4 and a cascade)', async () => {
    const sqls: string[] = [];
    // Compile-only Kysely (DummyDriver): no MySQL server is contacted.
    const db: MigrationDb = new Kysely({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (k) => new MysqlIntrospector(k),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      },
      log: (e) => {
        if (e.level === 'query') sqls.push(e.query.sql);
      },
    });
    await m0006.up({ db, dialect: 'mysql', t: columnTypes('mysql') });
    await m0006.down({ db, dialect: 'mysql', t: columnTypes('mysql') });
    await db.destroy();
    expect(sqls).toContain('alter table `sections` add column `layout` varchar(64)');
    expect(sqls).toContain('alter table `sections` add column `image_asset_id` varchar(26)');
    const create = sqls.find((q) => q.startsWith('create table `picture_characters`')) ?? '';
    expect(create).toContain('`sheet` mediumtext not null');
    expect(create).toContain('on delete cascade');
    expect(create).toContain('engine=InnoDB default charset=utf8mb4');
    expect(sqls).toContain('drop table `picture_characters`');
  });

  it('compiles 0009 to MySQL DDL (InnoDB, utf8mb4, indexable varchar email)', async () => {
    const sqls: string[] = [];
    // Compile-only Kysely (DummyDriver): no MySQL server is contacted.
    const db: MigrationDb = new Kysely({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (k) => new MysqlIntrospector(k),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      },
      log: (e) => {
        if (e.level === 'query') sqls.push(e.query.sql);
      },
    });
    await m0009.up({ db, dialect: 'mysql', t: columnTypes('mysql') });
    await m0009.down({ db, dialect: 'mysql', t: columnTypes('mysql') });
    await db.destroy();
    const create = sqls.find((q) => q.startsWith('create table `invitations`')) ?? '';
    expect(create).toContain('`email` varchar(255) not null');
    expect(create).toContain('`accepted_at` bigint');
    expect(create).toContain('engine=InnoDB default charset=utf8mb4');
    expect(sqls.filter((q) => q.startsWith('create index'))).toHaveLength(2);
    expect(sqls).toContain('drop table `invitations`');
  });

  it('compiles 0008 to MySQL DDL (InnoDB, utf8mb4, cascades and one slot per book and format)', async () => {
    const sqls: string[] = [];
    // Compile-only Kysely (DummyDriver): no MySQL server is contacted.
    const db: MigrationDb = new Kysely({
      dialect: {
        createAdapter: () => new MysqlAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (k) => new MysqlIntrospector(k),
        createQueryCompiler: () => new MysqlQueryCompiler(),
      },
      log: (e) => {
        if (e.level === 'query') sqls.push(e.query.sql);
      },
    });
    await m0008.up({ db, dialect: 'mysql', t: columnTypes('mysql') });
    await m0008.down({ db, dialect: 'mysql', t: columnTypes('mysql') });
    await db.destroy();
    for (const table of ['batches', 'batch_items', 'title_slots']) {
      const create = sqls.find((q) => q.startsWith(`create table \`${table}\``)) ?? '';
      expect(create, table).toContain('engine=InnoDB default charset=utf8mb4');
      expect(create, table).toContain('`workspace_id` varchar(26) not null');
      expect(sqls, table).toContain(`drop table \`${table}\``);
    }
    const slots = sqls.find((q) => q.startsWith('create table `title_slots`')) ?? '';
    expect(slots).toContain('`planned_at` bigint not null');
    expect(slots).toContain('on delete cascade');
    expect(slots).toContain('on delete set null');
    expect(sqls).toContain('create unique index `ux_title_slots_workspace_project_format` on `title_slots` (`workspace_id`, `project_id`, `format`)');
    expect(sqls).toContain('create unique index `ux_batch_items_workspace_project` on `batch_items` (`workspace_id`, `project_id`)');
  });
});

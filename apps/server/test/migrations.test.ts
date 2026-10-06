import { Migrator } from 'kysely/migration';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/env.js';
import { migrateToLatest, openSqlite } from '../src/db/connect.js';
import { VolumeMigrationProvider } from '../src/db/migrations/index.js';

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
];

describe('migrations on SQLite in memory', () => {
  it('create every table, are idempotent and roll back', async () => {
    const handle = openSqlite(':memory:');
    const first = await migrateToLatest(handle);
    expect(first.results?.map((r) => r.status)).toEqual(['Success', 'Success', 'Success', 'Success']);
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
    // 0004
    expect(cols('section_versions')).toContain('guardrails');

    const second = await migrateToLatest(handle);
    expect(second.results).toEqual([]);

    const migrator = new Migrator({ db: handle.db.withoutPlugins(), provider: new VolumeMigrationProvider('sqlite') });
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
});

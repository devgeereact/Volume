import type { CreateTableBuilder } from 'kysely';
import { tableEnd, type MigrationContext } from './types.js';

/**
 * Initial schema. Written once with the Kysely schema builder and run on both
 * SQLite and MySQL. Column names are snake_case. Every table except
 * workspaces and users carries workspace_id, and list indexes start with it.
 */

type Builder = CreateTableBuilder<string, string>;

interface TableSpec {
  name: string;
  tenant?: boolean; // default true
  columns: (b: Builder, m: MigrationContext) => Builder;
  indexes?: { cols: string[]; unique?: boolean }[];
  foreignKeys?: { cols: string[]; ref: string; refCols?: string[]; cascade?: boolean }[];
}

function base(b: Builder, m: MigrationContext, tenant: boolean): Builder {
  let out = b.addColumn('id', m.t.id, (c) => c.primaryKey().notNull());
  if (tenant) out = out.addColumn('workspace_id', m.t.id, (c) => c.notNull());
  return out;
}

function stamps(b: Builder, m: MigrationContext): Builder {
  return b.addColumn('created_at', m.t.ms, (c) => c.notNull()).addColumn('updated_at', m.t.ms, (c) => c.notNull());
}

const tables: TableSpec[] = [
  {
    name: 'workspaces',
    tenant: false,
    columns: (b, m) => b.addColumn('name', m.t.str, (c) => c.notNull()).addColumn('slug', m.t.str, (c) => c.notNull()),
    indexes: [{ cols: ['slug'], unique: true }],
  },
  {
    name: 'users',
    tenant: false,
    columns: (b, m) =>
      b
        .addColumn('email', m.t.str)
        .addColumn('display_name', m.t.str, (c) => c.notNull())
        .addColumn('auth_provider', m.t.short, (c) => c.notNull())
        .addColumn('password_hash', m.t.str)
        .addColumn('last_seen_at', m.t.ms),
    indexes: [{ cols: ['email'], unique: true }],
  },
  {
    name: 'memberships',
    columns: (b, m) => b.addColumn('user_id', m.t.id, (c) => c.notNull()).addColumn('role', m.t.short, (c) => c.notNull()),
    indexes: [{ cols: ['workspace_id', 'user_id'], unique: true }],
    foreignKeys: [{ cols: ['user_id'], ref: 'users', cascade: true }],
  },
  {
    name: 'settings',
    columns: (b, m) => b.addColumn('setting_key', m.t.str, (c) => c.notNull()).addColumn('value', m.t.json, (c) => c.notNull()),
    indexes: [{ cols: ['workspace_id', 'setting_key'], unique: true }],
  },
  {
    name: 'author_profiles',
    columns: (b, m) =>
      b
        .addColumn('source_key', m.t.str)
        .addColumn('pen_name', m.t.str, (c) => c.notNull())
        .addColumn('legal_name', m.t.str)
        .addColumn('imprint_name', m.t.str)
        .addColumn('is_real_person', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('illustrative_line_default', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('location', m.t.str)
        .addColumn('language', m.t.short, (c) => c.notNull())
        .addColumn('bio_third_person', m.t.text, (c) => c.notNull())
        .addColumn('bio_hash', m.t.short, (c) => c.notNull())
        .addColumn('short_bio', m.t.text)
        .addColumn('credentials', m.t.json, (c) => c.notNull())
        .addColumn('links', m.t.json, (c) => c.notNull())
        .addColumn('voice', m.t.json, (c) => c.notNull())
        .addColumn('brand', m.t.json, (c) => c.notNull())
        .addColumn('templates', m.t.json, (c) => c.notNull())
        .addColumn('publishing', m.t.json, (c) => c.notNull())
        .addColumn('models', m.t.json, (c) => c.notNull())
        .addColumn('default_book_type_id', m.t.str)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('archived_at', m.t.ms),
    indexes: [{ cols: ['workspace_id', 'status', 'pen_name'] }, { cols: ['workspace_id', 'source_key'] }],
  },
  {
    name: 'profile_samples',
    columns: (b, m) =>
      b
        .addColumn('profile_id', m.t.id, (c) => c.notNull())
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('title', m.t.str)
        .addColumn('text', m.t.text, (c) => c.notNull())
        .addColumn('word_count', m.t.int, (c) => c.notNull().defaultTo(0)),
    indexes: [{ cols: ['workspace_id', 'profile_id', 'kind'] }],
    foreignKeys: [{ cols: ['profile_id'], ref: 'author_profiles', cascade: true }],
  },
  {
    name: 'profile_memory',
    columns: (b, m) =>
      b
        .addColumn('profile_id', m.t.id, (c) => c.notNull())
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('content', m.t.text, (c) => c.notNull())
        .addColumn('origin', m.t.short, (c) => c.notNull())
        .addColumn('source_suggestion_id', m.t.id)
        .addColumn('weight', m.t.int, (c) => c.notNull().defaultTo(1))
        .addColumn('active', m.t.bool, (c) => c.notNull().defaultTo(1)),
    indexes: [{ cols: ['workspace_id', 'profile_id', 'active'] }],
    foreignKeys: [{ cols: ['profile_id'], ref: 'author_profiles', cascade: true }],
  },
  {
    name: 'projects',
    columns: (b, m) =>
      b
        .addColumn('profile_id', m.t.id, (c) => c.notNull())
        .addColumn('book_type_id', m.t.str)
        .addColumn('interior_theme_id', m.t.str)
        .addColumn('cover_style_id', m.t.str)
        .addColumn('template', m.t.short, (c) => c.notNull())
        .addColumn('idea', m.t.text)
        .addColumn('notes', m.t.text)
        .addColumn('title', m.t.str)
        .addColumn('subtitle', m.t.str)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('stage', m.t.short, (c) => c.notNull())
        .addColumn('trim', m.t.short, (c) => c.notNull())
        .addColumn('paper', m.t.short, (c) => c.notNull())
        .addColumn('isbn_paperback', m.t.short)
        .addColumn('isbn_ebook', m.t.short)
        .addColumn('edition', m.t.str)
        .addColumn('publication_year', m.t.int)
        .addColumn('illustrative_line', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('ai_disclosure', m.t.json, (c) => c.notNull())
        .addColumn('word_target', m.t.int)
        .addColumn('settings', m.t.json, (c) => c.notNull())
        .addColumn('budget_usd', m.t.real, (c) => c.notNull())
        .addColumn('cost_to_date_usd', m.t.real, (c) => c.notNull().defaultTo(0))
        .addColumn('approved_blueprint_id', m.t.id)
        .addColumn('published_at', m.t.ms)
        .addColumn('archived_at', m.t.ms),
    indexes: [{ cols: ['workspace_id', 'status', 'stage'] }, { cols: ['workspace_id', 'profile_id'] }, { cols: ['workspace_id', 'updated_at'] }],
    foreignKeys: [{ cols: ['profile_id'], ref: 'author_profiles' }],
  },
  {
    name: 'research_runs',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('job_id', m.t.id)
        .addColumn('prompt_run_id', m.t.id)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('input', m.t.json, (c) => c.notNull())
        .addColumn('output', m.t.json),
    indexes: [{ cols: ['workspace_id', 'project_id', 'created_at'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'research_sources',
    columns: (b, m) =>
      b
        .addColumn('research_run_id', m.t.id, (c) => c.notNull())
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('url', m.t.text, (c) => c.notNull())
        .addColumn('url_hash', m.t.short, (c) => c.notNull())
        .addColumn('title', m.t.text)
        .addColumn('domain', m.t.str)
        .addColumn('excerpt', m.t.text)
        .addColumn('start_index', m.t.int)
        .addColumn('end_index', m.t.int)
        .addColumn('use_in_book', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('link_status', m.t.short, (c) => c.notNull())
        .addColumn('checked_at', m.t.ms),
    indexes: [{ cols: ['research_run_id', 'url_hash'], unique: true }, { cols: ['workspace_id', 'project_id', 'use_in_book'] }],
    foreignKeys: [
      { cols: ['research_run_id'], ref: 'research_runs', cascade: true },
      { cols: ['project_id'], ref: 'projects', cascade: true },
    ],
  },
  {
    name: 'title_sets',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('job_id', m.t.id)
        .addColumn('prompt_run_id', m.t.id)
        .addColumn('directions', m.t.json, (c) => c.notNull())
        .addColumn('options', m.t.json, (c) => c.notNull())
        .addColumn('chosen_index', m.t.int),
    indexes: [{ cols: ['workspace_id', 'project_id', 'created_at'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'blueprints',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('version', m.t.int, (c) => c.notNull())
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('data', m.t.json, (c) => c.notNull())
        .addColumn('source', m.t.short, (c) => c.notNull())
        .addColumn('note', m.t.text)
        .addColumn('parent_version_id', m.t.id)
        .addColumn('approved_at', m.t.ms)
        .addColumn('approved_by', m.t.id)
        .addColumn('prompt_run_id', m.t.id),
    indexes: [{ cols: ['project_id', 'version'], unique: true }, { cols: ['workspace_id', 'project_id', 'status'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'sections',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('area', m.t.short, (c) => c.notNull())
        .addColumn('position', m.t.int, (c) => c.notNull())
        .addColumn('enabled', m.t.bool, (c) => c.notNull().defaultTo(1))
        .addColumn('part_id', m.t.id)
        .addColumn('number', m.t.int)
        .addColumn('title', m.t.str)
        .addColumn('word_target', m.t.int)
        .addColumn('plan', m.t.json, (c) => c.notNull())
        .addColumn('current_version_id', m.t.id)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('blueprint_changed', m.t.bool, (c) => c.notNull().defaultTo(0)),
    indexes: [{ cols: ['workspace_id', 'project_id', 'position'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'section_versions',
    columns: (b, m) =>
      b
        .addColumn('section_id', m.t.id, (c) => c.notNull())
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('version', m.t.int, (c) => c.notNull())
        .addColumn('content', m.t.json, (c) => c.notNull())
        .addColumn('body_md', m.t.text, (c) => c.notNull())
        .addColumn('plaintext', m.t.text, (c) => c.notNull())
        .addColumn('word_count', m.t.int, (c) => c.notNull())
        .addColumn('source', m.t.short, (c) => c.notNull())
        .addColumn('parent_version_id', m.t.id)
        .addColumn('prompt_run_id', m.t.id)
        .addColumn('summary', m.t.text)
        .addColumn('note', m.t.text),
    indexes: [{ cols: ['section_id', 'version'], unique: true }, { cols: ['workspace_id', 'project_id', 'created_at'] }],
    foreignKeys: [
      { cols: ['section_id'], ref: 'sections', cascade: true },
      { cols: ['project_id'], ref: 'projects', cascade: true },
    ],
  },
  {
    name: 'suggestions',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('section_id', m.t.id, (c) => c.notNull())
        .addColumn('base_version_id', m.t.id)
        .addColumn('pass', m.t.short, (c) => c.notNull())
        .addColumn('start_offset', m.t.int)
        .addColumn('end_offset', m.t.int)
        .addColumn('original', m.t.text, (c) => c.notNull())
        .addColumn('proposed', m.t.text, (c) => c.notNull())
        .addColumn('reason', m.t.text)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('decided_at', m.t.ms)
        .addColumn('prompt_run_id', m.t.id),
    indexes: [{ cols: ['workspace_id', 'section_id', 'status'] }],
    foreignKeys: [
      { cols: ['project_id'], ref: 'projects', cascade: true },
      { cols: ['section_id'], ref: 'sections', cascade: true },
    ],
  },
  {
    name: 'author_notes',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('section_id', m.t.id, (c) => c.notNull())
        .addColumn('position', m.t.int)
        .addColumn('anchor_text', m.t.text)
        .addColumn('note', m.t.text, (c) => c.notNull())
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('job_id', m.t.id)
        .addColumn('woven_version_id', m.t.id),
    indexes: [{ cols: ['workspace_id', 'section_id', 'status'] }, { cols: ['workspace_id', 'project_id', 'status'] }],
    foreignKeys: [
      { cols: ['project_id'], ref: 'projects', cascade: true },
      { cols: ['section_id'], ref: 'sections', cascade: true },
    ],
  },
  {
    name: 'story_ledger',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('section_id', m.t.id)
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('ledger_key', m.t.str, (c) => c.notNull())
        .addColumn('detail', m.t.text)
        .addColumn('version_id', m.t.id),
    indexes: [{ cols: ['project_id', 'kind', 'ledger_key'], unique: true }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'check_results',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('section_id', m.t.id)
        .addColumn('version_id', m.t.id)
        .addColumn('checker', m.t.short, (c) => c.notNull())
        .addColumn('severity', m.t.short, (c) => c.notNull())
        .addColumn('message', m.t.text, (c) => c.notNull())
        .addColumn('location', m.t.json, (c) => c.notNull())
        .addColumn('auto_fixed', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('status', m.t.short, (c) => c.notNull()),
    indexes: [{ cols: ['workspace_id', 'project_id', 'status', 'severity'] }, { cols: ['version_id'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'claims',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('section_id', m.t.id)
        .addColumn('version_id', m.t.id)
        .addColumn('category', m.t.short, (c) => c.notNull())
        .addColumn('sentence', m.t.text, (c) => c.notNull())
        .addColumn('location', m.t.json, (c) => c.notNull())
        .addColumn('check_needed', m.t.text)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('owner_note', m.t.text)
        .addColumn('source_url', m.t.text)
        .addColumn('resolved_at', m.t.ms),
    indexes: [{ cols: ['workspace_id', 'project_id', 'status'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'assets',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id)
        .addColumn('profile_id', m.t.id)
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('filename', m.t.str, (c) => c.notNull())
        .addColumn('mime', m.t.str, (c) => c.notNull())
        .addColumn('bytes', m.t.ms, (c) => c.notNull())
        .addColumn('chunk_size', m.t.int, (c) => c.notNull())
        .addColumn('chunk_count', m.t.int, (c) => c.notNull())
        .addColumn('sha256', m.t.short)
        .addColumn('width', m.t.int)
        .addColumn('height', m.t.int)
        .addColumn('dpi', m.t.int)
        .addColumn('ai_generated', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('prompt_run_id', m.t.id)
        .addColumn('status', m.t.short, (c) => c.notNull()),
    indexes: [{ cols: ['workspace_id', 'project_id', 'kind'] }],
  },
  {
    name: 'covers',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('brief', m.t.json, (c) => c.notNull())
        .addColumn('concepts', m.t.json, (c) => c.notNull())
        .addColumn('chosen_asset_id', m.t.id)
        .addColumn('typography', m.t.json, (c) => c.notNull())
        .addColumn('ebook_asset_id', m.t.id)
        .addColumn('wrap_asset_id', m.t.id)
        .addColumn('wrap_spec', m.t.json, (c) => c.notNull())
        .addColumn('status', m.t.short, (c) => c.notNull()),
    indexes: [{ cols: ['project_id'], unique: true }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'listings',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('description_html', m.t.text)
        .addColumn('back_blurb', m.t.text)
        .addColumn('short_bio', m.t.text)
        .addColumn('categories', m.t.json, (c) => c.notNull())
        .addColumn('keywords', m.t.json, (c) => c.notNull())
        .addColumn('ai_disclosure_note', m.t.text)
        .addColumn('pricing', m.t.json, (c) => c.notNull())
        .addColumn('kdp_rules_version', m.t.short),
    indexes: [{ cols: ['project_id'], unique: true }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'marketing_items',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('profile_id', m.t.id)
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('title', m.t.str)
        .addColumn('hook', m.t.text)
        .addColumn('body', m.t.text, (c) => c.notNull())
        .addColumn('cta', m.t.text)
        .addColumn('hashtags', m.t.json, (c) => c.notNull())
        .addColumn('duration_s', m.t.int)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('archived_at', m.t.ms)
        .addColumn('job_id', m.t.id)
        .addColumn('prompt_run_id', m.t.id),
    indexes: [{ cols: ['workspace_id', 'project_id', 'kind', 'status'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'exports',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id, (c) => c.notNull())
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('trim', m.t.short)
        .addColumn('paper', m.t.short)
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('asset_id', m.t.id)
        .addColumn('bytes', m.t.ms)
        .addColumn('page_count', m.t.int)
        .addColumn('sha256', m.t.short)
        .addColumn('manuscript_hash', m.t.short)
        .addColumn('preflight', m.t.json, (c) => c.notNull())
        .addColumn('job_id', m.t.id)
        .addColumn('mock', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('error', m.t.text),
    indexes: [{ cols: ['workspace_id', 'project_id', 'kind', 'created_at'] }],
    foreignKeys: [{ cols: ['project_id'], ref: 'projects', cascade: true }],
  },
  {
    name: 'prompt_runs',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id)
        .addColumn('job_id', m.t.id)
        .addColumn('stage', m.t.short, (c) => c.notNull())
        .addColumn('prompt_id', m.t.str)
        .addColumn('prompt_version', m.t.int)
        .addColumn('prompt_hash', m.t.short)
        .addColumn('provider', m.t.short, (c) => c.notNull())
        .addColumn('model_slug', m.t.str, (c) => c.notNull())
        .addColumn('generation_id', m.t.str)
        .addColumn('input_tokens', m.t.int, (c) => c.notNull().defaultTo(0))
        .addColumn('output_tokens', m.t.int, (c) => c.notNull().defaultTo(0))
        .addColumn('cost_usd', m.t.real, (c) => c.notNull().defaultTo(0))
        .addColumn('latency_ms', m.t.int, (c) => c.notNull().defaultTo(0))
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('error', m.t.text)
        .addColumn('output', m.t.text),
    indexes: [{ cols: ['workspace_id', 'project_id', 'created_at'] }, { cols: ['workspace_id', 'created_at'] }],
  },
  {
    name: 'jobs',
    columns: (b, m) =>
      b
        .addColumn('project_id', m.t.id)
        .addColumn('parent_id', m.t.id)
        .addColumn('depends_on_job_id', m.t.id)
        .addColumn('kind', m.t.short, (c) => c.notNull())
        .addColumn('status', m.t.short, (c) => c.notNull())
        .addColumn('priority', m.t.int, (c) => c.notNull().defaultTo(100))
        .addColumn('attempts', m.t.int, (c) => c.notNull().defaultTo(0))
        .addColumn('max_attempts', m.t.int, (c) => c.notNull().defaultTo(3))
        .addColumn('run_after', m.t.ms, (c) => c.notNull())
        .addColumn('locked_at', m.t.ms)
        .addColumn('lock_token', m.t.short)
        .addColumn('cancel_requested', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('pause_requested', m.t.bool, (c) => c.notNull().defaultTo(0))
        .addColumn('payload', m.t.json, (c) => c.notNull())
        .addColumn('result', m.t.json)
        .addColumn('progress', m.t.real, (c) => c.notNull().defaultTo(0))
        .addColumn('cost_usd', m.t.real, (c) => c.notNull().defaultTo(0))
        .addColumn('error', m.t.text)
        .addColumn('error_code', m.t.short)
        .addColumn('started_at', m.t.ms)
        .addColumn('finished_at', m.t.ms),
    indexes: [{ cols: ['status', 'run_after', 'priority'] }, { cols: ['workspace_id', 'project_id', 'created_at'] }, { cols: ['parent_id'] }],
  },
  {
    name: 'job_events',
    columns: (b, m) =>
      b
        .addColumn('job_id', m.t.id)
        .addColumn('project_id', m.t.id)
        .addColumn('type', m.t.short, (c) => c.notNull())
        .addColumn('data', m.t.json, (c) => c.notNull())
        .addColumn('created_at', m.t.ms, (c) => c.notNull()),
    indexes: [{ cols: ['workspace_id', 'project_id', 'id'] }, { cols: ['workspace_id', 'id'] }],
  },
];

/** Tables whose created_at/updated_at come from the shared stamps() helper. */
const NO_STAMPS = new Set(['job_events']);

function fkName(table: string, cols: string[]): string {
  return `fk_${table}_${cols.join('_')}`.slice(0, 64);
}

function ixName(table: string, cols: string[], unique: boolean | undefined): string {
  return `${unique ? 'ux' : 'ix'}_${table}_${cols.join('_')}`.slice(0, 64);
}

export async function up(m: MigrationContext): Promise<void> {
  for (const spec of tables) {
    const tenant = spec.tenant ?? true;
    let b: Builder = m.db.schema.createTable(spec.name);
    b = base(b, m, tenant);
    b = spec.columns(b, m);
    if (!NO_STAMPS.has(spec.name)) b = stamps(b, m);
    if (tenant && spec.name !== 'workspaces') {
      b = b.addForeignKeyConstraint(fkName(spec.name, ['workspace_id']), ['workspace_id'], 'workspaces', ['id']);
    }
    for (const fk of spec.foreignKeys ?? []) {
      b = b.addForeignKeyConstraint(fkName(spec.name, fk.cols), fk.cols, fk.ref, fk.refCols ?? ['id'], (c) => (fk.cascade ? c.onDelete('cascade') : c));
    }
    await tableEnd(b, m.dialect).execute();
    for (const ix of spec.indexes ?? []) {
      let ib = m.db.schema
        .createIndex(ixName(spec.name, ix.cols, ix.unique))
        .on(spec.name)
        .columns(ix.cols);
      if (ix.unique) ib = ib.unique();
      await ib.execute();
    }
  }

  // asset_chunks has a composite primary key and no id column.
  await tableEnd(
    m.db.schema
      .createTable('asset_chunks')
      .addColumn('asset_id', m.t.id, (c) => c.notNull())
      .addColumn('chunk_index', m.t.int, (c) => c.notNull())
      .addColumn('workspace_id', m.t.id, (c) => c.notNull())
      .addColumn('bytes', m.t.int, (c) => c.notNull())
      .addColumn('data', m.t.blob, (c) => c.notNull())
      .addColumn('created_at', m.t.ms, (c) => c.notNull())
      .addPrimaryKeyConstraint('pk_asset_chunks', ['asset_id', 'chunk_index'])
      .addForeignKeyConstraint('fk_asset_chunks_asset_id', ['asset_id'], 'assets', ['id'], (c) => c.onDelete('cascade'))
      .addForeignKeyConstraint('fk_asset_chunks_workspace_id', ['workspace_id'], 'workspaces', ['id']),
    m.dialect,
  ).execute();
}

export async function down(m: MigrationContext): Promise<void> {
  await m.db.schema.dropTable('asset_chunks').ifExists().execute();
  for (const spec of [...tables].reverse()) {
    await m.db.schema.dropTable(spec.name).ifExists().execute();
  }
}

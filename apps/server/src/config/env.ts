import { isAbsolute, join, relative, resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { findRepoRoot } from './paths.js';

const boolish = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase())));

const EnvSchema = z.object({
  DB_CLIENT: z.enum(['sqlite', 'mysql']).default('sqlite'),
  SQLITE_PATH: z.string().min(1).optional(),
  MYSQL_HOST: z.string().min(1).optional(),
  MYSQL_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  MYSQL_DATABASE: z.string().min(1).optional(),
  MYSQL_USER: z.string().min(1).optional(),
  MYSQL_PASSWORD: z.string().optional(),
  MYSQL_SSL: z.enum(['off', 'verify']).default('verify'),
  MYSQL_SSL_CA: z.string().min(1).optional(),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(20).default(5),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5181),
  WEB_ORIGINS: z.string().default('http://127.0.0.1:5180,http://localhost:5180'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_JSON_BYTES: z.coerce.number().int().min(1024).default(2 * 1024 * 1024),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(50 * 1024 * 1024),
  JOBS_ENABLED: boolish.default(true),
  AUTO_MIGRATE: boolish.default(true),
  /** mock, openrouter, or auto (the default): OpenRouter only when the key is set and accepted. */
  AI_PROVIDER: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['mock', 'openrouter', 'auto'])).optional(),
  /** volume (the default): real files from @volume/export. mock: placeholder files marked MOCK. */
  EXPORT_PROVIDER: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['mock', 'volume'])).optional(),
  /** true or false: look up search grounding redirect links in research sources (@volume/ai). Unset keeps the default (off). */
  RESOLVE_SOURCE_REDIRECTS: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['true', 'false'])).optional(),
  /** Folder for backups (DATA_DIR/backups). Default: data/ in the repo. Inside the repo only data/ is allowed. */
  DATA_DIR: z.string().min(1).optional(),
  /** Mock AI only: milliseconds between streamed chunks, so the live text is visible in demos and UI tests. */
  MOCK_STREAM_DELAY_MS: z.coerce.number().int().min(0).max(10000).optional(),
  /** Mock AI only: the nth writing call fails once with a model-unavailable error (tests and demos). */
  MOCK_FAIL_NEXT_WRITING: z.coerce.number().int().min(1).max(100000).optional(),
});

/**
 * Owners leave lines such as `MYSQL_HOST=` or `AI_PROVIDER=` blank in .env. A blank (or
 * whitespace-only) value for a setting Volume reads counts as unset, so its default applies.
 */
export function withoutBlankSettings(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = env[key];
    if (typeof value === 'string' && value.trim() === '') continue;
    out[key] = value;
  }
  return out;
}

/** True when OPENROUTER_API_KEY holds a value. A blank line counts as no key. */
export function openRouterKeyIsSet(env: NodeJS.ProcessEnv): boolean {
  const key = env['OPENROUTER_API_KEY'];
  return typeof key === 'string' && key.trim().length > 0;
}

export interface MysqlConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  /** Kept only inside the pool options; never logged or returned by the API. */
  password: string;
  ssl: 'off' | 'verify';
  /** Optional path to a CA certificate (PEM) for hosts with a private CA. */
  sslCaPath: string | null;
  connectionLimit: number;
}

export interface AppConfig {
  root: string;
  configDir: string;
  db: { client: 'sqlite'; sqlitePath: string } | { client: 'mysql'; mysql: MysqlConfig };
  host: string;
  port: number;
  /** Hosts allowed in the Host header (DNS rebinding guard). */
  allowedHosts: string[];
  /** Origins allowed on writes. */
  allowedOrigins: string[];
  logLevel: z.infer<typeof EnvSchema>['LOG_LEVEL'];
  maxJsonBytes: number;
  maxUploadBytes: number;
  jobsEnabled: boolean;
  autoMigrate: boolean;
  /** True when OPENROUTER_API_KEY is set. The value itself is never stored here. */
  openRouterKeyPresent: boolean;
  /** AI_PROVIDER. 'auto' (unset) lets the server check the key at start (src/adapters/openrouter-ai.ts). */
  aiProvider: 'mock' | 'openrouter' | 'auto';
  /** EXPORT_PROVIDER. 'volume' (default) uses src/adapters/volume-export.ts; 'mock' the placeholder adapter. */
  exportProvider: 'mock' | 'volume';
  /** RESOLVE_SOURCE_REDIRECTS, passed to createAiService. Undefined when unset or blank (the package default, off). */
  resolveSourceRedirects: boolean | undefined;
  /** DATA_DIR (absolute). Backups go to DATA_DIR/backups. */
  dataDir: string;
  /** MOCK_STREAM_DELAY_MS (default 0). */
  mockStreamDelayMs: number;
  /** MOCK_FAIL_NEXT_WRITING: which writing call the mock fails once, or null (unset or blank). */
  mockFailNextWriting: number | null;
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  /** Load ROOT/.env with dotenv first (default true for the real server, false in tests). */
  dotenv?: boolean;
  root?: string;
}

export function loadConfig(opts: LoadConfigOptions = {}): AppConfig {
  const root = opts.root ?? findRepoRoot();
  if (opts.dotenv ?? ((opts.env ?? process.env)['VOLUME_LOAD_ENV'] !== 'false')) {
    // quiet: dotenv must not print anything about the file or its keys.
    loadDotenv({ path: join(root, '.env'), quiet: true });
  }
  const env = opts.env ?? process.env;
  const parsed = EnvSchema.safeParse(withoutBlankSettings(env));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid server settings in the environment: ${fields}`);
  }
  const e = parsed.data;

  if (e.HOST !== '127.0.0.1' && e.HOST !== 'localhost' && e.HOST !== '::1') {
    throw new ConfigError('HOST must be 127.0.0.1 (Volume only listens on this Mac).');
  }

  let db: AppConfig['db'];
  if (e.DB_CLIENT === 'mysql') {
    const missing = (['MYSQL_HOST', 'MYSQL_DATABASE', 'MYSQL_USER'] as const).filter((k) => !e[k]);
    if (missing.length > 0) {
      throw new ConfigError(`DB_CLIENT=mysql needs ${missing.join(', ')} in .env.`);
    }
    db = {
      client: 'mysql',
      mysql: {
        host: e.MYSQL_HOST ?? '',
        port: e.MYSQL_PORT,
        database: e.MYSQL_DATABASE ?? '',
        user: e.MYSQL_USER ?? '',
        password: e.MYSQL_PASSWORD ?? '',
        ssl: e.MYSQL_SSL,
        sslCaPath: e.MYSQL_SSL_CA ? resolve(root, e.MYSQL_SSL_CA) : null,
        connectionLimit: e.MYSQL_CONNECTION_LIMIT,
      },
    };
  } else {
    db = { client: 'sqlite', sqlitePath: resolve(root, e.SQLITE_PATH ?? join('data', 'volume.sqlite')) };
  }

  const webOrigins = e.WEB_ORIGINS.split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const selfOrigins = [`http://127.0.0.1:${e.PORT}`, `http://localhost:${e.PORT}`];
  const allowedOrigins = [...new Set([...selfOrigins, ...webOrigins])];
  const allowedHosts = [...new Set(allowedOrigins.map((o) => o.replace(/^https?:\/\//, '')))];

  const keyPresent = openRouterKeyIsSet(env);

  const dataDir = resolve(root, e.DATA_DIR ?? 'data');
  const inRepo = relative(root, dataDir);
  if (!inRepo.startsWith('..') && !isAbsolute(inRepo)) {
    const inData = relative(join(root, 'data'), dataDir);
    if (inData.startsWith('..') || isAbsolute(inData)) throw new ConfigError('DATA_DIR must be the data folder (or a folder inside it) or a folder outside the repo.');
  }

  return {
    root,
    configDir: join(root, 'config'),
    db,
    host: e.HOST,
    port: e.PORT,
    allowedHosts,
    allowedOrigins,
    logLevel: e.LOG_LEVEL,
    maxJsonBytes: e.MAX_JSON_BYTES,
    maxUploadBytes: e.MAX_UPLOAD_BYTES,
    jobsEnabled: e.JOBS_ENABLED,
    autoMigrate: e.AUTO_MIGRATE,
    openRouterKeyPresent: keyPresent,
    aiProvider: e.AI_PROVIDER ?? 'auto',
    exportProvider: e.EXPORT_PROVIDER ?? 'volume',
    resolveSourceRedirects: e.RESOLVE_SOURCE_REDIRECTS === undefined ? undefined : e.RESOLVE_SOURCE_REDIRECTS === 'true',
    dataDir,
    mockStreamDelayMs: e.MOCK_STREAM_DELAY_MS ?? 0,
    mockFailNextWriting: e.MOCK_FAIL_NEXT_WRITING ?? null,
  };
}

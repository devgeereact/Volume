import { existsSync } from 'node:fs';
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
  /** Unix socket path. When set it replaces MYSQL_HOST and MYSQL_PORT (cPanel's MariaDB socket, for example). */
  MYSQL_SOCKET: z.string().min(1).optional(),
  /** verify (default for a remote host) or off (default for localhost, where cPanel MariaDB offers no TLS). */
  MYSQL_SSL: z.enum(['off', 'verify']).optional(),
  MYSQL_SSL_CA: z.string().min(1).optional(),
  MYSQL_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(20).default(5),
  HOST: z.string().default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(5181),
  WEB_ORIGINS: z.string().default('http://127.0.0.1:5180,http://localhost:5180'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  MAX_JSON_BYTES: z.coerce.number().int().min(1024).default(2 * 1024 * 1024),
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).default(50 * 1024 * 1024),
  JOBS_ENABLED: boolish.default(true),
  /** Default true, except in production, where `npm run migrate` runs with the migration user instead. */
  AUTO_MIGRATE: boolish.optional(),
  /** production on the host. Anything else (or unset) is development. */
  NODE_ENV: z.string().optional(),
  /** local (no sign-in, one owner; development only) or clerk (Clerk session tokens). Default: local, or clerk in production. */
  AUTH_MODE: z.preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() : v), z.enum(['local', 'clerk'])).optional(),
  /** Public origin of the hosted app, for example https://volume.example.com. Required in production. */
  APP_ORIGIN: z.string().min(1).optional(),
  /** Host header values to answer, comma separated. Default: the APP_ORIGIN host (plus the loopback hosts outside production). */
  ALLOWED_HOSTS: z.string().optional(),
  /** Trust the proxy in front (Passenger, Cloudflare): X-Forwarded-* and CF-Connecting-IP. Default: on in production only. */
  TRUST_PROXY: boolish.optional(),
  /** Requests per minute per client IP for /api (reads), writes and the public health check. */
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(100000).default(600),
  RATE_LIMIT_WRITE_MAX: z.coerce.number().int().min(1).max(100000).default(120),
  RATE_LIMIT_HEALTH_MAX: z.coerce.number().int().min(1).max(100000).default(30),
  /** Folder with the built web app (index.html and assets/). Default: <root>/web when it exists (the release layout). */
  WEB_DIST_DIR: z.string().min(1).optional(),
  /** Clerk publishable key (public). Its Frontend API host goes into the Content Security Policy. */
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  /** Comma separated Clerk user ids allowed in (user_...). */
  CLERK_ALLOWED_USER_IDS: z.string().optional(),
  /** Comma separated email addresses allowed in. Needs CLERK_SECRET_KEY to look the address up. */
  OWNER_EMAILS: z.string().optional(),
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
  /** Unix socket path, or null for TCP to host:port. */
  socketPath: string | null;
  database: string;
  user: string;
  /** Kept only inside the pool options; never logged or returned by the API. */
  password: string;
  ssl: 'off' | 'verify';
  /** Optional path to a CA certificate (PEM) for hosts with a private CA. */
  sslCaPath: string | null;
  connectionLimit: number;
}

/** Who may sign in with Clerk. Key values are never stored here; index.ts reads them from the environment. */
export interface ClerkSettings {
  publishableKey: string | null;
  /** Frontend API host decoded from the publishable key (for the Content Security Policy), or null. */
  frontendApiHost: string | null;
  secretKeyPresent: boolean;
  jwtKeyPresent: boolean;
  allowedUserIds: string[];
  /** Lower case. */
  ownerEmails: string[];
  /** Origins Clerk accepts in the token's azp claim. */
  authorizedParties: string[];
}

export interface AppConfig {
  root: string;
  /** NODE_ENV=production. */
  production: boolean;
  authMode: 'local' | 'clerk';
  clerk: ClerkSettings;
  /** APP_ORIGIN, or null in development when unset. */
  appOrigin: string | null;
  trustProxy: boolean;
  rateLimit: { max: number; writeMax: number; healthMax: number };
  /** Built web app folder served by Fastify, or null (development uses Vite). */
  webDistDir: string | null;
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

function list(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** An origin such as https://volume.example.com (scheme, host, optional port; no path). */
function parseOrigin(name: string, v: string): string {
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    throw new ConfigError(`${name} must be an origin such as https://volume.example.com.`);
  }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || (u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new ConfigError(`${name} must be an origin such as https://volume.example.com, with no path.`);
  }
  return u.origin.toLowerCase();
}

/** The Frontend API host inside a Clerk publishable key (pk_test_ or pk_live_, then base64 of "<host>$"). */
export function clerkFrontendApiHost(publishableKey: string | undefined): string | null {
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(publishableKey?.trim() ?? '');
  if (!m) return null;
  const decoded = Buffer.from(m[2] as string, 'base64').toString('utf8');
  const host = decoded.replace(/\$$/, '');
  return /^[a-z0-9.-]+$/i.test(host) ? host.toLowerCase() : null;
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1']);

export interface LoadConfigOptions {
  env?: NodeJS.ProcessEnv;
  /** Load ROOT/.env with dotenv first (default true for the real server, false in tests). */
  dotenv?: boolean;
  root?: string;
}

export function loadConfig(opts: LoadConfigOptions = {}): AppConfig {
  const root = opts.root ?? findRepoRoot();
  if (opts.dotenv ?? ((opts.env ?? process.env)['VOLUME_LOAD_ENV'] !== 'false')) {
    // quiet: dotenv must not print anything about the file or its keys. VOLUME_ENV_FILE points at a file elsewhere
    // (on the host: ~/apps/volume/shared/.env). Values already in the environment (Passenger settings) win.
    const file = (opts.env ?? process.env)['VOLUME_ENV_FILE']?.trim();
    loadDotenv({ path: file ? resolve(file) : join(root, '.env'), quiet: true });
  }
  const env = opts.env ?? process.env;
  const parsed = EnvSchema.safeParse(withoutBlankSettings(env));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new ConfigError(`Invalid server settings in the environment: ${fields}`);
  }
  const e = parsed.data;

  if (e.HOST !== '127.0.0.1' && e.HOST !== 'localhost' && e.HOST !== '::1') {
    throw new ConfigError('HOST must be 127.0.0.1 (Volume only listens on this computer).');
  }

  const production = e.NODE_ENV?.trim().toLowerCase() === 'production';

  let db: AppConfig['db'];
  if (e.DB_CLIENT === 'mysql') {
    const missing = (['MYSQL_DATABASE', 'MYSQL_USER'] as const).filter((k) => !e[k]);
    if (!e.MYSQL_HOST && !e.MYSQL_SOCKET) missing.unshift('MYSQL_HOST' as never);
    if (missing.length > 0) {
      throw new ConfigError(`DB_CLIENT=mysql needs ${missing.join(', ')} in .env.`);
    }
    const host = e.MYSQL_HOST ?? 'localhost';
    db = {
      client: 'mysql',
      mysql: {
        host,
        port: e.MYSQL_PORT,
        socketPath: e.MYSQL_SOCKET ?? null,
        database: e.MYSQL_DATABASE ?? '',
        user: e.MYSQL_USER ?? '',
        password: e.MYSQL_PASSWORD ?? '',
        ssl: e.MYSQL_SSL ?? (e.MYSQL_SOCKET || LOOPBACK.has(host.toLowerCase()) ? 'off' : 'verify'),
        sslCaPath: e.MYSQL_SSL_CA ? resolve(root, e.MYSQL_SSL_CA) : null,
        connectionLimit: e.MYSQL_CONNECTION_LIMIT,
      },
    };
  } else {
    db = { client: 'sqlite', sqlitePath: resolve(root, e.SQLITE_PATH ?? join('data', 'volume.sqlite')) };
  }

  const appOrigin = e.APP_ORIGIN ? parseOrigin('APP_ORIGIN', e.APP_ORIGIN) : null;
  if (production && !appOrigin) throw new ConfigError('NODE_ENV=production needs APP_ORIGIN (for example https://volume.example.com).');

  // Development keeps the loopback origins (Vite on 5180, the API on its own port). Production answers only APP_ORIGIN,
  // plus WEB_ORIGINS when it is set explicitly.
  const webOrigins = production ? list(env['WEB_ORIGINS']) : list(e.WEB_ORIGINS);
  const selfOrigins = production ? [] : [`http://127.0.0.1:${e.PORT}`, `http://localhost:${e.PORT}`];
  const allowedOrigins = [...new Set([...(appOrigin ? [appOrigin] : []), ...selfOrigins, ...webOrigins.map((o) => o.toLowerCase())])];
  const explicitHosts = list(e.ALLOWED_HOSTS).map((h) => h.toLowerCase());
  const allowedHosts = explicitHosts.length > 0 ? [...new Set(explicitHosts)] : [...new Set(allowedOrigins.map((o) => o.replace(/^https?:\/\//, '')))];

  const authMode = e.AUTH_MODE ?? (production ? 'clerk' : 'local');
  if (production && authMode === 'local') throw new ConfigError('AUTH_MODE=local is for development only. Production needs AUTH_MODE=clerk.');
  const publishableKey = e.CLERK_PUBLISHABLE_KEY?.trim() ?? null;
  const clerk: ClerkSettings = {
    publishableKey,
    frontendApiHost: clerkFrontendApiHost(publishableKey ?? undefined),
    secretKeyPresent: (env['CLERK_SECRET_KEY'] ?? '').trim().length > 0,
    jwtKeyPresent: (env['CLERK_JWT_KEY'] ?? '').trim().length > 0,
    allowedUserIds: list(e.CLERK_ALLOWED_USER_IDS),
    ownerEmails: list(e.OWNER_EMAILS).map((m) => m.toLowerCase()),
    authorizedParties: allowedOrigins.filter((o) => o.startsWith('https://') || !production),
  };
  if (authMode === 'clerk') {
    const problems: string[] = [];
    if (!clerk.publishableKey) problems.push('CLERK_PUBLISHABLE_KEY');
    if (!clerk.secretKeyPresent && !clerk.jwtKeyPresent) problems.push('CLERK_JWT_KEY or CLERK_SECRET_KEY');
    if (clerk.allowedUserIds.length === 0 && clerk.ownerEmails.length === 0) problems.push('OWNER_EMAILS or CLERK_ALLOWED_USER_IDS');
    if (clerk.ownerEmails.length > 0 && !clerk.secretKeyPresent) problems.push('CLERK_SECRET_KEY (OWNER_EMAILS looks up each address)');
    if (problems.length > 0) throw new ConfigError(`AUTH_MODE=clerk needs ${problems.join(', ')}.`);
  }

  const webDistDir = e.WEB_DIST_DIR ? resolve(root, e.WEB_DIST_DIR) : existsSync(join(root, 'web', 'index.html')) ? join(root, 'web') : null;

  const keyPresent = openRouterKeyIsSet(env);

  const dataDir = resolve(root, e.DATA_DIR ?? 'data');
  const inRepo = relative(root, dataDir);
  if (!inRepo.startsWith('..') && !isAbsolute(inRepo)) {
    const inData = relative(join(root, 'data'), dataDir);
    if (inData.startsWith('..') || isAbsolute(inData)) throw new ConfigError('DATA_DIR must be the data folder (or a folder inside it) or a folder outside the repo.');
  }

  return {
    root,
    production,
    authMode,
    clerk,
    appOrigin,
    trustProxy: e.TRUST_PROXY ?? production,
    rateLimit: { max: e.RATE_LIMIT_MAX, writeMax: e.RATE_LIMIT_WRITE_MAX, healthMax: e.RATE_LIMIT_HEALTH_MAX },
    webDistDir,
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
    autoMigrate: e.AUTO_MIGRATE ?? !production,
    openRouterKeyPresent: keyPresent,
    aiProvider: e.AI_PROVIDER ?? 'auto',
    exportProvider: e.EXPORT_PROVIDER ?? 'volume',
    resolveSourceRedirects: e.RESOLVE_SOURCE_REDIRECTS === undefined ? undefined : e.RESOLVE_SOURCE_REDIRECTS === 'true',
    dataDir,
    mockStreamDelayMs: e.MOCK_STREAM_DELAY_MS ?? 0,
    mockFailNextWriting: e.MOCK_FAIL_NEXT_WRITING ?? null,
  };
}

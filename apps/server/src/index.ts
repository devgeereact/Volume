import { join } from 'node:path';
import { MockExportAdapter } from './adapters/mock-export.js';
import { createOpenRouterAi, selectAiAdapter, type OpenRouterAiAdapter } from './adapters/openrouter-ai.js';
import { VolumeExportAdapter } from './adapters/volume-export.js';
import { buildApp } from './app.js';
import { ClerkAuthProvider, createClerkUserLookup, createClerkVerifier } from './auth/clerk.js';
import { ensureOwner } from './auth/context.js';
import { ConfigError, loadConfig } from './config/env.js';
import { migrateToLatest, openDatabase, pendingMigrations } from './db/connect.js';
import { createRepos } from './repos/index.js';
import { seedProfiles } from './seed/seed.js';

/** Shutdown waits this long for jobs and the browser, then exits anyway (Passenger kills a slow app). */
const SHUTDOWN_GRACE_MS = 10_000;

/**
 * Starts Volume's API (and, in the release layout, the web app) on 127.0.0.1. Under Passenger the same call listens
 * on Passenger's socket instead (Passenger replaces listen); PORT is used everywhere else.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const handle = openDatabase(config);
  if (config.autoMigrate) await migrateToLatest(handle);
  else {
    // Production runs `npm run migrate` with the migration user before a release goes live; the runtime user cannot.
    const pending = await pendingMigrations(handle);
    if (pending.length > 0) {
      await handle.close();
      throw new ConfigError(`The database needs migrations (${pending.join(', ')}). Run the migrate command with the migration user first.`);
    }
  }
  const owner = await ensureOwner(handle.db);
  // The key is read here and handed to @volume/ai only. It is never logged or stored in config.
  const aiLog: string[] = [];
  const { ai, provider } = await selectAiAdapter({
    choice: config.aiProvider,
    apiKey: process.env['OPENROUTER_API_KEY'],
    anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
    promptsDir: join(config.root, 'prompts'),
    configDir: config.configDir,
    resolveSourceRedirects: config.resolveSourceRedirects,
    mockStreamDelayMs: config.mockStreamDelayMs,
    mockFailNextWriting: config.mockFailNextWriting,
    log: (line) => aiLog.push(line),
  });
  const exporter = config.exportProvider === 'mock' ? new MockExportAdapter() : new VolumeExportAdapter({ root: config.root });
  // Settings' "Test the key" button: OpenRouter's key status through @volume/ai. The key stays in this closure.
  const apiKey = process.env['OPENROUTER_API_KEY']?.trim() ?? '';
  let keyAdapter: Promise<OpenRouterAiAdapter> | null = null;
  const openRouterKeyCheck = apiKey
    ? async (signal: AbortSignal) => {
        keyAdapter ??= createOpenRouterAi({
          apiKey,
          promptsDir: join(config.root, 'prompts'),
          configDir: config.configDir,
          resolveSourceRedirects: config.resolveSourceRedirects,
        });
        const status = await (await keyAdapter).keyStatus(signal);
        return { valid: status.valid, limitRemainingUsd: status.limitRemainingUsd };
      }
    : null;
  // Hosted sign-in: Clerk keys are read here and stay inside the verifier; they are never logged or stored in config.
  let auth: Parameters<typeof buildApp>[0]['auth'];
  if (config.authMode === 'clerk') {
    const keys = {
      publishableKey: config.clerk.publishableKey ?? '',
      secretKey: process.env['CLERK_SECRET_KEY']?.trim() || undefined,
      jwtKey: process.env['CLERK_JWT_KEY']?.trim().replace(/\\n/g, '\n') || undefined,
    };
    const verifier = createClerkVerifier(keys, config.clerk, config.appOrigin ?? `http://127.0.0.1:${config.port}`);
    // Email lookups serve OWNER_EMAILS and, with ACCOUNTS_MODE=invite, matching invitations to verified addresses.
    const needsLookup = config.clerk.ownerEmails.length > 0 || config.accountsMode === 'invite';
    const lookup = keys.secretKey && needsLookup ? createClerkUserLookup({ publishableKey: keys.publishableKey, secretKey: keys.secretKey }) : null;
    auth = (ownerCtx, db) => new ClerkAuthProvider(db, ownerCtx, config.clerk, verifier, lookup, config.accountsMode);
  }
  const { app } = await buildApp({ config, handle, ai, exporter, openRouterKeyCheck, ...(auth ? { auth } : {}) });
  for (const line of aiLog) app.log.info(line);
  app.log.info(
    config.exportProvider === 'mock' ? 'Export provider: mock (EXPORT_PROVIDER=mock). Files are placeholders marked MOCK.' : 'Export provider: @volume/export.',
  );

  const seed = await seedProfiles(createRepos(handle.db), owner, config.configDir);
  if (!seed.folderFound) app.log.info('config/profiles not found: no profiles seeded');
  else app.log.info({ created: seed.created.length, skipped: seed.skipped.length, invalid: seed.invalid.length }, 'profiles seeded from config');

  // Running jobs stay 'running' in the database; after a restart (or a Passenger idle stop) their stale heartbeat
  // puts them back in the queue and the runner picks them up again (src/jobs/runner.ts).
  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'shutting down');
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
    try {
      await app.close();
      await handle.close();
    } finally {
      process.exit(0);
    }
  };
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) process.once(signal, () => void shutdown(signal));

  await app.listen({ host: config.host, port: config.port });
  app.log.info(
    { db: config.db.client, ai: provider, exporter: exporter.name, auth: config.authMode, accounts: config.accountsMode, web: config.webDistDir !== null },
    'Volume server ready',
  );
}

main().catch((err: unknown) => {
  const message = err instanceof ConfigError ? err.message : err instanceof Error ? err.message : String(err);
  process.stderr.write(`Volume server could not start: ${message}\n`);
  process.exit(1);
});

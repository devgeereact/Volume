import { join } from 'node:path';
import { MockExportAdapter } from './adapters/mock-export.js';
import { createOpenRouterAi, selectAiAdapter, type OpenRouterAiAdapter } from './adapters/openrouter-ai.js';
import { VolumeExportAdapter } from './adapters/volume-export.js';
import { buildApp } from './app.js';
import { ensureOwner } from './auth/context.js';
import { ConfigError, loadConfig } from './config/env.js';
import { migrateToLatest, openDatabase } from './db/connect.js';
import { createRepos } from './repos/index.js';
import { seedProfiles } from './seed/seed.js';

/** Starts Volume's API on 127.0.0.1 only. */
async function main(): Promise<void> {
  const config = loadConfig();
  const handle = openDatabase(config);
  if (config.autoMigrate) await migrateToLatest(handle);
  const owner = await ensureOwner(handle.db);
  // The key is read here and handed to @volume/ai only. It is never logged or stored in config.
  const aiLog: string[] = [];
  const { ai, provider } = await selectAiAdapter({
    choice: config.aiProvider,
    apiKey: process.env['OPENROUTER_API_KEY'],
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
  const { app } = await buildApp({ config, handle, ai, exporter, openRouterKeyCheck });
  for (const line of aiLog) app.log.info(line);
  app.log.info(
    config.exportProvider === 'mock' ? 'Export provider: mock (EXPORT_PROVIDER=mock). Files are placeholders marked MOCK.' : 'Export provider: @volume/export.',
  );

  const seed = await seedProfiles(createRepos(handle.db), owner, config.configDir);
  if (!seed.folderFound) app.log.info('config/profiles not found: no profiles seeded');
  else app.log.info({ created: seed.created.length, skipped: seed.skipped.length, invalid: seed.invalid.length }, 'profiles seeded from config');

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info({ signal }, 'shutting down');
    await app.close();
    await handle.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.host, port: config.port });
  app.log.info({ db: config.db.client, ai: provider, exporter: exporter.name }, 'Volume server ready');
}

main().catch((err: unknown) => {
  const message = err instanceof ConfigError ? err.message : err instanceof Error ? err.message : String(err);
  process.stderr.write(`Volume server could not start: ${message}\n`);
  process.exit(1);
});

import type { FastifyInstance, InjectOptions } from 'fastify';
import { expect } from 'vitest';
import { buildApp, type AppServices, type BuildAppOptions } from '../src/app.js';
import { ensureOwner, type RequestCtx } from '../src/auth/context.js';
import { loadConfig, type AppConfig } from '../src/config/env.js';
import { migrateToLatest, openSqlite, type DbHandle } from '../src/db/connect.js';

export const HOST = '127.0.0.1:5181';

/** Vitest types asymmetric matchers as any; these name them as unknown so the typed lint rules accept them. */
export const anyString: unknown = expect.any(String);
export const anyNumber: unknown = expect.any(Number);
export const anyBoolean: unknown = expect.any(Boolean);

/** A response field that must be a string (an id, say), for use in a URL. Fails the test otherwise. */
export function str(v: unknown): string {
  if (typeof v !== 'string') throw new Error(`Expected a string, got ${typeof v}.`);
  return v;
}
export const ORIGIN = 'http://127.0.0.1:5180';

export function testConfig(extra: Record<string, string> = {}): AppConfig {
  // dotenv is off: tests never read the real .env.
  return loadConfig({ dotenv: false, env: { LOG_LEVEL: 'silent', JOBS_ENABLED: 'false', ...extra } });
}

export async function memoryDb(): Promise<DbHandle> {
  const handle = openSqlite(':memory:');
  await migrateToLatest(handle);
  return handle;
}

export interface TestApp {
  app: FastifyInstance;
  services: AppServices;
  handle: DbHandle;
  owner: RequestCtx;
  call: <T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url: string,
    body?: unknown,
    headers?: Record<string, string>,
  ) => Promise<{ status: number; body: T; headers: Record<string, unknown>; raw: string }>;
  close: () => Promise<void>;
}

export async function testApp(opts: Partial<BuildAppOptions> = {}): Promise<TestApp> {
  const handle = await memoryDb();
  const config = opts.config ?? testConfig();
  const { app, services } = await buildApp({ config, handle, startJobs: false, logger: false, ...opts });
  await app.ready();
  const owner = await ensureOwner(handle.db);
  const call: TestApp['call'] = async (method, url, body, headers = {}) => {
    const h: Record<string, string> = { host: HOST, ...headers };
    const o: InjectOptions = { method, url, headers: h };
    if (body !== undefined) {
      o.payload = JSON.stringify(body);
      h['content-type'] = 'application/json';
      if (!('origin' in headers)) h['origin'] = ORIGIN;
    }
    const res = await app.inject(o);
    let parsed: unknown;
    try {
      parsed = res.body ? JSON.parse(res.body) : null;
    } catch {
      parsed = null;
    }
    return { status: res.statusCode, body: parsed as never, headers: res.headers, raw: res.body };
  };
  return {
    app,
    services,
    handle,
    owner,
    call,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

/**
 * Makes cover concepts, chooses the first and builds the eBook cover and paperback wrap through the API, so a
 * test can build the KDP pack (the pack needs a cover since live run 3).
 */
export async function buildCovers(t: TestApp, bookId: string): Promise<void> {
  await t.call('POST', `/api/v1/books/${bookId}/cover/concepts`, {});
  await t.services.runner.runUntilIdle();
  const cover = await t.call<{ cover: { concepts: { assetId: string }[] } }>('GET', `/api/v1/books/${bookId}/cover`);
  const assetId = cover.body.cover.concepts[0]?.assetId;
  if (!assetId) throw new Error('The mock made no cover concept.');
  await t.call('POST', `/api/v1/books/${bookId}/cover/choose`, { assetId });
  await t.call('POST', `/api/v1/books/${bookId}/cover/build`, {});
  await t.services.runner.runUntilIdle();
}

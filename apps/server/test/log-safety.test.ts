import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, defaultLogger } from '../src/app.js';
import { errSerializer, hashIp, logUrl, safeErr } from '../src/http/log-safety.js';
import { HOST, memoryDb, testConfig } from './helpers.js';
import type { FastifyInstance } from 'fastify';
import type { DbHandle } from '../src/db/connect.js';

/** Request logs (D-050): no query text, no full IP, no error messages; 500 answers carry a code only. */

const SEARCH = 'my-secret-manuscript-phrase';
const VISITOR = '203.0.113.77';
const BOOM = 'secret internals with user text: Jane Q Patient';

describe('log helpers', () => {
  it('drops the query string', () => {
    expect(logUrl('/api/v1/books/01ABC/search?q=private%20words')).toBe('/api/v1/books/01ABC/search?[redacted]');
    expect(logUrl('/api/v1/books')).toBe('/api/v1/books');
  });

  it('hashes the IP to a short stable token', () => {
    const h = hashIp(VISITOR);
    expect(h).toMatch(/^ip-[0-9a-f]{12}$/);
    expect(h).toBe(hashIp(VISITOR));
    expect(h).not.toBe(hashIp('203.0.113.78'));
    expect(h).not.toContain('203');
  });

  it('keeps the error name, code and stack frames, never the message', () => {
    const err = Object.assign(new Error(`${BOOM}\n    at fake (looks like a frame)`), { code: 'ER_SOMETHING' });
    const safe = safeErr(err);
    expect(safe.name).toBe('Error');
    expect(safe.code).toBe('ER_SOMETHING');
    expect(safe.frames?.length).toBeGreaterThan(0);
    expect(JSON.stringify(safe)).not.toContain('Jane');
    expect(JSON.stringify(safe)).not.toContain('looks like a frame');
    expect(errSerializer(err)).toMatchObject({ type: 'Error', message: '[redacted]', code: 'ER_SOMETHING' });
    expect(safeErr({ message: BOOM })).toEqual({ name: 'Error' });
    expect(safeErr('plain string')).toEqual({ name: 'Error' });
    expect(safeErr(null)).toEqual({ name: 'object' });
  });
});

describe('server logs', () => {
  const lines: string[] = [];
  let app: FastifyInstance;
  let handle: DbHandle;

  beforeAll(async () => {
    const config = testConfig({ LOG_LEVEL: 'info' });
    const stream = new Writable({
      write(chunk: Buffer, _enc, done) {
        lines.push(chunk.toString('utf8'));
        done();
      },
    });
    const logger = defaultLogger(config);
    if (typeof logger !== 'object') throw new Error('Expected logger options.');
    handle = await memoryDb();
    ({ app } = await buildApp({ config, handle, startJobs: false, logger: { ...logger, stream } }));
    app.get('/api/v1/__boom', () => {
      throw new Error(BOOM);
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await handle.close();
  });

  it('logs the path without the query and a hashed IP', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/v1/books?q=${SEARCH}`, headers: { host: HOST }, remoteAddress: VISITOR });
    expect(res.statusCode).toBe(200);
    const all = lines.join('');
    expect(all).toContain('/api/v1/books?[redacted]');
    expect(all).toContain(hashIp(VISITOR));
    expect(all).not.toContain(SEARCH);
    expect(all).not.toContain(VISITOR);
    expect(all).not.toContain('remotePort');
  });

  it('answers a 500 with a code only and logs no message', async () => {
    lines.length = 0;
    const res = await app.inject({ method: 'GET', url: '/api/v1/__boom', headers: { host: HOST }, remoteAddress: VISITOR });
    expect(res.statusCode).toBe(500);
    expect(JSON.parse(res.body)).toEqual({ error: { code: 'internal_error', message: 'Something went wrong on the server. Try again.' } });
    const all = lines.join('');
    expect(all).toContain('request failed');
    expect(all).not.toContain('Jane Q Patient');
    expect(all).not.toContain('secret internals');
  });
});

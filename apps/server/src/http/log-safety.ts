import { createHash, randomBytes } from 'node:crypto';

/**
 * What the logs may hold (D-050, SECURITY.md): no query strings (manuscript search text), no full visitor IP and no
 * error messages (they can quote user text). These helpers are pure so tests can check them directly.
 */

/** The path without its query. A query is replaced by a marker so the log still shows that one was sent. */
export function logUrl(url: string): string {
  const q = url.indexOf('?');
  return q < 0 ? url : `${url.slice(0, q)}?[redacted]`;
}

/** Per-process salt: the same visitor gets the same hash while the server runs, and hashes cannot be joined later. */
const SALT = randomBytes(16);

/** A short salted hash of an IP: enough to see one visitor's requests together, not enough to recover the address. */
export function hashIp(ip: string): string {
  return `ip-${createHash('sha256').update(SALT).update(ip).digest('hex').slice(0, 12)}`;
}

export interface SafeErr {
  name: string;
  code?: string;
  /** Stack frames (`at ...` lines) only; the first stack line repeats the message and is dropped. */
  frames?: string[];
}

const CODE = /^[A-Za-z0-9_.-]{1,64}$/;
/** A V8 stack frame: `at name (file:line:col)` or `at file:line:col`. Message lines never match this shape by chance. */
const FRAME = /^at [^\n]{1,300}:\d+:\d+\)?$/;

/** An error reduced to its name, code and stack frames. Never throws (it runs inside the logger). */
export function safeErr(err: unknown): SafeErr {
  try {
    if (typeof err !== 'object' || err === null) return { name: typeof err === 'string' ? 'Error' : typeof err };
    const e = err as { name?: unknown; code?: unknown; stack?: unknown; frames?: unknown };
    const out: SafeErr = { name: typeof e.name === 'string' && CODE.test(e.name) ? e.name : 'Error' };
    if (typeof e.code === 'string' && CODE.test(e.code)) out.code = e.code;
    if (typeof e.stack === 'string') {
      const frames = e.stack
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => FRAME.test(l))
        .slice(0, 12);
      if (frames.length > 0) out.frames = frames;
    } else if (Array.isArray(e.frames)) {
      out.frames = e.frames.filter((f): f is string => typeof f === 'string' && FRAME.test(f)).slice(0, 12);
    }
    return out;
  } catch {
    return { name: 'Error' };
  }
}

/** The logger's `err` serializer: the shape pino expects, with the message always redacted. */
export function errSerializer(err: unknown): { type: string; message: string; stack: string; code?: string } {
  const e = safeErr(err);
  return { type: e.name, message: '[redacted]', stack: (e.frames ?? []).join('\n'), ...(e.code ? { code: e.code } : {}) };
}

import { chmod, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import type { RequestCtx } from '../auth/context.js';
import type { Db } from '../db/connect.js';
import type { Dialect } from '../db/migrations/types.js';
import { AppError } from '../http/errors.js';
import type { SettingsRepo } from '../repos/settings.js';

/**
 * Database backups (docs/02, Backups).
 * - SQLite: `VACUUM INTO` a timestamped file under DATA_DIR/backups. Consistent while the server runs.
 * - MySQL on cPanel: not done here; cPanel's own backups (or phpMyAdmin Export) cover it.
 * Files live in the database, so one backup holds the whole library. The newest 14 are kept.
 */

export const KEEP_BACKUPS = 14;
const NAME = /^volume-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.sqlite$/;
const MYSQL_MESSAGE =
  'Volume does not back up the MySQL database itself. Use cPanel Backup (or phpMyAdmin Export) for a full copy: it holds every book and file.';

export interface BackupFile {
  name: string;
  bytes: number;
  createdAt: number;
}

export interface BackupStatus {
  /** When the newest backup was made, or null. */
  lastAt: number | null;
  count: number;
  /** local_folder: files under DATA_DIR/backups. cpanel: the host's own backups (MySQL). */
  locationKind: 'local_folder' | 'cpanel';
  keep: number;
  /** Nightly backups switched on (setting backup.enabled, default on). */
  enabled: boolean;
  supported: boolean;
}

function fileName(at: Date): string {
  // 2026-10-05T03:12:45.123Z becomes volume-2026-10-05T03-12-45-123Z.sqlite
  return `volume-${at.toISOString().replace(/:/g, '-').replace('.', '-')}.sqlite`;
}

function timeOf(name: string): number | null {
  const m = NAME.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, ms] = m;
  return Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms));
}

export class BackupService {
  readonly dir: string;
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<BackupFile> | null = null;

  constructor(
    private readonly db: Db,
    private readonly dialect: Dialect,
    dataDir: string,
    private readonly keep = KEEP_BACKUPS,
  ) {
    this.dir = join(dataDir, 'backups');
  }

  get supported(): boolean {
    return this.dialect === 'sqlite';
  }

  /** Makes one backup now. MySQL: 501 with a plain message. Two calls at once share one backup. */
  async create(at = new Date()): Promise<BackupFile> {
    if (!this.supported) throw new AppError('not_implemented', MYSQL_MESSAGE);
    if (this.running) return this.running;
    this.running = this.write(at).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async write(at: Date): Promise<BackupFile> {
    await mkdir(this.dir, { recursive: true, mode: 0o700 });
    const name = fileName(at);
    const path = join(this.dir, name);
    try {
      await sql`vacuum into ${path}`.execute(this.db);
    } catch (e) {
      await rm(path, { force: true });
      throw e;
    }
    try {
      await chmod(path, 0o600);
    } catch {
      // best effort on file permissions
    }
    await this.prune();
    const st = await stat(path);
    return { name, bytes: st.size, createdAt: timeOf(name) ?? at.getTime() };
  }

  /** Backups newest first. MySQL: always empty. */
  async list(): Promise<BackupFile[]> {
    if (!this.supported) return [];
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch {
      return [];
    }
    const out: BackupFile[] = [];
    for (const name of names) {
      const t = timeOf(name);
      if (t === null) continue;
      try {
        const st = await stat(join(this.dir, name));
        out.push({ name, bytes: st.size, createdAt: t });
      } catch {
        // removed while listing
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Keeps the newest `keep` backups and removes older ones (only files Volume named). */
  async prune(): Promise<number> {
    const all = await this.list();
    const old = all.slice(this.keep);
    for (const f of old) await rm(join(this.dir, f.name), { force: true });
    return old.length;
  }

  async status(enabled: boolean): Promise<BackupStatus> {
    const list = await this.list();
    return {
      lastAt: list[0]?.createdAt ?? null,
      count: list.length,
      locationKind: this.supported ? 'local_folder' : 'cpanel',
      keep: this.keep,
      enabled: this.supported && enabled,
      supported: this.supported,
    };
  }

  /**
   * Nightly backup while the server runs: checked every `everyMs` (default 15 minutes). Once the
   * local time passes backup.time (default 02:00) and no backup was made today, one is made.
   * A Mac that slept through the time catches up on the next check.
   */
  startNightly(settings: SettingsRepo, ctx: RequestCtx, opts: { everyMs?: number; log?: (msg: string, err?: unknown) => void } = {}): void {
    if (!this.supported || this.timer) return;
    const check = async (): Promise<void> => {
      try {
        const values = await settings.all(ctx);
        if (values['backup.enabled'] === false) return;
        if (await this.dueAt(new Date(), values['backup.time'] ?? '02:00')) {
          const f = await this.create();
          opts.log?.(`Nightly backup made: ${f.name}`);
        }
      } catch (err) {
        opts.log?.('Nightly backup failed', err);
      }
    };
    this.timer = setInterval(() => void check(), opts.everyMs ?? 15 * 60 * 1000);
    this.timer.unref();
    void check();
  }

  /** True when the time of day has passed `hhmm` and the newest backup is from an earlier day (local time). */
  async dueAt(at: Date, hhmm: string): Promise<boolean> {
    const [h = 2, m = 0] = hhmm.split(':').map(Number);
    if (at.getHours() * 60 + at.getMinutes() < h * 60 + m) return false;
    const last = (await this.list())[0];
    if (!last) return true;
    const d = new Date(last.createdAt);
    return !(d.getFullYear() === at.getFullYear() && d.getMonth() === at.getMonth() && d.getDate() === at.getDate());
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

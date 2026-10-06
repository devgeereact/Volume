import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Finds the monorepo root (the folder holding config/models.defaults.json).
 * VOLUME_ROOT wins when set. Works from src (tsx) and dist (node) alike.
 */
export function findRepoRoot(startFrom?: string): string {
  const fromEnv = process.env['VOLUME_ROOT'];
  if (fromEnv && fromEnv.length > 0) return resolve(fromEnv);
  let dir = startFrom ?? dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i += 1) {
    if (existsSync(join(dir, 'config', 'models.defaults.json')) && existsSync(join(dir, 'package.json'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error('Could not find the Volume repository root (config/models.defaults.json). Set VOLUME_ROOT.');
}

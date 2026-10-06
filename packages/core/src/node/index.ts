/// <reference types="node" />
// Node-only helpers: read the config files from the repo. Kept apart from the pure core (import "@volume/core/node").

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseKdpRules, type KdpRules } from '../kdp.ts';
import { compileHouseStyle, type CompiledHouseStyle } from '../style.ts';
import { coverStylesFromConfig, interiorThemesFromConfig, type CoverStyle, type InteriorTheme } from '../theme.ts';

/** The repo root: the nearest folder above this file (or `from`) that holds AGENTS.md. */
export function findRepoRoot(from: string = path.dirname(fileURLToPath(import.meta.url))): string {
  let dir = path.resolve(from);
  while (dir !== path.dirname(dir)) {
    if (existsSync(path.join(dir, 'AGENTS.md')) && existsSync(path.join(dir, 'config'))) return dir;
    dir = path.dirname(dir);
  }
  throw new Error(`Cannot find the Volume repo root above ${from}.`);
}

const readJson = (p: string): unknown => JSON.parse(readFileSync(p, 'utf8')) as unknown;

/** The newest dated rules file in config/kdp-rules/ (or the named version). */
export function loadKdpRules(root: string = findRepoRoot(), version?: string): KdpRules {
  const dir = path.join(root, 'config', 'kdp-rules');
  const files = readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const name = version ? `${version}.json` : files[files.length - 1];
  if (!name) throw new Error(`No KDP rules file in ${dir}.`);
  return parseKdpRules(readJson(path.join(dir, name)));
}

export function loadHouseStyleConfig(root: string = findRepoRoot()): unknown {
  return readJson(path.join(root, 'config', 'house-style.json'));
}

export function loadHouseStyle(root: string = findRepoRoot(), extraBanned: readonly string[] = []): CompiledHouseStyle {
  return compileHouseStyle(loadHouseStyleConfig(root), extraBanned);
}

export function loadBookTemplate(id: string, root: string = findRepoRoot()): unknown {
  return readJson(path.join(root, 'config', 'book-templates', `${id}.json`));
}

/** Themes from config/interior-themes.json when it exists, otherwise an empty list (callers use the default). */
export function loadInteriorThemes(root: string = findRepoRoot()): InteriorTheme[] {
  const p = path.join(root, 'config', 'interior-themes.json');
  return existsSync(p) ? interiorThemesFromConfig(readJson(p)) : [];
}

export function loadCoverStyles(root: string = findRepoRoot()): CoverStyle[] {
  const p = path.join(root, 'config', 'cover-styles.json');
  return existsSync(p) ? coverStylesFromConfig(readJson(p)) : [];
}

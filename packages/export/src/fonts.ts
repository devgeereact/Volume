// Font discovery: OFL fonts in assets/fonts (static TTF/OTF, preferred) and Fontsource packages in node_modules.
// Families are matched by slug ("Source Sans 3" -> "source-sans-3").

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { slugify } from '@volume/core';
import { findRepoRoot } from '@volume/core/node';

export interface FontFile {
  family: string;
  slug: string;
  /** Exact weight for static files; [min, max] for variable files. */
  weight: number | [number, number];
  style: 'normal' | 'italic';
  path: string;
  format: 'truetype' | 'opentype' | 'woff2' | 'woff';
  variable: boolean;
  source: 'assets' | 'fontsource';
}

export interface FontLibrary {
  files: FontFile[];
  /** Files for a family (static files first), or an empty list. */
  family(name: string): FontFile[];
  has(name: string): boolean;
  /** Best file for a weight and style (nearest weight, static preferred). */
  pick(name: string, weight: number, style?: 'normal' | 'italic'): FontFile | undefined;
}

const FORMAT: Record<string, FontFile['format']> = { '.ttf': 'truetype', '.otf': 'opentype', '.woff2': 'woff2', '.woff': 'woff' };

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(' ');
}

function scanAssets(dir: string): FontFile[] {
  if (!existsSync(dir)) return [];
  const out: FontFile[] = [];
  for (const f of readdirSync(dir)) {
    const ext = path.extname(f).toLowerCase();
    const fmt = FORMAT[ext];
    if (!fmt) continue;
    const m = /^(.+?)-(\d{3}|variable)-(normal|italic)$/.exec(path.basename(f, ext));
    if (!m || !m[1]) continue;
    const variable = m[2] === 'variable';
    out.push({
      family: titleFromSlug(m[1]),
      slug: m[1],
      weight: variable ? [100, 900] : Number(m[2]),
      style: m[3] === 'italic' ? 'italic' : 'normal',
      path: path.join(dir, f),
      format: fmt,
      variable,
      source: 'assets',
    });
  }
  return out;
}

function scanFontsource(nodeModules: string): FontFile[] {
  const out: FontFile[] = [];
  for (const scope of ['@fontsource', '@fontsource-variable']) {
    const base = path.join(nodeModules, scope);
    if (!existsSync(base)) continue;
    for (const pkg of readdirSync(base)) {
      const filesDir = path.join(base, pkg, 'files');
      if (!existsSync(filesDir)) continue;
      let family = titleFromSlug(pkg);
      try {
        const meta = JSON.parse(readFileSync(path.join(base, pkg, 'package.json'), 'utf8')) as { description?: string };
        const d = /^(?:Self-host the )?(.+?) font/i.exec(meta.description ?? '');
        if (d?.[1]) family = d[1].trim();
      } catch {
        // keep the slug-derived name
      }
      const names = readdirSync(filesDir);
      const have = new Set(names);
      for (const f of names) {
        // Latin subset only. static: <pkg>-latin-400-normal.woff2 ; variable: <pkg>-latin-wght-normal.woff2
        const m = new RegExp(`^${pkg}-latin-(\\d{3}|wght)-(normal|italic)\\.(woff2|woff)$`).exec(f);
        if (m && m[3] === 'woff' && have.has(`${f}2`)) continue; // woff2 is smaller; skip the woff twin
        if (!m) continue;
        const variable = m[1] === 'wght';
        out.push({
          family,
          slug: pkg,
          weight: variable ? [100, 900] : Number(m[1]),
          style: m[2] === 'italic' ? 'italic' : 'normal',
          path: path.join(filesDir, f),
          format: m[3] === 'woff' ? 'woff' : 'woff2',
          variable,
          source: 'fontsource',
        });
      }
    }
  }
  return out;
}

export function createFontLibrary(files: FontFile[]): FontLibrary {
  const sorted = [...files].sort((a, b) => Number(a.variable) - Number(b.variable) || (a.source === 'assets' ? -1 : 1) - (b.source === 'assets' ? -1 : 1));
  const family = (name: string) => sorted.filter((f) => f.slug === slugify(name));
  return {
    files: sorted,
    family,
    has: (name) => family(name).length > 0,
    pick(name, weight, style = 'normal') {
      const fam = family(name).filter((f) => f.style === style);
      const pool = fam.length ? fam : family(name);
      let best: FontFile | undefined;
      let bestScore = Number.POSITIVE_INFINITY;
      for (const f of pool) {
        const score = Array.isArray(f.weight) ? (weight >= f.weight[0] && weight <= f.weight[1] ? 50 : 1000) : Math.abs(f.weight - weight);
        if (score < bestScore) {
          best = f;
          bestScore = score;
        }
      }
      return best;
    },
  };
}

let cached: FontLibrary | undefined;

/** Fonts from <root>/assets/fonts and <root>/node_modules/@fontsource*. Cached per process. */
export function loadFontLibrary(root: string = findRepoRoot()): FontLibrary {
  if (cached) return cached;
  cached = createFontLibrary([...scanAssets(path.join(root, 'assets', 'fonts')), ...scanFontsource(path.join(root, 'node_modules'))]);
  return cached;
}

/** True when a family exists only as variable font files (Chromium prints those as Type 3 fonts in PDFs). */
export function isVariableOnly(lib: FontLibrary, family: string): boolean {
  const files = lib.family(family);
  return files.length > 0 && files.every((f) => f.variable);
}

/**
 * Resolve a theme family to an available one, with a warning when it falls back. For PDF output, families that exist
 * only as variable fonts fall back too (unless allowVariable), because Chromium embeds them as Type 3 fonts, which
 * preflight rejects. Static files for the family (assets/fonts or @fontsource) fix this without code changes.
 */
export function resolveFamily(lib: FontLibrary, wanted: string, fallback: string, warnings: string[], opts: { allowVariable?: boolean } = {}): string {
  if (!lib.has(wanted)) {
    warnings.push(`Font "${wanted}" is not in assets/fonts or Fontsource; using "${fallback}".`);
    return fallback;
  }
  if (!opts.allowVariable && isVariableOnly(lib, wanted)) {
    warnings.push(`Font "${wanted}" is only installed as a variable font, which Chromium prints as Type 3; using "${fallback}" until static files are added.`);
    return fallback;
  }
  return wanted;
}

const dataCache = new Map<string, string>();
function dataUrl(f: FontFile): string {
  let v = dataCache.get(f.path);
  if (!v) {
    const mime = f.format === 'truetype' ? 'font/ttf' : f.format === 'opentype' ? 'font/otf' : `font/${f.format}`;
    v = `data:${mime};base64,${readFileSync(f.path).toString('base64')}`;
    dataCache.set(f.path, v);
  }
  return v;
}

/** @font-face rules (fonts inlined as data: URLs) for every file of the given families. */
/**
 * @font-face rules (fonts inlined as data: URLs) for the given families. With `weights`, only the static files
 * nearest to each wanted weight are included (normal and italic), which keeps the HTML small.
 */
export function fontFaceCss(lib: FontLibrary, families: string[], weights?: number[]): string {
  const rules: string[] = [];
  const seen = new Set<string>();
  for (const name of families) {
    const files = lib.family(name);
    const statics = files.filter((f) => !f.variable);
    let chosen = statics.length ? statics : files; // variable fonts print as Type 3 in Chromium; prefer static files
    if (weights?.length && statics.length) {
      const keep = new Set<FontFile>();
      for (const style of ['normal', 'italic'] as const) {
        const pool = statics.filter((f) => f.style === style);
        for (const w of weights) {
          const best = [...pool].sort((a, b) => Math.abs((a.weight as number) - w) - Math.abs((b.weight as number) - w))[0];
          if (best) keep.add(best);
        }
      }
      chosen = [...keep];
    }
    for (const f of chosen) {
      if (seen.has(f.path)) continue;
      seen.add(f.path);
      const weight = Array.isArray(f.weight) ? `${f.weight[0]} ${f.weight[1]}` : String(f.weight);
      rules.push(`@font-face { font-family: '${name}'; font-weight: ${weight}; font-style: ${f.style}; src: url('${dataUrl(f)}') format('${f.format}'); }`);
    }
  }
  return rules.join('\n');
}

/** Raw TTF/OTF bytes for embedding in DOCX (static files only). */
export function fontBytes(lib: FontLibrary, family: string, weight: number, style: 'normal' | 'italic' = 'normal'): Buffer | undefined {
  const f = lib.family(family).find((x) => !x.variable && (x.format === 'truetype' || x.format === 'opentype') && x.weight === weight && x.style === style);
  return f ? readFileSync(f.path) : undefined;
}

#!/usr/bin/env node
/*
 * Builds a self-contained release folder for the cPanel host (Passenger, Node 24): `npm run build:release`.
 *
 *   build/release/
 *     app.cjs              Passenger startup file (imports server/index.mjs)
 *     server/index.mjs     the API and web server, one esbuild bundle (the @volume/* packages inlined)
 *     server/migrate.mjs   the migrate command (run with the migration database user)
 *     web/                 the built web app (VITE_CLERK_PUBLISHABLE_KEY is read at build time)
 *     config/ prompts/ assets/
 *     package.json, package-lock.json   npm dependencies only (no better-sqlite3, no dev tools)
 *     tmp/                 Passenger watches tmp/restart.txt
 *
 * The host then runs `npm ci --omit=dev` with Node 24 inside the folder. Nothing here reads .env or data/.
 * Options: --out <dir> (default build/release), --require-clerk (fail without VITE_CLERK_PUBLISHABLE_KEY).
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { build } from 'esbuild';
import { root } from './runtime.mjs';

const args = process.argv.slice(2);
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : undefined;
const out = path.resolve(root, outArg ?? 'build/release');
const requireClerk = args.includes('--require-clerk');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Packages the release must not carry: SQLite is for development (its binary cannot load on the host). */
const DEV_ONLY = new Set(['better-sqlite3']);
const WORKSPACES = ['apps/server', 'packages/core', 'packages/ai', 'packages/export'];

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

function run(command, argv, cwd, env = process.env) {
  const r = spawnSync(command, argv, { cwd, stdio: 'inherit', env });
  if (r.status !== 0) throw new Error(`${command} ${argv.join(' ')} failed in ${path.relative(root, cwd) || '.'}`);
}

/** The exact installed version of a dependency (what the tests ran against). */
function installedVersion(name) {
  const file = path.join(root, 'node_modules', name, 'package.json');
  if (!existsSync(file)) throw new Error(`${name} is not installed. Run npm run setup first.`);
  return readJson(file).version;
}

function releaseDependencies() {
  const deps = {};
  for (const ws of WORKSPACES) {
    for (const name of Object.keys(readJson(path.join(root, ws, 'package.json')).dependencies ?? {})) {
      if (name.startsWith('@volume/') || DEV_ONLY.has(name)) continue;
      deps[name] = installedVersion(name);
    }
  }
  return Object.fromEntries(Object.entries(deps).sort(([a], [b]) => a.localeCompare(b)));
}

/** esbuild plugin: bundle the workspace packages (TypeScript sources), leave every npm package external. */
const externalNpm = {
  name: 'external-npm',
  setup(b) {
    b.onResolve({ filter: /^[^./]/ }, (a) => {
      if (a.path.startsWith('@volume/') || a.path.startsWith('node:')) return undefined;
      return { path: a.path, external: true };
    });
  },
};

function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

async function bundleServer(deps) {
  const result = await build({
    entryPoints: {
      index: path.join(root, 'apps/server/src/index.ts'),
      migrate: path.join(root, 'apps/server/src/db/migrate-cli.ts'),
    },
    outdir: path.join(out, 'server'),
    outExtension: { '.js': '.mjs' },
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    sourcemap: false,
    legalComments: 'none',
    metafile: true,
    logLevel: 'warning',
    plugins: [externalNpm],
  });
  // Every external import must be a declared release dependency (or a Node built-in).
  const missing = new Set();
  for (const file of Object.values(result.metafile.outputs)) {
    for (const imp of file.imports) {
      if (!imp.external || imp.path.startsWith('node:')) continue;
      const pkg = packageOf(imp.path);
      if (!(pkg in deps) && !DEV_ONLY.has(pkg)) missing.add(pkg);
    }
  }
  if (missing.size > 0) throw new Error(`The server bundle imports packages the release does not list: ${[...missing].join(', ')}`);
}

function writeManifest(deps) {
  const rootPkg = readJson(path.join(root, 'package.json'));
  const pkg = {
    name: 'volume-release',
    private: true,
    version: rootPkg.version,
    description: 'Volume release for the cPanel host. Built by scripts/build-release.mjs; install with npm ci --omit=dev.',
    type: 'module',
    engines: { node: '>=24.11 <27' },
    scripts: {
      start: 'node server/index.mjs',
      migrate: 'node server/migrate.mjs',
      'migrate:status': 'node server/migrate.mjs status',
    },
    dependencies: deps,
    allowScripts: { sharp: true },
  };
  writeFileSync(path.join(out, 'package.json'), `${JSON.stringify(pkg, null, 2)}\n`);
  // Start from the repository lockfile so every transitive version stays the one the tests ran against; npm then
  // prunes it to this package's dependencies (workspaces, dev tools and better-sqlite3 drop out).
  cpSync(path.join(root, 'package-lock.json'), path.join(out, 'package-lock.json'));
  run(npm, ['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund', '--workspaces=false'], out);
  const lock = readJson(path.join(out, 'package-lock.json'));
  const names = Object.keys(lock.packages ?? {});
  const leaked = names.filter((n) => /node_modules\/(better-sqlite3|@volume\/)/.test(n) || n.startsWith('packages/') || n.startsWith('apps/'));
  if (leaked.length > 0) throw new Error(`The release lockfile still lists: ${leaked.join(', ')}`);
}

function buildWeb() {
  const key = process.env.VITE_CLERK_PUBLISHABLE_KEY?.trim() ?? '';
  if (!key) {
    if (requireClerk) throw new Error('VITE_CLERK_PUBLISHABLE_KEY is not set; the hosted build needs it (--require-clerk).');
    console.warn('VITE_CLERK_PUBLISHABLE_KEY is not set: this web build has no sign-in screen (local use only).');
  } else if (!/^pk_(test|live)_/.test(key)) {
    throw new Error('VITE_CLERK_PUBLISHABLE_KEY does not look like a Clerk publishable key (pk_test_ or pk_live_).');
  }
  const viteBin = path.join(root, 'node_modules/vite/bin/vite.js');
  run(process.execPath, [viteBin, 'build', '--logLevel', 'warn', '--outDir', path.join(out, 'web'), '--emptyOutDir'], path.join(root, 'apps/web'));
  return key.length > 0;
}

try {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  const deps = releaseDependencies();
  console.log(`Bundling the server into ${path.relative(root, out)}/server ...`);
  await bundleServer(deps);
  console.log('Building the web app ...');
  const signIn = buildWeb();
  for (const dir of ['config', 'prompts', 'assets']) cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
  cpSync(path.join(root, 'deploy/passenger/app.cjs'), path.join(out, 'app.cjs'));
  mkdirSync(path.join(out, 'tmp'), { recursive: true });
  writeFileSync(path.join(out, 'tmp', 'restart.txt'), '');
  console.log('Writing package.json and the pruned lockfile ...');
  writeManifest(deps);
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim() || 'unknown';
  const info = { commit, builtAt: new Date().toISOString(), node: '>=24.11 <27', webSignIn: signIn };
  writeFileSync(path.join(out, 'RELEASE.json'), `${JSON.stringify(info, null, 2)}\n`);
  console.log(`Release ready: ${out} (commit ${commit}, web sign-in ${signIn ? 'on' : 'off'}).`);
} catch (err) {
  console.error(String(err instanceof Error ? err.message : err));
  process.exit(1);
}

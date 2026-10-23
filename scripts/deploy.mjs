#!/usr/bin/env node
/*
 * Deploys main to the cPanel host in one command: `npm run deploy`. Steps and reasons: docs/07-operations/DEPLOYMENT.md.
 *
 *   1. Preflight: on main, clean, equal to origin/main; CI on this commit passed (gh). With --no-ci-check the local
 *      checks run instead (typecheck, lint, format:check, test, e2e) and must pass, unless --skip-local-checks.
 *   2. Build the release (npm run build:release --require-clerk) with the public Clerk key from deploy/production.json.
 *   3. Upload to ~/apps/volume/releases/<utc>, then npm ci --omit=dev with the host's Node 24.
 *   4. Link the shared settings file into the release (a symlink; the file is never read or copied here).
 *   5. Migrations: stop when any are pending, unless --migrate (take the cPanel database backup first).
 *   6. Switch ~/apps/volume/current, stop the running lsnode process (LiteSpeed ignores tmp/restart.txt), check live.
 *   7. Any failed live check switches back to the previous release and restarts it.
 *
 * Options: --dry-run (preflight and plan only), --migrate, --no-ci-check (local checks instead of CI),
 * --skip-local-checks (with --no-ci-check: no checks at all, for an emergency only), --rollback (back to the previous release).
 *   8. After a passing deploy, delete older releases beyond the newest KEEP_RELEASES working ones (each holds ~20,000
 *      files and the host caps inodes); a release whose install failed (no node_modules) never counts as one. Never deletes the live or previous release, the one the Node.js selector is registered
 *      against (it names PassengerNodejs), or anything newer than this deploy (a concurrent upload).
 * Never touches ~/apps/volume/shared or the database outside server/migrate.mjs.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './runtime.mjs';

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const migrate = args.has('--migrate');
const ciCheck = !args.has('--no-ci-check');
const rollbackOnly = args.has('--rollback');
const skipLocalChecks = args.has('--skip-local-checks');
const known = new Set(['--dry-run', '--migrate', '--no-ci-check', '--skip-local-checks', '--rollback']);
for (const a of args) if (!known.has(a)) fail(`Unknown option ${a}. Options: ${[...known].join(', ')}.`);
if (skipLocalChecks && ciCheck) fail('--skip-local-checks only goes with --no-ci-check.');

/** What stands in for GitHub CI when it cannot run (the same gates as .github/workflows/check.yml, on this computer). */
const LOCAL_CHECKS = ['typecheck', 'lint', 'format:check', 'test', 'e2e'];
/** Releases kept after a deploy (the new one included); older ones go, except the protected ones in step 8. */
const KEEP_RELEASES = 3;

const cfg = JSON.parse(readFileSync(path.join(root, 'deploy/production.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// The host has no UTF-8 locale; forwarding the Mac's LC_CTYPE makes every remote command print perl warnings.
const sshEnv = { ...process.env, LANG: 'C', LC_ALL: 'C', LC_CTYPE: 'C' };
const app = `$HOME/${cfg.appDir}`;
const lsnodeTitle = `lsnode:/home/[^/]+/${cfg.appDir}/current/`;

function fail(message) {
  console.error(`\nDeploy stopped: ${message}`);
  process.exit(1);
}

function step(message) {
  console.log(`\n> ${message}`);
}

function local(command, argv, opts = {}) {
  const r = spawnSync(command, argv, { cwd: root, encoding: 'utf8', stdio: opts.inherit ? 'inherit' : 'pipe', env: opts.env ?? process.env });
  if (r.status !== 0 && !opts.allowFail) fail(`${command} ${argv.join(' ')} failed.\n${r.stderr ?? ''}`);
  return { status: r.status, out: (r.stdout ?? '').trim() };
}

/** Runs a bash script on the host. Returns stdout; exit status is returned, not thrown, when allowFail is set. */
function remote(script, opts = {}) {
  // The script goes in on stdin, so the remote login shell does not expand $p, $(...) or quotes before bash runs it.
  const r = spawnSync('ssh', ['-o', 'BatchMode=yes', cfg.host, 'bash', '-s'], {
    encoding: 'utf8',
    env: sshEnv,
    input: `set -euo pipefail\n${script}\n`,
  });
  const stderr = (r.stderr ?? '')
    .split('\n')
    .filter((l) => l.trim() && !/^perl: warning|^\s+(LANGUAGE|LC_|LANG|are supported)/.test(l))
    .join('\n');
  if (r.status !== 0 && !opts.allowFail) fail(`remote step failed (exit ${r.status}).\n${stderr}`);
  return { status: r.status, out: (r.stdout ?? '').trim(), err: stderr };
}

/** Every release folder on the host, as ['ok' | 'broken', name]; broken means its install failed (no node_modules). */
function hostReleases() {
  return remote(`cd ${app}/releases && for r in *; do if [ -d "$r/node_modules" ]; then echo "ok $r"; else echo "broken $r"; fi; done`)
    .out.split('\n')
    .map((l) => l.split(' '))
    .filter((p) => p.length === 2 && /^\d{8}T\d{6}Z$/.test(p[1]));
}

/**
 * Releases to delete after the deploy of `utc`: older than it, not among the newest KEEP_RELEASES working ones, and
 * not the new, previous live or Node.js selector release. A broken release never holds a keep slot.
 */
function staleReleases(listed, utc) {
  const selector = passengerNode.match(/\/releases\/([^/]+)\//)?.[1];
  const protectedReleases = new Set([utc, current, selector].filter(Boolean));
  const working = listed
    .filter((p) => p[0] === 'ok')
    .map((p) => p[1])
    .sort();
  const kept = new Set(working.slice(-KEEP_RELEASES));
  return listed.map((p) => p[1]).filter((r) => r < utc && !kept.has(r) && !protectedReleases.has(r));
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(urlPath) {
  try {
    const res = await fetch(`${cfg.url}${urlPath}${urlPath.includes('?') ? '&' : '?'}cb=${Date.now()}`, {
      redirect: 'manual',
      signal: AbortSignal.timeout(30_000),
    });
    return { status: res.status, body: await res.text() };
  } catch (e) {
    return { status: 0, body: e instanceof Error ? e.message : String(e) };
  }
}

/** Restarts the app: stop the lsnode process LiteSpeed runs for current/; the next request starts a fresh one. */
function restart() {
  remote(`for p in $(pgrep -f '^${lsnodeTitle}' || true); do kill "$p" || true; done; touch ${app}/current/tmp/restart.txt`);
}

/** Live checks after a switch. Returns a list of failures (empty when healthy). */
async function liveChecks(expectBundle, release) {
  let health = { status: 0, body: '' };
  for (let i = 0; i < 12; i += 1) {
    health = await get('/api/health');
    if (health.status === 200 && health.body.trim() === '{"status":"ok"}') break;
    await sleep(5000);
  }
  const problems = [];
  if (health.status !== 200 || health.body.trim() !== '{"status":"ok"}') problems.push(`health answered ${health.status} ${health.body.slice(0, 80)}`);
  for (const p of ['/api/v1/books', '/%61pi/v1/health', '/api/%761/books']) {
    const r = await get(p);
    if (r.status !== 401) problems.push(`${p} answered ${r.status}, expected 401`);
  }
  const page = await get('/');
  if (page.status !== 200) problems.push(`page answered ${page.status}`);
  if (expectBundle && !page.body.includes(expectBundle)) problems.push(`page does not load ${expectBundle} (old process still serving?)`);
  if (!page.body.includes('noindex')) problems.push('page has no noindex meta');
  if (release) {
    const cwd = remote(`for p in $(pgrep -f '^${lsnodeTitle}' || true); do readlink /proc/$p/cwd; done`, { allowFail: true }).out;
    if (cwd && !cwd.split('\n').every((l) => l.endsWith(`/releases/${release}`))) problems.push(`app process runs from ${cwd.replace(/\n/g, ', ')}`);
  }
  return problems;
}

async function switchTo(release, expectBundle) {
  remote(`test -d ${app}/releases/${release}/node_modules && ln -sfn releases/${release} ${app}/current`);
  restart();
  return liveChecks(expectBundle, release);
}

// ---- Current state on the host ----
step('Reading the host');
const current = remote(`basename "$(readlink ${app}/current)"`).out;
const releases = remote(`ls -1 ${app}/releases`).out.split('\n').filter(Boolean).sort();
console.log(`  live release: ${current}`);
// The docroot .htaccess (owned by the Node.js selector) names the Node binary; a missing one takes the whole site down.
const nodeLine = remote(`grep -m1 '^PassengerNodejs' $HOME/${new URL(cfg.url).hostname}/.htaccess || true`).out;
const passengerNode = nodeLine.match(/"([^"]+)"/)?.[1];
if (!passengerNode) fail('no PassengerNodejs line in the docroot .htaccess.');
if (remote(`test -x '${passengerNode}'`, { allowFail: true }).status !== 0) fail(`PassengerNodejs points at ${passengerNode}, which is missing.`);

if (rollbackOnly) {
  const idx = releases.indexOf(current);
  const previous = idx > 0 ? releases[idx - 1] : undefined;
  if (!previous) fail('no earlier release to roll back to.');
  step(`Rolling back ${current} -> ${previous}`);
  if (dryRun) process.exit(0);
  const problems = await switchTo(previous);
  if (problems.length) fail(`rollback live checks failed:\n  ${problems.join('\n  ')}`);
  console.log(`\nRolled back. Live release: ${previous}.`);
  process.exit(0);
}

// ---- 1. Preflight ----
step('Preflight');
const branch = local('git', ['rev-parse', '--abbrev-ref', 'HEAD']).out;
if (branch !== 'main') fail(`on branch ${branch}; deploy from main.`);
if (local('git', ['status', '--porcelain']).out) fail('the working tree has uncommitted changes.');
local('git', ['fetch', '-q', 'origin', 'main']);
const head = local('git', ['rev-parse', 'HEAD']).out;
if (head !== local('git', ['rev-parse', 'origin/main']).out) fail('main is not equal to origin/main (pull or push first).');
const short = head.slice(0, 7);
if (ciCheck) {
  const ci = local('gh', ['run', 'list', '--commit', head, '--json', 'conclusion,status', '-q', '.[] | "\\(.status) \\(.conclusion)"'], { allowFail: true });
  if (ci.status !== 0) fail('could not read CI with gh. Log in to gh, or pass --no-ci-check.');
  const runs = ci.out.split('\n').filter(Boolean);
  if (!runs.includes('completed success')) fail(`no passed CI run for ${short} yet (${runs.join(', ') || 'none'}). Wait for CI, or pass --no-ci-check.`);
}
if (!ciCheck) {
  if (skipLocalChecks) console.log('  WARNING: GitHub CI and the local checks are both skipped (--skip-local-checks).');
  else if (dryRun) console.log(`  would run the local checks instead of CI: ${LOCAL_CHECKS.map((c) => `npm run ${c}`).join(', ')}`);
  else {
    step('Local checks (instead of GitHub CI)');
    for (const check of LOCAL_CHECKS) {
      console.log(`\n  npm run ${check}`);
      local(npm, ['run', '-s', check], { inherit: true });
    }
    if (local('git', ['status', '--porcelain']).out) fail('the local checks changed the working tree; commit or discard, then deploy again.');
  }
}
const checked = ciCheck ? ', CI passed' : skipLocalChecks ? ', no checks run' : dryRun ? '' : ', local checks passed';
console.log(`  main at ${short}, clean, pushed${checked}`);

// ---- 2. Build ----
step('Building the release');
const utc = new Date()
  .toISOString()
  .replace(/[-:]/g, '')
  .replace(/\.\d+Z$/, 'Z');
if (dryRun) {
  console.log(`  would build ${short} as releases/${utc}, then upload, install, check migrations and switch from ${current}.`);
  // The new release counts as a working one once it passes.
  const prune = staleReleases([...hostReleases(), ['ok', utc]], utc);
  console.log(`  after a passing deploy would delete: ${prune.length ? prune.map((r) => `releases/${r}`).join(', ') : 'nothing'}`);
  process.exit(0);
}
local(npm, ['run', '-s', 'build:release', '--', '--require-clerk'], {
  inherit: true,
  env: { ...process.env, VITE_CLERK_PUBLISHABLE_KEY: cfg.clerkPublishableKey },
});
const built = JSON.parse(readFileSync(path.join(root, 'build/release/RELEASE.json'), 'utf8'));
if (built.commit !== short) fail(`built ${built.commit}, expected ${short}.`);
const bundle = readFileSync(path.join(root, 'build/release/web/index.html'), 'utf8').match(/\/assets\/index-[^"]+\.js/)?.[0];
if (!bundle) fail('no web bundle in build/release/web/index.html.');

// ---- 3. Upload and install ----
step(`Uploading releases/${utc}`);
local('rsync', ['-az', `${path.join(root, 'build/release')}/`, `${cfg.host}:${cfg.appDir}/releases/${utc}/`], { env: sshEnv });
step('Installing dependencies on the host (Node 24)');
// The host account has a thread cap shared with every other process it runs (an editor session can use most of it).
// npm starts several Node processes at once, and one of them aborted at start with "uv_thread_create" (exit 134,
// 23 October 2026), so the install runs Node with a one-thread pool: the same 167 packages, in about 8 seconds.
remote(
  `cd ${app}/releases/${utc} && export PATH=${cfg.nodeBin}:$PATH NODE_OPTIONS=--v8-pool-size=1 UV_THREADPOOL_SIZE=1 && npm ci --omit=dev --no-audit --no-fund --loglevel=error && test ! -d node_modules/better-sqlite3`,
);

// ---- 4. Settings link ----
remote(`ln -sfn ../../shared/.env ${app}/releases/${utc}/.env`);

// ---- 5. Migrations ----
step('Checking migrations');
const status = remote(`cd ${app}/releases/${utc} && export PATH=${cfg.nodeBin}:$PATH NODE_ENV=production && node server/migrate.mjs status`, {
  allowFail: true,
});
console.log(`  ${status.out.split('\n').slice(-1)[0]}`);
if (status.status === 2) {
  if (!migrate) fail(`migrations are pending. The release is uploaded but not live. Take a cPanel database backup, then run: npm run deploy -- --migrate`);
  remote(`cd ${app}/releases/${utc} && export PATH=${cfg.nodeBin}:$PATH NODE_ENV=production && node server/migrate.mjs`);
} else if (status.status !== 0) fail(`migrate status failed (exit ${status.status}).\n${status.err}`);

// ---- 6. Switch and check ----
step(`Switching ${current} -> ${utc}`);
const problems = await switchTo(utc, bundle);
if (problems.length) {
  console.error(`\nLive checks failed:\n  ${problems.join('\n  ')}\n\nRolling back to ${current}.`);
  const back = await switchTo(current);
  fail(back.length ? `rollback also failed:\n  ${back.join('\n  ')}` : `rolled back to ${current}; the site runs the previous release.`);
}
// ---- 8. Prune old releases ----
// Release names are UTC stamps, so sorting by name sorts by age. A failure here leaves extra folders, not a broken site.
step('Pruning old releases');
const stale = staleReleases(hostReleases(), utc);
for (const r of stale) {
  const rm = remote(`rm -rf -- ${app}/releases/${r}`, { allowFail: true });
  console.log(rm.status === 0 ? `  deleted releases/${r}` : `  WARNING: could not delete releases/${r}: ${rm.err}`);
}
if (!stale.length) console.log('  nothing to prune');

console.log(`\nDeployed ${short} as releases/${utc} (was ${current}). Health 200, sign-in enforced, ${bundle} served.`);
console.log(`Roll back with: npm run deploy -- --rollback`);

import { spawnSync } from 'node:child_process';
import { requireRuntime, root } from './runtime.mjs';

try {
  requireRuntime();
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const install = spawnSync(npm, ['ci', '--include=optional', '--no-audit', '--no-fund'], { cwd: root, stdio: 'inherit' });
  if (install.status !== 0) throw new Error('Lockfile installation failed. See the install error above; no lockfile was updated.');
  // Use the installed CLI directly: never download an unpinned npx package.
  const browser = spawnSync(process.execPath, [root + 'node_modules/playwright/cli.js', 'install', 'chromium'], { cwd: root, stdio: 'inherit' });
  if (browser.status !== 0) throw new Error('Chromium installation failed. See docs/07-operations/SETUP.md for OS prerequisites.');
  const check = spawnSync(process.execPath, [root + 'scripts/doctor.mjs'], { cwd: root, stdio: 'inherit' });
  process.exitCode = check.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

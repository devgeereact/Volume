import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { checkPort, developmentPorts, requireRuntime, root } from './runtime.mjs';

const require = createRequire(new URL('../package.json', import.meta.url));

export async function doctor({ ports = false } = {}) {
  requireRuntime();
  const checks = [`Runtime: Node ${process.versions.node} (24.11+ supported, 26 for development)`];
  if (!existsSync(root + 'node_modules')) throw new Error('Dependencies missing. Run mise exec -- npm run setup.');
  try {
    await import('vite');
    const Database = require('better-sqlite3');
    const db = new Database(':memory:');
    db.prepare('select 1').get();
    db.close();
    await require('sharp')({ create: { width: 1, height: 1, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
  } catch {
    throw new Error('Native dependencies cannot load on this OS/runtime. Run mise exec -- npm run setup to restore the lockfile dependencies.');
  }
  checks.push('Vite, in-memory SQLite and image native modules');
  const { chromium } = await import('playwright');
  if (!existsSync(chromium.executablePath())) throw new Error('Chromium is missing. Run mise exec -- npm run setup.');
  checks.push('Pinned Chromium executable is installed (launch is checked by browser tests)');
  const selected = developmentPorts();
  if (ports) {
    await Promise.all([checkPort(selected.api), checkPort(selected.web)]);
    checks.push(`Loopback ports ${selected.web}/${selected.api} are available`);
  }
  return { checks, ports: selected };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await doctor({ ports: process.argv.includes('--ports') });
    for (const check of result.checks) console.log(`PASS: ${check}`);
    console.log('No environment files or owner data were inspected. OpenRouter credentials are optional for mock development.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

// Validate local Markdown file targets without reading private data or environment files.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { root } from './runtime.mjs';

const files = [];
function collect(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (
      ['source-drafts', 'node_modules', '.git', 'data', 'dist', 'coverage', 'test-results'].includes(item.name) ||
      item.isSymbolicLink() ||
      item.name.startsWith('.env')
    )
      continue;
    const path = resolve(dir, item.name);
    if (item.isDirectory()) collect(path);
    else if (item.name.endsWith('.md')) files.push(path);
  }
}
for (const dir of ['docs', 'qa', '.agent', '.claude', 'apps', 'packages', 'scripts', 'tests']) collect(resolve(root, dir));
for (const name of ['README.md', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', 'CODEX.md', 'CHANGELOG.md', 'docs/KNOWN-ISSUES.md']) files.push(resolve(root, name));
// Reports live outside the repository (../reports/volume). A fresh clone or CI run has no copy,
// and each computer keeps only the reports written there, so a missing report is skipped, not failed.
const reportsRoot = resolve(root, '..', 'reports', 'volume');
const failures = [];
let skipped = 0;
for (const file of files) {
  const text = readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '');
  for (const match of text.matchAll(/!?\[[^\]\n]*\]\(([^\s)]+)\)/g)) {
    const dest = match[1];
    if (/^[a-z]+:|^#|^\//i.test(dest)) continue;
    const target = resolve(dirname(file), decodeURIComponent(dest.split('#')[0]));
    const fromReports = relative(reportsRoot, target);
    if (!existsSync(target) && !fromReports.startsWith('..') && !isAbsolute(fromReports)) {
      skipped++;
      continue;
    }
    if (!existsSync(target) || (!statSync(target).isFile() && !statSync(target).isDirectory())) failures.push(`${relative(root, file)}: ${dest}`);
  }
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  const note = skipped ? ` ${skipped} links into ../reports/volume skipped (report not on this computer).` : '';
  console.log(`PASS: local Markdown file links in ${files.length} documents (source drafts and examples excluded).${note}`);
}

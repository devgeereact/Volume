// Print a manuscript once per interior theme and list the fonts each PDF embeds (pdfjs-dist), for manual checks.
//
//   npx tsx packages/export/scripts/theme-matrix.ts <manuscript.md> <out-folder>

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseManuscript } from '@volume/core';
import { loadInteriorThemes, loadKdpRules } from '@volume/core/node';
import { acquireBrowser, exportPrintPdf, inspectPdf, releaseBrowser } from '../src/index.ts';

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) {
  console.error('Usage: tsx packages/export/scripts/theme-matrix.ts <manuscript.md> <out-folder>');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });
const book = parseManuscript(readFileSync(src, 'utf8'));
const rules = loadKdpRules();
const browser = await acquireBrowser();
const lines: string[] = [];
let failures = 0;
try {
  for (const theme of loadInteriorThemes()) {
    const r = await exportPrintPdf(book, theme, { browser, rules });
    writeFileSync(path.join(outDir, `${theme.id}.pdf`), r.buffer);
    const info = await inspectPdf(r.buffer, { text: false });
    const bad = info.fonts.filter((f) => !f.embedded || f.type3);
    const ok = bad.length === 0 && r.warnings.length === 0;
    if (!ok) failures++;
    const names = [...new Set(info.fonts.map((f) => f.name.replace(/^[A-Z]{6}\+/, '')))].sort();
    lines.push(
      `${ok ? 'PASS' : 'FAIL'}  ${theme.id.padEnd(22)} ${String(r.pageCount).padStart(3)} pp  body ${theme.fonts.body}, heading ${theme.fonts.heading}  embedded: ${names.join(', ')}${bad.length ? `  PROBLEM: ${bad.map((f) => f.name).join(', ')}` : ''}${r.warnings.length ? `  WARN: ${r.warnings.join(' | ')}` : ''}`,
    );
  }
} finally {
  await releaseBrowser();
}
writeFileSync(path.join(outDir, 'fonts-report.txt'), `${lines.join('\n')}\n`);
console.log(lines.join('\n'));
process.exit(failures ? 1 : 0);

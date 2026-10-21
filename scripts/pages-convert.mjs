#!/usr/bin/env node
// npm run pages -- <pack.zip|folder>
// Adds an Apple Pages copy of the DOCX manuscript to a KDP upload pack, on a Mac with Pages installed.
// Folder: writes manuscript/<name>.pages next to each manuscript/<name>.docx. Zip: adds manuscript/<name>.pages to the
// zip and names it in README.txt. Pages opens the DOCX, saves it as .pages and closes that document; Pages itself is
// never quit. The conversion code is shared with the server (packages/export/src/pages.ts).
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import JSZip from 'jszip';
import { PAGES_README_HINT, convertDocxFileToPages, findPages, pagesReadmeLine, readPagesFile } from '../packages/export/src/pages.ts';

function fail(message) {
  console.error(`pages: ${message}`);
  process.exit(1);
}

async function convertOne(docxPath, outPath) {
  const started = Date.now();
  console.log(`pages: converting ${basename(docxPath)} with Apple Pages...`);
  await convertDocxFileToPages(docxPath, outPath);
  console.log(`pages: wrote ${outPath} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

async function fromFolder(folder) {
  const manuscript = existsSync(join(folder, 'manuscript')) ? join(folder, 'manuscript') : folder;
  const docxs = readdirSync(manuscript).filter((n) => n.toLowerCase().endsWith('.docx') && !n.startsWith('~$'));
  if (!docxs.length) fail(`no DOCX found in ${manuscript}.`);
  for (const name of docxs) await convertOne(join(manuscript, name), join(manuscript, name.replace(/\.docx$/i, '.pages')));
}

async function fromZip(zipPath) {
  const zip = await JSZip.loadAsync(readFileSync(zipPath));
  const docxs = Object.keys(zip.files).filter((n) => /^manuscript\/[^/]+\.docx$/i.test(n));
  if (!docxs.length) fail(`no manuscript/*.docx in ${zipPath}.`);
  const tmp = mkdtempSync(join(tmpdir(), 'volume-pages-'));
  try {
    const added = [];
    for (const entry of docxs) {
      const name = basename(entry).replace(/\.docx$/i, '');
      const docxPath = join(tmp, `${name}.docx`);
      const outPath = join(tmp, `${name}.pages`);
      writeFileSync(docxPath, await zip.file(entry).async('nodebuffer'));
      await convertOne(docxPath, outPath);
      zip.file(`manuscript/${name}.pages`, await readPagesFile(outPath));
      added.push(`${name}.pages`);
    }
    const readme = zip.file('README.txt');
    if (readme) {
      const text = await readme.async('string');
      const lines = added.map(pagesReadmeLine).join('\n');
      zip.file('README.txt', text.includes(PAGES_README_HINT) ? text.replace(PAGES_README_HINT, lines) : `${text.trimEnd()}\n${lines}\n`);
    }
    const out = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    writeFileSync(zipPath, out);
    console.log(`pages: added ${added.map((n) => `manuscript/${n}`).join(', ')} to ${zipPath}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

const target = process.argv[2];
if (!target || target === '--help' || target === '-h') {
  console.log('Usage: npm run pages -- <pack.zip|pack folder>');
  process.exit(target ? 0 : 1);
}
const path = resolve(target);
if (!existsSync(path)) fail(`${path} does not exist.`);
const found = await findPages();
if (!found.ok) fail(found.reason);
try {
  if (statSync(path).isDirectory()) await fromFolder(path);
  else if (path.toLowerCase().endsWith('.zip')) await fromZip(path);
  else fail('give a pack .zip or a folder that has manuscript/*.docx.');
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}

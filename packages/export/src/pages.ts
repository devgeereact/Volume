// Apple Pages copy of the DOCX manuscript, for final retouching on a Mac (docs/book-production/EXPORT-SPEC.md, Upload pack).
// Shared by `npm run pages` (scripts/pages-convert.mjs) and the server's opt-in pack step (VOLUME_PAGES=1 on macOS).
// Only Node built-ins and JSZip, and only erasable TypeScript, so the plain Node script can import this file directly.
// Pages is driven by osascript: open the DOCX, save it as .pages, close the document without saving. Pages is never
// quit: the owner may already have it open with other documents.

import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

export const PAGES_BUNDLE_ID = 'com.apple.Pages';
export const PAGES_TIMEOUT_MS = 90_000;

/** README line when the pack has a Pages file. */
export const pagesReadmeLine = (fileName: string): string =>
  `Apple Pages: manuscript/${fileName} is the DOCX manuscript as a Pages document, for final retouching on a Mac.`;
/** README line when it has none. */
export const PAGES_README_HINT = 'Using Apple Pages? Open the DOCX in Pages and save it as a Pages document.';

export class PagesUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PagesUnavailableError';
  }
}

// Paths are passed as arguments, never pasted into the script. Pages is told to close the document it opened, not to quit.
export const PAGES_CONVERT_SCRIPT = `on run argv
  set inFile to POSIX file (item 1 of argv)
  set outFile to POSIX file (item 2 of argv)
  with timeout of 85 seconds
    tell application id "${PAGES_BUNDLE_ID}"
      set d to open inFile
      try
        save d in outFile
      on error errText number errNum
        close d saving no
        error errText number errNum
      end try
      close d saving no
    end tell
  end timeout
end run`;

// "path to application id" finds the app without starting it; it fails with -1728 when Pages is not installed.
const findScript = (bundleId: string) => `POSIX path of (path to application id "${bundleId.replace(/[^\w.-]/g, '')}")`;

function osascript(args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('osascript', args, { timeout: timeoutMs, killSignal: 'SIGKILL' }, (err, stdout, stderr) => {
      if (err) {
        const timedOut = (err as { killed?: boolean }).killed === true;
        reject(new Error(timedOut ? `Pages did not finish within ${Math.round(timeoutMs / 1000)} s.` : (stderr.trim() || err.message).replace(/\s+/g, ' ')));
      } else resolve(stdout.trim());
    });
  });
}

/** Where Pages is installed, or a plain reason why it cannot be used here (not a Mac, or Pages missing). */
export async function findPages(opts: { platform?: string; bundleId?: string } = {}): Promise<{ ok: true; appPath: string } | { ok: false; reason: string }> {
  const platform = opts.platform ?? process.platform;
  const bundleId = opts.bundleId ?? PAGES_BUNDLE_ID;
  if (platform !== 'darwin') return { ok: false, reason: `Apple Pages runs only on macOS; this computer is ${platform}.` };
  try {
    return { ok: true, appPath: await osascript(['-e', findScript(bundleId)], 15_000) };
  } catch {
    return { ok: false, reason: `Apple Pages (${bundleId}) is not installed on this Mac.` };
  }
}

/** A .pages file as bytes. Pages may save a package folder; its zipped contents are the single-file form. */
export async function readPagesFile(path: string): Promise<Buffer> {
  if (!statSync(path).isDirectory()) return readFileSync(path);
  const zip = new JSZip();
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else zip.file(relative(path, full).split('\\').join('/'), readFileSync(full));
    }
  };
  walk(path);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/** Convert one DOCX file to a .pages file at `outPath` with Apple Pages. Throws PagesUnavailableError off a Mac or without Pages. */
export async function convertDocxFileToPages(docxPath: string, outPath: string, opts: { timeoutMs?: number } = {}): Promise<void> {
  const found = await findPages();
  if (!found.ok) throw new PagesUnavailableError(found.reason);
  rmSync(outPath, { recursive: true, force: true });
  await osascript(['-e', PAGES_CONVERT_SCRIPT, docxPath, outPath], opts.timeoutMs ?? PAGES_TIMEOUT_MS);
  try {
    statSync(outPath);
  } catch {
    throw new Error(`Pages did not write ${outPath}.`);
  }
}

/** Convert DOCX bytes to .pages bytes through a temporary folder (removed afterwards). */
export async function convertDocxToPages(docx: Buffer, opts: { timeoutMs?: number; name?: string } = {}): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'volume-pages-'));
  try {
    const base = (opts.name ?? 'manuscript').replace(/[^a-z0-9-]+/gi, '-');
    const docxPath = join(dir, `${base}.docx`);
    const outPath = join(dir, `${base}.pages`);
    writeFileSync(docxPath, docx);
    await convertDocxFileToPages(docxPath, outPath, opts);
    return await readPagesFile(outPath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

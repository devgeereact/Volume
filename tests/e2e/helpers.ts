/*
 * Shared helpers for the phase 6, 7 and 8 browser specs (phase6-templates.spec.ts, picture-book.spec.ts and
 * phase8-volume-mode.spec.ts): small response shapes, API reads that assert the status, a section
 * flattener and a tiny zip reader (central directory plus raw inflate), so no package is needed.
 * full-book.spec.ts keeps its own copies on purpose; it is the older spec and stays untouched.
 */
import { inflateRawSync } from "node:zlib";
import { expect, type APIRequestContext } from "@playwright/test";

export const API = "http://127.0.0.1:5311/api/v1";
/** The picture-book server pair (see playwright.config.ts): same app, slow mock AI, its own database. */
export const PICTURE_API = "http://127.0.0.1:5317/api/v1";
export const PICTURE_ORIGIN = "http://127.0.0.1:5318";
export const JOB_WAIT = 60_000;
/** The Origin the server accepts on writes from the test browser. */
export const ORIGIN = "http://127.0.0.1:5312";

export interface Section {
  id: string;
  kind: string;
  enabled: boolean;
  number: number | null;
  status: string;
  wordCount: number;
  currentVersionId: string | null;
}
export interface SectionNode extends Section {
  children: Section[];
}
export interface SectionTree {
  front: Section[];
  body: SectionNode[];
  back: Section[];
  totals: { sections: number; words: number; done: number };
}
export interface Items<T> {
  items: T[];
}
export interface SectionDetail {
  section: Section;
  current: { id: string; version: number; bodyMd: string } | null;
}
export interface ExportRecord {
  id: string;
  kind: string;
  status: string;
  bytes: number | null;
}
export interface PreflightItem {
  id: string;
  severity: string;
  message: string;
}

export async function getJson<T>(request: APIRequestContext, route: string, api: string = API): Promise<T> {
  const res = await request.get(`${api}${route}`);
  expect(res.ok(), `GET ${route} answered ${res.status()}`).toBe(true);
  return (await res.json()) as T;
}

export async function postJson<T>(
  request: APIRequestContext,
  route: string,
  data: unknown,
  expected: number[] = [200, 201, 202],
  target: { api: string; origin: string } = { api: API, origin: ORIGIN },
): Promise<T> {
  const res = await request.post(`${target.api}${route}`, { headers: { Origin: target.origin }, data });
  expect(expected, `POST ${route} answered ${res.status()}: ${await res.text()}`).toContain(res.status());
  return (await res.json()) as T;
}

/** Sections that carry text: every enabled, non-part section in the tree. */
export function leafSections(tree: SectionTree): Section[] {
  const out: Section[] = [...tree.front];
  for (const node of tree.body) {
    if (node.kind === "part") out.push(...node.children);
    else out.push(node);
  }
  out.push(...tree.back);
  return out.filter((s) => s.enabled && s.kind !== "part");
}

export interface ZipEntry {
  name: string;
  size: number;
  read: () => Buffer;
}

export function readZip(buf: Buffer): ZipEntry[] {
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 70_000); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a zip file: no end-of-central-directory record.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error("Bad central directory entry.");
    const method = buf.readUInt16LE(p + 10);
    const compressed = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    entries.push({
      name,
      size,
      read: () => {
        const dataStart = localOffset + 30 + buf.readUInt16LE(localOffset + 26) + buf.readUInt16LE(localOffset + 28);
        const raw = buf.subarray(dataStart, dataStart + compressed);
        if (method === 0) return Buffer.from(raw);
        if (method === 8) return inflateRawSync(raw);
        throw new Error(`Unsupported zip method ${method} for ${name}.`);
      },
    });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Plain paragraphs the mock writer would not add: enough words to pass KDP's 24 page print minimum. */
export function padding(topic: string, paragraphs = 140): string {
  return Array.from(
    { length: paragraphs },
    (_, i) => `This is paragraph ${i + 1} about ${topic}. It keeps to plain British English and moves the book on.`,
  ).join("\n\n");
}

/**
 * Page count and page sizes (in points, 72 to the inch) of a PDF, read with pdfjs-dist, the reader packages/export
 * already uses for its own preflight. The exporter's Chromium compresses its page objects, so a text search will not do.
 */
export async function pdfPages(buf: Buffer): Promise<{ count: number; sizesPt: { widthPt: number; heightPt: number }[] }> {
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(buf), verbosity: 0 });
  const doc = await task.promise;
  try {
    const sizesPt: { widthPt: number; heightPt: number }[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const [x0 = 0, y0 = 0, x1 = 0, y1 = 0] = (await doc.getPage(i)).view;
      sizesPt.push({ widthPt: x1 - x0, heightPt: y1 - y0 });
    }
    return { count: doc.numPages, sizesPt };
  } finally {
    await task.destroy();
  }
}

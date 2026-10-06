/* Shared by run.mjs and playwright.config.ts: where the e2e run keeps its temporary files. */
import os from "node:os";
import path from "node:path";

export const e2eDir = path.join(os.tmpdir(), "volume-e2e");
export const webOutDir = path.join(e2eDir, "web");
export const sqlitePath = path.join(e2eDir, "volume.sqlite");
export const dataDir = path.join(e2eDir, "data");
export const downloadDir = path.join(e2eDir, "downloads");

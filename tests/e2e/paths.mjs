/* Shared by run.mjs and playwright.config.ts: where the e2e run keeps its temporary files. */
import os from "node:os";
import path from "node:path";

export const e2eDir = path.join(os.tmpdir(), "volume-e2e");
export const webOutDir = path.join(e2eDir, "web");
export const sqlitePath = path.join(e2eDir, "volume.sqlite");
export const dataDir = path.join(e2eDir, "data");
export const downloadDir = path.join(e2eDir, "downloads");
/* The full-book server (injected writing failure) keeps its own database and data folder. */
export const failServerSqlitePath = path.join(e2eDir, "volume-fail.sqlite");
export const failServerDataDir = path.join(e2eDir, "data-fail");
/* The picture-book server runs the mock AI slowly enough for a run to be watched, and keeps its own database. */
export const pictureServerSqlitePath = path.join(e2eDir, "volume-picture.sqlite");
export const pictureServerDataDir = path.join(e2eDir, "data-picture");

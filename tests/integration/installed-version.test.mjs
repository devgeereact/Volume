import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { installedVersion } from "../../scripts/installed-version.mjs";

/* The release build pins every dependency to the version that was installed and tested. npm decides where a package
   lives (hoisted to the root, or nested under the workspace that needs it), so the lookup must not assume the root.
   CI failed on golive/2026-11 because docx sat at packages/export/node_modules/docx. */

async function project(layout) {
  const dir = await mkdtemp(join(tmpdir(), "volume-installed-version-"));
  for (const [folder, version] of Object.entries(layout)) {
    await mkdir(join(dir, folder), { recursive: true });
    await writeFile(join(dir, folder, "package.json"), JSON.stringify({ name: "x", version }));
  }
  return dir;
}

test("finds a package hoisted to the root node_modules", async () => {
  const dir = await project({ "node_modules/fastify": "5.1.0" });
  try {
    assert.equal(installedVersion(dir, "apps/server", "fastify"), "5.1.0");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("finds a package npm nested under the workspace that needs it", async () => {
  const dir = await project({ "packages/export/node_modules/docx": "9.8.1" });
  try {
    assert.equal(installedVersion(dir, "packages/export", "docx"), "9.8.1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("prefers the workspace copy, because that is the one its code loads", async () => {
  const dir = await project({ "node_modules/docx": "9.15.0", "packages/export/node_modules/docx": "9.8.1" });
  try {
    assert.equal(installedVersion(dir, "packages/export", "docx"), "9.8.1");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("says which package is missing and how to fix it", async () => {
  const dir = await project({});
  try {
    assert.throws(() => installedVersion(dir, "packages/export", "docx"), /docx is not installed\. Run npm run setup first\./);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// Passenger startup file for Volume on the cPanel host (CloudLinux Node.js selector, Node 24).
// Passenger loads this file with require(), so it is CommonJS; the server itself is an ES module bundle.
// Passenger replaces http.Server#listen, so the server's listen() call lands on Passenger's socket.
// Settings come from Passenger environment variables and the file named by VOLUME_ENV_FILE
// (default: .env in this folder, a link to ~/apps/volume/shared/.env).
"use strict";

const path = require("node:path");
const { pathToFileURL } = require("node:url");

process.env.VOLUME_ROOT = process.env.VOLUME_ROOT || __dirname;
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

// Load the settings file before the server is imported: Playwright reads PLAYWRIGHT_BROWSERS_PATH when its module
// loads, which is earlier than the server's own config step. Values already set (Passenger settings) win.
const envFile = process.env.VOLUME_ENV_FILE ? path.resolve(process.env.VOLUME_ENV_FILE) : path.join(__dirname, ".env");
require("dotenv").config({ path: envFile, quiet: true });

// dotenv does not expand "~". Path settings written as ~/apps/... become absolute here.
const home = require("node:os").homedir();
for (const key of ["DATA_DIR", "PLAYWRIGHT_BROWSERS_PATH", "CHROMIUM_LD_LIBRARY_PATH", "WEB_DIST_DIR", "MYSQL_SOCKET", "MYSQL_SSL_CA"]) {
  const value = process.env[key];
  if (value && value.startsWith("~/")) process.env[key] = path.join(home, value.slice(2));
}

import(pathToFileURL(path.join(__dirname, "server", "index.mjs")).href).catch((err) => {
  process.stderr.write(`Volume could not start: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});

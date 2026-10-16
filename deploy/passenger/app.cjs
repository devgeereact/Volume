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

import(pathToFileURL(path.join(__dirname, "server", "index.mjs")).href).catch((err) => {
  process.stderr.write(`Volume could not start: ${err && err.message ? err.message : String(err)}\n`);
  process.exit(1);
});

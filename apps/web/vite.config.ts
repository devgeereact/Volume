import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Dev server: 127.0.0.1:5180 only. `npm run preview` also uses 5180 (the server owns 5181).
// /api goes to the local Volume server (apps/server, 127.0.0.1:5181). The Host header is left as the
// page's (127.0.0.1:5180), which the server allows as a web origin, so no changeOrigin.
// scripts/screenshot.mjs starts its own preview on 5182 and stops it when done.
// "@config" points at the repository's config/ folder, so the prototype reads the same profiles,
// book types, interior themes and cover styles as the server (src/demo/config.ts).
// VOLUME_API_PORT lets a test run point at its own server (default 5181).
const apiPort = process.env["VOLUME_API_PORT"] ?? "5181";
const apiProxy = { "/api": { target: `http://127.0.0.1:${apiPort}`, changeOrigin: false } };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@config": fileURLToPath(new URL("../../config", import.meta.url)) } },
  server: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: apiProxy },
  preview: { host: "127.0.0.1", port: 5180, strictPort: true, proxy: apiProxy },
  // Heavy screens are imported by the router on demand; keep the shell and library available immediately.
  build: { target: "es2023", sourcemap: false, chunkSizeWarningLimit: 600 },
});

// Starts only Volume's loopback web/API processes. Stop their process groups on shutdown.
import { spawn } from 'node:child_process';
import { doctor } from './doctor.mjs';
import { root } from './runtime.mjs';

const children = [];
let stopping = false;
let forceTimer;
function signalChild(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch {
    // The process group has already exited.
  }
}
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) signalChild(child, 'SIGTERM');
  forceTimer = setTimeout(() => {
    for (const child of children) signalChild(child, 'SIGKILL');
  }, 5000);
  forceTimer.unref();
}
process.on('SIGINT', () => stopAll());
process.on('SIGTERM', () => stopAll());

try {
  const { ports } = await doctor({ ports: true });
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const env = { ...process.env, PORT: String(ports.api), HOST: '127.0.0.1', VOLUME_API_PORT: String(ports.api) };
  // A non-default web port needs its loopback origin allowed by the API, unless the caller set WEB_ORIGINS.
  if (ports.web !== 5180 && !env.WEB_ORIGINS) env.WEB_ORIGINS = `http://127.0.0.1:${ports.web},http://localhost:${ports.web}`;
  const parts = [
    { name: 'server', args: ['run', 'dev', '-w', 'apps/server'] },
    { name: 'web', args: ['run', 'dev', '-w', 'apps/web', '--', '--host', '127.0.0.1', '--port', String(ports.web), '--strictPort'] },
  ];
  for (const { name, args } of parts) {
    if (stopping) break;
    const child = spawn(npm, args, { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' });
    children.push(child);
    const write = (stream) => (chunk) => {
      for (const line of chunk.toString().split('\n')) if (line.trim()) stream.write(`[${name}] ${line}\n`);
    };
    child.stdout.on('data', write(process.stdout));
    child.stderr.on('data', write(process.stderr));
    child.on('error', () => {
      console.error(`[${name}] could not start. Check npm and the project dependencies.`);
      stopAll(1);
    });
    child.on('exit', (code, signal) => {
      if (!stopping) {
        console.error(`[${name}] stopped unexpectedly (${signal ?? code}). Stopping Volume's other process.`);
        stopAll(code || 1);
      }
    });
    child.on('close', () => {
      if (children.every((c) => c.exitCode !== null || c.signalCode !== null)) clearTimeout(forceTimer);
    });
  }
  if (!stopping) console.log(`Volume: http://127.0.0.1:${ports.web} (API 127.0.0.1:${ports.api}). Ctrl+C stops both.`);
} catch (error) {
  console.error(error.message);
  stopAll(1);
}

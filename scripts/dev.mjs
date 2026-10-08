// Starts the Volume server (127.0.0.1:5181) and web app (5180, or VOLUME_WEB_PORT) together.
// Ctrl C stops both. Each process prints with a short prefix so the two logs stay readable.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';

const webPort = Number(process.env.VOLUME_WEB_PORT ?? '5180');
if (!Number.isInteger(webPort) || webPort < 1 || webPort > 65535) {
  process.stderr.write('VOLUME_WEB_PORT must be an integer between 1 and 65535.\n');
  process.exit(1);
}

// Check before spawning the API. Never stop a process that owns the requested port.
const probe = createServer();
try {
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(webPort, '127.0.0.1', resolve);
  });
  await new Promise((resolve, reject) => probe.close((error) => (error ? reject(error) : resolve())));
} catch (error) {
  process.stderr.write(
    `Volume: cannot use 127.0.0.1:${webPort} (${error.code}). Leave the existing process running and choose another port, for example VOLUME_WEB_PORT=5182 npm run dev.\n`,
  );
  process.exit(1);
}

const childEnv = { ...process.env };
if (webPort !== 5180 && !childEnv.WEB_ORIGINS) {
  childEnv.WEB_ORIGINS = `http://127.0.0.1:${webPort},http://localhost:${webPort}`;
}

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const parts = [
  { name: 'server', args: ['run', 'dev', '-w', 'apps/server'] },
  { name: 'web   ', args: ['run', 'dev', '-w', 'apps/web', '--', '--port', String(webPort)] },
];

const children = parts.map(({ name, args }) => {
  const child = spawn(npm, args, { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
  const write = (stream) => (chunk) => {
    for (const line of chunk.toString().split('\n')) if (line.trim()) stream.write(`[${name}] ${line}\n`);
  };
  child.stdout.on('data', write(process.stdout));
  child.stderr.on('data', write(process.stderr));
  child.on('exit', (code) => {
    process.stdout.write(`[${name}] stopped (${code ?? 'signal'})\n`);
    stopAll();
  });
  return child;
});

let stopping = false;
function stopAll() {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null) child.kill('SIGTERM');
}

process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
process.stdout.write(`Volume: open http://127.0.0.1:${webPort} (server on 127.0.0.1:${process.env.PORT ?? '5181'}). Ctrl C stops both.\n`);

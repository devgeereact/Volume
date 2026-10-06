// Starts the Volume server (127.0.0.1:5181) and the web app (127.0.0.1:5180) together.
// Ctrl C stops both. Each process prints with a short prefix so the two logs stay readable.
import { spawn } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const parts = [
  { name: 'server', args: ['run', 'dev', '-w', 'apps/server'] },
  { name: 'web   ', args: ['run', 'dev', '-w', 'apps/web'] },
];

const children = parts.map(({ name, args }) => {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'] });
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
process.stdout.write('Volume: open http://127.0.0.1:5180 (server on 127.0.0.1:5181). Ctrl C stops both.\n');

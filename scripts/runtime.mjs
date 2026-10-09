import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));

export function requireRuntime(version = process.versions.node) {
  if (Number(version.split('.')[0]) < 26) {
    throw new Error('Volume requires Node 26+. Run mise install, then mise exec -- npm run dev.');
  }
}

export function developmentPorts(env = process.env) {
  const port = (name, fallback) => {
    const value = env[name] ?? String(fallback);
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) throw new Error(`${name} must be a valid TCP port.`);
    return Number(value);
  };
  const api = port('PORT', 5181);
  const web = port('VOLUME_WEB_PORT', 5180);
  if (env.VOLUME_API_PORT !== undefined && port('VOLUME_API_PORT', api) !== api) throw new Error('PORT and VOLUME_API_PORT must match.');
  if (api === web) throw new Error('API and web ports must be different.');
  if (env.HOST !== undefined && env.HOST !== '127.0.0.1') throw new Error('Development HOST must be 127.0.0.1.');
  return { api, web };
}

export async function checkPort(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', (error) => reject(new Error(`Cannot use 127.0.0.1:${port} (${error.code}). Stop your conflicting server or choose another port.`)));
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}

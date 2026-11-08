import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * The exact installed version of a dependency (what the tests ran against).
 * npm decides where a package lives: hoisted to the root node_modules, or nested under the workspace that needs it
 * (a version conflict, or a pinned version, can leave it nested). The workspace's own copy is the one its code
 * loads, so it is looked at first, then the root.
 */
export function installedVersion(root, workspace, name) {
  const candidates = [path.join(root, workspace, 'node_modules', name), path.join(root, 'node_modules', name)];
  const folder = candidates.find((dir) => existsSync(path.join(dir, 'package.json')));
  if (!folder) throw new Error(`${name} is not installed. Run npm run setup first.`);
  return JSON.parse(readFileSync(path.join(folder, 'package.json'), 'utf8')).version;
}

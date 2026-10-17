import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parseKdpRules, titleCreationLimit, type KdpRules, type TitleCreationLimit } from '@volume/core';

/** The rule the title scheduler reads (FACTS 5.7). The numbers live only in config/kdp-rules/<date>.json. */
export const TITLE_LIMIT_RULE_ID = 'titles.creationLimit';

const cache = new Map<string, { file: string; rules: KdpRules }>();

/** The newest config/kdp-rules/<date>.json, parsed and cached per file name. */
export async function loadNewestKdpRules(configDir: string): Promise<KdpRules> {
  const dir = join(configDir, 'kdp-rules');
  const files = (await readdir(dir)).filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
  const newest = files[files.length - 1];
  if (!newest) throw new Error(`No KDP rules file in ${dir}.`);
  const hit = cache.get(dir);
  if (hit && hit.file === newest) return hit.rules;
  const rules = parseKdpRules(JSON.parse(await readFile(join(dir, newest), 'utf8')) as unknown);
  cache.set(dir, { file: newest, rules });
  return rules;
}

/** KDP's new-title limit per format and period, from the rules file (D-046). Never typed in. */
export async function loadTitleLimit(configDir: string): Promise<TitleCreationLimit & { ruleId: string; rulesVersion: string }> {
  const rules = await loadNewestKdpRules(configDir);
  return { ...titleCreationLimit(rules), ruleId: TITLE_LIMIT_RULE_ID, rulesVersion: rules.version };
}

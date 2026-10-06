// Prompt loader and renderer for prompts/<folder>/<name>.v<N>.md (format in prompts/README.md).
// The System part becomes the system message and the User part the user message. Anything after
// "# Changes" is ignored and HTML comments are stripped. Missing variables fail the call; a variable
// marked "(may be empty)" on its line, or passed as null or an empty value, is sent as "None".

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { MissingVariableError, PromptError } from './errors.ts';
import type { ChatMessage } from './types.ts';
import { asArray, asNumber, asObject, asString, sha256 } from './util.ts';

export interface PromptMeta {
  id: string;
  version: number;
  stage: string;
  tier: string;
  /** Variable names without braces, as declared in front matter. */
  inputs: string[];
  output: string;
  derivedFrom: string[];
  guardrails: string[];
}

export interface PromptFile {
  meta: PromptMeta;
  system: string;
  user: string;
  /** Variables used in the System and User parts. */
  variables: string[];
  /** Variables marked "(may be empty)" on the line where they appear. */
  optional: string[];
  path: string;
  /** sha256 of the whole file, stored in prompt_runs.prompt_hash. */
  hash: string;
}

export interface RenderedPrompt {
  promptId: string;
  promptVersion: number;
  promptHash: string;
  stage: string;
  tier: string;
  messages: ChatMessage[];
  /** The final string value of every variable used. */
  values: Record<string, string>;
}

export interface RenderOptions {
  /** Variables wrapped in <data> tags because they hold owner text or web content, not instructions. */
  fence?: ReadonlySet<string> | undefined;
}

const VAR_RE = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
const FILE_RE = /^(.+)\.v(\d+)\.md$/;

/** Turn a value into prompt text. Returns undefined when the value is missing. */
export function toPromptValue(v: unknown): string | undefined {
  if (v === undefined) return undefined;
  if (v === null) return 'None';
  if (typeof v === 'string') return v.trim() === '' ? 'None' : v;
  if (typeof v === 'number' || typeof v === 'boolean' || typeof v === 'bigint') return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return 'None';
    if (v.every((x) => typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean')) {
      return v.map((x) => `- ${String(x)}`).join('\n');
    }
    return JSON.stringify(v, null, 2);
  }
  const o = asObject(v);
  if (o && Object.keys(o).length === 0) return 'None';
  return JSON.stringify(v, null, 2);
}

export function parsePromptFile(raw: string, path: string): PromptFile {
  const fm = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(raw);
  if (!fm) throw new PromptError(`${path}: no front matter`);
  let data: unknown;
  try {
    data = parseYaml(fm[1] ?? '');
  } catch (e) {
    throw new PromptError(`${path}: front matter is not valid YAML (${e instanceof Error ? e.message : String(e)})`);
  }
  const o = asObject(data);
  if (!o) throw new PromptError(`${path}: front matter is not an object`);
  const id = asString(o['id']);
  const version = asNumber(o['version']);
  const stage = asString(o['stage']);
  const tier = asString(o['tier']);
  if (!id || version === undefined || !stage || !tier) {
    throw new PromptError(`${path}: front matter needs id, version, stage and tier`);
  }
  const inputs = asArray(o['inputs']).map((x) =>
    String(x)
      .replace(/^\{\{\s*|\s*\}\}$/g, '')
      .trim(),
  );
  const meta: PromptMeta = {
    id,
    version,
    stage,
    tier,
    inputs,
    output: typeof o['output'] === 'string' ? o['output'] : JSON.stringify(o['output'] ?? ''),
    derivedFrom: asArray(o['derived_from']).map(String),
    guardrails: asArray(o['guardrails']).map(String),
  };

  let body = (fm[2] ?? '').replace(/<!--[\s\S]*?-->/g, '');
  const changes = /^# Changes\s*$/m.exec(body);
  if (changes) body = body.slice(0, changes.index);
  const sys = /^# System\s*$/m.exec(body);
  const usr = /^# User\s*$/m.exec(body);
  if (!sys || !usr || usr.index < sys.index) throw new PromptError(`${path}: needs "# System" then "# User" headings`);
  const system = body.slice(sys.index + sys[0].length, usr.index).trim();
  const user = body.slice(usr.index + usr[0].length).trim();

  const variables = new Set<string>();
  const optional = new Set<string>();
  for (const part of [system, user]) {
    for (const line of part.split('\n')) {
      const marked = /\(may be empty/i.test(line);
      for (const m of line.matchAll(VAR_RE)) {
        const name = m[1] ?? '';
        variables.add(name);
        if (marked) optional.add(name);
      }
    }
  }
  return { meta, system, user, variables: [...variables], optional: [...optional], path, hash: sha256(raw) };
}

export function renderTemplate(
  template: string,
  values: Record<string, unknown>,
  ctx: { promptId: string; optional: ReadonlySet<string>; fence?: ReadonlySet<string> | undefined },
  used: Record<string, string> = {},
): string {
  const missing = new Set<string>();
  const out = template.replace(VAR_RE, (_all, name: string) => {
    let v = toPromptValue(values[name]);
    if (v === undefined) {
      if (ctx.optional.has(name)) v = 'None';
      else {
        missing.add(name);
        return '';
      }
    }
    used[name] = v;
    if (ctx.fence?.has(name) && v !== 'None') return `<data label="${name}">\n${v}\n</data>`;
    return v;
  });
  if (missing.size > 0) throw new MissingVariableError(ctx.promptId, [...missing]);
  return out;
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if (FILE_RE.test(name)) out.push(p);
  }
  return out;
}

export class PromptLoader {
  readonly promptsDir: string;
  private byId = new Map<string, Map<number, PromptFile>>();

  constructor(promptsDir: string) {
    this.promptsDir = promptsDir;
    this.reload();
  }

  /** Re-read every prompt file from disk. */
  reload(): void {
    this.byId.clear();
    for (const path of walk(this.promptsDir)) {
      const file = basename(path);
      const folder = basename(dirname(path));
      const m = FILE_RE.exec(file);
      if (!m) continue;
      const parsed = parsePromptFile(readFileSync(path, 'utf8'), path);
      const expectedId = `${folder}.${m[1]}`;
      if (parsed.meta.id !== expectedId) throw new PromptError(`${path}: id is ${parsed.meta.id}, expected ${expectedId}`);
      if (parsed.meta.version !== Number(m[2])) {
        throw new PromptError(`${path}: version ${parsed.meta.version} does not match the file name`);
      }
      const versions = this.byId.get(parsed.meta.id) ?? new Map<number, PromptFile>();
      versions.set(parsed.meta.version, parsed);
      this.byId.set(parsed.meta.id, versions);
    }
  }

  ids(): string[] {
    return [...this.byId.keys()].sort();
  }

  versions(id: string): number[] {
    return [...(this.byId.get(id)?.keys() ?? [])].sort((a, b) => a - b);
  }

  /** The highest version, unless a version is pinned. */
  load(id: string, version?: number): PromptFile {
    const versions = this.byId.get(id);
    if (!versions) throw new PromptError(`Prompt ${id} not found in ${this.promptsDir}`);
    const v = version ?? Math.max(...versions.keys());
    const file = versions.get(v);
    if (!file) throw new PromptError(`Prompt ${id} has no version ${v} (have ${this.versions(id).join(', ')})`);
    return file;
  }

  /** Latest version of every prompt. */
  latest(): PromptFile[] {
    return this.ids().map((id) => this.load(id));
  }

  render(id: string, values: Record<string, unknown>, opts: RenderOptions & { version?: number | undefined } = {}): RenderedPrompt {
    const file = this.load(id, opts.version);
    const optional = new Set(file.optional);
    const used: Record<string, string> = {};
    const missing: string[] = [];
    const render = (t: string): string => {
      try {
        return renderTemplate(t, values, { promptId: id, optional, fence: opts.fence }, used);
      } catch (e) {
        if (e instanceof MissingVariableError) {
          missing.push(...e.variables);
          return '';
        }
        throw e;
      }
    };
    const system = render(file.system);
    const user = render(file.user);
    if (missing.length > 0) throw new MissingVariableError(id, [...new Set(missing)]);
    return {
      promptId: id,
      promptVersion: file.meta.version,
      promptHash: file.hash,
      stage: file.meta.stage,
      tier: file.meta.tier,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      values: used,
    };
  }
}

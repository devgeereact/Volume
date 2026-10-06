#!/usr/bin/env bash
# Volume PreToolUse hook: block any tool call that touches .env files or data/.
# Wired in .claude/settings.json for Read|Edit|Write|MultiEdit|NotebookEdit|Bash|Grep|Glob.
#
# Blocks (exit 2, reason on stderr, which Claude Code shows to Claude):
#   - .env and .env.<anything> inside the project, except .env.example
#   - <project>/data and everything under it
# Allows everything else. On its own errors it fails open (exit 0) and warns the user
# through a JSON systemMessage, because stderr on exit 0 only reaches the debug log.
#
# AGENTS.md rule 4: never read, print, copy or commit .env or anything in data/.

HOOK_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." 2>/dev/null && pwd)}"
INPUT=$(cat 2>/dev/null)

warn_open() {
  # Fail open with a visible warning. Keep the message free of quotes and backslashes.
  printf '{"systemMessage":"Volume protect-secrets hook could not check this call (%s). Allowed it. Fix the hook: bash .claude/hooks/test-hooks.sh"}\n' "$1"
  exit 0
}

[ -n "$INPUT" ] || warn_open "empty hook input"

if ! command -v node >/dev/null 2>&1; then
  # Crude fallback without Node: look for the names in the raw JSON.
  CLEAN=$(printf '%s' "$INPUT" | sed 's/\.env\.example//g')
  if printf '%s' "$CLEAN" | grep -Eq '(^|[^A-Za-z0-9_])\.env([^A-Za-z0-9_]|$)|(^|[" /=])(\./)?data/'; then
    echo "Blocked by the Volume protect-secrets hook (fallback mode, Node not found): this call seems to touch .env or data/. AGENTS.md rule 4 forbids reading, printing, copying or committing them." >&2
    exit 2
  fi
  warn_open "node not found, used a crude fallback"
fi

JS=$(cat <<'EOF'
const fs = require('fs');
const path = require('path');
let raw = '';
try { raw = fs.readFileSync(0, 'utf8'); } catch (e) { console.error('cannot read stdin'); process.exit(3); }
let data;
try { data = JSON.parse(raw); } catch (e) { console.error('hook input is not JSON'); process.exit(3); }

const HOME = process.env.HOME || '';
function real(p) {
  // realpath of the nearest existing ancestor, so missing files still resolve through symlinks
  const rest = [];
  let dir = p;
  for (;;) {
    try { return path.join(fs.realpathSync(dir), ...rest); } catch (e) {}
    const parent = path.dirname(dir);
    if (parent === dir) return p;
    rest.unshift(path.basename(dir));
    dir = parent;
  }
}
const ROOT_RAW = path.resolve(process.env.VOLUME_ROOT || data.cwd || '.');
const ROOT = real(ROOT_RAW);
const CWD = data.cwd ? path.resolve(data.cwd) : ROOT_RAW;
const tool = String(data.tool_name || '');
const ti = (data.tool_input && typeof data.tool_input === 'object') ? data.tool_input : {};

const isSecretEnvName = (b) => b === '.env' || (b.startsWith('.env.') && b !== '.env.example');
const expandHome = (p) => (p === '~' ? HOME : p.startsWith('~/') ? path.join(HOME, p.slice(2)) : p);

function classify(p, base) {
  if (typeof p !== 'string' || !p.trim()) return null;
  const abs = real(path.resolve(base || CWD, expandHome(p.trim())));
  const rel = path.relative(ROOT, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null; // outside the project
  const parts = rel.split(path.sep);
  if (parts[0] === 'data') return 'data';
  if (isSecretEnvName(path.basename(abs))) return 'env';
  return null;
}

// Glob patterns: check the fixed prefix for data/, and a dot-leading last segment for .env names.
function globToRe(g) {
  let s = '';
  for (const ch of g) {
    if (ch === '*') s += '[^/]*';
    else if (ch === '?') s += '[^/]';
    else s += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + s + '$');
}
function classifyGlob(g, base) {
  if (typeof g !== 'string' || !g.trim()) return null;
  g = expandHome(g.trim());
  const full = path.isAbsolute(g) ? g : path.join(base || CWD, g);
  const firstMeta = full.search(/[*?[{]/);
  const fixed = firstMeta === -1 ? full : full.slice(0, firstMeta);
  const fixedDir = firstMeta === -1 ? full : path.dirname(fixed + 'x');
  const byPrefix = classify(fixedDir, '/');
  if (byPrefix) return byPrefix;
  const lastSeg = full.split('/').pop() || '';
  const relDir = path.relative(ROOT, real(fixedDir));
  const inProject = !relDir.startsWith('..') && !path.isAbsolute(relDir);
  if (inProject && lastSeg.startsWith('.')) {
    let re;
    try { re = globToRe(lastSeg); } catch (e) { return null; }
    if (re.test('.env') || re.test('.env.local') || re.test('.env.production')) return 'env';
  }
  return null;
}

// Bash: look for .env names and data/ paths as tokens, not as parts of words.
function classifyBash(cmd) {
  if (typeof cmd !== 'string' || !cmd) return null;
  cmd = cmd.replace(/\/{2,}/g, '/'); // a//b is the same path as a/b
  const D = String.raw`\s'"\x60=:<>(|;&,`;
  const envRe = new RegExp(String.raw`(^|[${D}/])\.env((?:\.[A-Za-z0-9_-]+)*)(?=$|[${D})*?\[\]{}])`, 'g');
  let m;
  while ((m = envRe.exec(cmd)) !== null) {
    const suffix = m[2] || '';
    const next = cmd[m.index + m[0].length] || '';
    if (suffix === '.example' && next !== '*' && next !== '?') continue;
    return 'env';
  }
  // relative data/ at the start of a token: data/x, ./data/x, ./data
  if (new RegExp(String.raw`(^|[${D}])(\./)?data/`).test(cmd)) return 'data';
  if (new RegExp(String.raw`(^|[${D}])\./data(?=$|[${D})])`).test(cmd)) return 'data';
  // absolute or variable forms of <root>/data
  const roots = new Set([ROOT_RAW, ROOT, '$CLAUDE_PROJECT_DIR', '${CLAUDE_PROJECT_DIR}']);
  for (const r of [ROOT_RAW, ROOT]) {
    if (HOME && r.startsWith(HOME + '/')) {
      const tail = r.slice(HOME.length);
      roots.add('~' + tail); roots.add('$HOME' + tail); roots.add('${HOME}' + tail);
    }
  }
  for (const r of roots) {
    const esc = r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(esc + String.raw`/data(?=$|[/${D})])`).test(cmd)) return 'data';
  }
  // bare "data" as an argument to a file command, run from the project root
  const FILE_CMDS = new Set(['cd', 'pushd', 'ls', 'cat', 'head', 'tail', 'less', 'more', 'find', 'tar', 'zip', 'unzip', 'cp', 'mv', 'rm', 'rsync', 'du', 'sqlite3', 'open', 'stat', 'file', 'tree', 'grep', 'egrep', 'rg', 'ag', 'chmod', 'chown', 'ln', 'scp', 'xxd', 'strings', 'od', 'base64', 'git', 'diff']);
  const cwdIsRoot = path.relative(ROOT, real(CWD)) === '';
  if (cwdIsRoot) {
    for (const seg of cmd.split(/[;&|\n()]+/)) {
      const words = seg.trim().split(/\s+/).filter(Boolean);
      while (words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[0])) words.shift();
      while (words.length && ['sudo', 'command', 'time', 'nice', 'nohup', 'env'].includes(words[0])) words.shift();
      if (!words.length || !FILE_CMDS.has(words[0])) continue;
      let args = words.slice(1);
      if (['grep', 'egrep', 'rg', 'ag'].includes(words[0])) {
        const hasE = args.some((a) => a === '-e' || a === '--regexp' || a.startsWith('--regexp='));
        if (!hasE) { const i = args.findIndex((a) => !a.startsWith('-')); if (i !== -1) args.splice(i, 1); }
      }
      if (args.some((a) => a === 'data' || a === 'data/' || a === './data')) return 'data';
    }
  }
  return null;
}

const hits = [];
const pathKeys = ['file_path', 'notebook_path', 'path'];
for (const k of pathKeys) if (typeof ti[k] === 'string') { const c = classify(ti[k]); if (c) hits.push([c, ti[k]]); }
for (const k of ['file_paths', 'paths']) if (Array.isArray(ti[k])) for (const p of ti[k]) { const c = classify(p); if (c) hits.push([c, p]); }
if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.file_path === 'string') { const c = classify(e.file_path); if (c) hits.push([c, e.file_path]); }
const searchBase = typeof ti.path === 'string' && ti.path ? path.resolve(CWD, expandHome(ti.path)) : CWD;
if (tool === 'Glob' && typeof ti.pattern === 'string') { const c = classifyGlob(ti.pattern, searchBase); if (c) hits.push([c, ti.pattern]); }
if (typeof ti.glob === 'string') { const c = classifyGlob(ti.glob, searchBase); if (c) hits.push([c, ti.glob]); }
if (typeof ti.command === 'string') { const c = classifyBash(ti.command); if (c) hits.push([c, 'the shell command']); }

if (hits.length) {
  const [kind, what] = hits[0];
  const target = kind === 'env' ? 'a .env file (secrets)' : 'the data/ folder (private user data and the database)';
  console.error(
    `Blocked by the Volume protect-secrets hook: ${tool || 'this tool'} touches ${target} via ${what}. ` +
    'AGENTS.md rule 4: never read, print, copy or commit .env or anything in data/. ' +
    'Use .env.example for key names and test fixtures under tests/ for sample data. ' +
    'If the owner needs something from these files, ask them to do it by hand.'
  );
  process.exit(2);
}
process.exit(0);
EOF
)

printf '%s' "$INPUT" | VOLUME_ROOT="$ROOT" node -e "$JS"
STATUS=$?
case "$STATUS" in
  0) exit 0 ;;
  2) exit 2 ;;
  *) warn_open "internal error, status $STATUS" ;;
esac

#!/usr/bin/env bash
# Volume PostToolUse hook: warn (never block) about em dashes and banned phrases
# in files just written or edited under:
#   prompts/, docs/ (not docs/source-drafts/), config/book-templates/, apps/web/
# The tool has already run. Findings go back to Claude as additionalContext (a system
# reminder next to the tool result) and a short systemMessage for the user, with exit 0.
# The checks come from .claude/skills/volume-house-style/scripts/check-style.mjs, which
# reads config/house-style.json at run time. Fails open with a visible message.

HOOK_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." 2>/dev/null && pwd)}"
CHECKER="$ROOT/.claude/skills/volume-house-style/scripts/check-style.mjs"
INPUT=$(cat 2>/dev/null)

warn_open() {
  printf '{"systemMessage":"Volume house-style hook skipped a check (%s)."}\n' "$1"
  exit 0
}

[ -n "$INPUT" ] || exit 0
command -v node >/dev/null 2>&1 || warn_open "node not found"
[ -f "$CHECKER" ] || warn_open "checker script missing"

JS=$(cat <<'EOF'
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
let data;
try { data = JSON.parse(fs.readFileSync(0, 'utf8')); } catch (e) { console.error('hook input is not JSON'); process.exit(3); }
const ROOT = path.resolve(process.env.VOLUME_ROOT);
const realRoot = (() => { try { return fs.realpathSync(ROOT); } catch (e) { return ROOT; } })();
const ti = (data.tool_input && typeof data.tool_input === 'object') ? data.tool_input : {};
const cwd = data.cwd ? path.resolve(data.cwd) : ROOT;
const paths = [];
if (typeof ti.file_path === 'string') paths.push(ti.file_path);
if (Array.isArray(ti.file_paths)) for (const p of ti.file_paths) if (typeof p === 'string') paths.push(p);
if (Array.isArray(ti.edits)) for (const e of ti.edits) if (e && typeof e.file_path === 'string') paths.push(e.file_path);

const IN_SCOPE = [/^prompts\//, /^docs\//, /^config\/book-templates\//, /^apps\/web\//];
const TEXT = /\.(md|mdx|txt|json|ya?ml|html|tsx?|jsx?|mjs)$/i;
const targets = [];
for (const p of [...new Set(paths)]) {
  let abs = path.resolve(cwd, p);
  try { abs = fs.realpathSync(abs); } catch (e) {}
  let rel = path.relative(realRoot, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) rel = path.relative(ROOT, path.resolve(cwd, p));
  if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
  rel = rel.split(path.sep).join('/');
  if (rel.startsWith('docs/source-drafts/')) continue;
  if (/(^|\/)(node_modules|dist|build)\//.test(rel)) continue;
  if (!IN_SCOPE.some((re) => re.test(rel)) || !TEXT.test(rel)) continue;
  if (!fs.existsSync(abs)) continue;
  targets.push({ abs, rel });
}
if (!targets.length) process.exit(0);

let report;
try {
  const out = execFileSync(process.execPath, [process.env.CHECKER, '--json', '--rules=emdash,banned,agents', `--root=${ROOT}`, ...targets.map((t) => t.abs)], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  report = JSON.parse(out);
} catch (e) {
  // exit 1 (findings) and 2 (config missing) still print JSON on stdout
  try { report = JSON.parse(e.stdout); } catch (e2) { console.error('checker failed: ' + (e.message || e)); process.exit(3); }
}
const findings = report.findings || [];
const relOf = (f) => { const t = targets.find((x) => path.resolve(x.abs) === path.resolve(process.cwd(), f.file) || x.abs.endsWith(f.file)); return t ? t.rel : f.file; };
const notes = [];
if (report.configMissing) notes.push('config/house-style.json is missing, so only em dashes and the AGENTS.md avoid list were checked.');
if (!findings.length) {
  if (notes.length) process.stdout.write(JSON.stringify({ systemMessage: 'House style: ' + notes.join(' ') }) + '\n');
  process.exit(0);
}
const MAX = 15;
const lines = findings.slice(0, MAX).map((f) => `- ${relOf(f)}:${f.line}:${f.col} ${f.rule}: ${f.message}`);
if (findings.length > MAX) lines.push(`- ... and ${findings.length - MAX} more. Run: node .claude/skills/volume-house-style/scripts/check-style.mjs <file>`);
const files = [...new Set(findings.map(relOf))].join(', ');
const context = [
  `House style warnings (not blocking) in ${files}:`,
  ...lines,
  'Fix these unless the text quotes the rule on purpose. For deliberate lists, wrap them in house-style:off / house-style:on comments or add "house-style: ignore" to the line.',
  ...notes,
].join('\n');
process.stdout.write(JSON.stringify({
  systemMessage: `House style: ${findings.length} warning(s) in ${files}.`,
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context },
}) + '\n');
process.exit(0);
EOF
)

OUT=$(printf '%s' "$INPUT" | VOLUME_ROOT="$ROOT" CHECKER="$CHECKER" node -e "$JS")
STATUS=$?
if [ "$STATUS" -ne 0 ]; then
  warn_open "internal error, status $STATUS"
fi
[ -n "$OUT" ] && printf '%s\n' "$OUT"
exit 0

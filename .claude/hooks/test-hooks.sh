#!/usr/bin/env bash
# Tests for the Volume Claude Code hooks and the house-style checker.
# Run: npm run hooks:test   (or: bash .claude/hooks/test-hooks.sh)
#
# Builds a throwaway sandbox project under a temp folder (copies of the hooks and the
# checker, a fixture house-style.json, sample files), feeds sample hook JSON on stdin
# and asserts exit codes and messages. It never reads the real .env or data/.

set -u
HOOK_DIR=$(cd "$(dirname "$0")" && pwd)
REAL_ROOT=$(cd "$HOOK_DIR/../.." && pwd)
CHECKER_SRC="$REAL_ROOT/.claude/skills/volume-house-style/scripts/check-style.mjs"

PASS=0
FAIL=0
FAILED_NAMES=""
EMDASH=$(printf '\342\200\224')

SANDBOX=$(mktemp -d "${TMPDIR:-/tmp}/volume-hooks-test.XXXXXX") || { echo "BLOCKED: cannot create temp dir"; exit 1; }
trap 'rm -rf "$SANDBOX"' EXIT
SB="$SANDBOX/project"
mkdir -p "$SB/.claude/hooks" "$SB/.claude/skills/volume-house-style/scripts" "$SB/.agent" \
  "$SB/prompts/writing" "$SB/docs/source-drafts" "$SB/config/book-templates" "$SB/apps/web/src" \
  "$SB/packages/core" "$SB/data" "$SANDBOX/tmp"
cp "$HOOK_DIR"/*.sh "$SB/.claude/hooks/"
cp "$CHECKER_SRC" "$SB/.claude/skills/volume-house-style/scripts/"
echo "# AGENTS" > "$SB/AGENTS.md"
printf '# Current task\n\n**Phase:** 0 test\n**Next step:** test the hooks\n' > "$SB/.agent/CURRENT-TASK.md"
printf '# Handoff log\n' > "$SB/.agent/HANDOFF.md"
cat > "$SB/config/house-style.json" <<'JSON'
{
  "bannedPhrases": ["delve", "in today's fast-paced world", "game-changer"],
  "bannedPhraseMatching": { "caseInsensitive": true, "inflections": ["s", "es", "ed", "ing", "d"] },
  "usToUkSpelling": { "color": "colour", "organize": "organise", "program": "programme" },
  "spellingExceptions": { "program": "computer program is correct in British English" },
  "ukPhrasing": { "gotten": "got" },
  "emDash": { "allowed": false, "replacement": ", " },
  "enDash": { "allowedAsDash": false, "allowedInNumberRanges": false, "replacement": " to " },
  "titleCase": { "style": "title", "mode": "capitalise-every-word", "minorWords": ["a", "of"], "minorWordsMode": "off by default" },
  "guardrailPatterns": [
    { "id": "no-isbn", "pattern": "ISBN[ -]?(97[89])?[0-9-]{9,}", "flags": "i", "message": "never invent ISBNs", "action": "block" }
  ]
}
JSON

export CLAUDE_PROJECT_DIR="$SB"
export TMPDIR="$SANDBOX/tmp"

OUT=""; ERR=""; CODE=0
run() { # run <script> <json>
  OUT=$(printf '%s' "$2" | bash "$SB/.claude/hooks/$1" 2>"$SANDBOX/stderr")
  CODE=$?
  ERR=$(cat "$SANDBOX/stderr")
}
ok() { PASS=$((PASS + 1)); printf 'PASS  %s\n' "$1"; }
bad() { FAIL=$((FAIL + 1)); FAILED_NAMES="$FAILED_NAMES\n  - $1"; printf 'FAIL  %s\n      code=%s\n      stdout=%s\n      stderr=%s\n' "$1" "$CODE" "$OUT" "$ERR"; }
expect() { # expect <name> <code> [stdout-substring|-] [stderr-substring|-]
  local name=$1 want=$2 so=${3:--} se=${4:--}
  [ "$CODE" = "$want" ] || { bad "$name (want exit $want)"; return; }
  if [ "$so" = "EMPTY" ]; then [ -z "$OUT" ] || { bad "$name (want empty stdout)"; return; }
  elif [ "$so" != "-" ]; then case "$OUT" in *"$so"*) ;; *) bad "$name (stdout lacks: $so)"; return ;; esac; fi
  if [ "$se" != "-" ]; then case "$ERR" in *"$se"*) ;; *) bad "$name (stderr lacks: $se)"; return ;; esac; fi
  ok "$name"
}
pre() { # pre <tool> <tool_input-json>; @SB@ in the JSON becomes the sandbox path
  local ti
  ti=$(printf '%s' "$2" | sed "s#@SB@#$SB#g")
  printf '{"session_id":"t1","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"%s","tool_input":%s}' "$SB" "$1" "$ti"
}
# Build payloads inside a function: bash 3.2 (macOS) brace-expands JSON inside "$(...)".
run_pre() { local payload; payload=$(pre "$1" "$2"); run protect-secrets.sh "$payload"; }
bash_in() { node -e 'process.stdout.write(JSON.stringify({command: process.argv[1]}))' "$1"; }

echo "== protect-secrets.sh (PreToolUse) =="
run_pre Read '{"file_path":"@SB@/.env"}';                 expect "Read .env is blocked" 2 - "Blocked by the Volume protect-secrets hook"
run_pre Read '{"file_path":"@SB@/.env.example"}';         expect "Read .env.example is allowed" 0 EMPTY
run_pre Read '{"file_path":"@SB@/apps/server/.env.local"}'; expect "Read apps/server/.env.local is blocked" 2 - ".env"
run_pre Read '{"file_path":"@SB@/data/volume.db"}';        expect "Read data/volume.db is blocked" 2 - "data/"
run_pre Read '{"file_path":"@SB@/AGENTS.md"}';             expect "Read AGENTS.md is allowed" 0 EMPTY
run_pre Read '{"file_path":"@SB@/apps/web/src/environment.ts"}'; expect "Read environment.ts is allowed" 0 EMPTY
run_pre Read '{"file_path":"@SB@/tests/golden/data/sample.md"}'; expect "Read tests/golden/data/ is allowed" 0 EMPTY
run_pre Read '{"file_path":"/etc/hosts"}';                 expect "Read outside the project is allowed" 0 EMPTY
run_pre Read '{"file_path":".env"}';                       expect "Read relative .env is blocked" 2
run_pre Write '{"file_path":"@SB@/.env","content":"X=1"}'; expect "Write .env is blocked" 2
run_pre Write '{"file_path":"@SB@/.env.example","content":"OPENROUTER_API_KEY="}'; expect "Write .env.example is allowed" 0 EMPTY
run_pre Edit '{"file_path":"@SB@/data/projects/a.md","old_string":"a","new_string":"b"}'; expect "Edit under data/ is blocked" 2
run_pre MultiEdit '{"file_paths":["@SB@/README.md","@SB@/.env"]}'; expect "MultiEdit list with .env is blocked" 2
run_pre Grep '{"pattern":"KEY","path":"@SB@/data"}';    expect "Grep in data/ is blocked" 2
run_pre Grep '{"pattern":"KEY","glob":".env*"}';        expect "Grep with glob .env* is blocked" 2
run_pre Grep '{"pattern":"env","path":"@SB@"}';          expect "Grep for the word env is allowed" 0 EMPTY
run_pre Glob '{"pattern":"data/**"}';                       expect "Glob data/** is blocked" 2
run_pre Glob '{"pattern":"**/.env"}';                       expect "Glob **/.env is blocked" 2
run_pre Glob '{"pattern":"**/*.ts"}';                       expect "Glob **/*.ts is allowed" 0 EMPTY
run_pre Glob '{"pattern":"**/.env.example"}';               expect "Glob **/.env.example is allowed" 0 EMPTY

blocked_cmds=(
  "cat .env"
  "cat ./.env"
  "source .env && npm run dev"
  "cp .env.example .env"
  "cat .env*"
  "grep KEY apps/server/.env"
  "node --env-file=.env apps/server/index.js"
  "ls data/"
  "sqlite3 ./data/volume.db .tables"
  "ls -la data"
  "cd data && ls"
  "grep -r token data"
  "cat \$CLAUDE_PROJECT_DIR/data/x.json"
  "cat $SB/data/x.json"
  "git add .env"
)
for c in "${blocked_cmds[@]}"; do
  run_pre Bash "$(bash_in "$c")"; expect "Bash blocked: $c" 2 - "Blocked"
done
allowed_cmds=(
  "cat .env.example"
  "npm run typecheck"
  "echo \$NODE_ENV"
  "grep -rn environment apps/web/src"
  "node -e 'console.log(process.env.HOME)'"
  "cat .envrc"
  "grep -r data src"
  "cat tests/golden/data/sample.md"
  "ls packages/core/data"
  "npx dotenv-cli --help"
  "git status --short"
)
for c in "${allowed_cmds[@]}"; do
  run_pre Bash "$(bash_in "$c")"; expect "Bash allowed: $c" 0 EMPTY
done
run protect-secrets.sh "this is not json";  expect "Bad input fails open with a visible message" 0 "systemMessage"

echo "== house-style-warn.sh (PostToolUse) =="
post() { printf '{"session_id":"t1","cwd":"%s","hook_event_name":"PostToolUse","tool_name":"%s","tool_input":{"file_path":"%s"},"tool_response":{}}' "$SB" "$1" "$2"; }
printf 'Write the chapter.\nThe garden%sa quiet place.\n' "$EMDASH" > "$SB/prompts/writing/chapter.v1.md"
run house-style-warn.sh "$(post Write "$SB/prompts/writing/chapter.v1.md")"; expect "Em dash in prompts/ is warned" 0 "additionalContext" ; case "$OUT" in *chapter.v1.md:2*emdash*) ok "Warning names file and line 2";; *) bad "Warning names file and line 2";; esac
printf 'Draft%swith em dash.\n' "$EMDASH" > "$SB/docs/source-drafts/BOOK.md"
run house-style-warn.sh "$(post Write "$SB/docs/source-drafts/BOOK.md")";  expect "docs/source-drafts/ is skipped" 0 EMPTY
printf '# Clean\n\nPlain British English, no problems here.\n' > "$SB/docs/01-PRD.md"
run house-style-warn.sh "$(post Edit "$SB/docs/01-PRD.md")";               expect "Clean doc gives no output" 0 EMPTY
printf 'export const t = "A seamless start";\n' > "$SB/apps/web/src/copy.ts"
run house-style-warn.sh "$(post Edit "$SB/apps/web/src/copy.ts")";          expect "AGENTS.md avoid word in apps/web is warned" 0 "seamless"
printf '{ "intro": "Let us delve into herbs" }\n' > "$SB/config/book-templates/nonfiction.json"
run house-style-warn.sh "$(post Write "$SB/config/book-templates/nonfiction.json")"; expect "Banned phrase in book-templates is warned" 0 "banned phrase"
printf 'Never write these:\n<!-- house-style:off -->\n- delve\n- game-changer\n<!-- house-style:on -->\nDone.\n' > "$SB/prompts/writing/rules.v1.md"
run house-style-warn.sh "$(post Write "$SB/prompts/writing/rules.v1.md")"; expect "house-style:off block is not warned" 0 EMPTY
printf 'Note%shere.\n' "$EMDASH" > "$SB/packages/core/NOTES.md"
run house-style-warn.sh "$(post Write "$SB/packages/core/NOTES.md")";      expect "Files outside the warned folders are ignored" 0 EMPTY
run house-style-warn.sh "$(post Read "$SB/prompts/writing/chapter.v1.md")" ; expect "Hook never blocks (exit 0)" 0

echo "== check-style.mjs (skill script) =="
CS="$SB/.claude/skills/volume-house-style/scripts/check-style.mjs"
OUT=$(node "$CS" "$SB/prompts/writing/chapter.v1.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Checker exits 1 with line numbers on findings" 1 "chapter.v1.md:2:"
printf '# The Windowsill Herb Garden\n\nWe organize the color chart. The program was gotten from the ISBN 978-1-23456-789-0 list. Pages 10\342\200\22320.\n' > "$SB/docs/sample-book.md"
OUT=$(node "$CS" "$SB/docs/sample-book.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Spelling map is applied" 1 'US spelling "organize"'
expect "Spelling exception is info only" 1 "context dependent"
expect "UK phrasing map is applied" 1 'US phrasing "gotten"'
expect "Guardrail pattern is applied" 1 "[no-isbn]"
expect "En dash rule from config is applied" 1 "en dash"
printf '# The windowsill herb garden\n' > "$SB/docs/heading.md"
OUT=$(node "$CS" --rules=titlecase "$SB/docs/heading.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Title case check flags lower-case words" 1 "title case"
OUT=$(node "$CS" "$SB/docs/source-drafts/BOOK.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Checker skips docs/source-drafts/" 0 "skipped"
OUT=$(node "$CS" "$SB/docs/01-PRD.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Checker exits 0 on a clean file" 0 "0 finding(s)"
mv "$SB/config/house-style.json" "$SB/config/house-style.json.off"
OUT=$(node "$CS" "$SB/docs/01-PRD.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Missing config prints a clear message and exits 2" 2 - "config/house-style.json not found"
OUT=$(node "$CS" "$SB/prompts/writing/chapter.v1.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
expect "Missing config still catches em dashes" 1 "emdash" "not found"
run house-style-warn.sh "$(post Write "$SB/prompts/writing/chapter.v1.md")"; expect "Hook with missing config still warns and says so" 0 "is missing"
mv "$SB/config/house-style.json.off" "$SB/config/house-style.json"
if [ -f "$REAL_ROOT/config/house-style.json" ]; then
  OUT=$(node "$CHECKER_SRC" --json --root="$REAL_ROOT" "$SB/docs/01-PRD.md" 2>"$SANDBOX/stderr"); CODE=$?; ERR=$(cat "$SANDBOX/stderr")
  case "$OUT" in *'"configMissing": false'*) [ "$CODE" -le 1 ] && ok "Real config/house-style.json loads" || bad "Real config/house-style.json loads";; *) bad "Real config/house-style.json loads";; esac
else
  echo "NOT TESTED  real config/house-style.json (not written yet)"
fi

echo "== session-start.sh (SessionStart) =="
run session-start.sh '{"session_id":"sess-1","hook_event_name":"SessionStart","source":"startup"}'
expect "Session start prints reminder and CURRENT-TASK" 0 "Next step:** test the hooks"
[ -f "$TMPDIR/volume-claude/session-sess-1.start" ] && ok "Session start marker written" || bad "Session start marker written"

echo "== stop-handoff-reminder.sh (Stop) =="
MARK="$TMPDIR/volume-claude/session-sess-1.start"
touch -t 202001010000 "$MARK"
touch -t 201901010000 "$SB/.agent/HANDOFF.md"
run stop-handoff-reminder.sh '{"session_id":"sess-1","hook_event_name":"Stop","stop_hook_active":true}'
expect "stop_hook_active true gives no output" 0 EMPTY
run stop-handoff-reminder.sh '{"session_id":"sess-1","hook_event_name":"Stop","stop_hook_active":false}'
expect "Changed files without HANDOFF update give a reminder" 0 "HANDOFF.md was not updated"
run stop-handoff-reminder.sh '{"session_id":"sess-1","hook_event_name":"Stop","stop_hook_active":false}'
expect "Reminder is shown only once per session" 0 EMPTY
run session-start.sh '{"session_id":"sess-2","source":"startup"}'
touch -t 202001010000 "$TMPDIR/volume-claude/session-sess-2.start"
touch "$SB/.agent/HANDOFF.md"
run stop-handoff-reminder.sh '{"session_id":"sess-2","hook_event_name":"Stop","stop_hook_active":false}'
expect "Updated HANDOFF.md gives no reminder" 0 EMPTY
run session-start.sh '{"session_id":"sess-3","source":"startup"}'
touch -t 203001010000 "$TMPDIR/volume-claude/session-sess-3.start"
run stop-handoff-reminder.sh '{"session_id":"sess-3","hook_event_name":"Stop","stop_hook_active":false}'
expect "No changed files gives no reminder" 0 EMPTY
run stop-handoff-reminder.sh 'garbage'
expect "Bad input fails open silently" 0 EMPTY

echo "== settings.json =="
if node -e 'const s=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); for (const e of ["PreToolUse","PostToolUse","SessionStart","Stop"]) if (!s.hooks[e]) throw new Error("missing "+e);' "$REAL_ROOT/.claude/settings.json" 2>"$SANDBOX/stderr"; then
  ok "settings.json parses and wires all four events"
else
  CODE=1; OUT=""; ERR=$(cat "$SANDBOX/stderr"); bad "settings.json parses and wires all four events"
fi
for f in "$REAL_ROOT"/.claude/hooks/*.sh; do
  [ -x "$f" ] && ok "executable: $(basename "$f")" || { CODE=1; OUT=""; ERR=""; bad "executable: $(basename "$f")"; }
done

echo ""
echo "Hook tests: $PASS passed, $FAIL failed."
if [ "$FAIL" -gt 0 ]; then
  printf 'Failed:%b\n' "$FAILED_NAMES"
  echo "RESULT: FAIL"
  exit 1
fi
echo "RESULT: PASS"
exit 0

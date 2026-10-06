#!/usr/bin/env bash
# Volume Stop hook: remind Claude to update .agent/CURRENT-TASK.md and .agent/HANDOFF.md
# when project files changed in this session but HANDOFF.md did not.
#
# How "changed in this session" is decided:
#   1. If session-start.sh left a marker in $TMPDIR/volume-claude/, files newer than the
#      marker count as changed (data/, .git, node_modules and build output are skipped).
#   2. Otherwise git status is used: other files modified but HANDOFF.md not.
# Loop safety: does nothing when stop_hook_active is true, and reminds at most once per
# session. It never uses exit 2 or decision "block". The reminder is additionalContext
# (Claude sees it and may continue once) plus a systemMessage for the user.
# Fails open: on any error it exits 0 without output.

HOOK_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." 2>/dev/null && pwd)}"
INPUT=$(cat 2>/dev/null)
HANDOFF="$ROOT/.agent/HANDOFF.md"
MARK_DIR="${TMPDIR:-/tmp}/volume-claude"

command -v node >/dev/null 2>&1 || exit 0
PARSED=$(printf '%s' "$INPUT" | node -e '
  let d = {}; try { d = JSON.parse(require("fs").readFileSync(0, "utf8")); } catch (e) {}
  const clean = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "");
  process.stdout.write(clean(d.session_id) + " " + (d.stop_hook_active === true ? "1" : "0"));
' 2>/dev/null) || exit 0
SESSION_ID=${PARSED%% *}
ACTIVE=${PARSED#* }

# Already continuing because of a stop hook: never add another round.
[ "$ACTIVE" = "1" ] && exit 0

MARK=""
[ -n "$SESSION_ID" ] && MARK="$MARK_DIR/session-$SESSION_ID.start"
REMINDED=""
[ -n "$SESSION_ID" ] && REMINDED="$MARK_DIR/session-$SESSION_ID.reminded"
[ -n "$REMINDED" ] && [ -f "$REMINDED" ] && exit 0

CHANGED=0
HANDOFF_DONE=0
if [ -n "$MARK" ] && [ -f "$MARK" ]; then
  CHANGED=$(find "$ROOT" \
      \( -name .git -o -name node_modules -o -name dist -o -name build -o -name coverage \
         -o -name test-results -o -name playwright-report -o -name .vite -o -path "$ROOT/data" \) -prune \
      -o -type f -newer "$MARK" \
         ! -path "$ROOT/.agent/HANDOFF.md" ! -path "$ROOT/.agent/CURRENT-TASK.md" ! -name .DS_Store -print 2>/dev/null \
    | head -n 200 | wc -l | tr -d ' ')
  [ -f "$HANDOFF" ] && [ "$HANDOFF" -nt "$MARK" ] && HANDOFF_DONE=1
elif command -v git >/dev/null 2>&1 && git -C "$ROOT" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  STATUS=$(git -C "$ROOT" status --porcelain --untracked-files=all 2>/dev/null)
  CHANGED=$(printf '%s\n' "$STATUS" | grep -v -e '^$' -e '\.agent/HANDOFF\.md$' -e '\.agent/CURRENT-TASK\.md$' | wc -l | tr -d ' ')
  printf '%s\n' "$STATUS" | grep -q '\.agent/HANDOFF\.md$' && HANDOFF_DONE=1
else
  exit 0
fi

case "$CHANGED" in ''|*[!0-9]*) exit 0 ;; esac
if [ "$CHANGED" -gt 0 ] && [ "$HANDOFF_DONE" -eq 0 ]; then
  [ -n "$REMINDED" ] && mkdir -p "$MARK_DIR" 2>/dev/null && : > "$REMINDED" 2>/dev/null
  MSG="Handoff reminder: $CHANGED project file(s) changed this session but .agent/HANDOFF.md was not updated. If this session's work is finished, update .agent/CURRENT-TASK.md (status, next step, blockers) and append a dated HANDOFF.md entry (who, what changed, files, checks with PASS/FAIL, next step). If work is still in progress, ignore this; it is shown once per session."
  printf '{"systemMessage":"%s","hookSpecificOutput":{"hookEventName":"Stop","additionalContext":"%s"}}\n' \
    "Volume: $CHANGED file(s) changed, HANDOFF.md not updated yet." "$MSG"
fi
exit 0

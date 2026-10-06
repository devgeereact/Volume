#!/usr/bin/env bash
# Volume SessionStart hook: add a short reminder and the top of .agent/CURRENT-TASK.md
# to Claude's context (plain stdout on exit 0 becomes context for this event).
# It also records the session start time in a marker file under $TMPDIR, which
# stop-handoff-reminder.sh uses to see whether HANDOFF.md was updated this session.
# Never blocks. On its own errors it prints a short note and exits 0.

HOOK_DIR=$(cd "$(dirname "$0")" 2>/dev/null && pwd)
ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$HOOK_DIR/../.." 2>/dev/null && pwd)}"
INPUT=$(cat 2>/dev/null)
TASK_FILE="$ROOT/.agent/CURRENT-TASK.md"
LINES="${VOLUME_TASK_LINES:-25}"

# session_id and source without jq: node if present, else a sed fallback
SESSION_ID=""
SOURCE=""
if command -v node >/dev/null 2>&1; then
  PARSED=$(printf '%s' "$INPUT" | node -e '
    let d = {}; try { d = JSON.parse(require("fs").readFileSync(0, "utf8")); } catch (e) {}
    const clean = (s) => String(s || "").replace(/[^A-Za-z0-9_-]/g, "");
    process.stdout.write(clean(d.session_id) + " " + clean(d.source));
  ' 2>/dev/null)
  SESSION_ID=${PARSED%% *}
  SOURCE=${PARSED#* }
else
  SESSION_ID=$(printf '%s' "$INPUT" | sed -n 's/.*"session_id"[[:space:]]*:[[:space:]]*"\([A-Za-z0-9_-]*\)".*/\1/p' | head -n 1)
fi

# Record the start time once per session (resume, clear and compact keep the first marker).
MARK_DIR="${TMPDIR:-/tmp}/volume-claude"
if [ -n "$SESSION_ID" ] && mkdir -p "$MARK_DIR" 2>/dev/null; then
  MARK="$MARK_DIR/session-$SESSION_ID.start"
  [ -f "$MARK" ] || : > "$MARK" 2>/dev/null
  # tidy markers older than 7 days
  find "$MARK_DIR" -name 'session-*' -mtime +7 -delete 2>/dev/null
fi

echo "Volume project. Rules: AGENTS.md (single source for every AI). Start with the volume-next-task skill."
echo "Never read .env or data/ (a hook blocks it). Report checks as PASS, FAIL, PARTIAL, NOT TESTED or BLOCKED."
echo "At the end: update .agent/CURRENT-TASK.md and append a dated entry to .agent/HANDOFF.md."
if [ "$SOURCE" = "compact" ]; then
  echo "Context was just compacted: re-read .agent/CURRENT-TASK.md before continuing."
fi
if [ -f "$TASK_FILE" ]; then
  echo ""
  echo "--- .agent/CURRENT-TASK.md (first $LINES lines) ---"
  head -n "$LINES" "$TASK_FILE" 2>/dev/null
else
  echo "Note: .agent/CURRENT-TASK.md not found at $TASK_FILE."
fi
exit 0

@AGENTS.md

# Notes for Claude Code

- All rules live in AGENTS.md so every AI follows the same ones. Change rules there, not here.
- Start with the `volume-next-task` skill. Use the subagents in `.claude/agents/` for work inside their folders.
- Hooks in `.claude/settings.json` block `.env` and `data/`, warn on house-style breaks and remind you to update the handoff.

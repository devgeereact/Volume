# Codex adapter

Read AGENTS.md, .agent/PROJECT.yml and .agent/CURRENT-TASK.md. GEE OS 1.4.5, `cpanel` profile (Passenger Node app, MariaDB, Clerk). Apply the same secret/data guards directly; Claude hooks do not run in Codex: never read `.env`, `data/` or `~/apps/volume/shared/`. Use GEE OS routing for the active task. No commit, push or deployment without explicit authority.

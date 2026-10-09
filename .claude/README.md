# Claude Code tooling for Volume

<!--
Formats checked against the official Claude Code docs on 4 October 2026
(docs.claude.com/en/docs/claude-code/* now redirects to code.claude.com/docs/en/*):
- Subagents: https://code.claude.com/docs/en/sub-agents
- Skills: https://code.claude.com/docs/en/skills
- Hooks reference: https://code.claude.com/docs/en/hooks (raw: https://code.claude.com/docs/en/hooks.md)
- Permissions: https://code.claude.com/docs/en/permissions
Re-check these pages when Claude Code reports a settings or hook error after an update.
-->

All project rules live in `AGENTS.md`. This folder only adds Claude Code helpers on top: subagents, skills and hooks. Nothing here changes a rule; if a rule needs to change, change `AGENTS.md`.

## Subagents (`agents/`)

Each file has front matter (`name`, `description`, `tools`, `model`) and a body with the role, owned folders, what to read first, the rules that matter most, the definition of done and a report format using PASS, FAIL and NOT TESTED.

| Agent | Owns | Tools | Model |
|---|---|---|---|
| `volume-architect` | `docs/08-change-management/DECISIONS.md`; guards `docs/08-change-management/plans/legacy-approved-plan.md` and `docs/02-architecture/ARCHITECTURE.md` | read, search, Bash, write, WebFetch | opus |
| `volume-frontend` | `apps/web`, `packages/ui` | read, search, Bash, write | inherit |
| `volume-backend` | `apps/server` | read, search, Bash, write, WebFetch | inherit |
| `volume-ai-prompts` | `packages/ai`, `prompts/`, `config/models.defaults.json` | read, search, Bash, write, WebFetch | inherit |
| `volume-export` | `packages/export`, `config/book-templates/` | read, search, Bash, write, WebFetch | inherit |
| `volume-reviewer` | nothing (read-only review, one line per finding with severity) | read, search, Bash | opus |
| `volume-qa` | `tests/` (runs typecheck, lint, unit, golden, e2e; reports evidence) | read, search, Bash, write | sonnet |

`inherit` uses the model of the main session. Change a model by editing the `model:` line.

## Skills (`skills/<name>/SKILL.md`)

| Skill | Use it when |
|---|---|
| `volume-next-task` | Starting a session or "continue": reads CURRENT-TASK and HANDOFF, does one step, runs checks, updates both files, stops at phase gates. |
| `volume-house-style` | Checking book text, prompts, templates, docs or UI copy against `config/house-style.json`. Ships `scripts/check-style.mjs` (no dependencies). |
| `volume-design-system` | Building or changing any UI: design guide first, tokens only, all states, accessibility floor, motion rules, screenshots at 1440 and 390. |
| `volume-kdp-rules` | Any KDP number: only from `config/kdp-rules/<latest>.json`; how to add a rule with source and date. |
| `volume-phase-gate` | Closing a phase: acceptance from `docs/01-product/ROADMAP.md` with evidence, CHANGELOG, DECISIONS, the owner review message, then stop. |

Run the style checker by hand:

```bash
node .claude/skills/volume-house-style/scripts/check-style.mjs prompts/writing/
node .claude/skills/volume-house-style/scripts/check-style.mjs --rules=emdash,banned --json docs/01-product/PRODUCT-SPEC.md
```

Exit codes: 0 clean, 1 findings, 2 usage error or config missing. It always skips `docs/source-drafts/` and `data/`. Text that quotes a rule on purpose can sit between `house-style:off` and `house-style:on` comments, or carry `house-style: ignore` on the line.

## Hooks (`hooks/`, wired in `settings.json`)

| Script | Event | What it does |
|---|---|---|
| `protect-secrets.sh` | PreToolUse on `Read`, `Edit`, `Write`, `MultiEdit`, `NotebookEdit`, `Bash`, `Grep`, `Glob` | Blocks (exit 2, reason to Claude) any file path, glob or shell command that touches `.env` or `.env.<anything>` inside the project (except `.env.example`) or the project's `data/` folder. Words like "environment" or `process.env` pass. |
| `house-style-warn.sh` | PostToolUse on `Edit`, `Write`, `MultiEdit` | After edits under `prompts/`, `docs/` (not `docs/source-drafts/`), `config/book-templates/`, `apps/web/` and `prototype/`, runs the checker's `emdash`, `banned` and `agents` rules and returns warnings to Claude as `additionalContext`, plus a one-line `systemMessage` for you. Never blocks. |
| `session-start.sh` | SessionStart (startup, resume, clear, compact) | Prints a short reminder and the first 25 lines of `.agent/CURRENT-TASK.md` as context, and records the session start time in `$TMPDIR/volume-claude/`. |
| `stop-handoff-reminder.sh` | Stop | If project files changed since the session started and `.agent/HANDOFF.md` did not, reminds Claude once per session to update CURRENT-TASK and HANDOFF. Does nothing when `stop_hook_active` is true. Never blocks. |
| `test-hooks.sh` | (test) | Builds a throwaway sandbox project, feeds sample hook JSON to every hook and the checker, and asserts exit codes and messages. Run `npm run hooks:test`. |

Every hook fails open on its own errors (exit 0 with a visible `systemMessage`), except the deliberate secret block. Node is used for JSON parsing; no `jq` needed.

`settings.json` also holds a small permissions block: deny `Read(.env)`, `Read(.env.*)` (with `.env.example` carved out), `Read(/data/**)` and `Edit(/data/**)`; allow `npm run typecheck`, `lint`, `test`, `hooks:test` and the style checker without a prompt. Personal overrides go in `.claude/settings.local.json` (git-ignored by Claude Code).

## Codex, Gemini CLI and other assistants

They read `AGENTS.md` (Gemini through `GEMINI.md`). They have no hooks here, so they follow the same rules by hand:

- Roles: open the matching `.claude/agents/volume-<role>.md` and follow its body as instructions (owned folders, read first, rules, done, report format).
- Skills: the `SKILL.md` files are plain Markdown checklists any assistant can follow. The style checker is a normal Node script: `node .claude/skills/volume-house-style/scripts/check-style.mjs <files>`.
- Hook behaviour by hand: never touch `.env` or `data/`; run the style checker after editing prompts, docs, templates or UI copy; read `.agent/CURRENT-TASK.md` at the start; update it and append to `.agent/HANDOFF.md` at the end.

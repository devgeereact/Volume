---
name: volume-house-style
description: Check Volume book text, chapters, prompts, templates, docs or UI copy against config/house-style.json (em dashes, banned phrases, US to UK spellings and phrasing, title case, guardrail patterns such as invented ISBNs, statistics, studies or reviews). Use after writing or editing any prompt, sample chapter, book template or UI copy, before a phase gate, or when the owner asks to check style, spelling, banned words or em dashes.
allowed-tools: Bash(node ${CLAUDE_SKILL_DIR}/scripts/check-style.mjs *)
---

# Volume house style check

The rules live in `config/house-style.json` (owned by the config and prompts agent). This skill does not copy them; the script reads the file at run time.

## Run it

```bash
node ${CLAUDE_SKILL_DIR}/scripts/check-style.mjs <file-or-folder> [...]
```

From the project root the same script is at `.claude/skills/volume-house-style/scripts/check-style.mjs`.

Output: one line per finding as `path:line:col  severity  rule  message`, then a summary.
Exit codes: `0` clean, `1` findings (severity `error` or `warn`), `2` usage error, or config missing with nothing else found.

Options:

- `--rules=emdash,banned,agents,spelling,titlecase,guardrails,habits` to run only some rules.
- `--json` for machine-readable output.
- `--quiet` to drop the summary line.

## What each rule checks

| Rule | Source | Notes |
|---|---|---|
| `emdash` | built in, plus `emDash` and `enDash` in the config | Em dashes always. En dashes when the config says they are not allowed. |
| `banned` | `bannedPhrases`, `bannedPhraseMatching` | Case-insensitive, whole words. Single words also match the suffixes in `singleWordInflections`, and words ending in e match with the e dropped before -ing or -ed when `dropFinalEBeforeSuffix` is true. |
| `agents` | AGENTS.md "Writing for people" list | The thirteen words listed there. |
| `spelling` | `usToUkSpelling`, `ukPhrasing`, `spellingExceptions` | Exceptions (program, meter, check, license, practice and so on) are reported as `info` only, because the right form depends on meaning. Skipped inside code fences. |
| `titlecase` | `titleCase` | Markdown headings. Runs by default only on book text outside the project folders; force it with `--rules=titlecase`. |
| `guardrails` | `guardrailPatterns` | Regex patterns with id and message (invented ISBNs, percentages, "studies show", reviews, URLs in prose, medical, legal and safety wording). `claims-report` and `autofix` actions show as `warn`; others as `error`. Negated guarantees ("not a guarantee", "never guaranteed") pass; organisation names such as GOV.UK are not URLs; "treat" counts only in a clinical context. |
| `habits` | `aiHabits` | AI writing habits, warnings only. Paragraphs opening with scaffolding ("Here's the", "Here's how", "Let's", "In this chapter, we will") when a `# ` section has more than `maxPerSection`; "this is illustrative" style disclaimers when a file has more than `maxPerBook` (the `::: copyright` block is not counted). Runs by default only on book text outside the project folders, like `titlecase`. |

## What it skips

- `docs/source-drafts/` always. Those are the owner's original drafts, kept verbatim as source material.
- `data/`, `node_modules`, `dist`, `build`, `.git`.
- Lines with `house-style: ignore`, and everything between `house-style:off` and `house-style:on` (inside any comment, for example `<!-- house-style:off -->`). Use this only for text that quotes a rule on purpose, such as a prompt that lists words to avoid.

If `config/house-style.json` is missing, the script says so, runs only the built-in em dash and AGENTS.md word checks, and exits 2 when those find nothing.

## How to act on findings

1. Fix every `error` in book text and prompts. Em dashes become a comma, colon, brackets or a full stop. Banned phrases get rewritten, not swapped for a synonym that says the same empty thing.
2. Fix `warn` findings unless the context makes them right, and say why you kept any.
3. `info` spelling findings: check the meaning (a computer program is correct; a TV programme is British).
4. Guardrail hits on invented facts: remove the claim or move it to the claims-to-verify report. Never invent a source to satisfy the check.
5. Re-run until the file is clean or every remaining finding is explained. Report the command and result as PASS or FAIL.

The PostToolUse hook `house-style-warn.sh` runs the `emdash`, `banned` and `agents` rules automatically after edits to `prompts/`, `docs/` (not source drafts), `config/book-templates/`, `apps/web/` and `prototype/`. It warns and never blocks.

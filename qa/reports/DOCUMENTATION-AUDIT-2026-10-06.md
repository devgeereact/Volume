# Documentation audit, 6 October 2026

Status: PASS for the targeted documentation consistency checks; product release acceptance remains PARTIAL.

Reviewed the repository documentation inventory (70 Markdown guidance/specification/record files outside dependencies, generated output and prompt versions), current scripts and workspace manifests, server routes, migrations/schema, AI provider/budget code, import limits, CI configuration and existing validation evidence. Prompt versions and owner source drafts remain preserved. This is a documentation audit, not another full runtime or line-by-line source audit.

## Corrections

| Area | Documents updated | Result |
|---|---|---|
| Entry points and commands | README, apps/web README, scripts README | Removed phase 0/no-code status, obsolete prototype workspace commands and nonexistent helper scripts; listed current evidence and checks. |
| Release and live results | Roadmap, project review ledger, local validation, testing guide | Distinguished approved acceptance targets and original review from current results. Free titles/blueprint pass; writing/Gemma tests fail; Word sampled layouts pass; Kindle/KDP outstanding; MySQL deferred. |
| Implemented flows | UX flows | Recorded Markdown/project import, portraits, blueprint compare/restore, writing confirmation and pre-publication pricing. Wider UX descriptions remain acceptance targets. |
| Database and budgets | Data model, AI pipeline, architecture, server README | Corrected model override storage, cost column naming, asset BLOB metadata, per-request budget protection and redirect default off. Exact database shape remains authoritative in migrations/schema. |
| KDP and exports | KDP guide, export specification, export README, PRD, glossary | Current rules file is 2026-10-06.json; unchanged rules keep their original verification date and 1 January recheck deadline. Trim/margin/safe-zone rechecks confirmed; barcode automatic placement partial. Named installed ZIP dependency and explicit EPUBCheck jar requirement. Removed unimplemented PDF fallback claim. |
| Security and operations | Security/privacy guide | Documented current ZIP/Markdown validation, BLOB downloads, logger output and actual CI checks; removed nonexistent verify-env and audit-step claims. |
| Historical records | Plan and original design boards | Added current pointers without rewriting approved history or marking proposed decisions accepted. |

## Verification and limits

- Local Markdown links checked across the inventory, excluding preserved source drafts and code examples. No broken document links found.
- Documented workspace commands checked against package.json; current application commands use apps/web, not prototype.
- KDP guide statuses checked against the dated JSON. No new external KDP facts or numerical rules were added.
- git diff --check: PASS. House-style scan: PARTIAL. Technical URLs, sourced/measured percentages and examples of prohibited book claims trigger the book-content detector. No new em dashes or banned house-style phrases were added.
- Product code, prompts, model defaults, environment files and owner manuscripts were not changed or read during this audit. No dependencies installed, servers started, live calls, commits or pushes.
- Existing automated and live results remain dated evidence. Tests were not rerun merely to edit prose.

## Remaining decisions and acceptance

KNOWN-ISSUES.md remains the current open-work list. D-014 visual approval and D-020 redirect approval remain proposed; owner profile facts remain unconfirmed. Free route availability and summary truncation need follow-up before a clean full live book can pass. Kindle licence approval and KDP application checks are still outstanding. cPanel testing remains deferred. Remote CI awaits an authorised push.

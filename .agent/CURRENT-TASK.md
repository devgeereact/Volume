## Fix follow-up, 7 October 2026

Test reliability fixes and fresh evidence are in qa/reports/FOLLOW-UP-2026-10-07.md. Core rerun 75 PASS, AI 155 PASS, server 189 PASS, export 86 PASS with PDF visual FAIL. Restart scenario PASS after matching the existing 60-second startup allowance. PDF references/threshold remain unchanged; full acceptance PARTIAL/NO-GO. Actual Mac and owner/external gates remain open.

## Latest: PDF parity investigation
Added a typed read-only comparison command that reports all four existing PDF references and environment/font hashes. Linux comparison: title PASS, contents/opener/body FAIL. Font-hinting experiments improved the match but none passed all pages, so production rendering, golden files and tolerance are unchanged. Exact cause remains unresolved. Typecheck, diagnostic lint/format and docs checks PASS. See qa/reports/PDF-INVESTIGATION-2026-10-07.md. Actual Mac access was not supplied; use Rebrand/MAC-LINUX.md and run the same diagnostic there.

# Current task

- Task: approved Volume GEE OS rebuild, local isolated candidate.
- Mode: Build. Workflow: Change Safety. Profile: Full Product.
- Status: implementation complete for documentation structure, portable tooling and React/Tailwind application composition. Linux candidate validation finished, with the preserved PDF failure. Feature-by-feature full reconstruction/acceptance remains outstanding; current features are ported implementations. Release acceptance remains PARTIAL.
- Plan: docs/08-change-management/plans/GEE-OS-REBUILD.md.
- Evidence: qa/reports/GEE-REBUILD-2026-10-07.md.

## Implemented

GEE document hierarchy and move manifest; standalone Mise/npm clean restore and runtime doctor; guarded process launcher; React providers/router under src/app and feature slices under src/features. Public demo fixtures are now included under src/demo: the old unanchored data/ ignore excluded them from fresh Git checkouts. Private root data remains ignored and untouched. Existing backends, schemas, prompts, assets, design and user workflows are retained.

## Boundaries and remaining work

No environment file or private root data read or copied. No original checkout cutover, commit, push, deployment, live AI call or destructive retirement. Mac execution and remote CI require a real Mac/authorised remote run. Linux PDF visual reference discrepancy remains unresolved, with golden and tolerance unchanged. Existing publishing and live AI acceptance blockers remain in KNOWN-ISSUES.md.

Use npm run setup, npm run doctor and npm run dev through Mise. Volume remains owner-only on loopback, web 5180 and API 5181. Safe LAN access requires a separately designed authentication/origin change.

Prior task history: qa/reports/TASK-BEFORE-GEE-REBUILD-2026-10-07.md.


## 7 October 2026: running-header correction

Corrected suppressed small capitals in PDF running headers and added a rendered-PDF regression. Full visual parity remains FAIL; reference images and tolerance remain unchanged. Ornament rendering is intact, correcting the initial diagnostic suspicion. See qa/reports/PDF-SMALLCAPS-2026-10-07.md. Release remains PARTIAL/NO-GO; actual Mac execution is NOT TESTED.


## Active promotion, 7 October 2026
Owner requested promotion and push. Current directory: /home/mr-gee/Work/Projects/active/volume. Original preserved at /home/mr-gee/Work/Projects/archive/pre-rebrand-2026-10-07/volume. Branch: rebrand/gee-os-typescript-20261007. See qa/reports/ACTIVE-PROMOTION-2026-10-07.md. Earlier release gates remain open; no production merge/deployment performed.

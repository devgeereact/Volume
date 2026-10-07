# Volume: GEE OS migration audit and rebuild plan

Date: 7 October 2026. Status: approved by the owner on 7 October 2026; implementation in progress. This is the first deliverable requested when selecting Volume. The approved move manifest is being applied in an isolated checkout. Destructive retirement remains separately gated.

## Outcome and recommendation

Volume already uses React and Tailwind. Its frontend imports Tailwind and the shared token/theme packages in `apps/web/src/styles/app.css`. The target is a fresh, orderly GEE OS application workspace with a rebuilt React interface, preserved book-production behaviour and reproducible macOS/Linux restoration.

Use the installed GEE OS Full Product blueprint for documentation and contracts, adapted to the existing npm monorepo. Keep the useful `apps/` and `packages/` boundaries. Do not force the application into the blueprint's generic `src/` folder, replace working database migrations or discard its tested export engines simply to make the directory look new.

Rebuild incrementally in an isolated checkout of the same repository, with an explicit feature-parity ledger. A fresh application shell is appropriate; individual engines are retained, ported or rewritten according to evidence. The existing checkout remains the reference until acceptance. Any further redesign of branding or behaviour requires an explicit product decision.

## Scope and authority

- Current authorised deliverable: audit, proposed structure, preservation checklist and exact move/rewrite/retirement plan.
- Proposed implementation after approval: local GEE OS contracts/docs migration; standalone cross-platform restoration/startup; fresh React/Tailwind frontend shell and feature-by-feature reconstruction; targeted refactoring behind preserved contracts; regression proof.
- No deployment, public access, paid AI, live generation, external database changes, commits or pushes are included.
- Private `.env` and `data/` are not read, copied into the replacement or changed. Development/test fixtures are separate from owner data.
- Broad implementation requires approval under Volume AGENTS.md working rule 1: “Plan before large changes; show the plan and wait for the owner's OK.”
- Destructive retirement requires an exact file list and explicit approval after verification. This document authorises no deletion by itself.

## Inspected baseline

Repository: `/home/mr-gee/Work/Projects/active/volume`, branch `main`, HEAD `1c0d3e2`. Existing changes: `.agent/CURRENT-TASK.md`, `.agent/HANDOFF.md`, `CHANGELOG.md`, and untracked `mise.toml`. These belong to the preceding restoration work and must be preserved.

Inspected project rules/contracts, architecture, product/route/test specifications, issues/decision records, package manifests, live router/CSS entry points, server root discovery, fonts, scripts and CI. The installed GEE OS router, Plan mode, Existing Application engine, Change Safety workflow, Full Product profile and new-project blueprint informed the target. This is not a full line-by-line source or security audit.

| Finding | Evidence | Implication |
| --- | --- | --- |
| React/Tailwind already implemented | apps/web/package.json; apps/web/src/styles/app.css | No framework conversion needed. |
| Useful package boundaries exist | package.json workspaces; apps/server/src; packages/* | Retain web, server, core, AI, export and token boundaries. |
| Legacy project contract format | .agent/PROJECT.yml flat fields; location ~/Projects/volume | Align to GEE OS project/gee_os/authority/sources_of_truth sections; make checkout location portable. |
| Mac-specific descriptions remain | README.md; docs/02-ARCHITECTURE.md | Rewrite current operations for macOS and Linux. |
| Root startup is minimal | scripts/dev.mjs; scripts/README.md | Make standalone restoration and prerequisite/exit checks explicit. Shared parent-folder launcher must not be required. |
| CI currently targets Ubuntu only | .github/workflows/check.yml | Add meaningful Linux and macOS execution; do not claim macOS compatibility from Linux tests. |
| UI package mainly contains tokens | packages/ui/package.json; packages/ui/README.md; apps/web/src/components/ui | Keep tokens initially. Move truly reusable primitives only after removing app dependencies and adding verified exports. |
| Token build depends on design tooling | packages/ui/README.md; design/final/src/build.mjs | Retain that generator until any replacement reproduces its output and contrast checks. |
| Historical plans differ from current implementation | docs/PLAN.md describes Drizzle; current architecture/manifests use Kysely; D-030 records preservation of historical plans | Label/archive original approved plans, preserve their wording, and make the current architecture authoritative. Do not revert the actual database layer. |
| Validation is not entirely green | Earlier Linux restoration evidence in this chat and project records | Preserve failures as baseline, especially PDF reference differences and live-writing acceptance. |

### Available execution evidence

Earlier in this same session on Linux: clean npm install, typecheck, lint, web/server builds, API SQLite health and five mock browser end-to-end scenarios passed. Core 75, AI 155, server 189 tests passed. Export: 86 passed, one optional skip, one failure. The PDF contents reference comparison measured 2.94352280521262 against a limit of 1.5. MySQL was skipped. No macOS execution was performed here.

These are inherited dated results, not checks rerun for this planning-only deliverable. Source/diff inspection in this turn: PASS. Product regression testing for prose-only planning: NOT APPLICABLE. New rebuild and macOS acceptance: NOT TESTED.

## Proposed target structure

```text
volume/
  AGENTS.md
  CLAUDE.md  CODEX.md  GEMINI.md       # Thin adapters to the shared contract
  README.md  CHANGELOG.md  KNOWN-ISSUES.md
  package.json  package-lock.json  mise.toml  .nvmrc
  .agent/
    PROJECT.yml  CURRENT-TASK.md  HANDOFF.md
  .github/workflows/
    check.yml                        # Linux and macOS gates
  docs/
    00-foundation/                    # Context, engineering and change safety
    01-product/                       # Product, roles, journeys, business rules, roadmap
    02-architecture/                  # Architecture, data, API, integrations, AI pipeline
    03-design/                        # Design system, UX, accessibility
    04-pwa/                           # Explicit applicability and future boundaries
    05-security/                      # Security, privacy, permissions, auth model
    06-quality/                       # Test strategy and evidence status
    07-operations/                    # Setup, development, backup, deployment, monitoring
    08-change-management/
      DECISIONS.md
      plans/                         # Approved current and historical plans
    09-release/                       # Checklist, production check, release report
    book-production/                 # Prompt index, export contract, KDP rule guide
    reference/                       # Dated reference material
    source-drafts/                   # Owner originals, preserved unchanged
  qa/
    reports/                         # Dated validation/review evidence
    checklists/                      # Applicable GEE OS gates
  apps/
    web/                             # React, TypeScript, Tailwind, Vite
    server/                          # Fastify API, jobs, SSE, SQLite/MySQL
  packages/
    core/  ai/  export/  ui/
  config/                            # Existing runtime contracts remain stable
  prompts/                           # Versioned, existing IDs preserved
  assets/fonts/                      # Fonts and licences preserved
  tests/                             # Existing end-to-end harness retained
  scripts/                           # Portable setup/check/dev/build tooling
  design/                            # Reference and active generator, classified before retirement
  .claude/                           # Existing agent-specific tooling retained/adapted
  data/                              # Existing ignored owner data, never copied during migration
```

GEE OS's generic `public/` and `src/` examples will be represented by the monorepo's actual application folders rather than duplicate empty source trees. PWA/offline/account capabilities are not automatically added. Their documents record current scope and the decision needed before implementation. Volume is an application that produces books, not the GEE OS book-writing project type.

## Document move and rewrite manifest

Every move below is proposed. Apply one coherent group at a time, update inbound Markdown links/agent pointers/script consumers, then verify them. Preserve historical language in historical material. Do not leave parallel editable sources of truth.

| Existing source | Proposed destination | Required treatment |
| --- | --- | --- |
| docs/00-VISION.md | docs/00-foundation/PROJECT-CONTEXT.md | Merge verified purpose/context into blueprint; preserve historical material with attribution. |
| docs/01-PRD.md | docs/01-product/PRODUCT-SPEC.md | Preserve M1-M13 identifiers and acceptance; distinguish implemented, partial and future scope. |
| docs/12-ROADMAP.md | docs/01-product/ROADMAP.md | Retain deferred phases and existing blockers. |
| Relevant PRD/UX sections | docs/01-product/USER-ROLES.md, USER-JOURNEYS.md, BUSINESS-RULES.md | Extract canonical definitions and replace duplicates with links. |
| docs/02-ARCHITECTURE.md | docs/02-architecture/ARCHITECTURE.md | Document actual Kysely/API/jobs architecture and both operating systems. |
| docs/03-DATA-MODEL.md | docs/02-architecture/DATA-MODEL.md | Keep schema identifiers and migration history unchanged. |
| Existing route source/spec material | docs/02-architecture/API-SPEC.md | Inventory actual endpoints and schemas, errors, Host/Origin and SSE contracts. |
| Existing architecture/AI material | docs/02-architecture/INTEGRATIONS.md | Separate OpenRouter, local SQLite, optional MySQL and browser/export prerequisites. |
| docs/04-AI-PIPELINE.md | docs/02-architecture/AI-PIPELINE.md | Preserve stage/model/context/retry/budget/fallback contracts. |
| docs/05-PROMPTS.md | docs/book-production/PROMPTS.md | Keep prompt IDs, variable schemas, version selection and explicit pins. |
| docs/06-EXPORT-SPEC.md | docs/book-production/EXPORT-SPEC.md | Preserve output formats, preflight and acceptance rules. |
| docs/07-KDP-RULES.md | docs/book-production/KDP-RULES.md | Preserve dated facts, provenance and unresolved warnings. No external facts revalidated merely by moving docs. |
| docs/08-DESIGN-GUIDE.md | docs/03-design/DESIGN-SYSTEM.md | Preserve design tokens and proposed D-014 status until accepted. |
| docs/09-UX-FLOWS.md | docs/03-design/UX-SPEC.md | Preserve URLs, redirects, flow states and module mapping. |
| Existing design/testing accessibility material | docs/03-design/ACCESSIBILITY.md | Record semantic, keyboard, reduced-motion and editor acceptance. Mark missing evidence. |
| docs/10-SECURITY-PRIVACY.md | docs/05-security/{SECURITY,DATA-PRIVACY,AUTH-MODEL,PERMISSIONS}.md | Split boundaries by responsibility; owner auth stub stays explicit. |
| docs/11-TESTING.md | docs/06-quality/TEST-STRATEGY.md | Preserve test/coverage thresholds; document platform-dependent PDF checks honestly. |
| docs/BACKUP-RESTORE.md | docs/07-operations/BACKUP-RECOVERY.md | Preserve existing recovery contract; test only disposable data during migration. |
| README/scripts/workspace restoration guidance | docs/07-operations/{SETUP,DEVELOPMENT}.md | Make this repository independently restorable on Mac/Linux without parent-folder scripts. |
| DECISIONS.md | docs/08-change-management/DECISIONS.md | Move full history with stable D-001... identifiers; append accepted/proposed new decisions. |
| docs/PLAN.md | docs/08-change-management/plans/legacy-approved-plan.md | Preserve original plan/history; label historical and link current plan. |
| Approved version of this proposal | docs/08-change-management/plans/GEE-OS-REBUILD.md | Become current migration plan after owner approval. |
| docs/*VALIDATION*, *REVIEW*, DOCUMENTATION-AUDIT-* | qa/reports/ with original basenames | Preserve dates, failures and evidence; repair links. |
| docs/reference-kdp-facts-* | docs/reference/ with original basenames | Preserve references and dates. |
| docs/GLOSSARY.md | docs/00-foundation/GLOSSARY.md | Keep canonical terminology. |
| docs/source-drafts/* | Same paths | Preserve originals; do not rewrite user source material. |
| CHANGELOG.md, KNOWN-ISSUES.md | Same root paths | Retain single append-only history and active issue register; link from GEE OS docs. |

Additional blueprint sections will be populated from verified facts. Unknown production/deployment requirements stay UNKNOWN. Email/payments/multi-device synchronisation receive applicability decisions, not invented implementations. Browser SSE progress is not permission to introduce a third-party notification service.

## Application rebuild and preservation ledger

| Area | Preserve | Rebuild/refactor target | Proof before replacement |
| --- | --- | --- | --- |
| M1 Profiles | Author/pen-name facts, photos, ownership and version rules | New profile features/components with existing API contracts | Profile/photo save and reload; author bio remains exact. |
| M2 Library/archive/published | IDs, project states, archive/restore behaviour | New shell, navigation, filtering and cards | Existing routes, project selection, archive/restore and empty/error states. |
| M3 Wizard | Template, profile, budget and project creation contracts | Rebuild typed form flow | Validation, cancellation, creation and persistence. |
| M4-M6 Research/titles/blueprint | Sources, model choices, schemas, revision history | Rebuild stage pages around typed client hooks | Mock source provenance, title selection, blueprint compare/restore. |
| M7 Writing | Jobs, section ordering, budget reservations, retries and restart recovery | Rebuild progress/error/recovery interface | SSE replay, paused budget, cancellation, interrupted-job recovery. |
| M8-M9 Checks/editor | Claims/guardrails, manuscript model, versions and TipTap behaviour | Rebuild editor composition without replacing its document contract | Import, undo, paste, save/reload and findings. |
| M10 Cover | Owner images, font licensing, deterministic text placement and sizing | Rebuild cover controls/previews | Mock cover generation, uploads and trim/spine checks. |
| M11 Export | PDF/DOCX/EPUB/TXT/MD, covers, preflight and ZIP contract | Port existing engine; rewrite only proven defects | Structural/text/font/page checks, reviewed visuals and full 19-entry fixture pack. |
| M12 Marketing | Metadata, selected model, approval and cost rules | Rebuild forms/results | Mock generation and persistence; no automatic posting. |
| M13 Settings | Key stays server-side, model defaults, budget and backup controls | Rebuild settings panels | No key in bundle/logs; configuration persistence; disposable recovery tests. |
| Core/API/DB | Workspace IDs, migration numbers, row relationships and typed boundaries | Keep schema/API first; targeted internal refactoring only | Existing unit/integration coverage plus feature contract tests. |
| Prompts/config/fonts | Versions, task IDs, model defaults, dated KDP facts, licences | Keep runtime paths stable during structural work | Loaders, pinned prompts, fixture outputs and generated token reproducibility. |

The route set includes `/`, `/library`, `/published`, `/profiles`, `/profiles/:profileId`, `/books/new`, `/new-book`, `/books/:bookId/*`, `/settings/:tab?`, `/archive` and the existing component reference route. Rebuild work must deliberately preserve or explicitly supersede each route; removing a reference route requires a classified consumer check.

## Implementation sequence and gates

1. **Safety baseline.** Recheck Git state and preserve source-only uncommitted changes before creating an isolated checkout. Never reset the working checkout or silently commit. Record source revision, lock hash, baseline passes and known failures. Use fresh disposable fixtures, not owner data.
2. **GEE OS contracts and docs.** Adapt the Full Product blueprint without overwriting populated files. Migrate the manifest above in batches; update AGENTS/adapters, project card, current plan and references. Keep current implementation unchanged. Gate: links resolve, canonical sources are unambiguous, original records retained.
3. **Standalone Mac/Linux foundation.** Keep Node 26.10.0/npm lockfile; validate compatibility with actual requirements rather than upgrade packages wholesale. Add portable prerequisite/restoration/development checks, safe environment-presence validation and process cleanup. Retain 5180/5181 loopback ports. Gate: fresh disposable Linux checkout restores/builds/starts without the parent launcher; macOS workflow prepared and later executed.
4. **Fresh React/Tailwind shell.** Rebuild navigation/layout, routing, state providers, errors, loading and keyboard foundations. Keep current token direction as provisional, with no unapproved brand redesign. Do not place app-specific components in shared UI merely to empty a folder. Gate: route smoke checks, keyboard/reduced-motion checks and representative screenshots.
5. **Feature-by-feature reconstruction.** Profiles and library; wizard and planning; writing/editor; cover/export; marketing/settings. Retain existing implementations as the comparison until each replacement passes the ledger. Keep mocks clearly identified. Gate each slice before starting the next.
6. **Resolve baseline blockers.** Investigate PDF contents rendering with pinned fonts/browser, render diffs on both systems and unchanged structural checks. Do not replace references or loosen tolerance merely to make tests pass. Track live AI truncation/upstream issues separately; any live acceptance needs fresh scope/budget. Gate: no unexplained new failures, old failures still clearly visible.
7. **Both-platform acceptance.** Run clean install, typecheck, lint, format, coverage, web/server builds, mock end-to-end tests, startup/shutdown and fixture restore on Linux and macOS. CI configuration is local work; remote execution requires the appropriate repository workflow run, and does not happen merely by writing YAML. Gate: actual evidence from both systems before a cross-platform PASS.
8. **Cutover and retirement.** Compare parity/visuals, document remaining blockers and prepare the exact delete list and rollback path. Owner reviews the replacement and file list. Only then retire approved obsolete paths. Keep the original Git history and private owner data. No deployment included.

## Portable operation acceptance

- Restoration uses the committed npm lockfile and installs native packages on the destination OS; node_modules/dist/caches are never transferred.
- Mise config is local to the project; startup validates the required runtime rather than silently using an incompatible global version.
- Node-based scripts or already-tested portable shell are used; no sips/brew-only runtime dependency or hard-coded home-directory path is introduced.
- Root/path resolution uses repository markers and file URLs. Windows compatibility is not claimed by this Mac/Linux scope.
- Chromium/fonts/native SQLite/image dependencies have documented restoration requirements; no blanket system package changes.
- Settings checks print missing variable names only, never values. The existing owner-reserved env template is not overwritten.
- Local defaults use explicit IPv4 loopback and strict ports; occupied-port errors identify the conflict without killing unrelated processes.
- Volume LAN remains disabled while it has the owner authentication stub. A future LAN/auth/security design is a separate decision.
- Database/files remain one coherent recovery unit. Schema changes require forward migrations and disposable tests; never a new empty owner database substituted for existing content.
- Cross-platform visual differences are investigated and documented, with reviewed platform references only if justified and approved.

## Retirement policy and current delete list

**Current approved delete list: empty.** No genuine project, prompt version, migration, owner asset, original draft or test is classified as disposable in this audit.

Possible later candidates: obsolete prototypes after confirming generator/reference consumers; superseded frontend components after their replacement passes and no references remain; obsolete documentation entry points after all consumers are migrated. These are candidates for inspection, not deletion authorisation.

Generated ignored outputs can be regenerated, but broad cleanup is not needed for this plan. Unfamiliar CLI/manual tools and agent adapters remain until their entry points are checked. No blanket “unused files” removal.

## Risks and rollback

| Risk | Control/rollback |
| --- | --- |
| Lost work or data | Preserve original checkout/uncommitted source; no env/data copying; separate fixture storage. |
| Broken doc/import/runtime paths | Batch move manifest, consumer search, link/type/build checks; revert only that migration batch. |
| Frontend rewrite loses hidden behaviour | Feature/route ledger and existing tests; compare against original before replacing each slice. |
| Schema/API drift | Keep existing schema and migration IDs; no database redesign inside a folder migration. |
| New build silently drops token generation | Retain design generator until output and contrast checks match. |
| False cross-platform claim | Require Mac execution as well as Linux; report NOT TESTED when unavailable. |
| Rebuild hides known failures | Keep PDF, live AI, publishing, barcode and cPanel issues in the active issue register. |
| Public exposure of owner-only app | Loopback defaults; no tunnels, wildcard hosts or auth changes. |

Rollback is returning to the original checkout and launcher, not reverting a shared branch or resetting owner data. Implementation batches should remain independently reviewable. No irreversible cutover until feature parity and owner review.

## Decisions requested for implementation

Approval of this plan would accept the Full Product GEE OS documentation structure, retained npm monorepo/backend/contracts, a fresh React/Tailwind frontend rebuilt in verified slices, standalone Mac/Linux restoration, and an isolated same-repository checkout with the original preserved. It would not approve deletion, Git publication, paid/live AI, production changes or public/LAN exposure.

The first implementation milestone is contracts/documentation and a standalone reproducible foundation. A generic empty scaffold would not count as a rebuilt app. Completion requires the feature ledger and both-platform evidence, with external acceptance blockers reported explicitly.

## Implementation record, 7 October 2026

See qa/reports/GEE-REBUILD-2026-10-07.md for the actual candidate and status. The GEE hierarchy, standalone foundation, React application composition and feature-folder port are implemented in isolation. Existing functioning feature implementations were retained during the port; this is not a claim that every screen was newly written. Full feature reconstruction/acceptance, PDF resolution, Mac execution and cutover gates remain outstanding where recorded. The original plan and requirements above are preserved for review.

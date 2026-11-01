# Audit record

One audit file for this project. Every audit, check or review adds a dated section at the top; nothing is rewritten. Open work lives in `.agent/CURRENT-TASK.md`.

## 1 November 2026: dependency alerts, sign-in page

- **Dependabot alerts 1 and 2 (moderate).** `glob` 13.0.6 (AbortSignal bypass, fixed in 14.0.2) and `minimatch` 10.2.6 (pattern DoS, fixed in 11.0.1). Neither is reachable:
  - `glob` comes in only through `@fastify/static`, which calls it only when `wildcard` is false. Volume registers it with `wildcard: true` (`apps/server/src/http/hosting.ts`), so glob never runs on the host.
  - `minimatch` comes in through ESLint, typescript-eslint and glob; it runs only in local linting on the project's own patterns.
  - The fixes are new majors (27 and 28 October 2026). `@fastify/static` still declares `glob ^13`, and `npm audit fix --force` would downgrade ESLint and Fastify by several majors. Not applied. Alerts dismissed on GitHub with this reason; revisit when `@fastify/static` and ESLint move to the patched majors.
- **Sign-in page (live).** Clerk works: an unknown address gets "Couldn't find your account"; the owner's address reaches the email code step (factors: Google, email code). The page's CSP allows Clerk's scripts and frames. Clerk production has the password method on and required while the owner's account has no password, so the form shows a Password box that cannot be used; the email code path still works through "Continue". Recommended Clerk change, owner's call: turn the password method off.
- **Sign-in heading fixed.** "studio." was invisible (accent token equals the panel colour since D-066) and the heading and line wrapped early at laptop widths. Now one line at 1024 to 1920, contrast 13.7:1 light and 13.1:1 dark, axe clean. The 3D book's gilt (landing and sign-in) used the same token and vanished on the navy cloth; it is now a fixed content colour.

## 1 November 2026: clean-up

- Dead code: `BlueprintInspector.tsx` (257 lines, only its `Totals` type was used; moved into `BlueprintPage.tsx`), nine exports used nowhere (`RESOURCES_PLACEHOLDER`, `RESOURCES_NEED_SOURCES`, `CatalogueResponse`, `paperbackRulesVersion`, `TikTokBody`, `InstagramBody`, `EmailBody`, `useBreakpoint`, `GuardrailPattern`) and the unused `@fontsource-variable/schibsted-grotesk` package. Method: import graph over every workspace, then a whole-repo search per export; `tsc --noUnusedLocals` clean in every workspace. 520 exports used only in their own file were left (not dead).
- Git: 37 merged remote branches and 2 local ones deleted (each checked to have no commits outside main); two agent worktrees removed. `docs/release-20261030` kept: it holds commits not in main (owner's call).
- Docs: 39 Markdown files corrected against the code (roles and sign-in, D-057 spending, hosting, PWA facts, test counts and ports, folder maps, known issues); plan statuses updated. Prompt version files are kept by design.

## 31 October 2026: design gap audit (product-design method)

- Scope: production build on demo data, 25 routes at 375, 834, 1280, 1920 and 2560 px, axe-core 4.10 (WCAG 2.0, 2.1, 2.2 A and AA tags) plus DOM measurements (row heights, column ends, orphan last rows, repeated text, navy buttons per page).
- Before: all 125 captures failed axe (toast region `aria-prohibited-attr` on every page; also an unlabelled profile photo input, an unfocusable wizard scroll area at 390, 16 px citation targets). Layout: 2 or 3 navy primaries per step page, step bar clipped at 1280, Overview columns 1033/997/855 px, Blueprint inspector 1,957 px beside a 716 px outline, stretched Research cards, chosen title shown three times, lone last cards on several grids. Saved: `../reports/volume/gap-fixes/before-audit.json`.
- After (PR #87, #88): 200 captures at six widths plus dark mode, 0 axe violations, 0 sideways scroll, 0 orphan rows. Gate: typecheck, lint, format, web 267, e2e 20.
- Not tested: screen readers, real devices, signed-in pages on real data.

## 30 October 2026: automatic deploy and docs tidy

- Scope: the new `deploy.yml` (runs `npm run deploy` after "Check Volume" passes on `main`) and the docs layout.
- Evidence: Check Volume run 41116467668 passed (Linux, macOS, Node 24 + MariaDB host job); Deploy run 41118270156 released `8fc47e4` as `releases/20261030T194912Z` (health 200, sign-in enforced, migrations up to date). `KNOWN-ISSUES.md` moved to `docs/`; docs check passes.
- Result: PASS.

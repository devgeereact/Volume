# Plan: Studio redesign into the real app (28 October 2026)

Status: approved by the owner on 28 October 2026. Stage 0 merged (PR #76), stage 1 in PR #77, stage 2 in its own PR.

## Goal

Bring the Studio demo design (artifact version 6) into `apps/web` and take it live. Every feature in the app today keeps working: the demo mode, the API mode, jobs, SSE progress, claims, export, Volume mode, profiles, archive and settings. The design changes how things look and move. It does not change any business rule.

## What the new design adds

- **Shell:** a frosted side menu and top bar.
- **Navigation:** a sticky step bar at the top, with previous, the 8 steps and Next. It replaces the fixed bottom StepFooter.
- **Step pages:** each step has a head with its purpose and tools, and ends with an "Up next" card.
- **Library:** covers in a 3 by 3 grid of 9 with "Show all". All cards are the same size. The side column stays in view while you scroll.
- **Research:** counts, filters and search over the sources.
- **Titles:** an Amazon-style preview and a length bar.
- **Blueprint:** an outline with a chapter panel and version history.
- **Writing:** live counts.
- **Editor:** a full TipTap toolbar (free extensions only), find with highlights, focus mode, and Style, Claims and Notes tabs.
- **Cover studio:**
  - The wrap fits the screen, and the panels can be hidden.
  - The guides key and the shortcuts list move into popovers.
  - Each book gets its own palette, plus 32 palettes in 8 families.
  - The background can be a colour, a gradient or an image (texture or upload, with opacity, blend mode, blur and tint). <!-- house-style: ignore (CSS blend mode) -->
  - Shapes as layers.
  - Trim and ink choices change the spine width, and there is a page-range check.
- **Marketing:** a launch kit in the cover colours, with TikTok, Instagram and email previews and the full post with Copy.

## Constraints (from AGENTS.md)

- TypeScript strict, React and Tailwind v4, with the tokens in `packages/ui`. No new packages unless the owner approves.
- KDP numbers come only from `config/kdp-rules/`. Trims that are not in the rules are not offered until each one is added with its official source and date.
- No budget caps in the UI (D-057). The demo's "of $15.00" budget lines are dropped.
- No invented counts in the marketing previews. No likes or views are shown.
- The cover studio additions (background, gradient, image, shapes) must also print. A cover that looks right on screen but exports differently is a defect.

## Stages

Each stage is a separate PR. Each one is checked (typecheck, lint, format:check, unit tests, e2e, screenshots at 1440 and 390, light and dark) and can be deployed on its own.

0. **Housekeeping.** The 57 uncommitted files on `feat/smoke-test-and-polish` (originality, prompt caching D-063, origin lock D-062, dependency fixes) are committed and merged first, so the redesign starts from a clean `main`.
1. **Design foundation** (frontend agent). Add the frost and glass tokens to `packages/ui` and `apps/web/src/styles`. Restyle AppShell, TopBar and the side menu. Dark mode. No behaviour change.
2. **Step navigation** (frontend agent). Build a StepRail to replace StepFooter, plus StepHead and the Up next card in BookLayout. The routes stay the same, so `routes.test.tsx` and the e2e tests keep passing.
3. **Library** (frontend agent). The 3 by 3 grid with equal cards and the sticky side column, for both the demo and the API data.
4. **Step pages** (frontend agent). Restyle Research, Titles, Blueprint, Writing, Editor and Marketing, in both their demo and API versions. The editor toolbar uses only the TipTap extensions already installed.
5. **Cover studio** (frontend, export and backend agents).
   - Extend the cover spec in `packages/core` with the background mode, gradient, image (uploaded asset or texture) and shape layers. The new fields are optional with defaults, so old covers load unchanged.
   - Render the same spec in `packages/export/src/covers.ts`, with golden-file tests for the print PDF and the eBook JPG.
   - Uploaded background images go through the existing asset routes.
   - If the cover is stored in its own column, this needs a migration and a cPanel backup before deploy. If it is stored as JSON, it does not.
6. **Trims** (export agent).
   - Children's and other KDP sizes are added to a new `config/kdp-rules/<date>.json`, but only from KDP's official help pages, with the URL and date for each.
   - Reading those pages is a network call, so it needs the owner's OK.
   - Until then, the studio offers only the confirmed trims.
7. **Live** (owner approval).
   - Run the full gate.
   - Run `npm run deploy -- --dry-run`, then `npm run deploy`, adding `--migrate` after a backup if stage 5 adds a migration.
   - Check every step live, and roll back with `npm run deploy -- --rollback` if a live check fails.

## Risks

- **Size:** about 39,000 lines of TSX are involved. Doing it in stages keeps each review small and each rollback simple.
- **Cover parity:** the screen and the print could drift apart. The golden files guard against this.
- **Tests that look for old selectors:** StepFooter and the library shelves are covered by e2e, and those specs are updated in the same PR as the change.
- **Speed:** the Cover studio and Editor stay lazy-loaded, and the size of the web bundle sent up front is checked at every stage.

---
name: volume-design-system
description: How to build or change any Volume user interface (apps/web, packages/ui) so it matches the design guide. Use before creating or editing a screen, component, design token, animation or UI copy in Volume, and when checking UI with screenshots at 1440 and 390 wide.
---

# Volume design system

`docs/03-design/DESIGN-SYSTEM.md` is the source of truth for look and feel. `docs/03-design/UX-SPEC.md` is the source of truth for screens and flows. This skill is the checklist; it does not repeat their values.

## 1. Read before you build

1. `docs/03-design/DESIGN-SYSTEM.md` in full (tokens, type, spacing, components, motion, states, accessibility, do and don't).
2. The section of `docs/03-design/UX-SPEC.md` for the screen you touch.
3. The existing tokens and components in `packages/ui`. Reuse before you create.

If the guide does not exist yet or does not cover your case, stop and ask; do not invent a new visual direction (phase 0 has the owner pick one of three directions first).

## 2. Tokens only

- Colours, type sizes, weights, line heights, spacing, radii, shadows, z-index and durations come from `packages/ui` tokens (exposed to Tailwind v4 through `@theme`).
- No raw hex, rgb or pixel values in screens. If a value is missing, add it to the tokens in `packages/ui` with a name that says what it is for, and note it for the owner.
- Book preview text uses the serif book fonts from `assets/fonts/` (OFL); interface text uses the UI font from the guide.

## 3. Every view has every state

- Loading (skeleton or progress that matches the final layout), empty (what it is, one clear action), error (what happened, what to do next, retry), success.
- Long jobs (research, writing, export) show live progress from the server's SSE stream, can be left and resumed, and say what they cost when AI is involved.
- Destructive actions ask for confirmation and say what will be lost.

## 4. Accessibility floor

- WCAG 2.2 AA contrast for text and controls in light and dark themes.
- Full keyboard use: logical Tab order, visible focus ring from the tokens, Escape closes dialogs and menus, focus returns to the trigger.
- Real labels on inputs, `aria-live` for job progress and toasts, landmarks on every page, alt text on images (covers included).
- Hit targets at least 44 by 44 px on touch layouts.

## 5. Motion rules

- Use `motion/react` with the durations and easings from the tokens. Motion explains a change (enter, exit, reorder, progress); it never decorates.
- Animate transform and opacity only. No layout thrash, no animation longer than the guide allows.
- Respect `prefers-reduced-motion`: swap movement for a fade or nothing.

## 6. Copy

Plain British English, short sentences, no em dashes, none of the AGENTS.md avoid words. Buttons say what they do ("Export pack", not "Submit"). The house-style hook warns on edits in `apps/web/` and `prototype/`.

## 7. Check with screenshots

For each screen you changed:

1. Start the dev server you need (and stop it when done).
2. Playwright screenshots at 1440 x 900 and 390 x 844, saved to `test-results/screens/<screen>-<width>.png` (git-ignored).
3. No console errors or warnings during load and the main interaction.
4. Keyboard pass: Tab through, check focus order and visibility, open and close any dialog with the keyboard.
5. Look at both screenshots yourself and compare with the guide: spacing rhythm, type scale, alignment, states.

Report each as PASS, FAIL or NOT TESTED with the file paths.

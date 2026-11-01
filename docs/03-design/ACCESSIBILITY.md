# Accessibility

Canonical visual/interaction requirements: [design system](DESIGN-SYSTEM.md#accessibility-floor). Keep semantic landmarks, one screen heading, labelled controls, visible focus, logical keyboard navigation, 44 px touch targets, reduced motion and readable light/dark contrast.

The shell keeps its skip link, focus-trapped mobile navigation and Escape dismissal. `tests/e2e/shell.spec.ts` checks the mobile menu focus trap and Escape with reduced motion.

## Evidence

| Check | Result | Source |
|---|---|---|
| Automated: axe-core 4.10, WCAG 2.2 AA rules, 25 routes at 375 to 2560 px wide, light and dark, production build on demo data | PASS, 0 violations (31 October 2026, after the design gap fixes: toast region role, profile photo label, focusable wizard step list on phones, 24 px citation targets) | Commit `851d0bd`; `.agent/HANDOFF.md`, 31 October 2026 (evening); before audit in ../reports/volume/gap-fixes/ |
| Automated: sign-in page heading contrast and axe | PASS, 13.7:1 light and 13.1:1 dark, axe clean (1 November 2026) | [audit record](../AUDIT.md), 1 November 2026 |
| Screen readers (VoiceOver, NVDA) | NOT TESTED | |
| Real phones and tablets | NOT TESTED | |
| Signed-in pages on real data in a browser | NOT TESTED | |

The axe run is a script outside the repository (axe-core is not a project dependency); automated rules catch only part of WCAG. These results do not establish full WCAG 2.2 AA conformance.

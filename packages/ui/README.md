# packages/ui

Design tokens for Volume, from the fused Volume direction (D-014, accepted). The rules behind every value are in `docs/03-design/DESIGN-SYSTEM.md`, section "Visual direction". Shared React components come later; the prototype proves them first.

## Files

| File | What it is |
|---|---|
| `tokens.json` | Source of truth: colours for light and dark (hex and role), fonts with licences, type scale, spacing, radii, shadows, motion and layout sizes |
| `tokens.css` | CSS custom properties (`--vol-*`). Light by default, dark with `data-theme="dark"` on `<html>`, and the system setting when no theme is set. Reduced motion shortens the duration tokens |
| `theme.css` | Tailwind v4 theme. Maps the tokens to utilities with `@theme inline`, sets the `dark:` variant to `data-theme`, and adds the signature keyframes |
| `glass.css` | Frost and glass tokens for the app shell (studio redesign, stage 1): the frost sky and hills, glass layers with their solid fallback, blur strengths, the floating menu's radii and the top bar title. Hand written, with its own utilities (`bg-glass`, `border-glass-edge`, `shadow-glass`, `rounded-panel`, `text-bar-title`) and classes (`vol-scene`, `vol-glass`, `vol-glass-bar`, `vol-glass-drawer`) |

`tokens.css` and `theme.css` are generated (`glass.css` is not, yet). Do not edit them by hand: change `tokens.json`, then run

```sh
node design/final/src/build.mjs
```

That regenerates both files, checks every contrast pair in both themes (it stops if any pair fails) and rebuilds the board at `design/final/volume-direction.html`.

## Use in apps/web

```css
@import "tailwindcss";
@import "../../packages/ui/tokens.css";
@import "../../packages/ui/theme.css";
@import "../../packages/ui/glass.css";
```

Then use the token utilities, for example `bg-canvas`, `bg-sheet`, `text-ink`, `text-ink-secondary`, `border-border-strong`, `bg-accent text-on-accent`, `text-claim`, `bg-select-wash`, `font-book`, `font-ui`, `text-title`, `text-prose`, `rounded-md`, `shadow-sheet`, `ease-page`, `animate-page-turn`.

- `theme.css` clears Tailwind's default colours, fonts, radii and shadows, so only Volume tokens exist. A class like `bg-red-500` does nothing on purpose.
- Spacing keeps Tailwind's 4 px step, which matches the 8 px grid (`p-2` is 8 px, `p-6` is 24 px).
- Utilities read the `--vol-*` variables at run time, so switching `data-theme` needs no rebuild.
- Durations are plain variables (`--vol-dur-fast`, `--vol-dur-base`, `--vol-dur-slow`); use them as `duration-(--vol-dur-base)`.

Checked on 4 October 2026: `theme.css` compiled with Tailwind 4.3.2 (`@tailwindcss/node`) and produced the expected utilities, including `dark:` on `data-theme`.

## Fonts

All SIL OFL 1.1: Literata (book text and titles), Schibsted Grotesk (interface), JetBrains Mono (model IDs and keys only). Self-host the WOFF2 files and each `OFL.txt` in `assets/fonts/`. Icons: Lucide (ISC).

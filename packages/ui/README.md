# packages/ui

Design tokens for Volume. Since 29 October 2026 the values follow the owner's approved "Volume Studio" design, frost edition: a misty mountain scene, glass panels, navy primary buttons, Manrope for the interface and Literata for book text. The rules behind every value are in `docs/03-design/DESIGN-SYSTEM.md`. The shared React components live in `apps/web/src/components/ui`.

## Files

| File | What it is |
|---|---|
| `tokens.json` | Source of truth: colours for light and dark (hex and role), fonts with licences, type scale, spacing, radii, shadows, motion and layout sizes |
| `tokens.css` | CSS custom properties (`--vol-*`). Light by default, dark with `data-theme="dark"` on `<html>`, and the system setting when no theme is set. Reduced motion shortens the duration tokens |
| `theme.css` | Tailwind v4 theme. Maps the tokens to utilities with `@theme inline`, sets the `dark:` variant to `data-theme`, and adds the signature keyframes |
| `glass.css` | The scene (`vol-scene` with hill classes `vol-m1` to `vol-m3` and the mist), glass surfaces (`vol-glass`, `vol-glass-2`, `vol-glass-bar`), the table class (`vol-tbl`) and the solid fallbacks: without backdrop-filter, or with less transparency asked for, the panel tokens turn solid. Hand written, every colour a token |

`tokens.css` and `theme.css` are generated (`glass.css` is not, yet). Do not edit them by hand: change `tokens.json`, then run

```sh
node design/final/src/build.mjs
```

That regenerates both files, checks every contrast pair in both themes (it stops if any pair fails) and rebuilds the board at `design/final/volume-direction.html`. To regenerate only the two token files, run `node design/final/src/build-tokens.mjs`; the contrast script has not been updated for the translucent glass colours yet.

## Use in apps/web

```css
@import "tailwindcss";
@import "../../packages/ui/tokens.css";
@import "../../packages/ui/theme.css";
@import "../../packages/ui/glass.css";
```

Then use the token utilities, for example `bg-canvas`, `bg-sheet`, `text-ink`, `text-ink-secondary`, `border-border-strong`, `bg-accent text-on-accent`, `text-claim`, `bg-select-wash`, `font-book`, `font-ui`, `text-title`, `text-prose`, `rounded-md`, `shadow-sheet`, `ease-page`, `animate-page-turn`. The approved design's own names are tokens too: `bg-panel`, `bg-panel-2`, `bg-soft`, `border-edge`, `border-line`, `text-ink-2`, `text-ink-3`, `bg-btn text-on-btn`, `bg-mint-wash text-mint-ink`, `bg-good-wash text-good`, `bg-amber-wash text-amber`, `bg-red-wash text-red`, `bg-blue-wash text-blue`, `bg-track`, `rounded-card` (22 px), `rounded-control` (12 px), `rounded-panel` (24 px), `shadow-glass`, `shadow-control`, `text-bar-title`, `text-step-title`. The old semantic names map onto the new palette (accent is now navy, accent-text is amber), so older screens follow without edits.

- `theme.css` clears Tailwind's default colours, fonts, radii and shadows, so only Volume tokens exist. A class like `bg-red-500` does nothing on purpose.
- Spacing keeps Tailwind's 4 px step, which matches the 8 px grid (`p-2` is 8 px, `p-6` is 24 px).
- Utilities read the `--vol-*` variables at run time, so switching `data-theme` needs no rebuild.
- Durations are plain variables (`--vol-dur-fast`, `--vol-dur-base`, `--vol-dur-slow`); use them as `duration-(--vol-dur-base)`.

Checked on 4 October 2026: `theme.css` compiled with Tailwind 4.3.2 (`@tailwindcss/node`) and produced the expected utilities, including `dark:` on `data-theme`.

## Fonts

All SIL OFL 1.1: Literata (book text and titles), Manrope (interface), JetBrains Mono (model IDs and keys only). Self-host the WOFF2 files and each `OFL.txt` in `assets/fonts/`. Icons: Lucide (ISC).

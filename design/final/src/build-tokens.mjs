import { fileURLToPath } from 'node:url'
// Generates packages/ui/tokens.css and packages/ui/theme.css from packages/ui/tokens.json.
import fs from 'node:fs'
const ROOT = fileURLToPath(new URL('../../../packages/ui', import.meta.url))
const t = JSON.parse(fs.readFileSync(`${ROOT}/tokens.json`, 'utf8'))
const L = t.color.light, D = t.color.dark
const colourBlock = (c, ind) => Object.entries(c).map(([k, v]) => `${ind}--vol-${k}: ${v.value};`).join('\n')
const shadowBlock = (s, ind) => Object.entries(s).map(([k, v]) => `${ind}--vol-shadow-${k}: ${v.value};`).join('\n')

const shared = [
  '  /* Fonts (self-host the OFL files in assets/fonts/) */',
  ...Object.entries(t.font).map(([k, v]) => `  --vol-font-${k}: ${v.value};`),
  '',
  '  /* Type scale: size / line height / weight / tracking */',
  ...Object.entries(t.type).flatMap(([k, v]) => [
    `  --vol-type-${k}-size: ${v.size};`,
    `  --vol-type-${k}-line: ${v.line};`,
    `  --vol-type-${k}-weight: ${v.weight};`,
    `  --vol-type-${k}-tracking: ${v.tracking};`,
  ]),
  '',
  '  /* Spacing (8 px grid, 4 only inside dense controls) */',
  ...Object.entries(t.space).map(([k, v]) => `  --vol-space-${k}: ${v};`),
  '',
  '  /* Radii */',
  ...Object.entries(t.radius).map(([k, v]) => `  --vol-radius-${k}: ${v.value};`),
  '',
  '  /* Motion */',
  ...Object.entries(t.motion.duration).map(([k, v]) => `  --vol-dur-${k}: ${v};`),
  ...Object.entries(t.motion.easing).map(([k, v]) => `  --vol-ease-${k}: ${v.value};`),
  '',
  '  /* Layout */',
  ...Object.entries(t.layout).map(([k, v]) => `  --vol-${k}: ${v};`),
].join('\n')

const css = `/* Volume design tokens, generated from tokens.json. Do not edit by hand; edit tokens.json and regenerate.
   Light is the default. Dark applies with [data-theme="dark"] on <html>, or with the system setting
   when no data-theme is set. Contrast pairs are listed in docs/03-design/DESIGN-SYSTEM.md (Visual direction). */

:root,
[data-theme="light"] {
  color-scheme: light;
${colourBlock(L, '  ')}
${shadowBlock(t.shadow.light, '  ')}
  --vol-scrim-opacity: 0.4;
}

[data-theme="dark"] {
  color-scheme: dark;
${colourBlock(D, '  ')}
${shadowBlock(t.shadow.dark, '  ')}
  --vol-scrim-opacity: 0.6;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${colourBlock(D, '    ')}
${shadowBlock(t.shadow.dark, '    ')}
    --vol-scrim-opacity: 0.6;
  }
}

:root {
${shared}
}

/* Reduced motion: transitions become a short fade or nothing. Components read these. */
@media (prefers-reduced-motion: reduce) {
  :root {
    --vol-dur-fast: 0ms;
    --vol-dur-base: 120ms;
    --vol-dur-slow: 120ms;
  }
}
`
fs.writeFileSync(`${ROOT}/tokens.css`, css)

const theme = `/* Tailwind v4 theme for Volume, generated from tokens.json. Import after tailwindcss and tokens.css:
     @import "tailwindcss";
     @import "@volume/ui/tokens.css";
     @import "@volume/ui/theme.css";
   Utilities resolve to the --vol-* variables at run time (@theme inline), so the theme switch needs no rebuild.
   Spacing uses Tailwind's default 4 px step (p-1 = 4px, p-2 = 8px, p-6 = 24px), which matches the 8 px grid. */

@custom-variant dark (&:where([data-theme=dark], [data-theme=dark] *));

@theme inline {
  --color-*: initial;
  --color-transparent: transparent;
  --color-current: currentColor;
${Object.keys(L).map(k => `  --color-${k}: var(--vol-${k});`).join('\n')}

  --font-*: initial;
${Object.keys(t.font).map(k => `  --font-${k}: var(--vol-font-${k});`).join('\n')}

${Object.keys(t.type).flatMap(k => [
  `  --text-${k}: var(--vol-type-${k}-size);`,
  `  --text-${k}--line-height: var(--vol-type-${k}-line);`,
  `  --text-${k}--font-weight: var(--vol-type-${k}-weight);`,
  `  --text-${k}--letter-spacing: var(--vol-type-${k}-tracking);`,
]).join('\n')}

  --radius-*: initial;
${Object.keys(t.radius).map(k => `  --radius-${k}: var(--vol-radius-${k});`).join('\n')}

  --shadow-*: initial;
${Object.keys(t.shadow.light).filter(k => k !== 'none').map(k => `  --shadow-${k}: var(--vol-shadow-${k});`).join('\n')}

${Object.keys(t.motion.easing).map(k => `  --ease-${k}: var(--vol-ease-${k});`).join('\n')}

  --animate-ink-fill: vol-ink-fill var(--vol-dur-slow) var(--vol-ease-out) both;
  --animate-page-turn: vol-page-turn var(--vol-dur-slow) var(--vol-ease-page) both;
  --animate-ink-in: vol-ink-in var(--vol-dur-base) var(--vol-ease-out) both;
  --animate-pencil: vol-pencil var(--vol-dur-base) var(--vol-ease-out) both;
  --animate-pencil-x: vol-pencil-x var(--vol-dur-base) var(--vol-ease-out) both;
}

/* Signature motion. Transform and opacity only. Reduced motion swaps each for a fade or nothing. */
@keyframes vol-ink-fill { from { transform: scaleX(var(--vol-fill-from, 0)); } to { transform: scaleX(var(--vol-fill-to, 1)); } }
@keyframes vol-page-turn { from { transform: perspective(600px) rotateY(-80deg); opacity: 0; } to { transform: perspective(600px) rotateY(0); opacity: 1; } }
@keyframes vol-ink-in { from { opacity: 0; transform: translateY(2px); } to { opacity: 1; transform: none; } }
@keyframes vol-pencil { from { transform: scaleY(0); } to { transform: scaleY(1); } }
@keyframes vol-pencil-x { from { transform: scaleX(0); } to { transform: scaleX(1); } }

@media (prefers-reduced-motion: reduce) {
  @keyframes vol-ink-fill { from { opacity: 1; } to { opacity: 1; } }
  @keyframes vol-page-turn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes vol-ink-in { from { opacity: 0; } to { opacity: 1; } }
  @keyframes vol-pencil { from { opacity: 1; } to { opacity: 1; } }
  @keyframes vol-pencil-x { from { opacity: 1; } to { opacity: 1; } }
}
`
fs.writeFileSync(`${ROOT}/theme.css`, theme)
console.log('wrote tokens.css', css.length, 'theme.css', theme.length)

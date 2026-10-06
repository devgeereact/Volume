// WCAG 2.2 contrast for every text/background pair Volume uses, both themes.
import fs from 'node:fs'
const t = JSON.parse(fs.readFileSync(new URL('../../../packages/ui/tokens.json', import.meta.url), 'utf8'))
const lum = hex => {
  const n = hex.replace('#', '')
  const c = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) / 255).map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
// [foreground, background, use, minimum]
const pairs = [
  ['ink', 'canvas', 'Body text on paper', 4.5],
  ['ink', 'sheet', 'Body text on sheet', 4.5],
  ['ink', 'sunken', 'Text on sunken rows', 4.5],
  ['ink', 'raised', 'Text in menus and modal', 4.5],
  ['ink-secondary', 'canvas', 'Secondary on paper', 4.5],
  ['ink-secondary', 'sheet', 'Secondary on sheet', 4.5],
  ['ink-secondary', 'sunken', 'Secondary on sunken', 4.5],
  ['ink-secondary', 'raised', 'Secondary in menus', 4.5],
  ['ink-tertiary', 'canvas', 'Hints on paper', 4.5],
  ['ink-tertiary', 'sheet', 'Hints and placeholders on sheet', 4.5],
  ['ink-tertiary', 'raised', 'Hints in menus', 4.5],
  ['ink-tertiary', 'sunken', 'Hints on sunken', 4.5],
  ['ink-on-spine', 'spine', 'Nav text', 4.5],
  ['ink-on-spine', 'spine-raised', 'Selected nav item', 4.5],
  ['ink-on-spine-muted', 'spine', 'Nav secondary', 4.5],
  ['ink-on-spine-muted', 'spine-raised', 'Nav secondary on selected', 4.5],
  ['on-accent', 'accent', 'Primary button label', 4.5],
  ['on-accent', 'accent-hover', 'Primary button hover', 4.5],
  ['on-accent', 'accent-pressed', 'Primary button pressed', 4.5],
  ['accent-text', 'canvas', 'Live label on paper', 4.5],
  ['accent-text', 'sheet', 'Live label on sheet', 4.5],
  ['accent-text', 'accent-wash', 'Needs attention note', 4.5],
  ['ink', 'accent-wash', 'Body text in live panel', 4.5],
  ['ink-secondary', 'accent-wash', 'Secondary in live panel', 4.5],
  ['select', 'sheet', 'Link and selection text', 4.5],
  ['select', 'canvas', 'Link on paper', 4.5],
  ['select', 'select-wash', 'Selected item label', 4.5],
  ['ink', 'select-wash', 'Body text on selected row', 4.5],
  ['claim', 'sheet', 'Claim and error text', 4.5],
  ['claim', 'canvas', 'Error on paper', 4.5],
  ['claim', 'claim-wash', 'Claim note', 4.5],
  ['ink', 'claim-wash', 'Body text in claim note', 4.5],
  ['on-claim', 'claim', 'Destructive button label', 4.5],
  ['success', 'sheet', 'Check passed text', 4.5],
  ['success', 'success-wash', 'Success toast text', 4.5],
  ['ink', 'success-wash', 'Body text in success toast', 4.5],
  ['ink-on-spine', 'spine', 'Tooltip text', 4.5],
  ['ink-disabled', 'sheet', 'Disabled label (exempt, info)', 0],
  ['border-strong', 'sheet', 'Input boundary (non-text)', 3],
  ['border-strong', 'canvas', 'Control boundary on paper (non-text)', 3],
  ['select', 'canvas', 'Focus ring on paper (non-text)', 3],
  ['select', 'sheet', 'Focus ring on sheet (non-text)', 3],
  ['progress', 'sunken', 'Progress fill vs track (non-text)', 3],
  ['progress', 'sheet', 'Progress fill vs sheet (non-text)', 3],
  ['accent', 'spine', 'Live dot on spine (non-text)', 3],
]
const out = { light: [], dark: [] }
let fails = 0
for (const theme of ['light', 'dark']) {
  const c = t.color[theme]
  for (const [fg, bg, use, min] of pairs) {
    const r = ratio(c[fg].value, c[bg].value)
    const pass = min === 0 ? 'info' : r >= min ? 'PASS' : 'FAIL'
    if (pass === 'FAIL') fails++
    out[theme].push({ fg, bg, fgHex: c[fg].value, bgHex: c[bg].value, use, ratio: Math.round(r * 100) / 100, min, pass })
  }
}
fs.writeFileSync(new URL('./contrast.json', import.meta.url), JSON.stringify(out, null, 2))
for (const theme of ['light', 'dark']) {
  console.log(`\n${theme}`)
  for (const p of out[theme]) console.log(`${p.pass.padEnd(4)} ${String(p.ratio).padStart(5)}  ${p.fg} on ${p.bg}  (${p.use})`)
}
console.log('\nfails', fails)

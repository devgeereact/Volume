import { fileURLToPath } from 'node:url'
// Builds everything from packages/ui/tokens.json:
//   1. packages/ui/tokens.css and packages/ui/theme.css (build-tokens.mjs)
//   2. contrast.json (contrast.mjs, prints PASS/FAIL per pair)
//   3. design/final/volume-direction.html from volume-direction.template.html
// Run: node design/final/src/build.mjs
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
const here = fileURLToPath(new URL('.', import.meta.url))
const ROOT = fileURLToPath(new URL('../../../', import.meta.url))
execFileSync(process.execPath, [here + 'build-tokens.mjs'], { stdio: 'inherit' })
const report = execFileSync(process.execPath, [here + 'contrast.mjs']).toString()
if (/fails [1-9]/.test(report)) { console.log(report); throw new Error('Contrast failures, board not built') }

const t = JSON.parse(fs.readFileSync(ROOT + 'packages/ui/tokens.json', 'utf8'))
const contrast = JSON.parse(fs.readFileSync(here + 'contrast.json', 'utf8'))
const tokensCss = fs.readFileSync(ROOT + 'packages/ui/tokens.css', 'utf8')
let html = fs.readFileSync(here + 'volume-direction.template.html', 'utf8')

const swatches = Object.entries(t.color.light).map(([k, v]) =>
  `<div class="sw"><i style="background:var(--vol-${k})"></i><b>${k}</b><span>${v.value} / ${t.color.dark[k].value}</span><span>${v.role}</span></div>`).join('\n')

const fam = { book: 'var(--vol-font-book)', ui: 'var(--vol-font-ui)' }
const sample = {
  display: 'The Calm Ward', title: 'Library', figure: '21,340 words', heading: 'The Night-to-Day Handover',
  subhead: 'Word targets', body: 'Sections write in order, one at a time, with checks after each.',
  label: 'Approve blueprint', small: 'Harni Muharami, updated today at 14:12', caption: 'Chapter 6 of 10',
  prose: 'So the handover begins not with the patient list but with a breath.',
  'prose-sm': 'Every shift on a busy ward holds moments that could tip into conflict.',
}
const typescale = Object.entries(t.type).map(([k, v]) =>
  `<div><small>${k}</small><span style="font:${v.weight} ${v.size}/${v.line} ${fam[v.family]};letter-spacing:${v.tracking}">${sample[k]}</span><small>${v.family === 'book' ? 'Literata' : 'Schibsted Grotesk'} ${v.size}/${v.line}, ${v.weight}</small></div>`).join('\n')

const table = theme => `<table class="ct"><caption>${theme === 'light' ? 'Light' : 'Dark'} theme</caption>
<thead><tr><th>Sample</th><th>Text on background</th><th class="r">Ratio</th><th class="r">Need</th><th>Result</th></tr></thead><tbody>
${contrast[theme].map(p => `<tr><td class="s"><span style="color:${p.fgHex};background:${p.bgHex}">Aa</span></td><td>${p.fg} on ${p.bg}</td><td class="r">${p.ratio.toFixed(2)}</td><td class="r">${p.min ? p.min + ':1' : 'none'}</td><td class="${p.pass === 'PASS' ? 'p' : ''}">${p.pass === 'info' ? 'Exempt' : p.pass}</td></tr>`).join('\n')}
</tbody></table>`

const books = [
  ['cv-none', 'Milo and the Moon Kite', 'Picture book for ages 3 to 6', 'Tobi Rhymes', 0, 'Idea', 'saved', 'None yet', '$0.00', '2 October'],
  ['cv-none', 'Night Shift Survival', 'Sleep, Food and Recovery for Healthcare Workers', 'Harni Muharami', 1, 'Research', '18 sources so far', 'None yet', '$0.62', 'Today, 13:50'],
  ['cv-calm', 'The Calm Ward', 'De-escalation and Compassion in NHS Practice', 'Harni Muharami', 2, 'Blueprint', 'ready to approve', '0 of 42,000', '$0.46', 'Today, 14:12'],
  ['cv-hand', 'Handover', 'Clear Communication for Busy Wards', 'Harni Muharami', 3, 'Writing', 'chapter 6 of 10', '21,340 of 38,000', '$1.92', 'Today, 14:31'],
  ['cv-charge', 'The New Charge Nurse', 'Your First Year Leading a Shift', 'Harni Muharami', 4, 'Editing', 'line edit 6 of 10', '44,120', '$3.10', 'Yesterday'],
  ['cv-speak', 'Speaking Up Safely', "A Nurse's Guide to Raising Concerns", 'Harni Muharami', 5, 'Cover', '3 concepts to compare', '36,800', '$2.74', '1 October'],
  ['cv-sour', 'Sourdough on a Weeknight', 'Slow Bread for Busy People', 'Ada Fenwick', 6, 'Export', '2 preflight warnings', '29,450', '$2.18', '28 September'],
  ['cv-herb', 'Windowsill Herbs', 'Grow Fresh Herbs in a Small UK Home (demo)', 'Sam Rowe', 7, 'Published', '12 September', '24,600', '$1.64', '12 September'],
]
// Reuse the exact cover markup from the Library frame for the ledger thumbnails.
const coverHtml = cls => { const m = html.match(new RegExp('<div class="cv ' + cls + '"[^>]*>[\\s\\S]*?</div>')); return m ? m[0] : '' }
const ticks = n => Array.from({ length: 8 }, (_, i) => `<i class="${i < n ? 'd' : i === n ? 'n' : ''}"></i>`).join('')
const ledger = `<table class="ledger"><thead><tr><th>Book</th><th>Pen name</th><th>Stage</th><th class="r">Words</th><th class="r">AI spend</th><th class="r">Updated</th></tr></thead><tbody>
${books.map(b => `<tr${b[1] === 'The Calm Ward' ? ' aria-selected="true"' : ''}><td><div class="bk">${b[0] === 'cv-none' ? '<div class="cv cv-none" role="img" aria-label="No cover yet"></div>' : coverHtml(b[0])}<div><b>${b[1]}</b><small>${b[2]}</small></div></div></td><td>${b[3]}</td><td><div class="ticks" aria-hidden="true">${ticks(b[4])}</div><span class="st"><b>${b[5]}</b>, ${b[6]}</span></td><td class="r">${b[7]}</td><td class="r">${b[8]}</td><td class="r">${b[9]}</td></tr>`).join('\n')}
</tbody></table>`

html = html
  .replace('/* @tokens */', tokensCss)
  .replace('<!-- @swatches -->', swatches)
  .replace('<!-- @typescale -->', typescale)
  .replace('<!-- @contrast -->', table('light') + '\n' + table('dark'))
  .replace('<!-- @ledger -->', ledger)
for (const m of ['@tokens', '@swatches', '@typescale', '@contrast', '@ledger']) if (html.includes(m)) throw new Error('marker left: ' + m)
fs.writeFileSync(ROOT + 'design/final/volume-direction.html', html)
console.log(report.split('\n').slice(-2).join(' '), '| board written', html.length, 'bytes')

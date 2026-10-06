#!/usr/bin/env node
// Volume house-style checker. No dependencies, Node 20 or later.
//
// Usage:
//   node check-style.mjs [options] <file-or-folder> [...]
//
// Options:
//   --rules=emdash,banned,agents,spelling,titlecase,guardrails,habits   rules to run (default: all;
//                     titlecase and habits run by default only on book text outside the project folders)
//   --config=<path>   house-style JSON (default: <root>/config/house-style.json)
//   --root=<path>     project root (default: found from this script's location)
//   --json            print one JSON object instead of text lines
//   --quiet           print findings only, no summary
//
// Exit codes: 0 clean, 1 findings, 2 usage error or config missing with nothing else found.
//
// Skips: anything under docs/source-drafts/ (owner's drafts, source material, not rules),
// node_modules, dist, build, .git and data/.
// Ignore markers inside a file:
//   a line containing "house-style: ignore" is skipped;
//   lines between "house-style:off" and "house-style:on" (any comment syntax) are skipped.
//
// The config is read at run time because config/house-style.json is owned by another agent.
// The reader accepts several shapes; see readConfig() below.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const EM_DASH = '\u2014';
const ALL_RULES = ['emdash', 'banned', 'agents', 'spelling', 'titlecase', 'guardrails', 'habits'];
// AGENTS.md, "Writing for people". Applied to every checked file as rule "agents".
const AGENTS_WORDS = [
  'leverage', 'empower', 'showcase', 'transformative', 'impactful', 'cutting-edge',
  'revolutionise', 'synergy', 'groundbreaking', 'utilise', 'elevate', 'unlock', 'seamless',
];
const DEFAULT_MINOR_WORDS = [
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'as', 'at', 'by', 'in',
  'of', 'off', 'on', 'per', 'to', 'up', 'via', 'with', 'from', 'into', 'onto', 'over', 'vs',
];
const TEXT_EXT = new Set(['.md', '.mdx', '.txt', '.json', '.yml', '.yaml', '.html', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.css']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'coverage', 'test-results', 'playwright-report']);

// ---------- arguments ----------
const args = process.argv.slice(2);
const opts = { rules: new Set(ALL_RULES), rulesExplicit: false, json: false, quiet: false, config: null, root: null, targets: [] };
for (const a of args) {
  if (a === '--json') opts.json = true;
  else if (a === '--quiet') opts.quiet = true;
  else if (a === '-h' || a === '--help') { usage(0); }
  else if (a.startsWith('--rules=')) {
    const list = a.slice(8).split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
    const bad = list.filter((r) => !ALL_RULES.includes(r));
    if (bad.length) { console.error(`Unknown rule(s): ${bad.join(', ')}. Known: ${ALL_RULES.join(', ')}`); process.exit(2); }
    opts.rules = new Set(list);
    opts.rulesExplicit = true;
  } else if (a.startsWith('--config=')) opts.config = a.slice(9);
  else if (a.startsWith('--root=')) opts.root = a.slice(7);
  else if (a.startsWith('--')) { console.error(`Unknown option ${a}`); usage(2); }
  else opts.targets.push(a);
}
if (!opts.targets.length) usage(2);

function usage(code) {
  const msg = 'Usage: node check-style.mjs [--rules=emdash,banned,agents,spelling,titlecase,guardrails,habits] [--config=path] [--root=path] [--json] [--quiet] <file-or-folder> [...]';
  (code ? console.error : console.log)(msg);
  process.exit(code);
}

// ---------- root and config ----------
function findRoot() {
  if (opts.root) return path.resolve(opts.root);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const fromScript = path.resolve(here, '..', '..', '..', '..');
  if (fs.existsSync(path.join(fromScript, 'AGENTS.md'))) return fromScript;
  if (process.env.CLAUDE_PROJECT_DIR) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'AGENTS.md'))) return dir;
    dir = path.dirname(dir);
  }
  return process.cwd();
}
const realOr = (p) => { try { return fs.realpathSync(p); } catch { return p; } };
const ROOT = realOr(findRoot());
const CONFIG_PATH = opts.config ? path.resolve(opts.config) : path.join(ROOT, 'config', 'house-style.json');

const norm = (k) => String(k).toLowerCase().replace(/[^a-z0-9]/g, '');
const asText = (v) => (typeof v === 'string' ? v : v && typeof v === 'object'
  ? (v.phrase ?? v.text ?? v.term ?? v.value ?? v.word ?? v.pattern ?? null) : null);

function readConfig() {
  const out = { missing: false, error: null, banned: [], spelling: [], emdashReplacement: null, enDash: null, titleCase: null, guardrails: [], inflections: null, dropE: true, exceptions: new Map(), habits: null };
  if (!fs.existsSync(CONFIG_PATH)) { out.missing = true; return out; }
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); } catch (e) { out.error = `cannot parse ${CONFIG_PATH}: ${e.message}`; return out; }

  const addBanned = (v, category) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach((x) => addBanned(x, category)); return; }
    if (typeof v === 'string') { out.banned.push({ phrase: v, replacement: null, category }); return; }
    if (typeof v === 'object') {
      const t = asText(v);
      if (t && typeof t === 'string') {
        out.banned.push({ phrase: t, replacement: v.replacement ?? v.instead ?? v.suggest ?? v.suggestion ?? v.use ?? null, category: v.category ?? category, regex: Boolean(v.regex || v.isRegex) });
        return;
      }
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string' && !['description', 'note', 'notes', 'source', 'comment'].includes(norm(k))) {
          // map form: { "phrase": "replacement" }
          out.banned.push({ phrase: k, replacement: val || null, category });
        } else if (val && typeof val === 'object') addBanned(val, k);
      }
    }
  };
  const addSpelling = (v, kind = 'spelling') => {
    if (v == null) return;
    if (Array.isArray(v)) {
      for (const x of v) {
        if (Array.isArray(x) && x.length >= 2) out.spelling.push({ us: String(x[0]), uk: String(x[1]), kind });
        else if (x && typeof x === 'object') {
          const us = x.us ?? x.from ?? x.american ?? x.wrong;
          const uk = x.uk ?? x.to ?? x.british ?? x.right;
          if (us && uk) out.spelling.push({ us: String(us), uk: String(uk), kind });
        }
      }
      return;
    }
    if (typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (typeof val === 'string') { if (!['description', 'note', 'notes', 'source', 'comment'].includes(norm(k))) out.spelling.push({ us: k, uk: val, kind }); }
        else addSpelling(val, kind);
      }
    }
  };
  const addGuardrails = (v, label) => {
    if (v == null) return;
    if (Array.isArray(v)) { v.forEach((x) => addGuardrails(x, label)); return; }
    if (typeof v === 'string') { out.guardrails.push({ pattern: v, flags: 'i', message: label || `matches guardrail pattern /${v}/` }); return; }
    if (typeof v === 'object') {
      const p = v.pattern ?? v.regex ?? v.re;
      if (typeof p === 'string') {
        out.guardrails.push({ pattern: p, flags: typeof v.flags === 'string' ? v.flags : 'i', message: v.message ?? v.reason ?? v.label ?? v.name ?? label ?? `matches guardrail pattern /${p}/`, severity: v.severity ?? v.action, id: v.id });
        return;
      }
      for (const [k, val] of Object.entries(v)) if (val && typeof val === 'object') addGuardrails(val, k);
    }
  };
  const setTitleCase = (v) => {
    if (typeof v === 'string') { out.titleCase = { style: v.toLowerCase(), minor: DEFAULT_MINOR_WORDS }; return; }
    if (v && typeof v === 'object') {
      const style = String(v.style ?? v.case ?? v.headings ?? v.mode ?? v.value ?? '').toLowerCase();
      let minor = v.minorWords ?? v.smallWords ?? v.lowercase ?? v.lowercaseWords ?? v.minor ?? DEFAULT_MINOR_WORDS;
      minor = Array.isArray(minor) ? minor.map((m) => String(m).toLowerCase()) : DEFAULT_MINOR_WORDS;
      // "capitalise-every-word" or minorWordsMode "off..." means minor words are capitalised too
      const every = /every/i.test(String(v.mode ?? '')) || /^off/i.test(String(v.minorWordsMode ?? ''));
      if (style) out.titleCase = { style, minor: every ? [] : minor };
    }
  };

  const walk = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj)) {
      const n = norm(k);
      if (n.includes('matching') || n.includes('options') || n.includes('settings')) {
        // e.g. bannedPhraseMatching: { inflections: ["s","es","ed","ing","d"], ... }
        if (n.includes('banned') && v && typeof v === 'object') {
          const inf = v.singleWordInflections ?? v.inflections ?? v.suffixes ?? v.inflectionSuffixes;
          if (typeof v.dropFinalEBeforeSuffix === 'boolean') out.dropE = v.dropFinalEBeforeSuffix;
          if (Array.isArray(inf)) out.inflections = inf.map(String);
          else if (inf === false) out.inflections = [];
        }
      } else if (n.includes('exception')) {
        // e.g. spellingExceptions: { us: note } -> these words are context dependent, reported as info only
        if (v && typeof v === 'object' && !Array.isArray(v)) for (const [w, note] of Object.entries(v)) out.exceptions.set(w.toLowerCase(), typeof note === 'string' ? note : '');
        else if (Array.isArray(v)) for (const w of v) out.exceptions.set(String(w).toLowerCase(), '');
      } else if (n.includes('banned') || n.includes('forbiddenphrase') || n === 'avoid' || n === 'avoidphrases') addBanned(v, k);
      else if (n.includes('phrasing')) addSpelling(v, 'phrasing');
      else if (n.includes('spelling') || n.includes('ustouk') || n === 'usuk') addSpelling(v, 'spelling');
      else if (n.includes('emdash')) {
        if (v && typeof v === 'object') out.emdashReplacement = v.replacement ?? v.use ?? v.instead ?? null;
      } else if (n.includes('endash')) {
        if (v && typeof v === 'object' && (v.allowedAsDash === false || v.allowed === false)) out.enDash = { replacement: v.replacement ?? null, ranges: v.allowedInNumberRanges !== false };
      } else if (n.includes('titlecase') || n.includes('headingcase') || n === 'capitalisation' || n === 'capitalization') setTitleCase(v);
      else if (n.includes('guardrail') || n === 'patterns' || n === 'regexpatterns' || n === 'forbiddenpatterns') addGuardrails(v, null);
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v);
    }
  };
  walk(cfg);
  // aiHabits: scaffolding paragraph openers per section and illustrative disclaimers per file (same config as packages/core)
  const h = cfg && typeof cfg.aiHabits === 'object' ? cfg.aiHabits : null;
  if (h) {
    const res = (list) => (Array.isArray(list) ? list : []).flatMap((x) => {
      const src = x && typeof x === 'object' ? (x.regex ?? x.pattern) : null;
      if (typeof src !== 'string') return [];
      try { return [{ id: x.id ?? src, label: x.label ?? x.id ?? src, re: new RegExp(src, 'iu') }]; } catch { return []; }
    });
    const po = h.paragraphOpeners ?? {};
    const di = h.illustrativeDisclaimers ?? {};
    out.habits = {
      openers: res(po.openers), maxOpeners: typeof po.maxPerSection === 'number' ? po.maxPerSection : 2,
      disclaimers: res(di.markers), maxDisclaimers: typeof di.maxPerBook === 'number' ? di.maxPerBook : 2,
    };
  }
  // de-duplicate banned phrases
  const seen = new Set();
  out.banned = out.banned.filter((b) => { const key = b.phrase.toLowerCase(); if (!b.phrase.trim() || seen.has(key)) return false; seen.add(key); return true; });
  return out;
}
const CONFIG = readConfig();

// ---------- matching helpers ----------
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function phraseRe(phrase, isRegex, inflections = [], dropE = false) {
  if (isRegex) { try { return new RegExp(phrase, 'giu'); } catch { return null; } }
  const t = phrase.trim();
  let body = escapeRe(t).replace(/\s+/g, '\\s+').replace(/'/g, "['\u2019]");
  // single words also match simple inflections (config: bannedPhraseMatching)
  if (inflections.length && /^[\p{L}-]+$/u.test(t)) {
    const suf = `(?:${inflections.map(escapeRe).join('|')})`;
    // dropFinalEBeforeSuffix: "ensure" also matches "ensuring"; the e-less stem needs a suffix, so "dive" never matches "div"
    if (dropE && /e$/i.test(t) && t.length > 2) body = `(?:${body}${suf}?|${escapeRe(t.slice(0, -1))}(?:ing|ed))`;
    else body += `${suf}?`;
  }
  const pre = /^[\p{L}\p{N}_]/u.test(t) ? '(?<![\\p{L}\\p{N}_])' : '';
  const post = /[\p{L}\p{N}_]$/u.test(t) ? '(?![\\p{L}\\p{N}_])' : '';
  return new RegExp(pre + body + post, 'giu');
}
const INFLECT = CONFIG.inflections ?? ['s', 'es', 'ed', 'ing', 'd'];
const bannedRes = CONFIG.banned.map((b) => ({ ...b, re: phraseRe(b.phrase, b.regex, INFLECT, CONFIG.dropE) })).filter((b) => b.re);
const agentsRes = AGENTS_WORDS.map((w) => ({ phrase: w, re: phraseRe(w, false, ['s', 'es', 'ed', 'ing', 'd'], true) }));
const spellingRes = CONFIG.spelling.map((s) => ({ ...s, re: phraseRe(s.us, false) }));
const guardRes = CONFIG.guardrails.map((g) => {
  try { return { ...g, re: new RegExp(g.pattern, (g.flags.includes('g') ? g.flags : g.flags + 'g').replace(/[^dgimsuvy]/g, '')) }; } catch { return null; }
}).filter(Boolean);

function checkHeadingCase(text, tc) {
  const words = text.replace(/[*_`]/g, '').split(/\s+/).filter((w) => /\p{L}/u.test(w));
  if (words.length < 2) return null;
  const isCap = (w) => /^[^\p{L}]*\p{Lu}/u.test(w);
  const bare = (w) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '').toLowerCase();
  if (tc.style.startsWith('title')) {
    const wrong = words.filter((w, i) => i > 0 && i < words.length - 1 && !tc.minor.includes(bare(w)) && /^[^\p{L}]*\p{Ll}/u.test(w));
    if (!isCap(words[0])) wrong.unshift(words[0]);
    return wrong.length ? `heading not in title case (check: ${wrong.slice(0, 4).join(', ')})` : null;
  }
  if (tc.style.startsWith('sentence')) {
    const rest = words.slice(1).filter((w) => !tc.minor.includes(bare(w)));
    const caps = rest.filter((w) => isCap(w) && !/^[^\p{L}]*\p{Lu}{2,}/u.test(w));
    return rest.length >= 2 && caps.length / rest.length > 0.5 ? 'heading looks like Title Case; house style is sentence case' : null;
  }
  return null;
}

// ---------- file walk ----------
function relToRoot(abs) { return path.relative(ROOT, realOr(abs)).split(path.sep).join('/'); }
function isSourceDraft(abs) { const r = relToRoot(abs); return r === 'docs/source-drafts' || r.startsWith('docs/source-drafts/'); }
function isDataDir(abs) { const r = relToRoot(abs); return r === 'data' || r.startsWith('data/'); }

const files = [];
const skipped = [];
function collect(target) {
  const abs = path.resolve(target);
  if (!fs.existsSync(abs)) { console.error(`Not found: ${target}`); process.exitCode = 2; return; }
  if (isSourceDraft(abs)) { skipped.push({ file: target, reason: 'docs/source-drafts/ is source material, not checked' }); return; }
  if (isDataDir(abs)) { skipped.push({ file: target, reason: 'data/ is private, not read' }); return; }
  const st = fs.statSync(abs);
  if (st.isDirectory()) {
    for (const name of fs.readdirSync(abs)) {
      if (SKIP_DIRS.has(name)) continue;
      const child = path.join(abs, name);
      const cst = fs.statSync(child);
      if (cst.isDirectory()) collect(child);
      else if (TEXT_EXT.has(path.extname(name).toLowerCase())) collect(child);
    }
  } else files.push(abs);
}
opts.targets.forEach(collect);

// ---------- check ----------
const findings = [];
for (const abs of files) {
  const display = path.relative(process.cwd(), abs) || abs;
  const isMarkdown = /\.(md|mdx|txt)$/i.test(abs);
  // Title case is for book titles and headings, so by default it skips project docs and code folders.
  const relPath = relToRoot(abs);
  const isBookText = relPath.startsWith('..') || !/^(docs|prompts|apps|packages|config|tests|scripts|\.claude|\.agent)\/|^[^/]+\.md$/.test(relPath);
  let lines;
  try { lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/); } catch (e) { console.error(`Cannot read ${display}: ${e.message}`); process.exitCode = 2; continue; }
  let off = false;
  let fence = false;
  // habits: paragraph openers per '# ' section, illustrative disclaimers per file (not inside ::: copyright)
  const runHabits = opts.rules.has('habits') && CONFIG.habits && isMarkdown && (opts.rulesExplicit || isBookText);
  const openerHits = [];
  const disclaimerHits = [];
  let habitSection = 0;
  let inCopyright = false;
  lines.forEach((line, i) => {
    const ln = i + 1;
    if (/house-style:\s*off/i.test(line)) { off = true; return; }
    if (/house-style:\s*on/i.test(line)) { off = false; return; }
    if (off || /house-style:\s*ignore/i.test(line)) return;
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; }
    const add = (rule, col, message, severity = 'warn') => findings.push({ file: display, line: ln, col, rule, severity, message });

    if (opts.rules.has('emdash')) {
      let idx = line.indexOf(EM_DASH);
      while (idx !== -1) {
        add('emdash', idx + 1, `em dash found; ${CONFIG.emdashReplacement ? `use ${CONFIG.emdashReplacement}` : 'use a comma, colon, brackets or a full stop'}`, 'error');
        idx = line.indexOf(EM_DASH, idx + 1);
      }
      if (CONFIG.enDash) {
        const re = /\u2013/g;
        let m;
        while ((m = re.exec(line)) !== null) {
          const between = /\d\s*$/.test(line.slice(0, m.index)) && /^\s*\d/.test(line.slice(m.index + 1));
          if (between && CONFIG.enDash.ranges) continue;
          add('emdash', m.index + 1, `en dash used as a dash${CONFIG.enDash.replacement ? `; use "${CONFIG.enDash.replacement.trim() || CONFIG.enDash.replacement}"` : ''}`, 'error');
        }
      }
    }
    const scan = (rule, list, msg, severity) => {
      for (const item of list) {
        item.re.lastIndex = 0;
        let m;
        while ((m = item.re.exec(line)) !== null) {
          add(rule, m.index + 1, msg(item, m[0]), severity);
          if (m[0] === '') item.re.lastIndex++;
        }
      }
    };
    if (opts.rules.has('banned')) scan('banned', bannedRes, (b, hit) => `banned phrase "${hit}"${b.replacement ? `; try "${b.replacement}"` : ''}`, 'error');
    if (opts.rules.has('agents')) scan('agents', agentsRes, (_b, hit) => `word "${hit}" is on the AGENTS.md avoid list`, 'warn');
    if (opts.rules.has('spelling') && !fence) {
      for (const sp of spellingRes) {
        sp.re.lastIndex = 0;
        let m;
        while ((m = sp.re.exec(line)) !== null) {
          const exc = CONFIG.exceptions.get(sp.us.toLowerCase());
          const what = sp.kind === 'phrasing' ? `US phrasing "${m[0]}"; British English is "${sp.uk}"` : `US spelling "${m[0]}"; British English is "${sp.uk}"`;
          if (exc !== undefined) add('spelling', m.index + 1, `${what} (context dependent${exc ? `: ${exc}` : ''})`, 'info');
          else add('spelling', m.index + 1, what, 'warn');
        }
      }
    }
    if (opts.rules.has('guardrails')) {
      for (const g of guardRes) {
        g.re.lastIndex = 0;
        let m;
        while ((m = g.re.exec(line)) !== null) {
          if (opts.rules.has('emdash') && /^[\u2013\u2014]$/.test(m[0].trim())) { if (m[0] === '') g.re.lastIndex++; continue; } // already reported by the emdash rule
          add('guardrails', m.index + 1, `${g.id ? `[${g.id}] ` : ''}${g.message}`, /warn|flag|info|claims|autofix/i.test(String(g.severity ?? '')) ? 'warn' : 'error');
          if (m[0] === '') g.re.lastIndex++;
        }
      }
    }
    if (runHabits && !fence) {
      const t = line.trim();
      if (/^:::\s*copyright\b/i.test(t)) inCopyright = true;
      else if (inCopyright && t === ':::') inCopyright = false;
      if (/^#\s/.test(t)) habitSection++;
      const prose = t !== '' && !/^(?:#|:::|[-*+]\s|\d+\.\s|\||>|!\[|\*\*\*$)/.test(t);
      if (prose && !inCopyright) {
        const lead = line.length - line.trimStart().length;
        const marks = /^[*_]*/.exec(t)[0].length;
        const o = CONFIG.habits.openers.find((x) => x.re.exec(t.slice(marks))?.index === 0);
        if (o) openerHits.push({ section: habitSection, line: ln, col: lead + marks + 1, text: o.re.exec(t.slice(marks))[0] });
        let best = null;
        for (const d of CONFIG.habits.disclaimers) { const m = d.re.exec(line); if (m && (!best || m.index < best.index)) best = { index: m.index, text: m[0] }; }
        if (best) disclaimerHits.push({ line: ln, col: best.index + 1, text: best.text });
      }
    }
    if (opts.rules.has('titlecase') && CONFIG.titleCase && isMarkdown && !fence && (opts.rulesExplicit || isBookText)) {
      const h = /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line);
      if (h) { const msg = checkHeadingCase(h[1], CONFIG.titleCase); if (msg) add('titlecase', 1, msg, 'warn'); }
    }
  });
  if (runHabits) {
    const bySection = new Map();
    for (const o of openerHits) bySection.set(o.section, [...(bySection.get(o.section) ?? []), o]);
    for (const list of bySection.values()) {
      if (list.length <= CONFIG.habits.maxOpeners) continue;
      for (const o of list) findings.push({ file: display, line: o.line, col: o.col, rule: 'habits', severity: 'warn', message: `scaffolding opener "${o.text}" (${list.length} in this section, keep it to ${CONFIG.habits.maxOpeners})` });
    }
    if (disclaimerHits.length > CONFIG.habits.maxDisclaimers)
      for (const d of disclaimerHits) findings.push({ file: display, line: d.line, col: d.col, rule: 'habits', severity: 'warn', message: `"${d.text}" disclaimer (${disclaimerHits.length} in this file, keep it to ${CONFIG.habits.maxDisclaimers}); the copyright page covers the stories` });
  }
}

// ---------- report ----------
const configNote = CONFIG.missing
  ? `config/house-style.json not found at ${CONFIG_PATH}. Only the built-in em dash and AGENTS.md word checks ran. Another agent may still be writing it; rerun when it exists.`
  : CONFIG.error ? `House style config error: ${CONFIG.error}. Only the built-in checks ran.` : null;

if (opts.json) {
  console.log(JSON.stringify({ root: ROOT, config: CONFIG_PATH, configMissing: CONFIG.missing, configError: CONFIG.error, checked: files.length, skipped, findings }, null, 2));
} else {
  if (configNote) console.error(configNote);
  for (const s of skipped) if (!opts.quiet) console.log(`skipped ${s.file}: ${s.reason}`);
  for (const f of findings) console.log(`${f.file}:${f.line}:${f.col}  ${f.severity}  ${f.rule}  ${f.message}`);
  if (!opts.quiet) {
    const loaded = CONFIG.missing || CONFIG.error ? 'built-in rules only' : `${bannedRes.length} banned phrases, ${spellingRes.length} spellings, ${guardRes.length} guardrail patterns, title case: ${CONFIG.titleCase ? CONFIG.titleCase.style : 'not set'}`;
    console.log(`${findings.length} finding(s) in ${files.length} file(s) checked (${loaded}).`);
  }
}
if (findings.some((f) => f.severity !== 'info')) process.exit(1);
if (process.exitCode === 2 || configNote) process.exit(2);
process.exit(0);

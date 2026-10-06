import { assignSourceIds, loadHouseStyle, savedTextReport, type GuardrailHit, type GuardrailReport, type HouseStyle } from '@volume/ai';
import type { AiGuardrailHit, AiGuardrails } from '../ports/ai.js';
import type { TextGuardrailChecker } from '../repos/manuscript.js';
import type { Repos } from '../repos/index.js';

/**
 * The code guardrails for saved text, the same checks @volume/ai runs on every AI answer (house-style
 * guardrail patterns, banned phrases, links that are not research sources or profile links, ISBNs the owner
 * did not enter, unknown [[S<n>]] markers), worked out again whenever a version is saved. Banned phrases are
 * "needs attention"; everything else that blocks is in blocking.
 */

const houseStyles = new Map<string, HouseStyle>();

function houseStyleFor(configDir: string): HouseStyle {
  let hs = houseStyles.get(configDir);
  if (!hs) {
    hs = loadHouseStyle(configDir);
    houseStyles.set(configDir, hs);
  }
  return hs;
}

function hitOut(h: GuardrailHit): AiGuardrailHit {
  const out: AiGuardrailHit = { rule: h.rule, severity: h.severity, message: h.message, match: h.match, path: h.path };
  if (h.phrase !== undefined) out.phrase = h.phrase;
  return out;
}

/** A package guardrail report in the server's AiGuardrails shape. */
export function toAiGuardrails(r: GuardrailReport): AiGuardrails {
  return {
    passed: r.passed,
    blocking: r.blocking.map(hitOut),
    needsAttention: r.needsAttention.map(hitOut),
    rules: r.rules.map((x) => ({ rule: x.rule, list: x.list, count: x.count, message: x.message, matches: [...x.matches] })),
    styleRewrite: null,
  };
}

/** The checker ManuscriptRepo runs on every save: the book's sources (S1, S2... in the writer's order), profile links and ISBNs. */
export function createTextChecker(repos: Repos, configDir: string): TextGuardrailChecker {
  return async (ctx, projectId, bodyMd) => {
    if (!bodyMd.trim()) return null;
    const book = await repos.books.get(ctx, projectId);
    if (!book) return null;
    const profile = await repos.profiles.get(ctx, book.profileId);
    const sources = await repos.planning.listSources(ctx, { projectId, useInBook: true });
    const hs = houseStyleFor(configDir);
    const report = savedTextReport(bodyMd, hs, {
      sources: assignSourceIds(sources.map((s) => ({ title: s.title ?? s.url, url: s.url, snippet: s.excerpt ?? '' }))),
      allowedUrls: (profile?.links ?? []).map((l) => l.url ?? l.value ?? '').filter((u) => u.length > 0),
      allowedIsbns: [book.isbnPaperback, book.isbnEbook].filter((x): x is string => !!x),
      bannedPhrases: [...hs.bannedPhrases],
    });
    return toAiGuardrails(report);
  };
}

import {
  assignSourceIds,
  authorAnecdoteApplies,
  formatProfileFacts,
  loadHouseStyle,
  savedTextReport,
  type GuardrailContext,
  type GuardrailHit,
  type GuardrailReport,
  type HouseStyle,
} from '@volume/ai';
import type { RequestCtx } from '../auth/context.js';
import { loadBookStructure } from '../config/book-structure.js';
import type { Book } from '../repos/books.js';
import type { Profile } from '../repos/profiles.js';
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

/**
 * The facts the saved text may state about the author: the profile facts block (as the prompts get it) and the owner's
 * brief (idea and notes). Null when the profile is missing. Sent as GuardrailContext.authorFacts, which the
 * author-anecdote guardrail reads (branch fix/prompt-honesty); older @volume/ai versions ignore it.
 */
export function savedAuthorFacts(profile: Profile | null, book: Pick<Book, 'idea' | 'notes'>): string | null {
  if (!profile) return null;
  const facts = formatProfileFacts({
    penName: profile.penName,
    isRealPerson: profile.isRealPerson,
    credentials: profile.credentials,
    location: profile.location,
    bio: profile.bioThirdPerson,
    links: profile.links.map((l) => l.url ?? l.value ?? '').filter((u) => u.length > 0),
  });
  return [facts ?? '', book.idea ?? '', book.notes ?? ''].filter((x) => x.trim() !== '').join('\n');
}

/** The guardrail context for text saved in a book: its sources, profile links, ISBNs and the author facts. */
export async function savedTextContext(repos: Repos, configDir: string, ctx: RequestCtx, book: Book): Promise<GuardrailContext & { authorFacts?: string }> {
  const profile = await repos.profiles.get(ctx, book.profileId);
  const sources = await repos.planning.listSources(ctx, { projectId: book.id, useInBook: true });
  const hs = houseStyleFor(configDir);
  // The author-anecdote guardrail needs the facts the author has given; stories, poetry and memoir skip it (left out).
  const structure = await loadBookStructure(configDir, book.bookTypeId, book.template);
  const applies = authorAnecdoteApplies({ template: structure.templateId, type: book.bookTypeId });
  const authorFacts = applies ? savedAuthorFacts(profile, book) : null;
  return {
    sources: assignSourceIds(sources.map((s) => ({ title: s.title ?? s.url, url: s.url, snippet: s.excerpt ?? '' }))),
    allowedUrls: (profile?.links ?? []).map((l) => l.url ?? l.value ?? '').filter((u) => u.length > 0),
    allowedIsbns: [book.isbnPaperback, book.isbnEbook].filter((x): x is string => !!x),
    bannedPhrases: [...hs.bannedPhrases],
    ...(authorFacts !== null ? { authorFacts } : {}),
  };
}

/** The checker ManuscriptRepo runs on every save: savedTextContext over the saved words. */
export function createTextChecker(repos: Repos, configDir: string): TextGuardrailChecker {
  return async (ctx, projectId, bodyMd) => {
    if (!bodyMd.trim()) return null;
    const book = await repos.books.get(ctx, projectId);
    if (!book) return null;
    const guard = await savedTextContext(repos, configDir, ctx, book);
    return toAiGuardrails(savedTextReport(bodyMd, houseStyleFor(configDir), guard));
  };
}

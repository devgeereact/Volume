import { checkDisclaimers, findProfileReuse, findRepetitions, type RepetitionFinding, type RepetitionUnit } from '@volume/core';
import { CODE_WRITTEN_KINDS, houseStyle, OWNER_PLACEHOLDER_SOURCE } from './book-data.js';
import type { JobContext } from './runner.js';

/** Suggestion pass name for book-level repetition findings (shown in the editor with the other suggestions). */
export const REPETITION_PASS = 'repetition';

/**
 * Book-level repetition and disclaimer check (@volume/core findRepetitions) after a section is written: every section with text
 * is compared, and each later use in this section of a sentence, definition or piece of advice the book already
 * gave becomes an editor suggestion to cut it (the first use is kept). Repeated phrases become warnings. Sections
 * are written in order, so by the last section the whole book has been checked. Model-free and deterministic.
 */
export async function bookRepetitions(jc: JobContext, projectId: string, sectionId: string): Promise<{ suggestions: number; warnings: number }> {
  const { repos } = jc.services;
  const sections = (await repos.manuscript.listSections(jc.ctx, projectId)).filter(
    (s) => s.enabled && s.currentVersionId && !CODE_WRITTEN_KINDS.has(s.kind) && s.kind !== 'part',
  );
  const units: RepetitionUnit[] = [];
  let currentVersionId: string | null = null;
  for (const s of sections) {
    const v = await repos.manuscript.getVersion(jc.ctx, s.currentVersionId as string);
    if (!v || !v.bodyMd.trim() || v.source === OWNER_PLACEHOLDER_SOURCE) continue;
    if (s.id === sectionId) currentVersionId = v.id;
    units.push({
      sectionId: s.id,
      text: v.bodyMd,
      title: s.kind === 'chapter' && s.number !== null ? `Chapter ${s.number}: ${s.title ?? ''}` : (s.title ?? s.kind),
    });
  }
  const section = sections.find((s) => s.id === sectionId);
  if (!section || !currentVersionId || units.length < 2) return { suggestions: 0, warnings: 0 };

  const body = units.find((u) => u.sectionId === sectionId)?.text ?? '';
  const items: { original: string; proposed: string; reason: string; start: number | null; end: number | null }[] = [];
  const warnings: { checker: string; severity: 'warn' | 'info'; message: string; location: Record<string, unknown> }[] = [];
  // The author's background goes in the body once (live run 3 restated the studio bio in the introduction and chapter 2).
  const book = await repos.books.require(jc.ctx, projectId);
  const bio = (await repos.profiles.require(jc.ctx, book.profileId)).bioThirdPerson;
  const findings: RepetitionFinding[] = [...findRepetitions(units), ...findProfileReuse(units, bio)];
  for (const f of findings) {
    // A profile finding keeps every sentence of the first section that states the background; later sections are cut.
    const first = f.occurrences[0]?.sectionId;
    const later = (f.kind === 'profile' ? f.occurrences.filter((o) => o.sectionId !== first) : f.occurrences.slice(1)).filter((o) => o.sectionId === sectionId);
    if (later.length === 0) continue;
    for (const o of later) {
      if (f.kind === 'phrase') {
        warnings.push({ checker: 'repetition', severity: f.severity, message: f.message, location: { start: o.start, end: o.end, match: o.text, id: f.id } });
      } else {
        // Cutting a sentence also takes the space after it, so accepting leaves no double space.
        const end = body[o.end] === ' ' ? o.end + 1 : o.end;
        items.push({ original: body.slice(o.start, end), proposed: '', reason: `${f.message} ${f.suggestion}`.trim(), start: o.start, end });
      }
    }
  }
  // "This is illustrative" lines across the whole book (the copyright page carries the note once; code pages are left out).
  for (const d of checkDisclaimers(units, houseStyle(jc.services.configDir))) {
    if (d.sectionId !== sectionId) continue;
    warnings.push({
      checker: 'disclaimer',
      severity: d.severity === 'info' ? 'info' : 'warn',
      message: d.message,
      location: { start: d.start, end: d.end, match: d.match, id: d.id },
    });
  }
  if (items.length > 0) await repos.manuscript.addSuggestions(jc.ctx, section, currentVersionId, REPETITION_PASS, items, null);
  if (warnings.length > 0) await repos.manuscript.addCheckResults(jc.ctx, projectId, sectionId, currentVersionId, warnings);
  if (items.length > 0) await jc.emit('book.updated', { projectId, part: 'suggestions', sectionId, count: items.length, pass: REPETITION_PASS });
  return { suggestions: items.length, warnings: warnings.length };
}

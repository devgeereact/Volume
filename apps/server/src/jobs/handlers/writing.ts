import { findTemplateJunk, findUndatedPrices, tidyGlossaryMarkdown } from '@volume/core';
import { markdownToPlaintext, wordCount } from '../../lib/text.js';
import { datedPricesVars, factsUsedIn, plannedBodyCount, templateChecks, writtenSections } from '../book-checks.js';
import {
  CHECKS_MISSING_CHECKER,
  CODE_WRITTEN_KINDS,
  loadTemplate,
  OWNER_PLACEHOLDER_SOURCE,
  profileSummary,
  styleChecks,
  SUMMARY_MISSING_CHECKER,
} from '../book-data.js';
import { bookRepetitions } from '../repetition.js';
import { AiModelUnavailableError } from '../../ports/ai.js';
import type { Section } from '../../repos/manuscript.js';
import { JobFailed } from '../errors.js';
import type { JobContext, JobHandler } from '../runner.js';

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);

/** The book's template id: the id inside the loaded template rules, else the book's template column. */
function templateIdOf(template: unknown, book: { template: string }): string {
  const id = typeof template === 'object' && template !== null ? (template as Record<string, unknown>)['id'] : null;
  return typeof id === 'string' && id ? id : book.template;
}

/** Sends streamed text as section.delta events, at most every 250 ms (docs/02, Live progress). */
function deltaThrottle(jc: JobContext, sectionId: string, intervalMs = 250): { push(t: string): void; flush(): void } {
  let buf = '';
  let last = 0;
  const flush = (): void => {
    if (!buf) return;
    jc.emitEphemeral('section.delta', { sectionId, text: buf });
    buf = '';
    last = Date.now();
  };
  return {
    push(t: string) {
      buf += t;
      if (Date.now() - last >= intervalMs) flush();
    },
    flush,
  };
}

/** Sections the writer moves through in order; the next one is named in the chapter prompt. */
const BODY_FLOW: ReadonlySet<string> = new Set(['introduction', 'chapter', 'conclusion', 'epilogue']);

/**
 * Sections the AI writer fills. Code-written pages are built at export; sections the book type leaves to the
 * owner (plan.writer 'owner', such as a disclaimer) are never written by the AI.
 */
function writtenByAi(s: { kind: string; plan: Record<string, unknown> }): boolean {
  return !CODE_WRITTEN_KINDS.has(s.kind) && s.kind !== 'part' && s.plan['writer'] !== 'owner' && s.plan['writer'] !== 'code';
}

export const writeBookHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Write job is missing its book.');
  const book = await repos.books.require(jc.ctx, projectId);
  if (!book.approvedBlueprintId) throw new JobFailed('Approve the blueprint before writing the book.', 'invalid_state');
  const onlyEmpty = jc.payload['onlyEmpty'] !== false;
  // Acknowledgements whose placeholder is already saved wait for the owner's names; writing them again changes nothing.
  const noThanks = ((await profileSummary(repos, jc.ctx, book.profileId, book))['acknowledgementNames'] as string[]).length === 0;
  const sections = (await repos.manuscript.listSections(jc.ctx, projectId)).filter(
    (s) =>
      s.enabled &&
      writtenByAi(s) &&
      (!onlyEmpty || s.status !== 'done') &&
      !(onlyEmpty && noThanks && s.kind === 'acknowledgements' && s.currentVersionId !== null),
  );
  let previous: string | null = null;
  for (const s of sections) {
    // Chapters are written in order: each depends on the one before (summaries and ledger).
    const child = await jc.enqueueChild({ kind: 'write_section', projectId, payload: { sectionId: s.id }, dependsOnJobId: previous });
    await repos.manuscript.setSectionStatus(jc.ctx, s.id, 'queued');
    previous = child.id;
  }
  await repos.books.advanceStage(jc.ctx, projectId, 'writing');
  if (sections.length === 0) return { result: { sections: 0 } };
  return { waitForChildren: true, result: { sections: sections.length } };
};

/** Saved instead of AI text when the owner has named nobody to thank. Preflight blocks the pack until it is replaced. */
export const ACKNOWLEDGEMENTS_PLACEHOLDER =
  "Acknowledgements to come. Add the names of the people you want to thank in this book's settings, then write this section again, or switch the section off.";
/** Saved instead of AI text when no research source is ticked for the book. Preflight blocks the pack until it is replaced. */
export const RESOURCES_PLACEHOLDER =
  'Resources to come. Tick the sources you want listed in Research, then write this section again, or switch the section off.';
/** The preflight and check message for resources with no ticked sources. */
export const RESOURCES_NEED_SOURCES = 'Resources needs sources: tick sources in Research';
/** Version source of an owner placeholder (preflight blocks while it is the current text). */
export const PLACEHOLDER_SOURCE = OWNER_PLACEHOLDER_SOURCE;

/** Under this share of the word target a section gets one automatic extend pass; over the upper share it is flagged. */
export const WORD_TARGET_LOW = 0.85;
export const WORD_TARGET_HIGH = 1.15;

function words(markdown: string): number {
  return wordCount(markdownToPlaintext(markdown));
}

/** Glossary terms for the back matter: the blueprint's list plus every term a chapter defined (ledger). */
function glossaryTermsOf(blueprint: Record<string, unknown> | null, ledger: { kind: string; key: string }[]): string[] {
  const back = blueprint && typeof blueprint['back'] === 'object' && blueprint['back'] !== null ? (blueprint['back'] as Record<string, unknown>) : {};
  const planned = [back['glossaryTerms'], back['glossary_terms']].flatMap((v) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []));
  const defined = ledger.filter((e) => e.kind === 'term').map((e) => e.key);
  return [...new Set([...planned, ...defined].map((t) => t.trim()).filter(Boolean))];
}

/**
 * A failure of a post-write step (summary, claims and consistency checks) that leaves the written text worth keeping: a
 * cut-off or invalid answer after the AI layer's own retry, a refusal, a missing model. Pauses, cancels, budget stops and
 * retryable provider errors are not caught here: they still end the attempt, as before.
 */
function stepFailure(err: unknown): { code: string; detail: string } | null {
  if (err instanceof JobFailed) return { code: err.code, detail: err.message.slice(0, 500) };
  if (err instanceof AiModelUnavailableError) return { code: 'model_unavailable', detail: err.message.slice(0, 500) };
  return null;
}

function summaryMissingCheck(f: { code: string; detail: string }): { checker: string; severity: 'block'; message: string; location: Record<string, unknown> } {
  return {
    checker: SUMMARY_MISSING_CHECKER,
    severity: 'block',
    message:
      'Summary missing: the text is saved, but its summary failed, so later sections were written without its summary and story ledger entries. Run the summary again.',
    location: { errorCode: f.code, detail: f.detail },
  };
}

function checksMissingCheck(f: { code: string; detail: string }): { checker: string; severity: 'block'; message: string; location: Record<string, unknown> } {
  return {
    checker: CHECKS_MISSING_CHECKER,
    severity: 'block',
    message: 'Checks missing: the text is saved, but its claims and consistency check failed. Run the checks again.',
    location: { errorCode: f.code, detail: f.detail },
  };
}

type CodeCheckItem = { checker: string; severity: 'info' | 'warn' | 'block'; message: string; location?: Record<string, unknown> };

/**
 * The model's claims and consistency check on saved text. Consistency issues come back as warnings; claims are stored and
 * announced. A step failure (see stepFailure) comes back as `failed` instead of throwing, so the text is never lost.
 */
async function modelChecks(
  jc: JobContext,
  projectId: string,
  sectionId: string,
  versionId: string,
  variables: Record<string, unknown>,
): Promise<{ checks: CodeCheckItem[]; claims: number; failed: { code: string; detail: string } | null }> {
  const { repos } = jc.services;
  let model;
  try {
    model = await jc.runAi('checks', { promptId: 'checks.claims-and-consistency', variables });
  } catch (err) {
    const failed = stepFailure(err);
    if (!failed) throw err;
    return { checks: [], claims: 0, failed };
  }
  const checks: CodeCheckItem[] = model.output.consistency.map((c) => ({
    checker: 'consistency',
    severity: 'warn',
    message: c.issue,
    location: { excerpt: c.excerpt },
  }));
  const claims = await repos.manuscript.addClaims(
    jc.ctx,
    projectId,
    sectionId,
    versionId,
    model.output.claims.map((c) => ({
      sentence: c.sentence,
      category: c.category,
      checkNeeded: c.check_needed,
      start: c.start,
      end: c.end,
      suggestedSoftening: c.softer,
    })),
  );
  for (const c of claims) await jc.emit('claim.added', { claimId: c.id, sectionId, category: c.category });
  return { checks, claims: claims.length, failed: null };
}

/** The section variables the writing and summary prompts share. */
function sectionVarsOf(section: Section, all: readonly Section[]): Record<string, unknown> {
  const later = all.filter((s) => s.enabled && s.position > section.position && BODY_FLOW.has(s.kind));
  const isLast = section.kind === 'chapter' && !later.some((s) => s.kind === 'chapter');
  const partTitle = section.partId ? (all.find((s) => s.id === section.partId)?.title ?? null) : null;
  return { kind: section.kind, title: section.title, number: section.number, word_target: section.wordTarget, ...section.plan, partTitle, isLast };
}

type Book = Awaited<ReturnType<JobContext['services']['repos']['books']['require']>>;
type Source = Awaited<ReturnType<JobContext['services']['repos']['planning']['listSources']>>[number];

/**
 * Continuity and context for the writing, summary and checks prompts: summaries of earlier sections (the last one is the
 * previous chapter), the story ledger, the next chapter, dated prices, the blueprint, the template and the profile facts.
 */
async function writingContext(jc: JobContext, book: Book, section: Section, profile: Record<string, unknown>, sources: readonly Source[]) {
  const { repos } = jc.services;
  const projectId = book.id;
  const sectionId = section.id;
  const all = [...(await repos.manuscript.listSections(jc.ctx, projectId))].sort((a, b) => a.position - b.position);
  const earlier = all.filter((s) => s.enabled && s.position < section.position && s.currentVersionId);
  const summaries: { number: number; title: string | null; summary: string }[] = [];
  for (const s of earlier) {
    const v = await repos.manuscript.getVersion(jc.ctx, s.currentVersionId as string);
    if (v?.summary) summaries.push({ number: s.number ?? summaries.length + 1, title: s.title, summary: v.summary });
  }
  // An earlier section whose summary failed is simply absent here; its open summary_missing flag says so.
  const later = all.filter((s) => s.enabled && s.position > section.position && BODY_FLOW.has(s.kind));
  const next = later[0] ?? null;
  const ledger = await repos.manuscript.listLedger(jc.ctx, projectId);
  // Dated prices, and where the author's background is already stated (a profile fact goes in the body once).
  const written = await writtenSections(repos, jc.ctx, projectId);
  const prices = await datedPricesVars(jc.services.configDir, book, written, await plannedBodyCount(repos, jc.ctx, projectId));
  const bio = typeof profile['bio'] === 'string' ? profile['bio'] : '';
  const usedIn = factsUsedIn(written, bio, sectionId);
  // The approved blueprint version (not a later draft) and the book type's template rules.
  const blueprint = book.approvedBlueprintId ? await repos.planning.blueprintById(jc.ctx, book.approvedBlueprintId) : null;
  const template = await loadTemplate(jc.services.configDir, book);
  const sectionVars = sectionVarsOf(section, all);
  const templateId = templateIdOf(template, book);
  const common = {
    book: {
      title: book.title,
      subtitle: book.subtitle,
      summary: blueprint?.data['summary'] ?? null,
      audience: blueprint?.data['audience'] ?? null,
      // Fiction: the owner's point of view and tense for the book (settings.pov, settings.tense); the template default otherwise.
      pov: str(book.settings['pov']),
      tense: str(book.settings['tense']),
    },
    templateId,
    bookTypeId: book.bookTypeId,
    wordTarget: book.wordTarget,
    illustrativeStories: book.illustrativeLine,
    blueprint: blueprint?.data ?? null,
    template,
    previousSummaries: summaries,
    ledger,
    sources: sources.map((s) => ({ title: s.title, url: s.url, excerpt: s.excerpt })),
    profile: { ...profile, factsUsedIn: usedIn.length ? usedIn.join('; ') : null },
    ...prices,
  };

  return { all, next, ledger, written, prices, blueprint, sectionVars, common, template, templateId };
}

/**
 * Rerun of the post-write steps that failed on a saved section (write_section with rerunMissing, or the older summaryOnly):
 * the summary when the current text has none or carries an open summary_missing flag, and the claims and consistency
 * checks when it carries an open checks_missing flag. The text is never rewritten. A step that works resolves its flag; a
 * step that fails again keeps exactly one open flag and the job ends needing attention.
 */
async function rerunMissingSteps(jc: JobContext, projectId: string, section: Section): Promise<Awaited<ReturnType<JobHandler>>> {
  const { repos } = jc.services;
  const current = section.currentVersionId ? await repos.manuscript.getVersion(jc.ctx, section.currentVersionId) : null;
  if (!current) throw new JobFailed('This section has no text to summarise or check yet.', 'invalid_state');
  const sectionId = section.id;
  const book = await repos.books.require(jc.ctx, projectId);
  const profile = await profileSummary(repos, jc.ctx, book.profileId, book);
  const sources = await repos.planning.listSources(jc.ctx, { projectId, useInBook: true });
  const { ledger, sectionVars, common } = await writingContext(jc, book, section, profile, sources);
  const openOf = async (checker: string): Promise<boolean> =>
    (await repos.manuscript.listChecks(jc.ctx, { versionId: current.id })).some((c) => c.checker === checker && c.status === 'open');
  const flag = async (checker: string, item: CodeCheckItem): Promise<void> => {
    // One open flag per version and step, never a pile of them.
    if (!(await openOf(checker))) await repos.manuscript.addCheckResults(jc.ctx, projectId, sectionId, current.id, [item]);
  };
  const doSummary = current.summary === null || (await openOf(SUMMARY_MISSING_CHECKER));
  const doChecks = await openOf(CHECKS_MISSING_CHECKER);
  // The section status is left alone until the end: a cancelled or crashed rerun must not clear "needs attention".
  const failed: Record<string, string> = {};
  let warnings = 0;
  let claims = 0;

  if (doSummary) {
    await jc.progress(0.1, 'Summarising');
    try {
      const summary = await jc.runAi('summarise', {
        promptId: 'checks.summarise-and-ledger',
        variables: { markdown: current.bodyMd, section: sectionVars, bookTypeId: book.bookTypeId, templateId: common.templateId, ledger },
      });
      await jc.checkpoint();
      await repos.manuscript.setVersionSummary(jc.ctx, current.id, summary.output.summary);
      await repos.manuscript.upsertLedger(jc.ctx, projectId, sectionId, current.id, summary.output.ledger);
      await repos.manuscript.resolveChecks(jc.ctx, current.id, SUMMARY_MISSING_CHECKER);
      await jc.emit('book.updated', { projectId, part: 'summary', sectionId });
    } catch (err) {
      const f = stepFailure(err);
      if (!f) throw err;
      failed['summary'] = f.code;
      await flag(SUMMARY_MISSING_CHECKER, summaryMissingCheck(f));
    }
  }
  if (doChecks) {
    await jc.progress(0.5, 'Checking');
    const r = await modelChecks(jc, projectId, sectionId, current.id, { ...common, markdown: current.bodyMd, section: { id: sectionId, ...sectionVars } });
    if (r.failed) {
      failed['checks'] = r.failed.code;
      await flag(CHECKS_MISSING_CHECKER, checksMissingCheck(r.failed));
    } else {
      await jc.checkpoint();
      await repos.manuscript.addCheckResults(jc.ctx, projectId, sectionId, current.id, r.checks);
      await repos.manuscript.resolveChecks(jc.ctx, current.id, CHECKS_MISSING_CHECKER);
      warnings = r.checks.length;
      claims = r.claims;
    }
  }

  const blocks = (await repos.manuscript.listChecks(jc.ctx, { versionId: current.id })).filter((c) => c.status === 'open' && c.severity === 'block').length;
  await repos.manuscript.setSectionStatus(jc.ctx, sectionId, blocks > 0 ? 'needs_attention' : 'done');
  await jc.emit('check.result', { sectionId, versionId: current.id, blocks, warnings, claims });
  const reran = [...(doSummary ? ['summary'] : []), ...(doChecks ? ['checks'] : [])];
  return {
    status: blocks > 0 ? 'needs_attention' : 'succeeded',
    result: {
      sectionId,
      versionId: current.id,
      reran,
      summaryMissing: 'summary' in failed,
      checksMissing: 'checks' in failed,
      ...(Object.keys(failed).length ? { errorCodes: failed } : {}),
      // Kept for callers of the first rerun result shape.
      ...(failed['summary'] ? { errorCode: failed['summary'] } : failed['checks'] ? { errorCode: failed['checks'] } : {}),
    },
  };
}

export const writeSectionHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  const sectionId = str(jc.payload['sectionId']);
  if (!projectId || !sectionId) throw new JobFailed('Section job is missing its book or section.');
  const section = await repos.manuscript.requireSection(jc.ctx, sectionId);
  if (jc.payload['rerunMissing'] === true || jc.payload['summaryOnly'] === true) return rerunMissingSteps(jc, projectId, section);
  const book = await repos.books.require(jc.ctx, projectId);
  // Every start or restart (retry, recovery after a crash): the UI clears any streamed text it holds for the section.
  await jc.emit('section.started', { bookId: projectId, projectId, sectionId, jobId: jc.job.id, attempt: jc.job.attempts });
  await repos.manuscript.setSectionStatus(jc.ctx, sectionId, 'writing');
  await jc.progress(0.05, 'Writing');
  const profile = await profileSummary(repos, jc.ctx, book.profileId, book);

  // Acknowledgements thank only people the owner named. With no names, a placeholder the owner must fill
  // (preflight blocks the pack while it stands), never invented family, colleagues or early readers.
  const sources = await repos.planning.listSources(jc.ctx, { projectId, useInBook: true });
  const placeholder = async (bodyMd: string, note: string, message: string) => {
    const version = await repos.manuscript.saveVersion(jc.ctx, sectionId, { bodyMd, source: PLACEHOLDER_SOURCE, note, status: 'needs_attention' });
    await repos.manuscript.addCheckResults(jc.ctx, projectId, sectionId, version.id, [{ checker: 'owner_placeholder', severity: 'block', message }]);
    await jc.emit('section.saved', { sectionId, versionId: version.id, version: version.version, wordCount: version.wordCount, source: version.source });
    await jc.emit('check.result', { sectionId, versionId: version.id, blocks: 1, warnings: 0, claims: 0 });
    await repos.manuscript.setSectionStatus(jc.ctx, sectionId, 'needs_attention');
    // The job did its part; the section shows as needing attention and the preflight blocks the pack until it is filled.
    return { result: { sectionId, versionId: version.id, wordCount: version.wordCount, placeholder: true } };
  };
  if (section.kind === 'acknowledgements' && (profile['acknowledgementNames'] as string[]).length === 0) {
    return placeholder(
      ACKNOWLEDGEMENTS_PLACEHOLDER,
      'No names to thank yet: add them in the book settings or switch this section off.',
      'Acknowledgements need the names of the people you want to thank. Add them in the book settings, or switch the section off.',
    );
  }
  // Resources list only ticked research sources (live run 3: an empty list failed the job). None ticked: a placeholder.
  if (section.kind === 'resources' && sources.length === 0) {
    return placeholder(RESOURCES_PLACEHOLDER, 'No research sources ticked yet.', `${RESOURCES_NEED_SOURCES}, then write this section again, or switch it off.`);
  }

  const { next, ledger, written, prices, blueprint, sectionVars, common, template } = await writingContext(jc, book, section, profile, sources);

  const delta = deltaThrottle(jc, sectionId);
  const writing = await jc.runAi(
    'writing',
    {
      promptId:
        section.kind === 'chapter'
          ? 'writing.chapter'
          : section.kind === 'introduction'
            ? 'writing.introduction'
            : section.kind === 'conclusion'
              ? 'writing.conclusion'
              : 'writing.front-matter',
      variables: {
        ...common,
        section: sectionVars,
        nextChapter: next ? { title: next.title, summary: typeof next.plan['summary'] === 'string' ? next.plan['summary'] : null } : null,
        instruction: jc.payload['instruction'] ?? null,
        glossaryTerms: glossaryTermsOf(blueprint?.data ?? null, ledger),
      },
    },
    { onDelta: (t) => delta.push(t) },
  );
  delta.flush();

  // Word target: one automatic extend pass (substance, not padding) when the section came back under 85%.
  let markdown = writing.output.markdown;
  let promptRunId = writing.promptRunId;
  const target = section.wordTarget;
  if (target && target > 0 && BODY_FLOW.has(section.kind) && words(markdown) < target * WORD_TARGET_LOW) {
    await jc.progress(0.45, 'Extending');
    await jc.emit('section.started', { bookId: projectId, projectId, sectionId, jobId: jc.job.id, attempt: jc.job.attempts, phase: 'extend' });
    const extendDelta = deltaThrottle(jc, sectionId);
    const extended = await jc.runAi(
      'writing',
      { promptId: 'writing.extend-section', variables: { ...common, section: sectionVars, markdown, currentWords: words(markdown) } },
      { onDelta: (t) => extendDelta.push(t) },
    );
    extendDelta.flush();
    // Kept only when it really is longer; otherwise the first answer stands and the section is flagged below.
    if (words(extended.output.markdown) > words(markdown)) {
      markdown = extended.output.markdown;
      promptRunId = extended.promptRunId;
    }
  }
  // Glossary post-step: duplicates merged, terms the book never uses dropped, the rest alphabetical (live run 3).
  if (section.kind === 'glossary') {
    const bookText = written
      .filter((w) => w.id !== sectionId)
      .map((w) => w.bodyMd)
      .join('\n\n');
    markdown = tidyGlossaryMarkdown(markdown, bookText).markdown;
  }
  await jc.progress(0.6, 'Summarising');

  // A failed summary no longer loses the written text (owner decision, 7 October 2026): the text is saved with no
  // summary and a blocking summary_missing flag, the job ends needing attention, and later sections still run.
  let summary: { summary: string; ledger: { kind: string; key: string; detail: string }[] } | null = null;
  let summaryFailed: { code: string; detail: string } | null = null;
  try {
    summary = (
      await jc.runAi('summarise', {
        promptId: 'checks.summarise-and-ledger',
        variables: { markdown, section: sectionVars, bookTypeId: book.bookTypeId, templateId: common.templateId, ledger },
      })
    ).output;
  } catch (err) {
    summaryFailed = stepFailure(err);
    if (!summaryFailed) throw err;
  }
  await jc.checkpoint();

  // Save in one transaction at the end (idempotent: a crash before here leaves no half version).
  const version = await repos.manuscript.saveVersion(jc.ctx, sectionId, {
    bodyMd: markdown,
    source: 'ai:writing',
    promptRunId,
    summary: summary?.summary ?? null,
    status: 'checking',
    styleRewrite: writing.guardrails?.styleRewrite ?? null,
  });
  await repos.books.setAiDisclosure(jc.ctx, projectId, 'text', 'ai_generated');
  if (summary) await repos.manuscript.upsertLedger(jc.ctx, projectId, sectionId, version.id, summary.ledger);
  await jc.emit('section.saved', { sectionId, versionId: version.id, version: version.version, wordCount: version.wordCount, source: version.source });
  await jc.progress(0.8, 'Checking');

  const checks = styleChecks(markdown, jc.services.configDir);
  if (summaryFailed) checks.push(summaryMissingCheck(summaryFailed));
  // Template junk ("- x: x", TBD, [NEEDS ...]) blocks; prices with no month checked warn in dated-prices book types.
  for (const j of findTemplateJunk(markdown)) {
    checks.push({
      checker: 'placeholder',
      severity: 'block',
      message: `Unfilled placeholder "${j.match}". Replace or delete it.`,
      location: { start: j.start, end: j.end, match: j.match },
    });
  }
  // Template rules in code (fiction: no subheadings or takeaways; workbook: 2 to 4 exercises). Block findings set needs_attention.
  checks.push(...templateChecks(markdown, section, template));
  if (prices.datedPrices === 'yes') {
    for (const p of findUndatedPrices(markdown)) {
      checks.push({
        checker: 'dated_price',
        severity: 'warn',
        message: `${p.match} has no month checked. Add "(checked ${prices.checkedMonth})" after it.`,
        location: { start: p.start, end: p.end, match: p.match },
      });
    }
  }
  if (target && target > 0 && BODY_FLOW.has(section.kind)) {
    const n = version.wordCount;
    if (n > target * WORD_TARGET_HIGH) {
      checks.push({
        checker: 'word_target',
        severity: 'warn',
        message: `${n} words against a target of ${target}: more than 15% over. Trim or split it.`,
        location: { words: n, target },
      });
    } else if (n < target * WORD_TARGET_LOW) {
      checks.push({
        checker: 'word_target',
        severity: 'warn',
        message: `${n} words against a target of ${target}: still more than 15% under after one extend pass.`,
        location: { words: n, target },
      });
    }
  }
  // The checks get the context they need: the profile facts (personal claims), this section's plan, earlier summaries and the ledger.
  // The text is already saved: a failed check call adds a blocking checks_missing flag instead of failing the job (live
  // run of 7 October 2026: a cut-off checks answer lost chapter 2 and cancelled five later sections).
  const model = await modelChecks(jc, projectId, sectionId, version.id, { ...common, markdown, section: { id: sectionId, ...sectionVars } });
  checks.push(...model.checks);
  if (model.failed) checks.push(checksMissingCheck(model.failed));
  await repos.manuscript.addCheckResults(jc.ctx, projectId, sectionId, version.id, checks);
  await bookRepetitions(jc, projectId, sectionId);
  const blocking = checks.filter((c) => c.severity === 'block').length;
  await jc.emit('check.result', { sectionId, versionId: version.id, blocks: blocking, warnings: checks.length - blocking, claims: model.claims });

  const status = blocking > 0 ? 'needs_attention' : 'done';
  await repos.manuscript.setSectionStatus(jc.ctx, sectionId, status);
  return {
    status: blocking > 0 ? 'needs_attention' : 'succeeded',
    result: {
      sectionId,
      versionId: version.id,
      wordCount: version.wordCount,
      ...(summaryFailed ? { summaryMissing: true } : {}),
      ...(model.failed ? { checksMissing: true } : {}),
    },
  };
};

/** "Weave in": the author's notes are worked into the section text as a new version. */
export const weaveNotesHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  const sectionId = str(jc.payload['sectionId']);
  const noteIds = Array.isArray(jc.payload['noteIds']) ? (jc.payload['noteIds'] as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  if (!projectId || !sectionId) throw new JobFailed('Weave job is missing its book or section.');
  const section = await repos.manuscript.requireSection(jc.ctx, sectionId);
  const notes = (await repos.manuscript.listNotes(jc.ctx, { sectionId, ids: noteIds })).filter((n) => n.status === 'queued' || n.status === 'open');
  if (notes.length === 0) return { result: { woven: 0 } };
  const current = section.currentVersionId ? await repos.manuscript.getVersion(jc.ctx, section.currentVersionId) : null;
  const book = await repos.books.require(jc.ctx, projectId);
  const mode = jc.payload['mode'] === 'expand' ? 'expand' : 'weave';

  const delta = deltaThrottle(jc, sectionId);
  let res;
  try {
    res = await jc.runAi(
      'weave',
      {
        promptId: 'editing.weave-notes',
        variables: {
          markdown: current?.bodyMd ?? '',
          mode,
          notes: notes.map((n) => ({ id: n.id, note: n.note, position: n.position, anchorText: n.anchorText })),
          section: { title: section.title, kind: section.kind, ...section.plan },
          profile: await profileSummary(repos, jc.ctx, book.profileId, book),
        },
      },
      { onDelta: (t) => delta.push(t) },
    );
  } catch (err) {
    await repos.manuscript.setNotesStatus(
      jc.ctx,
      notes.map((n) => n.id),
      'open',
      { jobId: null },
    );
    throw err;
  }
  delta.flush();
  const version = await repos.manuscript.saveVersion(jc.ctx, sectionId, {
    bodyMd: res.output.markdown,
    source: 'ai:weave',
    promptRunId: res.promptRunId,
    note: `${mode === 'expand' ? 'Expanded' : 'Wove in'} ${notes.length} author note${notes.length === 1 ? '' : 's'}`,
  });
  await repos.books.setAiDisclosure(jc.ctx, projectId, 'text', 'ai_generated');
  await repos.manuscript.setNotesStatus(
    jc.ctx,
    notes.map((n) => n.id),
    'woven',
    { wovenVersionId: version.id },
  );
  await jc.emit('section.saved', { sectionId, versionId: version.id, version: version.version, wordCount: version.wordCount, source: version.source });
  await jc.emit('note.woven', { sectionId, versionId: version.id, noteIds: notes.map((n) => n.id), mode });
  return { result: { sectionId, versionId: version.id, woven: notes.length, mode } };
};

export const editPassHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const sectionId = str(jc.payload['sectionId']);
  const pass = str(jc.payload['pass']) ?? 'line';
  if (!sectionId) throw new JobFailed('Edit job is missing its section.');
  const section = await repos.manuscript.requireSection(jc.ctx, sectionId);
  const current = section.currentVersionId ? await repos.manuscript.getVersion(jc.ctx, section.currentVersionId) : null;
  if (!current) throw new JobFailed('This section has no text to edit yet.', 'invalid_state');
  const res = await jc.runAi('editing', {
    promptId: `editing.${pass}`,
    variables: {
      pass,
      markdown: current.bodyMd,
      section: { title: section.title, ...section.plan },
      instruction: jc.payload['instruction'] ?? null,
      selection: jc.payload['selection'] ?? null,
    },
  });
  const added = await repos.manuscript.addSuggestions(
    jc.ctx,
    section,
    current.id,
    pass,
    res.output.suggestions.map((s) => ({ original: s.original, proposed: s.proposed, reason: s.reason, start: s.start, end: s.end })),
    res.promptRunId,
  );
  await jc.emit('book.updated', { projectId: section.projectId, part: 'suggestions', sectionId, count: added.length });
  return { result: { sectionId, suggestions: added.length } };
};

/**
 * Selection rewrite: runs writing.rewrite-selection on [from, to) of the current text and returns a proposal
 * { text, from, to, baseVersionId } as the job result. Nothing is saved: the screen saves a version to accept it.
 */
export const rewriteSelectionHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const sectionId = str(jc.payload['sectionId']);
  const from = Number(jc.payload['from']);
  const to = Number(jc.payload['to']);
  if (!sectionId) throw new JobFailed('Rewrite job is missing its section.');
  const section = await repos.manuscript.requireSection(jc.ctx, sectionId);
  const current = section.currentVersionId ? await repos.manuscript.getVersion(jc.ctx, section.currentVersionId) : null;
  if (!current) throw new JobFailed('This section has no text to rewrite yet.', 'invalid_state');
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to <= from || to > current.bodyMd.length) {
    throw new JobFailed('The selection is outside the current text. Select the words again.', 'invalid_input');
  }
  const book = section.projectId ? await repos.books.require(jc.ctx, section.projectId) : null;
  const res = await jc.runAi('editing', {
    promptId: 'writing.rewrite-selection',
    variables: {
      pass: 'selection',
      markdown: current.bodyMd,
      selection: { start: from, end: to },
      instruction: jc.payload['instruction'] ?? null,
      section: { title: section.title, kind: section.kind, ...section.plan },
      ...(book ? { profile: await profileSummary(repos, jc.ctx, book.profileId, book) } : {}),
    },
  });
  const proposal = res.output.suggestions[0];
  if (!proposal || !proposal.proposed.trim()) throw new JobFailed('The model returned no rewrite. Try again or reword the instruction.', 'invalid_output');
  return {
    result: { sectionId, text: proposal.proposed, from, to, original: current.bodyMd.slice(from, to), reason: proposal.reason, baseVersionId: current.id },
  };
};

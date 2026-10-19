import { z } from 'zod';
import { BlueprintChapterSchema, BlueprintSchema } from '../../ports/ai.js';
import { loadBookStructure, promptTemplate } from '../../config/book-structure.js';
import { profileSummary } from '../book-data.js';
import { datedPricesVars, plannedBodyCount, writtenSections } from '../book-checks.js';
import { JobFailed } from '../errors.js';
import type { JobHandler } from '../runner.js';

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export const researchHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  const runId = str(jc.payload['runId']);
  if (!projectId || !runId) throw new JobFailed('Research job is missing its book or run.');
  const book = await repos.books.require(jc.ctx, projectId);
  await jc.progress(0.1, 'Searching the web');
  try {
    const res = await jc.runAi('research', {
      promptId: 'research.title-research',
      variables: {
        idea: book.idea,
        notes: book.notes,
        audience_hint: jc.payload['audienceHint'] ?? null,
        template: book.template,
        bookTypeId: book.bookTypeId,
        profile: await profileSummary(repos, jc.ctx, book.profileId, book),
      },
    });
    await repos.planning.completeRun(jc.ctx, runId, res.output, res.sources, res.promptRunId);
  } catch (err) {
    await repos.planning.failRun(jc.ctx, runId);
    throw err;
  }
  await repos.books.advanceStage(jc.ctx, projectId, 'research');
  await jc.emit('book.updated', { projectId, part: 'research', runId });
  return { result: { runId } };
};

export const titlesHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Titles job is missing its book.');
  const book = await repos.books.require(jc.ctx, projectId);
  const runs = await repos.planning.listRuns(jc.ctx, projectId);
  const research = runs.find((r) => r.status === 'done')?.output ?? null;
  // A chosen direction skips the directions step; without one the first suggested direction is used.
  const chosen = isRecord(jc.payload['direction']) ? jc.payload['direction'] : null;
  const res = await jc.runAi('titles', {
    promptId: 'titles.title-options',
    variables: {
      idea: book.idea,
      // The author's brief (the wizard's notes) reaches the stage as {{book.authorBrief}}.
      notes: book.notes,
      title: book.title,
      research,
      bookTypeId: book.bookTypeId,
      profile: await profileSummary(repos, jc.ctx, book.profileId, book),
      instruction: jc.payload['instruction'] ?? null,
      ...(chosen ? { direction: chosen } : {}),
    },
  });
  // App checks (docs/04 stage 2): combined length under 200 characters.
  const options = res.output.options.map((o) => {
    const chars = o.title.length + (o.subtitle ? o.subtitle.length + 2 : 0);
    const issues: string[] = [];
    if (chars >= 200) issues.push('Title and subtitle are 200 characters or more.');
    if (/—/.test(o.title + o.subtitle)) issues.push('Contains an em dash.');
    return { ...o, chars, valid: issues.length === 0, issues };
  });
  // Titles for a chosen direction keep the earlier set's directions so the owner can switch again.
  const directions = chosen && Array.isArray(jc.payload['directions']) ? jc.payload['directions'] : res.output.directions;
  const set = await repos.planning.createTitleSet(jc.ctx, projectId, { directions, options, jobId: jc.job.id, promptRunId: res.promptRunId });
  await repos.books.advanceStage(jc.ctx, projectId, 'titles');
  await jc.emit('book.updated', { projectId, part: 'titles', titleSetId: set.id });
  return { result: { titleSetId: set.id } };
};

export const blueprintHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  if (!projectId) throw new JobFailed('Blueprint job is missing its book.');
  const book = await repos.books.require(jc.ctx, projectId);
  const runs = await repos.planning.listRuns(jc.ctx, projectId);
  const research = runs.find((r) => r.status === 'done')?.output ?? null;
  const sources = await repos.planning.listSources(jc.ctx, { projectId, useInBook: true });
  // The book type's own template (structure, word range, genre rules) and the book's word target.
  const structure = await loadBookStructure(jc.services.configDir, book.bookTypeId, book.template);
  const wordTarget = book.wordTarget ?? structure.defaultWordTarget;
  const res = await jc.runAi('blueprint', {
    promptId: 'blueprint.blueprint',
    variables: {
      title: book.title ?? book.idea,
      subtitle: book.subtitle,
      idea: book.idea,
      notes: book.notes,
      template: promptTemplate(structure),
      bookTypeId: book.bookTypeId,
      wordTarget,
      illustrativeStories: book.illustrativeLine,
      chapterCount: jc.payload['chapterCount'] ?? null,
      // Fiction: the owner's point of view and tense (book settings); the adapter falls back to the template's voice.
      pov: str(book.settings['pov']),
      tense: str(book.settings['tense']),
      instruction: jc.payload['instruction'] ?? null,
      research,
      sources: sources.map((s) => ({ title: s.title, url: s.url, excerpt: s.excerpt })),
      profile: await profileSummary(repos, jc.ctx, book.profileId, book),
    },
  });
  // The plan must add up to the book's word target within 10%; otherwise every target is rescaled to fit.
  const fitted = fitWordTargets(res.output, wordTarget);
  const bp = await repos.planning.addBlueprintVersion(jc.ctx, projectId, fitted, { source: 'ai:blueprint', promptRunId: res.promptRunId });
  await repos.books.advanceStage(jc.ctx, projectId, 'blueprint');
  await jc.emit('book.updated', { projectId, part: 'blueprint', blueprintId: bp.id, version: bp.version });
  return { result: { blueprintId: bp.id, version: bp.version } };
};

type Rec = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const rec = (v: unknown): Rec => (isRecord(v) ? v : {});

/** Word targets a blueprint plans: each chapter, the introduction and the conclusion (camelCase or snake_case keys). */
export function plannedWords(bp: Rec): { chapters: number; introduction: number | null; conclusion: number | null; total: number } {
  const chapters = (Array.isArray(bp['chapters']) ? bp['chapters'] : []).reduce<number>((n, c) => n + (num(rec(c)['word_target']) ?? 0), 0);
  const intro = rec(rec(bp['front'])['introduction']);
  const concl = rec(rec(bp['back'])['conclusion']);
  const introduction = num(intro['wordTarget']) ?? num(intro['word_target']);
  const conclusion = num(concl['wordTarget']) ?? num(concl['word_target']);
  return { chapters, introduction, conclusion, total: chapters + (introduction ?? 0) + (conclusion ?? 0) };
}

/** Allowed gap between the planned words and the book's word target. */
export const WORD_PLAN_TOLERANCE = 0.1;

/**
 * Keeps the blueprint's word targets (chapters, introduction, conclusion) within 10% of the book's word target.
 * Outside that, every target is scaled by the same factor (rounded to 50 words, at least 100) and the change is
 * noted in word_targets_fitted. Returns the blueprint unchanged when it already fits or there is no target.
 */
export function fitWordTargets<T extends Rec>(bp: T, bookTarget: number | null | undefined): T {
  const planned = plannedWords(bp);
  if (!bookTarget || bookTarget <= 0 || planned.total <= 0) return bp;
  if (Math.abs(planned.total - bookTarget) <= bookTarget * WORD_PLAN_TOLERANCE) return bp;
  const factor = bookTarget / planned.total;
  const scale = (n: number): number => Math.max(100, Math.round((n * factor) / 50) * 50);
  const next = structuredClone(bp) as Rec;
  next['chapters'] = (Array.isArray(next['chapters']) ? next['chapters'] : []).map((c) => {
    const o = rec(c);
    const t = num(o['word_target']);
    return t === null ? o : { ...o, word_target: scale(t) };
  });
  for (const [area, key] of [
    ['front', 'introduction'],
    ['back', 'conclusion'],
  ] as const) {
    const part = rec(next[area]);
    const item = rec(part[key]);
    for (const k of ['wordTarget', 'word_target']) {
      const t = num(item[k]);
      if (t !== null) item[k] = scale(t);
    }
    if (Object.keys(item).length > 0) next[area] = { ...part, [key]: item };
  }
  next['word_targets_fitted'] = { bookTarget, planned: planned.total, fittedTo: plannedWords(next).total, factor: Math.round(factor * 1000) / 1000 };
  return next as T;
}

/** Replaces one part of the blueprint and saves a new version. */
export function mergeBlueprintPart(data: Record<string, unknown>, part: string, partData: unknown): Record<string, unknown> {
  const next: Record<string, unknown> = structuredClone(data);
  const obj = (partData && typeof partData === 'object' ? partData : {}) as Record<string, unknown>;
  if (part === 'summary') next['summary'] = typeof obj['summary'] === 'string' ? obj['summary'] : next['summary'];
  else if (part === 'chapters') next['chapters'] = z.array(BlueprintChapterSchema).parse(obj['chapters']);
  else if (part.startsWith('chapter:')) {
    const n = Number(part.split(':')[1]);
    const chapter = BlueprintChapterSchema.parse({ ...obj, number: n });
    const chapters = Array.isArray(next['chapters']) ? [...(next['chapters'] as Record<string, unknown>[])] : [];
    const idx = chapters.findIndex((c) => c['number'] === n);
    if (idx >= 0) chapters[idx] = chapter;
    else chapters.push(chapter);
    next['chapters'] = chapters;
  } else if (part === 'front' || part === 'back') next[part] = obj;
  else if (part === 'listing') {
    for (const k of ['back_blurb', 'description_draft', 'categories', 'keywords']) if (obj[k] !== undefined) next[k] = obj[k];
  } else throw new JobFailed(`Unknown blueprint part ${part}.`);
  return BlueprintSchema.parse(next);
}

export const blueprintPartHandler: JobHandler = async (jc) => {
  const { repos } = jc.services;
  const projectId = jc.job.projectId;
  const part = str(jc.payload['part']);
  if (!projectId || !part) throw new JobFailed('Regenerate job is missing its book or part.');
  const latest = await repos.planning.latestBlueprint(jc.ctx, projectId);
  if (!latest) throw new JobFailed('Build the blueprint before regenerating a part.');
  const book = await repos.books.require(jc.ctx, projectId);
  const structure = await loadBookStructure(jc.services.configDir, book.bookTypeId, book.template);
  const target = book.wordTarget ?? structure.defaultWordTarget;
  const res = await jc.runAi('blueprint_part', {
    promptId: 'blueprint.regenerate-part',
    variables: {
      part,
      instruction: jc.payload['instruction'] ?? null,
      idea: book.idea,
      notes: book.notes,
      blueprint: latest.data,
      wordTarget: target,
      template: promptTemplate(structure),
      bookTypeId: book.bookTypeId,
      // The listing may promise dated prices only when the check over the written chapters passes.
      ...(await datedPricesVars(
        jc.services.configDir,
        book,
        await writtenSections(repos, jc.ctx, projectId),
        await plannedBodyCount(repos, jc.ctx, projectId),
      )),
    },
  });
  // A regenerated chapter list must still add up to the book's word target.
  const merged =
    part === 'chapters'
      ? fitWordTargets(mergeBlueprintPart(latest.data, part, res.output.data), target)
      : mergeBlueprintPart(latest.data, part, res.output.data);
  const bp = await repos.planning.addBlueprintVersion(jc.ctx, projectId, merged, {
    source: 'ai:blueprint_part',
    note: `Regenerated ${part}`,
    parentVersionId: latest.id,
    promptRunId: res.promptRunId,
  });
  await jc.emit('book.updated', { projectId, part: 'blueprint', blueprintId: bp.id, version: bp.version });
  return { result: { blueprintId: bp.id, version: bp.version, part } };
};

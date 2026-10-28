import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AppServices } from '../app.js';
import type { RequestCtx } from '../auth/context.js';
import { AppError, parse } from '../http/errors.js';
import { contextOf, findMatches, replaceMatches } from '../lib/find.js';
import { KeyedLock } from '../lib/keyed-lock.js';
import { lineDiff } from '../lib/text.js';
import { NoteInputSchema, NotePatchSchema, SaveVersionSchema, sessionStartOf, type Section } from '../repos/manuscript.js';
import { RESOURCES_AUTO_OFF_KEY } from '../jobs/handlers/writing.js';
import { advanceIfWritingComplete, CHECKS_MISSING_CHECKER, CODE_WRITTEN_KINDS, sectionPreviews, SUMMARY_MISSING_CHECKER } from '../jobs/book-data.js';
import { estimateRuns } from './fixes.js';
import { sectionGuardrails } from '../repos/run-info.js';
import { LEDGER_KINDS } from '../ports/ai.js';
import { accepted, idOf, writer } from './common.js';

const VersionParams = z.object({ id: z.string().min(1).max(64), versionId: z.string().min(1).max(64) });

/** Replaces the first exact occurrence; returns null when the text is not there any more. */
function replaceOnce(text: string, find: string, replacement: string, at?: number | null): string | null {
  if (!find) return null;
  if (typeof at === 'number' && at >= 0 && text.slice(at, at + find.length) === find) return text.slice(0, at) + replacement + text.slice(at + find.length);
  const i = text.indexOf(find);
  if (i < 0) return null;
  return text.slice(0, i) + replacement + text.slice(i + find.length);
}

async function currentText(s: AppServices, ctx: RequestCtx, section: Section): Promise<{ bodyMd: string; versionId: string | null }> {
  if (!section.currentVersionId) return { bodyMd: '', versionId: null };
  const v = await s.repos.manuscript.getVersion(ctx, section.currentVersionId);
  return { bodyMd: v?.bodyMd ?? '', versionId: v?.id ?? null };
}

export function manuscriptRoutes(app: FastifyInstance, s: AppServices): void {
  const m = s.repos.manuscript;

  // ---------- sections ----------

  app.get('/books/:id/sections', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const tree = await m.tree(req.ctx, id);
    // Guardrails of each section's latest AI-written version (needs attention items and the rules that hit).
    const all = [...tree.front, ...tree.body, ...tree.body.flatMap((b) => b.children), ...tree.back];
    const g = await sectionGuardrails(
      s.db,
      req.ctx,
      all.map((x) => x.id),
    );
    const who = await m.writtenBy(req.ctx, all, CODE_WRITTEN_KINDS);
    // Built pages and owner pages: what the exported book holds for them (the Editor shows it, not an empty page).
    const previews = await sectionPreviews(s.repos, req.ctx, id, s.configDir);
    const add = <T extends Section>(x: T) => ({
      ...x,
      guardrails: g.get(x.id)?.guardrails ?? null,
      writtenBy: who.get(x.id) ?? 'ai',
      generated: previews.generated.get(x.id) ?? null,
      ownerPrompt: previews.ownerPrompts.get(x.id) ?? null,
    });
    return {
      ...tree,
      front: tree.front.map(add),
      body: tree.body.map((b) => ({ ...add(b), children: b.children.map(add) })),
      back: tree.back.map(add),
    };
  });

  app.get('/sections/:id', async (req) => {
    const section = await m.requireSection(req.ctx, idOf(req));
    const current = section.currentVersionId ? await m.getVersion(req.ctx, section.currentVersionId) : null;
    const checks = current ? await m.listChecks(req.ctx, { versionId: current.id }) : [];
    const g = (await sectionGuardrails(s.db, req.ctx, [section.id])).get(section.id);
    const who = (await m.writtenBy(req.ctx, [section], CODE_WRITTEN_KINDS)).get(section.id) ?? 'ai';
    const previews = await sectionPreviews(s.repos, req.ctx, section.projectId, s.configDir);
    return {
      section: {
        ...section,
        guardrails: g?.guardrails ?? null,
        writtenBy: who,
        generated: previews.generated.get(section.id) ?? null,
        ownerPrompt: previews.ownerPrompts.get(section.id) ?? null,
      },
      current,
      checks,
    };
  });

  app.patch('/sections/:id', async (req) => {
    writer(req);
    const id = idOf(req);
    const body = parse(
      z.object({
        title: z.string().max(255).nullable().optional(),
        enabled: z.boolean().optional(),
        position: z.number().int().min(0).optional(),
        wordTarget: z.number().int().min(0).nullable().optional(),
      }),
      req.body,
    );
    const existing = await m.requireSection(req.ctx, id);
    const set: Parameters<typeof m.updateSectionPlan>[2] = {};
    if (body.title !== undefined) set.title = body.title;
    if (body.enabled !== undefined) set.enabled = body.enabled;
    // Switching a page back on ends the app's "switched off" note (Resources with no sources), so it does not linger.
    if (body.enabled === true && RESOURCES_AUTO_OFF_KEY in existing.plan) {
      const { [RESOURCES_AUTO_OFF_KEY]: _note, ...rest } = existing.plan;
      set.plan = rest;
    }
    if (body.position !== undefined) set.position = body.position;
    if (body.wordTarget !== undefined) set.wordTarget = body.wordTarget;
    await m.updateSectionPlan(req.ctx, id, set);
    return m.requireSection(req.ctx, id);
  });

  // ---------- versions ----------

  app.post('/sections/:id/versions', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(SaveVersionSchema, req.body);
    const input: Parameters<typeof m.saveVersion>[2] = {
      bodyMd: body.bodyMd,
      content: body.content,
      source: 'human',
      note: body.note ?? null,
      createdBy: req.ctx.userId,
    };
    if (body.baseVersionId !== undefined) input.baseVersionId = body.baseVersionId;
    const v = await m.saveVersion(req.ctx, id, input);
    // D-048: the owner's save can finish the writing, which moves the book on to the editor.
    await advanceIfWritingComplete(s.repos, req.ctx, v.projectId);
    await s.bus.publish(req.ctx.workspaceId, {
      projectId: v.projectId,
      type: 'section.saved',
      data: { sectionId: id, versionId: v.id, version: v.version, wordCount: v.wordCount, source: v.source },
    });
    void reply.code(201);
    return v;
  });

  /**
   * Versions, newest first. previousVersionId is the version before the current edit session (before the run of the
   * same user's autosaves that ends at the current version), for "restore what I had before I started editing".
   */
  app.get('/sections/:id/versions', async (req) => {
    const id = idOf(req);
    const items = await m.listVersions(req.ctx, id);
    const section = await m.requireSection(req.ctx, id);
    return { items, currentVersionId: section.currentVersionId, previousVersionId: sessionStartOf(items, section.currentVersionId) };
  });

  app.get('/sections/:id/versions/:versionId', async (req) => {
    const p = parse(VersionParams, req.params);
    return m.requireVersion(req.ctx, p.id, p.versionId);
  });

  app.post('/sections/:id/versions/:versionId/restore', async (req, reply) => {
    writer(req);
    const p = parse(VersionParams, req.params);
    const v = await m.restoreVersion(req.ctx, p.id, p.versionId);
    await advanceIfWritingComplete(s.repos, req.ctx, v.projectId);
    await s.bus.publish(req.ctx.workspaceId, {
      projectId: v.projectId,
      type: 'section.saved',
      data: { sectionId: p.id, versionId: v.id, version: v.version, wordCount: v.wordCount, source: v.source },
    });
    void reply.code(201);
    return v;
  });

  /** Diff data: both texts plus a line diff (null when too long to diff on the server). */
  app.get('/sections/:id/diff', async (req) => {
    const id = idOf(req);
    const q = parse(z.object({ from: z.string().min(1).max(64), to: z.string().min(1).max(64).optional() }), req.query);
    const section = await m.requireSection(req.ctx, id);
    const toId = q.to ?? section.currentVersionId;
    if (!toId) throw new AppError('invalid_state', 'This section has no text yet.');
    const from = await m.requireVersion(req.ctx, id, q.from);
    const to = await m.requireVersion(req.ctx, id, toId);
    const strip = (v: typeof from) => ({ id: v.id, version: v.version, source: v.source, createdAt: v.createdAt, wordCount: v.wordCount, bodyMd: v.bodyMd });
    return { from: strip(from), to: strip(to), lines: lineDiff(from.bodyMd, to.bodyMd) };
  });

  // ---------- writing jobs ----------

  app.post('/books/:id/write', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ onlyEmpty: z.boolean().optional() }).optional(), req.body) ?? {};
    const book = await s.repos.books.require(req.ctx, id);
    if (!book.approvedBlueprintId) throw new AppError('invalid_state', 'Approve the blueprint first.');
    const job = await s.queue.enqueue(req.ctx, { kind: 'write_book', projectId: id, payload: { onlyEmpty: body.onlyEmpty ?? true } });
    return accepted(reply, job);
  });

  app.post('/sections/:id/write', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ instruction: z.string().max(4000).optional() }).optional(), req.body) ?? {};
    const section = await m.requireSection(req.ctx, id);
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'write_section',
      projectId: section.projectId,
      payload: { sectionId: id, instruction: body.instruction ?? null },
    });
    await m.setSectionStatus(req.ctx, id, 'queued');
    return accepted(reply, job);
  });

  // Rerun of the post-write steps that failed on a saved section (open summary_missing or checks_missing flags, or no
  // summary yet). The text is not rewritten. /summarise is the first name of this route and does the same.
  // POST: 202 { jobId, job, steps, estimate: { lowUsd, highUsd } }. 409 invalid_state when there is no text or nothing
  // is missing; 409 conflict { jobId } when an unfinished job already works on the section. Check, estimate and
  // enqueue run under one lock per section, so two clicks cannot queue (and pay for) two reruns. Pack preflight fix
  // actions 'rerun-checks' point here. GET /sections/:id/recheck answers the same steps and estimate without queuing.
  const recheckLock = new KeyedLock();
  const RecheckBody = z
    .object({ checks: z.literal(true).optional() })
    .strict()
    .optional();
  // { checks: true } runs the claims and consistency checks even with no failed step, for books whose text never went
  // through them (imported manuscripts; owner, 21 October 2026).
  const recheckPlan = async (ctx: RequestCtx, id: string, forceChecks = false) => {
    const section = await m.requireSection(ctx, id);
    const current = section.currentVersionId ? await m.getVersion(ctx, section.currentVersionId) : null;
    if (!current) return { section, steps: [] as ('summary' | 'checks')[], hasText: false, runningJobId: null, estimate: { lowUsd: 0, highUsd: 0 } };
    // The same test rerunMissingSteps makes, so the answer and the job agree on what runs.
    const open = (await m.listChecks(ctx, { versionId: current.id })).filter((c) => c.status === 'open');
    const steps: ('summary' | 'checks')[] = [
      ...(current.summary === null || open.some((c) => c.checker === SUMMARY_MISSING_CHECKER) ? (['summary'] as const) : []),
      ...(forceChecks || open.some((c) => c.checker === CHECKS_MISSING_CHECKER) ? (['checks'] as const) : []),
    ];
    // Any unfinished job on the section's text; claim fix options only read it.
    const running = await s.queue.activeWhere(ctx, section.projectId, (j) => j.payload['sectionId'] === section.id && j.kind !== 'claim_fix');
    const variables = { markdown: current.bodyMd, section: { id: section.id, title: section.title } };
    const estimate = await estimateRuns(s, ctx, section.projectId, [
      ...(steps.includes('summary')
        ? [{ stage: 'summarise' as const, input: { promptId: 'checks.summarise-and-ledger', variables, projectId: section.projectId } }]
        : []),
      ...(steps.includes('checks')
        ? [{ stage: 'checks' as const, input: { promptId: 'checks.claims-and-consistency', variables, projectId: section.projectId } }]
        : []),
    ]);
    return { section, steps, hasText: true, runningJobId: running[0]?.id ?? null, estimate };
  };
  const rerunMissing = async (req: FastifyRequest, reply: FastifyReply) => {
    writer(req);
    const id = idOf(req);
    const forceChecks = parse(RecheckBody, req.body)?.checks === true;
    await m.requireSection(req.ctx, id);
    return recheckLock.run(id, async () => {
      const plan = await recheckPlan(req.ctx, id, forceChecks);
      if (!plan.hasText) throw new AppError('invalid_state', 'This section has no text to summarise or check yet. Write it first.');
      if (plan.steps.length === 0) throw new AppError('invalid_state', 'Nothing is missing: this section has its summary and its checks.');
      if (plan.runningJobId) throw new AppError('conflict', 'A job is already working on this section. Wait for it to finish.', { jobId: plan.runningJobId });
      // The section keeps its status (needs attention) until the rerun ends, so a cancelled rerun cannot hide the flag.
      const job = await s.queue.enqueue(req.ctx, {
        kind: 'write_section',
        projectId: plan.section.projectId,
        payload: { sectionId: id, rerunMissing: true, ...(forceChecks ? { forceChecks: true } : {}) },
      });
      return { ...accepted(reply, job), steps: plan.steps, estimate: plan.estimate };
    });
  };
  /** What a rerun would do and cost, without queuing it: { steps, estimate, runningJobId, hasText }. */
  app.get('/sections/:id/recheck', async (req) => {
    const plan = await recheckPlan(req.ctx, idOf(req));
    return { sectionId: plan.section.id, steps: plan.steps, estimate: plan.estimate, runningJobId: plan.runningJobId, hasText: plan.hasText };
  });
  app.post('/sections/:id/recheck', rerunMissing);
  app.post('/sections/:id/summarise', rerunMissing);

  app.post('/sections/:id/edit-pass', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(
      z.object({
        pass: z.enum(['structure', 'line', 'voice', 'selection']),
        instruction: z.string().max(4000).optional(),
        selection: z.object({ start: z.number().int().min(0), end: z.number().int().min(0) }).optional(),
      }),
      req.body,
    );
    const section = await m.requireSection(req.ctx, id);
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'edit_pass',
      projectId: section.projectId,
      payload: { sectionId: id, pass: body.pass, instruction: body.instruction ?? null, selection: body.selection ?? null },
    });
    return accepted(reply, job);
  });

  // ---------- author notes ("weave in") ----------

  app.post('/sections/:id/notes', async (req, reply) => {
    writer(req);
    void reply.code(201);
    return m.addNote(req.ctx, idOf(req), parse(NoteInputSchema, req.body));
  });

  app.get('/sections/:id/notes', async (req) => {
    const id = idOf(req);
    await m.requireSection(req.ctx, id);
    const q = parse(z.object({ status: z.enum(['open', 'queued', 'woven', 'dismissed']).optional() }), req.query);
    return { items: await m.listNotes(req.ctx, q.status ? { sectionId: id, status: q.status } : { sectionId: id }) };
  });

  app.get('/books/:id/notes', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const q = parse(z.object({ status: z.enum(['open', 'queued', 'woven', 'dismissed']).optional() }), req.query);
    return { items: await m.listNotes(req.ctx, q.status ? { projectId: id, status: q.status } : { projectId: id }) };
  });

  app.patch('/notes/:id', async (req) => {
    writer(req);
    return m.updateNote(req.ctx, idOf(req), parse(NotePatchSchema, req.body));
  });

  /**
   * Rewrite a selection [from, to) of the current text with writing.rewrite-selection. 202 with the job; the job's
   * result is the proposal { sectionId, text, from, to, original, reason, baseVersionId }. Nothing is saved.
   */
  app.post('/sections/:id/rewrite-selection', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    const body = parse(
      z
        .object({ from: z.number().int().min(0), to: z.number().int().min(1), instruction: z.string().max(2000).optional() })
        .refine((b) => b.to > b.from, { message: 'to must be after from', path: ['to'] }),
      req.body,
    );
    const section = await m.requireSection(req.ctx, id);
    const cur = await currentText(s, req.ctx, section);
    if (!cur.versionId) throw new AppError('invalid_state', 'This section has no text to rewrite yet.');
    if (body.to > cur.bodyMd.length)
      throw new AppError('validation_failed', 'The selection is outside the current text.', [{ path: 'to', message: 'past the end of the text' }]);
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'rewrite_selection',
      projectId: section.projectId,
      payload: { sectionId: id, from: body.from, to: body.to, instruction: body.instruction ?? null },
    });
    return accepted(reply, job);
  });

  // ---------- book-wide find and replace ----------

  const boolQ = z.enum(['true', 'false']).optional();
  /** Sections whose text is written by code (About the author is the profile bio) are never searched or changed. */
  const searchable = async (ctx: RequestCtx, bookId: string) =>
    (await m.listSections(ctx, bookId)).filter((x) => x.currentVersionId && x.kind !== 'about_author');

  app.get('/books/:id/find', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const q = parse(z.object({ q: z.string().min(1).max(500), case: boolQ, word: boolQ }), req.query);
    const opts = { caseSensitive: q.case === 'true', word: q.word === 'true' };
    const sections: {
      sectionId: string;
      kind: string;
      title: string | null;
      number: number | null;
      enabled: boolean;
      versionId: string;
      count: number;
      matches: { start: number; end: number; before: string; match: string; after: string }[];
    }[] = [];
    let total = 0;
    for (const sec of await searchable(req.ctx, id)) {
      const v = await m.getVersion(req.ctx, sec.currentVersionId as string);
      if (!v) continue;
      const found = findMatches(v.bodyMd, q.q, opts);
      if (found.length === 0) continue;
      total += found.length;
      sections.push({
        sectionId: sec.id,
        kind: sec.kind,
        title: sec.title,
        number: sec.number,
        enabled: sec.enabled,
        versionId: v.id,
        count: found.length,
        // Offsets are in the section's current Markdown (bodyMd). At most 200 listed per section; count is the full number.
        matches: found.slice(0, 200).map((f) => ({ ...f, ...contextOf(v.bodyMd, f) })),
      });
    }
    return { q: q.q, caseSensitive: opts.caseSensitive, word: opts.word, total, sections };
  });

  app.post('/books/:id/replace', async (req) => {
    writer(req);
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const body = parse(
      z.object({
        q: z.string().min(1).max(500),
        replacement: z.string().max(5000),
        case: z.boolean().optional(),
        word: z.boolean().optional(),
        sectionIds: z.array(z.string().min(1).max(64)).max(1000).optional(),
      }),
      req.body,
    );
    const opts = { caseSensitive: body.case === true, word: body.word === true };
    const versions: { sectionId: string; versionId: string; count: number }[] = [];
    let replacements = 0;
    for (const sec of await searchable(req.ctx, id)) {
      if (body.sectionIds && !body.sectionIds.includes(sec.id)) continue;
      const cur = await m.getVersion(req.ctx, sec.currentVersionId as string);
      if (!cur) continue;
      const found = findMatches(cur.bodyMd, body.q, opts);
      if (found.length === 0) continue;
      const next = replaceMatches(cur.bodyMd, found, body.replacement);
      if (next === cur.bodyMd) continue;
      const v = await m.saveVersion(req.ctx, sec.id, {
        bodyMd: next,
        source: 'human',
        baseVersionId: cur.id,
        note: `Replaced "${body.q.slice(0, 80)}" with "${body.replacement.slice(0, 80)}" (${found.length})`,
      });
      await s.bus.publish(req.ctx.workspaceId, {
        projectId: id,
        type: 'section.saved',
        data: { sectionId: sec.id, versionId: v.id, version: v.version, wordCount: v.wordCount, source: v.source },
      });
      versions.push({ sectionId: sec.id, versionId: v.id, count: found.length });
      replacements += found.length;
    }
    if (versions.length > 0) await advanceIfWritingComplete(s.repos, req.ctx, id);
    return { replacements, sectionsChanged: versions.length, versions };
  });

  /** A woven (or dismissed) note goes back to open. woven_version_id stays as history. */
  app.post('/notes/:id/reopen', async (req) => {
    writer(req);
    const note = await m.requireNote(req.ctx, idOf(req));
    if (note.status === 'queued') throw new AppError('invalid_state', 'This note is being woven in right now. Wait for the job to finish.');
    if (note.status !== 'open') await m.setNotesStatus(req.ctx, [note.id], 'open', { jobId: null });
    return m.requireNote(req.ctx, note.id);
  });

  app.post('/sections/:id/notes/weave', async (req, reply) => {
    writer(req);
    const id = idOf(req);
    // mode: weave (default) works each note into the prose; expand turns each into a new subsection.
    const body =
      parse(
        z.object({ noteIds: z.array(z.string().min(1).max(64)).min(1).max(100).optional(), mode: z.enum(['weave', 'expand']).optional() }).optional(),
        req.body,
      ) ?? {};
    const section = await m.requireSection(req.ctx, id);
    const open = await m.listNotes(req.ctx, { sectionId: id, status: 'open' });
    const notes = body.noteIds ? open.filter((n) => body.noteIds?.includes(n.id)) : open;
    if (notes.length === 0) throw new AppError('invalid_state', 'There are no open notes to weave in.');
    const job = await s.queue.enqueue(req.ctx, {
      kind: 'weave_notes',
      projectId: section.projectId,
      payload: { sectionId: id, noteIds: notes.map((n) => n.id), mode: body.mode ?? 'weave' },
    });
    await m.setNotesStatus(
      req.ctx,
      notes.map((n) => n.id),
      'queued',
      { jobId: job.id },
    );
    return accepted(reply, job);
  });

  // ---------- suggestions ----------

  app.get('/sections/:id/suggestions', async (req) => {
    const id = idOf(req);
    await m.requireSection(req.ctx, id);
    const q = parse(z.object({ status: z.enum(['open', 'accepted', 'rejected', 'stale']).optional() }), req.query);
    return { items: await m.listSuggestions(req.ctx, q.status ? { sectionId: id, status: q.status } : { sectionId: id }) };
  });

  app.post('/suggestions/:id/accept', async (req) => {
    writer(req);
    const id = idOf(req);
    const body = parse(z.object({ remember: z.boolean().optional() }).optional(), req.body) ?? {};
    const sug = await m.requireSuggestion(req.ctx, id);
    if (sug.status !== 'open') throw new AppError('invalid_state', `This suggestion is already ${sug.status}.`);
    const section = await m.requireSection(req.ctx, sug.sectionId);
    const cur = await currentText(s, req.ctx, section);
    const at = sug.baseVersionId === cur.versionId ? sug.start : null;
    const next = replaceOnce(cur.bodyMd, sug.original, sug.proposed, at);
    if (next === null) {
      await m.decideSuggestion(req.ctx, id, 'stale');
      throw new AppError('conflict', 'The text this suggestion refers to has changed. It is marked as stale.');
    }
    const version = await m.saveVersion(req.ctx, section.id, { bodyMd: next, source: 'ai:editing', note: `Accepted ${sug.pass} suggestion` });
    await s.repos.books.setAiDisclosure(req.ctx, section.projectId, 'text', 'ai_generated');
    const decided = await m.decideSuggestion(req.ctx, id, 'accepted');
    let memory = null;
    if (body.remember) {
      const book = await s.repos.books.require(req.ctx, section.projectId);
      memory = await s.repos.profiles.addMemory(req.ctx, book.profileId, {
        kind: 'preference',
        content: `Prefer "${sug.proposed.slice(0, 400)}" over "${sug.original.slice(0, 400)}".`,
        origin: 'accepted_edit',
        sourceSuggestionId: id,
      });
    }
    await s.bus.publish(req.ctx.workspaceId, {
      projectId: section.projectId,
      type: 'section.saved',
      data: { sectionId: section.id, versionId: version.id, version: version.version, wordCount: version.wordCount, source: version.source },
    });
    return { suggestion: decided, version, memory };
  });

  app.post('/suggestions/:id/reject', async (req) => {
    writer(req);
    const id = idOf(req);
    const sug = await m.requireSuggestion(req.ctx, id);
    if (sug.status !== 'open') throw new AppError('invalid_state', `This suggestion is already ${sug.status}.`);
    return { suggestion: await m.decideSuggestion(req.ctx, id, 'rejected') };
  });

  // ---------- claims ----------

  /** The story ledger (characters, settings, stories, terms and so on), optionally one kind. Read only. */
  app.get('/books/:id/story-ledger', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const q = parse(z.object({ kind: z.enum(LEDGER_KINDS).optional() }), req.query);
    const items = await m.listLedger(req.ctx, id);
    return { items: q.kind ? items.filter((e) => e.kind === q.kind) : items };
  });

  app.get('/books/:id/claims', async (req) => {
    const id = idOf(req);
    await s.repos.books.require(req.ctx, id);
    const q = parse(
      z.object({ status: z.enum(['open', 'verified', 'softened', 'removed', 'author_experience']).optional(), sectionId: z.string().optional() }),
      req.query,
    );
    const filter: { projectId: string; status?: string; sectionId?: string } = { projectId: id };
    if (q.status) filter.status = q.status;
    if (q.sectionId) filter.sectionId = q.sectionId;
    return { items: await m.listClaims(req.ctx, filter) };
  });

  app.post('/claims/:id/verify', async (req) => {
    writer(req);
    const body =
      parse(
        z.object({ sourceUrl: z.url().max(2000).optional(), note: z.string().max(2000).optional(), authorExperience: z.boolean().optional() }).optional(),
        req.body,
      ) ?? {};
    const claim = await m.requireClaim(req.ctx, idOf(req));
    return {
      claim: await m.resolveClaim(req.ctx, claim.id, body.authorExperience ? 'author_experience' : 'verified', {
        ownerNote: body.note ?? null,
        sourceUrl: body.sourceUrl ?? null,
      }),
      version: null,
    };
  });

  for (const action of ['soften', 'remove'] as const) {
    app.post(`/claims/:id/${action}`, async (req) => {
      writer(req);
      const body = parse(
        // soften: replacement defaults to the claim's suggestedSoftening when the body leaves it out.
        action === 'soften'
          ? z.object({ replacement: z.string().min(1).max(5000).optional(), note: z.string().max(2000).optional() }).optional()
          : z.object({ note: z.string().max(2000).optional() }).optional(),
        req.body,
      ) as { replacement?: string; note?: string } | undefined;
      const claim = await m.requireClaim(req.ctx, idOf(req));
      if (action === 'soften' && !body?.replacement && !claim.suggestedSoftening) {
        throw new AppError('validation_failed', 'Write the softer wording: this claim has no suggestion.', [{ path: 'replacement', message: 'required' }]);
      }
      const replacement = body?.replacement ?? claim.suggestedSoftening ?? '';
      let version = null;
      if (claim.sectionId) {
        const section = await m.requireSection(req.ctx, claim.sectionId);
        const cur = await currentText(s, req.ctx, section);
        const next = replaceOnce(cur.bodyMd, claim.sentence, action === 'soften' ? replacement : '');
        if (next !== null) {
          version = await m.saveVersion(req.ctx, section.id, {
            bodyMd: next.replace(/ {2,}/g, ' '),
            source: 'human',
            note: action === 'soften' ? 'Softened a claim' : 'Removed a claim',
          });
        }
      }
      const resolved = await m.resolveClaim(req.ctx, claim.id, action === 'soften' ? 'softened' : 'removed', {
        ownerNote: body?.note ?? null,
        ...(action === 'soften' ? { replacement } : {}),
      });
      return { claim: resolved, version, textChanged: version !== null };
    });
  }
}

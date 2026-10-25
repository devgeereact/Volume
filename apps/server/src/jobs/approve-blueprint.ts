import type { RequestCtx } from '../auth/context.js';
import { loadBookStructure, type StructureSection } from '../config/book-structure.js';
import { AppError } from '../http/errors.js';
import { BlueprintSchema, type Blueprint } from '../ports/ai.js';
import { tidyTitleChars } from './house-style-fix.js';
import type { Repos } from '../repos/index.js';
import type { NewSectionInput } from '../repos/manuscript.js';
import type { EventBus } from '../sse/bus.js';

/** What approving a blueprint needs: the route passes AppServices, the batch job passes JobServices. */
export interface ApproveServices {
  repos: Repos;
  configDir: string;
  bus: EventBus;
}

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : {});
const positive = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null);
const words = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** The plan of the introduction or conclusion from the blueprint (camelCase from the model, snake_case from older plans). */
function matterPlan(item: Rec): { summary: string; wordTarget: number | null } {
  const summary = [words(item['hook']) ? `Hook: ${words(item['hook'])}` : '', words(item['outline']) || words(item['summary'])].filter(Boolean).join('\n\n');
  return { summary, wordTarget: positive(item['wordTarget']) ?? positive(item['word_target']) };
}

/**
 * One new section for a front or back matter entry of the book type's structure. AI pages are switched on;
 * code pages are built at export; pages only the owner can supply (a disclaimer, a map, practical information)
 * start switched off, so nothing is invented and the owner switches them on once filled. Required template
 * sections the type leaves out are switched off on purpose (the preflight sees them as off).
 */
function structureSection(x: StructureSection, bp: Blueprint): NewSectionInput {
  const plan: Rec = { writer: x.writer, templateId: x.id, source: x.source };
  if (x.content) plan['rule'] = x.content;
  let wordTarget = x.wordTarget;
  if (x.kind === 'introduction' || x.kind === 'conclusion') {
    const m = matterPlan(rec(x.kind === 'introduction' ? bp.front['introduction'] : bp.back['conclusion']));
    plan['summary'] = m.summary;
    wordTarget = m.wordTarget ?? x.wordTarget ?? (x.kind === 'introduction' ? 1500 : 1200);
  }
  const out: NewSectionInput = { kind: x.kind, area: x.area, title: x.title, enabled: x.inType && x.writer !== 'owner', plan };
  if (wordTarget !== null) out.wordTarget = wordTarget;
  return out;
}

/** Creates the book's sections from the approved blueprint, or updates chapter plans when they exist. */
async function syncSections(
  s: ApproveServices,
  ctx: RequestCtx,
  projectId: string,
  bp: Blueprint,
  rebuild = false,
): Promise<{ created: number; updated: number }> {
  const existing = await s.repos.manuscript.listSections(ctx, projectId);
  const chapterPlan = (c: Blueprint['chapters'][number]) => ({
    subheadings: c.subheadings,
    summary: c.summary,
    key_points: c.key_points,
    takeaways: c.takeaways,
    bridge_note: c.bridge_note,
    hook_style: bp.hook_style,
    // Workbook exercises and fiction scene plans reach the writer through the section plan (P6-4).
    ...(c.exercises ? { exercises: c.exercises } : {}),
    ...(c.povCharacter ? { povCharacter: c.povCharacter } : {}),
    ...(c.setting ? { setting: c.setting } : {}),
    ...(c.scenes ? { scenes: c.scenes } : {}),
  });
  if (existing.length === 0) {
    // The book type decides the front and back matter (a tech how-to gets how-to-use, glossary and resources).
    const book = await s.repos.books.require(ctx, projectId);
    const structure = await loadBookStructure(s.configDir, book.bookTypeId, book.template);
    const items: NewSectionInput[] = structure.front.map((x) => structureSection(x, bp));
    const created = await s.repos.manuscript.addSections(ctx, projectId, items, 1000);
    let pos = 1000 * (created.length + 1);
    const partIds = new Map<number, string>();
    // Reading order: each part is stored directly before its first chapter, so the stored positions already read
    // front matter, Part I, its chapters, Part II, its chapters, back matter (older books store the parts first and
    // are put in order when read, see orderPartsWithChapters).
    const addPart = async (number: number): Promise<void> => {
      const p = bp.parts.find((x) => x.number === number);
      if (!p || partIds.has(number)) return;
      const [part] = await s.repos.manuscript.addSections(ctx, projectId, [{ kind: 'part', area: 'body', title: p.title, number: p.number }], pos);
      if (part) partIds.set(p.number, part.id);
      pos += 1000;
    };
    for (const c of bp.chapters) {
      if (c.part) await addPart(c.part);
      await s.repos.manuscript.addSections(
        ctx,
        projectId,
        [
          {
            kind: 'chapter',
            area: 'body',
            title: c.title,
            number: c.number,
            wordTarget: c.word_target,
            plan: chapterPlan(c),
            partId: c.part ? (partIds.get(c.part) ?? null) : null,
          },
        ],
        pos,
      );
      pos += 1000;
    }
    // A part no chapter belongs to still gets its divider, after the chapters.
    for (const p of bp.parts) await addPart(p.number);
    const backItems: NewSectionInput[] = structure.back.map((x) => {
      const sec = structureSection(x, bp);
      // Also by lists published books under this pen name; it starts off until there is one.
      return x.kind === 'also_by' ? { ...sec, enabled: false } : sec;
    });
    await s.repos.manuscript.addSections(ctx, projectId, backItems, pos);
    return { created: items.length + bp.parts.length + bp.chapters.length + backItems.length, updated: 0 };
  }
  if (rebuild) return rebuildSections(s, ctx, projectId, bp, existing, chapterPlan);
  // Sections exist: update chapter plans; flag written chapters whose plan changed.
  let updated = 0;
  const chapters = existing.filter((x) => x.kind === 'chapter');
  let lastBody = Math.max(0, ...existing.filter((x) => x.area === 'body').map((x) => x.position));
  for (const c of bp.chapters) {
    const match = chapters.find((x) => x.number === c.number);
    const plan = chapterPlan(c);
    if (match) {
      const changed = JSON.stringify(match.plan) !== JSON.stringify(plan) || match.title !== c.title;
      if (changed) {
        await s.repos.manuscript.updateSectionPlan(ctx, match.id, {
          title: c.title,
          plan,
          wordTarget: c.word_target,
          blueprintChanged: match.currentVersionId !== null,
        });
        updated += 1;
      }
    } else {
      lastBody += 10;
      await s.repos.manuscript.addSections(
        ctx,
        projectId,
        [{ kind: 'chapter', area: 'body', title: c.title, number: c.number, wordTarget: c.word_target, plan }],
        lastBody,
      );
      updated += 1;
    }
  }
  return { created: 0, updated };
}

type ExistingSection = Awaited<ReturnType<Repos['manuscript']['listSections']>>[number];

/**
 * A whole-book rebuild (owner, 22 October 2026): the book's body follows the new blueprint exactly. Parts and chapters
 * are matched by number and take the new title, plan and part; new ones are added; ones the new plan no longer has are
 * switched off, never deleted, so their text and versions stay and an undo can switch them back on. The introduction
 * and conclusion take the new plan. Every section is put back in reading order: front matter, then each part followed
 * by its chapters, then back matter.
 */
async function rebuildSections(
  s: ApproveServices,
  ctx: RequestCtx,
  projectId: string,
  bp: Blueprint,
  existing: ExistingSection[],
  chapterPlan: (c: Blueprint['chapters'][number]) => Rec,
): Promise<{ created: number; updated: number }> {
  const m = s.repos.manuscript;
  let created = 0;
  let updated = 0;
  const front = existing.filter((x) => x.area === 'front');
  const back = existing.filter((x) => x.area === 'back');
  const parts = existing.filter((x) => x.kind === 'part');
  const chapters = existing.filter((x) => x.kind === 'chapter');
  const otherBody = existing.filter((x) => x.area === 'body' && x.kind !== 'part' && x.kind !== 'chapter');

  // Introduction and conclusion follow the new plan; their other plan keys (writer, template) stay.
  for (const x of [...front, ...back]) {
    if (x.kind !== 'introduction' && x.kind !== 'conclusion') continue;
    const mp = matterPlan(rec(x.kind === 'introduction' ? bp.front['introduction'] : bp.back['conclusion']));
    await m.updateSectionPlan(ctx, x.id, {
      plan: { ...x.plan, summary: mp.summary },
      ...(mp.wordTarget !== null ? { wordTarget: mp.wordTarget } : {}),
      blueprintChanged: x.currentVersionId !== null,
    });
    updated += 1;
  }

  const order: string[] = front.map((x) => x.id);
  const partIds = new Map<number, string>();
  const usedParts = new Set<string>();
  for (const p of bp.parts) {
    const match = parts.find((x) => x.number === p.number);
    if (match) {
      await m.updateSectionPlan(ctx, match.id, { title: p.title, enabled: true });
      partIds.set(p.number, match.id);
      usedParts.add(match.id);
      updated += 1;
    } else {
      const [part] = await m.addSections(ctx, projectId, [{ kind: 'part', area: 'body', title: p.title, number: p.number }], 0);
      if (part) {
        partIds.set(p.number, part.id);
        usedParts.add(part.id);
        created += 1;
      }
    }
  }
  const usedChapters = new Set<string>();
  const chapterIds = new Map<number, string>();
  for (const c of bp.chapters) {
    const match = chapters.find((x) => x.number === c.number);
    const partId = c.part ? (partIds.get(c.part) ?? null) : null;
    if (match) {
      await m.updateSectionPlan(ctx, match.id, {
        title: c.title,
        plan: chapterPlan(c),
        wordTarget: c.word_target,
        partId,
        enabled: true,
        blueprintChanged: match.currentVersionId !== null,
      });
      chapterIds.set(c.number, match.id);
      usedChapters.add(match.id);
      updated += 1;
    } else {
      const [ch] = await m.addSections(
        ctx,
        projectId,
        [{ kind: 'chapter', area: 'body', title: c.title, number: c.number, wordTarget: c.word_target, plan: chapterPlan(c), partId }],
        0,
      );
      if (ch) {
        chapterIds.set(c.number, ch.id);
        usedChapters.add(ch.id);
        created += 1;
      }
    }
  }
  // Reading order of the body: each part, then its chapters; chapters with no part where the plan puts them.
  const placedParts = new Set<number>();
  for (const c of bp.chapters) {
    if (c.part && !placedParts.has(c.part)) {
      placedParts.add(c.part);
      const pid = partIds.get(c.part);
      if (pid) order.push(pid);
    }
    const cid = chapterIds.get(c.number);
    if (cid) order.push(cid);
  }
  for (const p of bp.parts) {
    const pid = partIds.get(p.number);
    if (pid && !order.includes(pid)) order.push(pid);
  }
  order.push(...otherBody.map((x) => x.id));
  // Parts and chapters the new plan no longer has: switched off, kept after the body with their versions.
  for (const x of [...parts.filter((p) => !usedParts.has(p.id)), ...chapters.filter((c) => !usedChapters.has(c.id))]) {
    if (x.enabled) {
      await m.updateSectionPlan(ctx, x.id, { enabled: false });
      updated += 1;
    }
    order.push(x.id);
  }
  order.push(...back.map((x) => x.id));
  let pos = 1000;
  for (const id of order) {
    await m.updateSectionPlan(ctx, id, { position: pos });
    pos += 1000;
  }
  return { created, updated };
}

/**
 * Approves a blueprint version (the latest when none is given): validates it, marks it approved, creates or updates the
 * book's sections and moves the book to writing. Shared by POST /books/:id/blueprint/approve and the batch_book job.
 */
export async function approveBlueprint(s: ApproveServices, ctx: RequestCtx, id: string, version?: number, opts: { rebuild?: boolean } = {}) {
  const { books, planning } = s.repos;
  const bp = version ? await planning.blueprintByVersion(ctx, id, version) : await planning.latestBlueprint(ctx, id);
  if (!bp) throw new AppError('invalid_state', 'Build the blueprint first.');
  const v = BlueprintSchema.safeParse(bp.data);
  if (!v.success)
    throw new AppError(
      'validation_failed',
      'The blueprint is missing parts.',
      v.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  if (v.data.chapters.length === 0) throw new AppError('validation_failed', 'The blueprint has no chapters.');
  const approved = await planning.approveBlueprint(ctx, bp.id);
  // Blueprints saved before the title fix (or edited by hand) may still hold look-alike hyphens: only those and stray
  // spaces are tidied here, the wording stays (live acceptance run, 19 October 2026).
  const title = tidyTitleChars(v.data.title);
  await books.setApprovedBlueprint(ctx, id, approved.id, title || null, tidyTitleChars(v.data.subtitle));
  const sections = await syncSections(s, ctx, id, v.data, opts.rebuild === true);
  await books.advanceStage(ctx, id, 'writing');
  await s.bus.publish(ctx.workspaceId, { projectId: id, type: 'book.updated', data: { projectId: id, part: 'blueprint', approved: approved.id } });
  return { blueprint: approved, sections, book: await books.require(ctx, id) };
}

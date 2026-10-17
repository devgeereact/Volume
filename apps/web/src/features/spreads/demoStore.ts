import { useSyncExternalStore } from "react";
import { ApiError } from "../../api/client";
import { PICTURE_ESTIMATE_USD, type CharacterView, type PictureStoryInput, type SpreadLayout } from "../../api/picture";
import { demoCharacters, demoPictureBooksMade, demoPictureStories, demoPictureView, demoRepaint, type DemoPictureView } from "../../demo/pictureBook";

/* Demo mode for the picture-book screens: one in-memory store per demo book, so edits on the Writing step
   still show on Export in the same visit. The run, a repaint and the export are simulated with timers; nothing
   talks to a server and nothing is saved. A reload starts again. */

export interface DemoChild {
  kind: string;
  status: string;
}

export interface DemoRun {
  progress: number;
  message: string;
  children: DemoChild[];
}

export interface DemoBookState {
  view: DemoPictureView | null;
  characters: CharacterView[];
  run: DemoRun | null;
  /** Progress (0 to 1) of each spread being repainted. */
  painting: Record<string, number>;
  exportStatus: "idle" | "running" | "done";
  exportProgress: number;
  builtAt: number | null;
  spentUsd: number;
  budgetUsd: number;
}

const DEMO_TIME = Date.parse("2026-10-04T14:31:00+01:00");
const books = new Map<string, DemoBookState>();
const listeners = new Set<() => void>();
let repaintRound = 0;

function initial(bookId: string): DemoBookState {
  const story = demoPictureStories[bookId];
  const made = !!story && demoPictureBooksMade.has(bookId);
  return {
    view: story && made ? demoPictureView(bookId, story, DEMO_TIME) : null,
    characters: story && made ? demoCharacters(bookId, story) : [],
    run: null,
    painting: {},
    exportStatus: made ? "done" : "idle",
    exportProgress: made ? 1 : 0,
    builtAt: made ? DEMO_TIME : null,
    spentUsd: made ? 1.38 : 0,
    budgetUsd: made ? 6 : 5,
  };
}

function get(bookId: string): DemoBookState {
  let s = books.get(bookId);
  if (!s) {
    s = initial(bookId);
    books.set(bookId, s);
  }
  return s;
}

function set(bookId: string, fn: (s: DemoBookState) => DemoBookState): void {
  books.set(bookId, fn(get(bookId)));
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useDemoPictureBook(bookId: string): DemoBookState {
  return useSyncExternalStore(
    subscribe,
    () => get(bookId),
    () => get(bookId),
  );
}

export function hasDemoStory(bookId: string): boolean {
  return bookId in demoPictureStories;
}

const tick = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Simulates the run: story and scenes, two character references, then one picture per spread. */
export async function demoStartRun(bookId: string, input: PictureStoryInput, spreads: number): Promise<void> {
  const story = demoPictureStories[bookId];
  if (!story) throw new ApiError(409, "invalid_state", "This demo book has no picture book.");
  const total = Math.min(spreads, story.spreads.length);
  const children = (): DemoChild[] => [
    { kind: "picture_story", status: "queued" },
    { kind: "picture_characters", status: "queued" },
    ...Array.from({ length: total }, () => ({ kind: "spread_image", status: "queued" })),
  ];
  const kids = children();
  const update = (progress: number, message: string) => set(bookId, (s) => ({ ...s, run: { progress, message, children: kids.map((c) => ({ ...c })) } }));
  kids[0] = { kind: "picture_story", status: "running" };
  update(0.05, "Writing the story");
  void (async () => {
    await tick(1400);
    kids[0] = { kind: "picture_story", status: "succeeded" };
    kids[1] = { kind: "picture_characters", status: "running" };
    update(0.25, "Painting the character references");
    await tick(1100);
    kids[1] = { kind: "picture_characters", status: "succeeded" };
    for (let i = 0; i < total; i++) {
      kids[i + 2] = { kind: "spread_image", status: "running" };
      update(0.3 + (0.7 * i) / total, `Painting spread ${i + 1}`);
      await tick(380);
      kids[i + 2] = { kind: "spread_image", status: "succeeded" };
    }
    const view = demoPictureView(bookId, story, Date.now());
    set(bookId, (s) => ({
      ...s,
      view: {
        ...view,
        story: { ...view.story, ...input },
        newWord: input.newWord ?? view.newWord,
        spreads: view.spreads.slice(0, total),
      },
      characters: demoCharacters(bookId, story),
      run: null,
      spentUsd: Math.round((s.spentUsd + (total + 2) * PICTURE_ESTIMATE_USD * 0.6) * 100) / 100,
    }));
  })();
  await tick(150);
}

export async function demoSaveText(bookId: string, sectionId: string, text: string): Promise<void> {
  await tick(350);
  set(bookId, (s) =>
    s.view
      ? {
          ...s,
          view: {
            ...s.view,
            spreads: s.view.spreads.map((sp) =>
              sp.sectionId === sectionId ? { ...sp, text, wordCount: text.trim() ? text.trim().split(/\s+/).length : 0, updatedAt: Date.now() } : sp,
            ),
          },
        }
      : s,
  );
}

export async function demoSetLayout(bookId: string, sectionId: string, layout: SpreadLayout): Promise<void> {
  await tick(200);
  set(bookId, (s) => (s.view ? { ...s, view: { ...s.view, spreads: s.view.spreads.map((sp) => (sp.sectionId === sectionId ? { ...sp, layout } : sp)) } } : s));
}

/** Repaints one spread. `overBudget` (demo URL ?budget=low) answers as the server does at the budget limit. */
export async function demoPaint(bookId: string, sectionId: string, overBudget: boolean): Promise<void> {
  const s = get(bookId);
  const story = demoPictureStories[bookId];
  const spread = s.view?.spreads.find((x) => x.sectionId === sectionId);
  if (!story || !spread) throw new ApiError(404, "not_found", "That spread was not found.");
  await tick(300);
  if (overBudget || s.spentUsd + PICTURE_ESTIMATE_USD > s.budgetUsd) {
    throw new ApiError(
      402,
      "budget_exceeded",
      `One more picture needs about $${PICTURE_ESTIMATE_USD.toFixed(2)} more than this book's budget allows. Raise the budget first.`,
      { scope: "book", limitUsd: s.budgetUsd, spentUsd: overBudget ? s.budgetUsd - 0.05 : s.spentUsd, estimateUsd: PICTURE_ESTIMATE_USD },
    );
  }
  repaintRound += 1;
  const round = repaintRound;
  const steps = 6;
  void (async () => {
    for (let i = 1; i <= steps; i++) {
      set(bookId, (st) => ({ ...st, painting: { ...st.painting, [sectionId]: i / (steps + 1) } }));
      await tick(320);
    }
    set(bookId, (st) => {
      const painting = { ...st.painting };
      delete painting[sectionId];
      return {
        ...st,
        painting,
        spentUsd: Math.round((st.spentUsd + PICTURE_ESTIMATE_USD * 0.6) * 100) / 100,
        exportStatus: st.exportStatus === "done" ? "idle" : st.exportStatus,
        view: st.view
          ? {
              ...st.view,
              spreads: st.view.spreads.map((sp) =>
                sp.sectionId === sectionId
                  ? { ...sp, imageUrl: demoRepaint(sp, story, round), imageAssetId: `${sp.imageAssetId ?? sectionId}-r${round}`, updatedAt: Date.now() }
                  : sp,
              ),
            }
          : null,
      };
    });
  })();
}

export function demoRaiseBudget(bookId: string, to: number): void {
  set(bookId, (s) => ({ ...s, budgetUsd: to }));
}

export async function demoBuildExport(bookId: string): Promise<void> {
  set(bookId, (s) => ({ ...s, exportStatus: "running", exportProgress: 0.05 }));
  void (async () => {
    for (const p of [0.25, 0.5, 0.75, 0.95]) {
      await tick(450);
      set(bookId, (s) => ({ ...s, exportProgress: p }));
    }
    await tick(300);
    set(bookId, (s) => ({ ...s, exportStatus: "done", exportProgress: 1, builtAt: Date.now() }));
  })();
  await tick(100);
}

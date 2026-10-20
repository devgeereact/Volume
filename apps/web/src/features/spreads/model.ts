import template from "@config/book-templates/picture-book.json";
import { PICTURE_ESTIMATE_USD, SPREAD_COUNT, type PictureEstimate, type PictureStoryInput, type SpreadLayout } from "../../api/picture";

/* Plain rules for the picture-book screens: words for layouts and steps, the story form and its server body,
   the cost line, and the preflight shape. The Bedtime Story rules come from config/book-templates/picture-book.json.
   No React here, so model.test.ts covers it. */

export const layoutLabels: Record<SpreadLayout, string> = {
  "text-left": "Text on the left page",
  "text-right": "Text on the right page",
  "text-top": "Text at the top",
  "text-bottom": "Text at the bottom",
};

/** The positive messages the template names (storyRules.message: "One positive message: kindness, courage, ..."). */
export const messageOptions: string[] = (template.storyRules.message.split(":")[1] ?? "kindness")
  .split(",")
  .map((m) => m.trim().replace(/\.$/, ""))
  .filter(Boolean);

/** The template's rule for the problem in the story (storyRules.conflict). Shown as the hint. */
export const GENTLE_PROBLEM_RULE: string = template.storyRules.conflict;

/** Reader ages the template offers (audience.ageRangeOptions), as "3 to 7". */
export const pictureAgeRanges: string[] = template.audience.ageRangeOptions.map((a) => `${a.min} to ${a.max}`);
const defaultAge = `${template.audience.defaultAgeRange.min} to ${template.audience.defaultAgeRange.max}`;

/** Words that suit one spread (spreads.wordsPerSpread). */
export const WORDS_PER_SPREAD: { min: number; max: number } = template.spreads.wordsPerSpread;

/** The story form on the Writing step. Strings so the fields can hold what the owner types. */
export interface StoryForm {
  topic: string;
  ageRange: string;
  newWord: boolean;
  newWordText: string;
  problem: string;
  message: string;
  characterIdeas: string;
  spreads: string;
  goodnightMessage: boolean;
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * The form filled from what the wizard saved (book settings.genre and settings.pictureBook.story) and the idea.
 * The plan's spread count is the default so the book meets the shortest colour page count.
 */
export function storyFormFrom(settings: Record<string, unknown>, idea: string | null, planSpreads: number | null): StoryForm {
  const genre = (typeof settings["genre"] === "object" && settings["genre"] !== null ? settings["genre"] : {}) as Record<string, unknown>;
  const pb = (typeof settings["pictureBook"] === "object" && settings["pictureBook"] !== null ? settings["pictureBook"] : {}) as Record<string, unknown>;
  const story = (typeof pb["story"] === "object" && pb["story"] !== null ? pb["story"] : {}) as Record<string, unknown>;
  const savedWord = str(story["newWord"]) || (genre["newWord"] === "writer suggests" ? "" : str(genre["newWord"]));
  const newWordOn = genre["newWord"] !== null || !!savedWord;
  const spreads = typeof settings["chapters"] === "number" ? settings["chapters"] : planSpreads;
  return {
    topic: str(story["topic"]) || (idea ?? ""),
    ageRange: str(story["ageRange"]) || str(genre["ageRange"]) || defaultAge,
    newWord: newWordOn,
    newWordText: savedWord,
    problem: str(story["conflict"]) || str(genre["problem"]),
    message: str(story["theme"]) || str(genre["message"]) || messageOptions[0] || "kindness",
    characterIdeas: str(story["characterIdeas"]),
    spreads: String(clampSpreads(spreads ?? 10)),
    goodnightMessage: story["goodnightMessage"] === true,
  };
}

export function clampSpreads(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return Math.min(SPREAD_COUNT.max, Math.max(SPREAD_COUNT.min, Math.round(n)));
}

export interface StoryFormErrors {
  topic?: string;
  spreads?: string;
  newWordText?: string;
}

export function validateStory(f: StoryForm): StoryFormErrors {
  const e: StoryFormErrors = {};
  if (f.topic.trim().length < 12) e.topic = "Add a sentence about the story, for example who it is about and what happens.";
  const n = Number(f.spreads);
  if (!Number.isInteger(n) || n < SPREAD_COUNT.min || n > SPREAD_COUNT.max) e.spreads = `Use ${SPREAD_COUNT.min} to ${SPREAD_COUNT.max} spreads.`;
  if (f.newWord && f.newWordText.trim().length > 60) e.newWordText = "Keep the new word under 60 characters.";
  return e;
}

/** The form as the server's story input. The gentle problem goes in its own field (conflict). */
export function storyInput(f: StoryForm): PictureStoryInput {
  const problem = f.problem.trim();
  const out: PictureStoryInput = { topic: f.topic.trim().slice(0, 2000), ageRange: f.ageRange, theme: f.message, goodnightMessage: f.goodnightMessage };
  if (problem) out.conflict = problem.slice(0, 500);
  if (f.newWord && f.newWordText.trim()) out.newWord = f.newWordText.trim();
  if (f.characterIdeas.trim()) out.characterIdeas = f.characterIdeas.trim().slice(0, 2000);
  return out;
}

/** Pictures the run makes: one per spread and one reference per main character (D-045). */
export function runPictures(spreads: number, characters = 2): number {
  return Math.max(0, spreads) + Math.max(0, characters);
}

/** "up to about $2.40" for the pictures of a run with no server price (demo books, the new-book wizard). */
export function runEstimate(spreads: number, characters = 2): string {
  return `up to about $${(runPictures(spreads, characters) * PICTURE_ESTIMATE_USD).toFixed(2)}`;
}

/** "about $0.10" or "about $0.05 to $0.10" (one figure when both ends round the same). */
function usdRange(low: number, high: number): string {
  if (high < 0.01) return "under $0.01";
  const lo = low.toFixed(2);
  const hi = high.toFixed(2);
  return lo === hi ? `about $${lo}` : `about $${lo} to $${hi}`;
}

/**
 * The whole run (story, scene and reference prompts, and every picture) from the server's estimate, for the spread
 * count in the form: the server prices the text once and one picture, so another spread count needs no new call.
 */
export function runEstimateFrom(e: PictureEstimate, spreads: number): string {
  const pictures = runPictures(spreads, e.characters);
  return usdRange(e.text.lowUsd + pictures * e.image.lowUsd, e.text.highUsd + pictures * e.image.highUsd);
}

/** One picture: the server's price when it has one, else the demo figure. */
export function pictureEstimateFrom(e: PictureEstimate | null | undefined): string {
  return e ? usdRange(e.image.lowUsd, e.image.highUsd) : pictureEstimate;
}

export const pictureEstimate = `about $${PICTURE_ESTIMATE_USD.toFixed(2)}`;

/** Steps of a picture_book run, by child job kind. */
export const stepLabels: Record<string, string> = {
  picture_story: "Story and scenes",
  picture_characters: "Character references",
  spread_image: "Spread pictures",
};

export type StepState = "done" | "running" | "queued" | "failed" | "attention";

export interface RunStep {
  id: string;
  label: string;
  state: StepState;
  detail: string;
}

/** Children of the run (from GET /jobs/:id) as three steps with their state and a count for the pictures. */
export function runSteps(children: readonly { kind: string | null; status: string | null }[]): RunStep[] {
  const order = ["picture_story", "picture_characters", "spread_image"];
  return order.map((kind) => {
    const list = children.filter((c) => c.kind === kind);
    const done = list.filter((c) => c.status === "succeeded").length;
    const state: StepState =
      list.length === 0
        ? "queued"
        : list.some((c) => c.status === "failed" || c.status === "cancelled")
          ? "failed"
          : list.some((c) => c.status === "needs_attention")
            ? "attention"
            : done === list.length
              ? "done"
              : list.some((c) => c.status === "running")
                ? "running"
                : "queued";
    const detail = kind === "spread_image" && list.length > 0 ? `${done} of ${list.length}` : "";
    return { id: kind, label: stepLabels[kind] ?? kind, state, detail };
  });
}

/** A child of the run as the panel needs it, from GET /jobs/:id or the live event stream. */
export interface RunChild {
  id: string;
  kind: string | null;
  status: string | null;
  /** 0 to 1. */
  progress: number;
  /** The step the child is on, from job.progress events (live only). */
  message?: string | null | undefined;
}

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "needs_attention"]);

/**
 * The run's children from the polled job record and the live stream, merged by id. The stream is newer, so its
 * status wins unless the record already says the child ended; progress only goes up. Children the record has not
 * listed yet still show, so the steps move as soon as the events arrive.
 */
export function mergeRunChildren(record: readonly RunChild[], live: readonly RunChild[]): RunChild[] {
  const out = new Map<string, RunChild>();
  for (const c of record) out.set(c.id, { ...c });
  for (const l of live) {
    const r = out.get(l.id);
    if (!r) {
      out.set(l.id, { ...l });
      continue;
    }
    const recordEnded = r.status !== null && TERMINAL.has(r.status);
    out.set(l.id, {
      id: l.id,
      kind: r.kind ?? l.kind,
      status: recordEnded ? r.status : (l.status ?? r.status),
      progress: Math.max(r.progress, l.progress),
      message: l.message ?? r.message ?? null,
    });
  }
  return [...out.values()];
}

/** How much of the run each step is worth. The spreads take the longest. */
const STEP_WEIGHTS: Record<string, number> = { picture_story: 0.25, picture_characters: 0.25, spread_image: 0.5 };

function childDone(c: RunChild): number {
  if (c.status === "succeeded" || c.status === "needs_attention") return 1;
  return Math.max(0, Math.min(1, c.progress));
}

/** The run's progress, 0 to 1, from its children: each step's share times how far its children have got. */
export function runProgressFromChildren(children: readonly RunChild[]): number {
  let total = 0;
  for (const [kind, weight] of Object.entries(STEP_WEIGHTS)) {
    const list = children.filter((c) => c.kind === kind);
    if (list.length === 0) continue;
    total += (weight * list.reduce((n, c) => n + childDone(c), 0)) / list.length;
  }
  return Math.max(0, Math.min(1, total));
}

/** The line under the title: the running child's own message, else its step name. Null when nothing runs yet. */
export function runLineFromChildren(children: readonly RunChild[]): string | null {
  const running = children.filter((c) => c.status === "running");
  const withMessage = running.find((c) => c.message);
  if (withMessage?.message) return withMessage.message;
  const first = running[0];
  return first?.kind ? (stepLabels[first.kind] ?? null) : null;
}

/** The highest progress seen for a run. A new run id starts again from its own value. */
export interface RunPeak {
  runId: string | null;
  value: number;
}

/** The next high-water mark: progress shown for one run never goes down. */
export function nextRunPeak(prev: RunPeak, runId: string | null, value: number): RunPeak {
  const v = Math.max(0, Math.min(1, value));
  if (prev.runId !== runId) return { runId, value: v };
  return v > prev.value ? { runId, value: v } : prev;
}

/* ---------- Preflight from an export record ---------- */

export type PreflightSeverity = "pass" | "warn" | "block";

export interface PicturePreflightItem {
  id: string;
  area: string;
  severity: PreflightSeverity;
  message: string;
}

/** The preflight stored on a pdf_print export record ({ items: [...] }), read defensively. */
export function preflightItems(raw: unknown): PicturePreflightItem[] {
  if (typeof raw !== "object" || raw === null) return [];
  const items = (raw as Record<string, unknown>)["items"];
  if (!Array.isArray(items)) return [];
  return items.flatMap((x): PicturePreflightItem[] => {
    if (typeof x !== "object" || x === null) return [];
    const r = x as Record<string, unknown>;
    const severity = r["severity"];
    if (typeof r["id"] !== "string" || typeof r["message"] !== "string") return [];
    if (severity !== "pass" && severity !== "warn" && severity !== "block") return [];
    return [{ id: r["id"], area: typeof r["area"] === "string" ? r["area"] : "interior", severity, message: r["message"] }];
  });
}

/** The picture-book checks first (bleed, pictures, safe area, page count, disclosure), then the rest. */
export function sortPreflight(items: PicturePreflightItem[]): PicturePreflightItem[] {
  const first = ["interior.bleed", "picture.spread-images", "picture.safe-area", "picture.page-count", "kdp.ai-disclosure"];
  const rank = (id: string) => {
    const i = first.indexOf(id);
    return i === -1 ? first.length : i;
  };
  const sev: Record<PreflightSeverity, number> = { block: 0, warn: 1, pass: 2 };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id) || sev[a.severity] - sev[b.severity]);
}

/** "AI-generated" for a disclosure level. */
export function disclosureText(level: string | null | undefined): string {
  if (level === "ai_generated") return "AI-generated";
  if (level === "ai_assisted") return "AI-assisted";
  return "Not set";
}

/** Printed pages: matter, a blank before spread 1 when needed, two pages per spread, a blank to make it even (pageCount on the server). */
export function pageCountFor(frontPages: number, spreads: number, backPages: number): number {
  const lead = spreads > 0 && frontPages % 2 === 0 ? frontPages + 1 : frontPages;
  const used = lead + spreads * 2 + backPages;
  return used % 2 === 1 ? used + 1 : used;
}

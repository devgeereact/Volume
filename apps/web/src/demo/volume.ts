import type { ApiBatchDetail, ApiInvitation, ApiMember, ApiTitleSlot, QualityGate, TitleFormat } from "../api/types";
import { books, DEMO_NOW } from "./books";
import { getPenName } from "./penNames";

/* Demo fixtures for Volume mode (phase 8): two batches, a week of planned releases, the members of the
   workspace and one pending invitation. They use the server's shapes (api/types.ts) so the screens read one
   shape in both modes. Times are epoch milliseconds; planned dates sit at 12:00 UTC so they fall on the same
   day in London. The people and addresses are made up for the demo (example.com). */

const DAY_MS = 86_400_000;
const now = Date.parse(DEMO_NOW);
/** 12:00 UTC on the day `n` days after the demo's today (4 October 2026). */
export function demoDay(n: number): number {
  const d = new Date(now + n * DAY_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12);
}

function bookRef(id: string) {
  const b = books.find((x) => x.id === id);
  const pen = b ? getPenName(b.penNameId) : undefined;
  return {
    title: b?.title ?? null,
    idea: b?.subtitle || null,
    stage: b?.stage ?? "idea",
    status: "active",
    profileId: b?.penNameId ?? "",
    penName: pen?.name ?? "Unknown pen name",
  };
}

function slot(id: string, bookId: string, batchId: string | null, format: TitleFormat, day: number, confirmed: boolean): ApiTitleSlot {
  const ref = bookRef(bookId);
  return {
    id,
    bookId,
    batchId,
    format,
    plannedAt: demoDay(day),
    status: confirmed ? "confirmed" : "planned",
    confirmedAt: confirmed ? now - DAY_MS : null,
    createdAt: now - 2 * DAY_MS,
    book: { title: ref.title, idea: ref.idea, profileId: ref.profileId, penName: ref.penName },
  };
}

export function demoSlots(): ApiTitleSlot[] {
  return [
    slot("slot-1", "handover", "batch-nurses", "paperback", 2, true),
    slot("slot-2", "handover", "batch-nurses", "ebook", 2, true),
    slot("slot-3", "sourdough-on-a-weeknight", null, "paperback", 4, false),
    slot("slot-4", "the-calm-ward", "batch-nurses", "ebook", 9, false),
  ];
}

function item(batchId: string, position: number, bookId: string, ready: boolean, run: ApiBatchDetail["items"][number]["run"], jobId: string | null) {
  return {
    id: `${batchId}-item-${position}`,
    batchId,
    bookId,
    position,
    status: ready ? ("ready" as const) : ("planned" as const),
    jobId,
    readyAt: ready ? now - 3 * 3_600_000 : null,
    book: bookRef(bookId),
    run,
    slots: [] as ApiTitleSlot[],
  };
}

export function demoBatches(): ApiBatchDetail[] {
  const nurses: ApiBatchDetail = {
    id: "batch-nurses",
    name: "Nursing shelf, winter",
    notes: "Three short guides for new nurses, released a week apart.",
    jobId: "demo-batch-job",
    startedAt: now - 5 * 3_600_000,
    createdAt: now - 2 * DAY_MS,
    updatedAt: now - 3_600_000,
    status: "running",
    progress: 0.55,
    itemCount: 3,
    readyCount: 1,
    penNames: ["Harni Muharami"],
    job: null,
    items: [
      item("batch-nurses", 1, "handover", true, { status: "succeeded", progress: 1, error: null }, "demo-book-job-1"),
      item("batch-nurses", 2, "the-calm-ward", false, { status: "running", progress: 0.62, error: null }, "demo-book-job-2"),
      item("batch-nurses", 3, "night-shift-survival", false, { status: "queued", progress: 0, error: null }, "demo-book-job-3"),
    ],
  };
  const mixed: ApiBatchDetail = {
    id: "batch-mixed",
    name: "Mixed October set",
    notes: null,
    jobId: null,
    startedAt: null,
    createdAt: now - DAY_MS,
    updatedAt: now - DAY_MS,
    status: "draft",
    progress: 0,
    itemCount: 4,
    readyCount: 0,
    penNames: ["Gideon Akinlotan", "Harni Muharami", "J. R. Kade"],
    job: null,
    items: [
      item("batch-mixed", 1, "the-new-charge-nurse", false, null, null),
      item("batch-mixed", 2, "speaking-up-safely", false, null, null),
      item("batch-mixed", 3, "ai-for-absolute-beginners", false, null, null),
      item("batch-mixed", 4, "the-ninth-lock", false, null, null),
    ],
  };
  return [nurses, mixed];
}

/** The quality gate per demo book: what preflight and the claims list would say. */
export function demoGate(bookId: string, runStatus: string | null): QualityGate {
  if (runStatus === "running" || runStatus === "queued") {
    return { ok: false, blocks: [{ id: "manuscript.incomplete", area: "manuscript", message: "The manuscript is not finished yet." }], openClaims: 0 };
  }
  if (bookId === "the-new-charge-nurse") return { ok: false, blocks: [], openClaims: 2 };
  if (bookId === "speaking-up-safely") {
    return { ok: false, blocks: [{ id: "cover.wrap", area: "cover", message: "The paperback wrap has not been built." }], openClaims: 0 };
  }
  return { ok: true, blocks: [], openClaims: 0 };
}

export function demoMembers(): ApiMember[] {
  return [
    {
      userId: "u-owner",
      role: "owner",
      displayName: "Gideon Akinlotan",
      email: null,
      signedIn: true,
      isYou: true,
      joinedAt: Date.parse("2026-09-20T10:00:00Z"),
    },
    { userId: "u-amara", role: "editor", displayName: "Amara Okafor", email: "amara@example.com", signedIn: true, isYou: false, joinedAt: now - 6 * DAY_MS },
    { userId: "u-sam", role: "viewer", displayName: "Sam Reid", email: "sam@example.com", signedIn: false, isYou: false, joinedAt: now - 2 * DAY_MS },
  ];
}

export function demoInvitations(): ApiInvitation[] {
  return [{ id: "inv-1", email: "proofreader@example.com", role: "viewer", status: "pending", createdAt: now - 20 * 3_600_000, acceptedAt: null }];
}

/** Demo "today" for the schedule, so the planned week lines up with the other demo screens. */
export const DEMO_TODAY_MS = demoDay(0);

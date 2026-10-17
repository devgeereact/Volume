import { describe, expect, it } from "vitest";
import { isApiError } from "../../api/client";
import { demoDay } from "../../demo/volume";
import {
  demoAddSlot,
  demoConfirmSlot,
  demoCreateBatch,
  demoDeleteBatch,
  demoLimit,
  demoMarkReady,
  demoStartBatch,
  demoTick,
  initialDemoVolume,
} from "./demoVolume";

function rejected(fn: () => unknown): { code: string; details: unknown } {
  try {
    fn();
  } catch (e) {
    if (isApiError(e)) return { code: e.code, details: e.details };
    throw e;
  }
  throw new Error("expected a refusal");
}

describe("demo schedule follows the server's rules", () => {
  it("reads the title limit from the KDP rules file", () => {
    expect(demoLimit.ruleId).toBe("titles.creationLimit");
    expect(demoLimit.maxNewTitlesPerFormat).toBeGreaterThan(0);
    expect(demoLimit.periodDays).toBe(7);
  });

  it("refuses a third paperback in 7 days with the clashes and the next free date", () => {
    const s = initialDemoVolume();
    // The demo already plans two paperbacks on days 2 and 4.
    const r = rejected(() => demoAddSlot(s, { bookId: "the-calm-ward", format: "paperback", plannedAt: demoDay(3) }));
    expect(r.code).toBe("title_limit");
    const details = r.details as { conflicts: unknown[]; nextFreeAt: number };
    expect(details.conflicts).toHaveLength(2);
    expect(details.nextFreeAt).toBeGreaterThan(demoDay(3));
    // The next free date is accepted.
    const next = demoAddSlot(s, { bookId: "the-calm-ward", format: "paperback", plannedAt: details.nextFreeAt });
    expect(next.slots.filter((x) => x.format === "paperback")).toHaveLength(3);
  });

  it("allows the same day in another format", () => {
    const s = demoAddSlot(initialDemoVolume(), { bookId: "night-shift-survival", format: "hardcover", plannedAt: demoDay(3) });
    expect(s.slots.some((x) => x.bookId === "night-shift-survival" && x.format === "hardcover")).toBe(true);
  });

  it("refuses a second slot for the same book and format", () => {
    expect(rejected(() => demoAddSlot(initialDemoVolume(), { bookId: "handover", format: "ebook", plannedAt: demoDay(20) })).code).toBe("conflict");
  });

  it("confirms only books that pass the quality gate", () => {
    let s = initialDemoVolume();
    s = demoAddSlot(s, { bookId: "the-new-charge-nurse", format: "hardcover", plannedAt: demoDay(5) });
    const slot = s.slots.find((x) => x.bookId === "the-new-charge-nurse");
    if (!slot) throw new Error("slot missing");
    const r = rejected(() => demoConfirmSlot(s, slot.id));
    expect(r.code).toBe("quality_gate");
    expect((r.details as { openClaims: number }).openClaims).toBe(2);
    const sourdough = s.slots.find((x) => x.bookId === "sourdough-on-a-weeknight");
    if (!sourdough) throw new Error("slot missing");
    expect(demoConfirmSlot(s, sourdough.id).slots.find((x) => x.id === sourdough.id)?.status).toBe("confirmed");
  });
});

describe("demo batches", () => {
  it("creates, refuses a book that is in another batch, starts and runs one book at a time", () => {
    let s = initialDemoVolume();
    expect(rejected(() => demoCreateBatch(s, { name: "Taken", bookIds: ["handover"] })).code).toBe("conflict");
    const made = demoCreateBatch(s, { name: "Two books", bookIds: ["sourdough-on-a-weeknight", "windowsill-herbs"] });
    s = demoStartBatch(made.state, made.id);
    let b = s.batches.find((x) => x.id === made.id);
    expect(b?.status).toBe("running");
    expect(b?.items.map((i) => i.run?.status)).toEqual(["running", "queued"]);
    for (let i = 0; i < 8; i += 1) s = demoTick(s, made.id);
    b = s.batches.find((x) => x.id === made.id);
    expect(b?.status).toBe("succeeded");
    expect(b?.progress).toBe(1);
  });

  it("will not delete or restart a running batch", () => {
    const s = initialDemoVolume();
    expect(rejected(() => demoDeleteBatch(s, "batch-nurses")).code).toBe("invalid_state");
    expect(rejected(() => demoStartBatch(s, "batch-nurses")).code).toBe("invalid_state");
  });

  it("marks a book ready only after the gate passes", () => {
    const s = initialDemoVolume();
    expect(rejected(() => demoMarkReady(s, "batch-mixed", "batch-mixed-item-1")).code).toBe("quality_gate");
    const next = demoMarkReady(s, "batch-mixed", "batch-mixed-item-3");
    expect(next.batches.find((b) => b.id === "batch-mixed")?.readyCount).toBe(1);
  });
});

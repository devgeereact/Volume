import { describe, expect, it } from "vitest";
import type { ApiTitleSlot, TitleLimitDetails } from "../../api/types";
import { fromIsoDate, gateSummary, isoDate, limitSentence, refusalText, runLabel, runProgress, windowDays, windowRange, windowUse } from "./model";

const limit = { maxNewTitlesPerFormat: 2, periodDays: 7, ruleId: "titles.creationLimit", rulesVersion: "2026-10-17" };
const day = (d: number) => Date.UTC(2026, 9, d, 12);

function slot(id: string, title: string, format: ApiTitleSlot["format"], plannedAt: number): ApiTitleSlot {
  return {
    id,
    bookId: id,
    batchId: null,
    format,
    plannedAt,
    status: "planned",
    confirmedAt: null,
    createdAt: 0,
    book: { title, idea: null, profileId: "p", penName: "Pen" },
  };
}

describe("schedule window", () => {
  it("lists seven days at noon UTC from the start day", () => {
    const days = windowDays(Date.UTC(2026, 9, 4, 23, 30));
    expect(days).toHaveLength(7);
    expect(days[0]).toBe(day(4));
    expect(days[6]).toBe(day(10));
  });

  it("covers whole days for the server query", () => {
    const r = windowRange(day(4));
    expect(r.from).toBe(Date.UTC(2026, 9, 4));
    expect(r.to).toBe(Date.UTC(2026, 9, 11) - 1);
  });

  it("round-trips dates for the date field and rejects impossible ones", () => {
    expect(isoDate(day(6))).toBe("2026-10-06");
    expect(fromIsoDate("2026-10-06")).toBe(day(6));
    expect(fromIsoDate("2026-02-30")).toBeNull();
    expect(fromIsoDate("6 October")).toBeNull();
  });

  it("counts one format inside the window against the limit from the rules", () => {
    const slots = [
      slot("a", "A", "paperback", day(5)),
      slot("b", "B", "paperback", day(8)),
      slot("c", "C", "ebook", day(8)),
      slot("d", "D", "paperback", day(12)),
    ];
    expect(windowUse(slots, "paperback", day(4), limit)).toEqual({ used: 2, max: 2, full: true });
    expect(windowUse(slots, "ebook", day(4), limit)).toEqual({ used: 1, max: 2, full: false });
    expect(windowUse(slots, "hardcover", day(4), limit).used).toBe(0);
  });
});

describe("refusal message", () => {
  it("names the limit, the clashing books and the next free date", () => {
    const details: TitleLimitDetails = {
      conflicts: [slot("a", "Handover", "paperback", day(6)), slot("b", "Sourdough on a Weeknight", "paperback", day(8))],
      nextFreeAt: day(13),
      limit,
    };
    const r = refusalText(details, "paperback");
    expect(r.title).toBe("No paperback slot free on that date");
    expect(r.body).toContain("KDP allows 2 new paperback titles in any 7 days for one account.");
    expect(r.body).toContain("Handover (6 October 2026) and Sourdough on a Weeknight (8 October 2026)");
    expect(r.body).toContain("The next free date is 13 October 2026.");
    expect(r.nextFree).toBe("13 October 2026");
    expect(r.body).not.toContain(String.fromCharCode(0x2014));
  });

  it("uses the singular for a limit of one", () => {
    expect(limitSentence({ maxNewTitlesPerFormat: 1, periodDays: 1 }, "ebook")).toBe("KDP allows 1 new Kindle eBook title in any 1 days for one account.");
  });
});

describe("gate and run words", () => {
  it("summarises the quality gate", () => {
    expect(gateSummary({ ok: true, blocks: [], openClaims: 0 })).toBe("Checks passed");
    expect(gateSummary({ ok: false, blocks: [], openClaims: 2 })).toBe("2 claims open");
    expect(gateSummary({ ok: false, blocks: [{ id: "x", area: "cover", message: "m" }], openClaims: 1 })).toBe("1 blocking item and 1 claim open");
  });

  it("labels every run state with a word", () => {
    expect(runLabel("draft").label).toBe("Not started");
    expect(runLabel("running")).toEqual({ label: "Running", tone: "live" });
    expect(runLabel("failed").tone).toBe("error");
    expect(runLabel("paused_budget").label).toBe("Paused at budget");
  });

  it("reports books done and the book being written", () => {
    const book = (title: string) => ({ title, idea: null, stage: "writing", status: "active", profileId: "p", penName: "Pen" });
    const p = runProgress([
      { status: "ready", run: { status: "succeeded", progress: 1, error: null }, book: book("One") },
      { status: "planned", run: { status: "running", progress: 0.5, error: null }, book: book("Two") },
      { status: "planned", run: { status: "queued", progress: 0, error: null }, book: book("Three") },
    ]);
    expect(p).toEqual({ done: 1, total: 3, current: "Two" });
  });
});

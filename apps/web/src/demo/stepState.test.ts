import { describe, expect, it } from "vitest";
import { books, stepState } from "./books";

const base = books[0];
if (!base) throw new Error("no demo books");

describe("stepState", () => {
  it("does not call Writing or Editor done while the writing is unfinished, even when the stage has moved to Cover", () => {
    const book = { ...base, stage: "cover" as const, writingComplete: false, attentionSteps: [] };
    expect(stepState(book, "research", null)).toBe("done");
    expect(stepState(book, "blueprint", null)).toBe("done");
    expect(stepState(book, "writing", null)).toBe("in-progress");
    expect(stepState(book, "writing", book.id)).toBe("running");
    expect(stepState(book, "editor", null)).toBe("not-started");
    expect(stepState(book, "cover", null)).toBe("in-progress");
  });

  it("calls them done once the writing is complete, and for a published book", () => {
    const done = { ...base, stage: "cover" as const, writingComplete: true, attentionSteps: [] };
    expect(stepState(done, "writing", null)).toBe("done");
    expect(stepState(done, "editor", null)).toBe("done");
    const published = { ...base, stage: "published" as const, writingComplete: false, attentionSteps: [] };
    expect(stepState(published, "writing", null)).toBe("done");
    expect(stepState(published, "editor", null)).toBe("done");
  });
});

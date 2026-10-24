import { describe, expect, it } from "vitest";
import { bookSteps, books, stepState } from "./books";

describe("book steps", () => {
  it("ends with Marketing then Export", () => {
    expect(bookSteps.map((s) => s.id)).toEqual(["research", "titles", "blueprint", "writing", "editor", "cover", "marketing", "export"]);
  });

  it("marks Export done only while the pack on file matches the book, and Marketing done once posts exist", () => {
    const base = { ...books.find((b) => b.stage === "export")!, stage: "export" as const, writingComplete: true, attentionSteps: [] };
    expect(stepState({ ...base, exported: false }, "export", null)).toBe("in-progress");
    expect(stepState({ ...base, exported: true }, "export", null)).toBe("done");
    expect(stepState({ ...base, marketingMade: false }, "marketing", null)).toBe("in-progress");
    expect(stepState({ ...base, marketingMade: true }, "marketing", null)).toBe("done");
  });
});

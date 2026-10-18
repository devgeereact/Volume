import { describe, expect, it } from "vitest";
import { canMarkPublished, localToday, publishDateError } from "./publishDate";

describe("publish date", () => {
  it("formats today as a local YYYY-MM-DD", () => {
    expect(localToday(new Date(2026, 9, 8, 23, 30))).toBe("2026-10-08");
  });

  it("accepts today and earlier days", () => {
    expect(publishDateError("2026-10-18", "2026-10-18")).toBeUndefined();
    expect(publishDateError("2025-01-31", "2026-10-18")).toBeUndefined();
  });

  it("refuses a later day, an empty value and a day that does not exist", () => {
    expect(publishDateError("2026-10-19", "2026-10-18")).toBe("The date cannot be after today.");
    expect(publishDateError("", "2026-10-18")).toBe("Enter the date the book went live.");
    expect(publishDateError("2026-02-30", "2026-10-18")).toBe("Enter a real date.");
  });
});

describe("canMarkPublished", () => {
  const book = { published: null, archived: false, stage: "export" as const };
  it("offers publishing for a book that is neither published nor archived", () => {
    expect(canMarkPublished(book)).toBe(true);
    expect(canMarkPublished({ ...book, stage: "writing" })).toBe(true);
  });
  it("hides it for archived and published books", () => {
    expect(canMarkPublished({ ...book, archived: true })).toBe(false);
    expect(canMarkPublished({ ...book, stage: "published" })).toBe(false);
  });
});

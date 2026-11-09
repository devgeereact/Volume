import { describe, expect, it } from "vitest";
import { houseStyleSummary } from "./houseStyleSummary";

// The owner pressed "Fix house style", read "fixed", and found the pack still blocked on house style after a refresh.
// The summary must say what was changed AND what the pack check still holds against the book.

const clean = { severity: "pass", message: "No em dashes, banned phrases or US spellings." };
// house-style:off
const blocked = { severity: "block", message: '1 problem(s), first: "a rich tapestry" in section-2.' };
// house-style:on

describe("houseStyleSummary", () => {
  it("says what was fixed and that nothing is left", () => {
    const text = houseStyleSummary({ sections: 2, dashes: 5, spellings: 3, emptyItems: 0, styleAfter: clean });
    expect(text).toBe("House style fixed in 2 sections: 5 dashes, 3 US spellings.");
  });

  it("mentions removed empty list items", () => {
    const text = houseStyleSummary({ sections: 1, dashes: 1, spellings: 0, emptyItems: 2, styleAfter: clean });
    expect(text).toBe("House style fixed in 1 section: 1 dashes, 0 US spellings and 2 empty list items removed.");
  });

  it("says the book was already clean only when the pack check agrees", () => {
    expect(houseStyleSummary({ sections: 0, dashes: 0, spellings: 0, emptyItems: 0, styleAfter: clean })).toBe("House style was already clean.");
  });

  it("does not call the book clean when nothing was changed but the pack check still blocks", () => {
    const text = houseStyleSummary({ sections: 0, dashes: 0, spellings: 0, emptyItems: 0, styleAfter: blocked });
    expect(text).not.toMatch(/already clean/i);
    expect(text).toContain("Nothing here could be fixed automatically");
    expect(text).toContain("a rich tapestry"); // house-style: ignore
  });

  it("says what is still blocking after a fix that did change things", () => {
    const text = houseStyleSummary({ sections: 1, dashes: 2, spellings: 0, emptyItems: 0, styleAfter: blocked });
    expect(text).toContain("House style fixed in 1 section");
    expect(text).toContain("Still blocking the pack");
    expect(text).toContain("a rich tapestry"); // house-style: ignore
    expect(text).toContain("needs your own wording");
  });

  it("keeps the old wording when the server gives no pack verdict", () => {
    expect(houseStyleSummary({ sections: 0, dashes: 0, spellings: 0, emptyItems: 0, styleAfter: null })).toBe("House style was already clean.");
    expect(houseStyleSummary({ sections: 1, dashes: 1, spellings: 1, emptyItems: 0, styleAfter: null })).toBe(
      "House style fixed in 1 section: 1 dashes, 1 US spellings.",
    );
  });
});

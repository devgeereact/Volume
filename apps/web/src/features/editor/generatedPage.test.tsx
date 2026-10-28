import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import type { ApiGeneratedPage, ApiOwnerPrompt } from "../../api/types";
import { builtPageWords, partTitle, romanNumeral, shownWords, treeMeta } from "./generatedPage";
import { editHref, GeneratedPagePreview, OwnerPagePrompt } from "./GeneratedPagePreview";
import type { MsSection } from "./manuscript";

const built = (over: Partial<ApiGeneratedPage> = {}): ApiGeneratedPage => ({
  lines: [{ text: "Windowsill Herbs", level: 0 }],
  words: 2,
  countsInTotal: true,
  note: "Built from your book details when you export. You do not write this page.",
  edit: { target: "profile", label: "Edit the bio" },
  leftOut: false,
  ...over,
});

const prompt: ApiOwnerPrompt = { message: "This page is yours to write.", placeholder: "Nothing is printed for this page until you write it.", leftOut: true };

function section(over: Partial<MsSection> = {}): MsSection {
  return {
    id: "s1",
    group: "front",
    number: null,
    title: "Title Page",
    baseWords: 0,
    wordTarget: null,
    blocks: [],
    source: "writer",
    enabled: true,
    excerpt: false,
    ...over,
  };
}

describe("tree labels", () => {
  it("does not call a built page empty", () => {
    expect(treeMeta(section({ generated: built({ words: 9 }) }), 9, false)).toBe("9, built");
  });
  it("calls a part a divider, never empty", () => {
    expect(treeMeta(section({ isPart: true, group: "body", title: "Part I: Start" }), 0, false)).toBe("Divider");
  });
  it("says an Also by page with no published book is left out", () => {
    expect(treeMeta(section({ generated: built({ leftOut: true, words: 0, lines: [] }) }), 0, false)).toBe("Left out");
  });
  it("asks for the owner's input on an empty owner page, and counts written text once it has some", () => {
    expect(treeMeta(section({ title: "Dedication", ownerPrompt: prompt }), 0, false)).toBe("Needs your input");
    expect(treeMeta(section({ title: "Dedication", blocks: [{ id: "b", kind: "p", text: "For Sam.", rev: 0 }], baseWords: 2 }), 2, true)).toBe("2, edited");
  });
  it("keeps Empty for an ordinary section with nothing in it, and Off for a switched-off page", () => {
    expect(treeMeta(section({ title: "Introduction" }), 0, false)).toBe("Empty");
    expect(treeMeta(section({ enabled: false }), 0, false)).toBe("Off");
  });
});

describe("word counts", () => {
  it("shows a built page's own words", () => {
    expect(shownWords({ wordCount: 0, generated: built({ words: 5 }) })).toBe(5);
    expect(shownWords({ wordCount: 120, generated: null })).toBe(120);
  });
  it("adds built pages to the total only when the exported book counts them, and only when they are on", () => {
    const list = [
      { enabled: true, generated: built({ words: 5 }) },
      { enabled: true, generated: built({ words: 9, countsInTotal: false }) },
      { enabled: false, generated: built({ words: 7 }) },
      { enabled: true, generated: null },
    ];
    expect(builtPageWords(list)).toBe(5);
  });
});

describe("part titles", () => {
  it("writes Roman numerals", () => {
    expect([1, 2, 4, 9, 14, 39].map(romanNumeral)).toEqual(["I", "II", "IV", "IX", "XIV", "XXXIX"]);
    expect(romanNumeral(40)).toBe("40");
  });
  it("joins the number and the title", () => {
    expect(partTitle(2, "Grow")).toBe("Part II: Grow");
    expect(partTitle(1, null)).toBe("Part I");
    expect(partTitle(null, "")).toBe("Part");
  });
});

describe("previews", () => {
  it("labels a built page as read only, shows its lines and links to where it is edited", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GeneratedPagePreview
          page={built({
            lines: [
              { text: "Introduction", level: 0 },
              { text: "Why herbs", level: 1 },
            ],
          })}
          bookId="b1"
          penNameId="p1"
        />
      </MemoryRouter>,
    );
    expect(html).toContain("Read-only preview");
    expect(html).toContain("Built from your book details when you export");
    expect(html).toContain("Introduction");
    expect(html).toContain("Why herbs");
    expect(html).toContain('href="/profiles/p1"');
    expect(html).toContain("Edit the bio");
  });
  it("shows no page for a left out page, only the reason", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <GeneratedPagePreview page={built({ leftOut: true, lines: [], note: "Left out of the exported book." })} bookId="b1" penNameId="p1" />
      </MemoryRouter>,
    );
    expect(html).toContain("Left out of the exported book.");
    expect(html).not.toContain("Preview of the page as exported");
  });
  it("prompts kindly on an owner page and says what the book holds", () => {
    const html = renderToStaticMarkup(<OwnerPagePrompt prompt={prompt} />);
    expect(html).toContain("This page needs your input");
    expect(html).toContain("This page is yours to write.");
    expect(html).toContain("Nothing is printed for this page until you write it.");
  });
  it("maps every edit target to a route", () => {
    expect(editHref({ target: "titles", label: "" }, "b", "p")).toBe("/books/b/titles");
    expect(editHref({ target: "blueprint", label: "" }, "b", "p")).toBe("/books/b/blueprint");
    expect(editHref({ target: "published", label: "" }, "b", "p")).toBe("/published");
  });
});

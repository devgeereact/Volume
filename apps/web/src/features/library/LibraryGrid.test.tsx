import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { books } from "../../demo/books";
import { groupOf, stepLine, stepSegments } from "./bookStatus";
import { GRID_SHOWN, LibraryGrid, firstPage, gridShown, sortForGrid } from "./LibraryGrid";
import { LibraryTiles } from "./LibraryTiles";

function render(list = books) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <LibraryGrid books={list} group={null} live={null} />
    </MemoryRouter>,
  );
}

describe("Library grid view", () => {
  it("shows nine books, says how many of how many, and offers Show all", () => {
    const active = books.filter((b) => !b.archived);
    expect(active.length).toBeGreaterThan(GRID_SHOWN);
    const html = render(active);
    expect(html.match(/data-grid-card/g)).toHaveLength(GRID_SHOWN);
    expect(html).toContain(`${GRID_SHOWN} of ${active.length}`);
    expect(html).toContain(`Show all ${active.length} books`);
    expect(html).toContain(`${active.length - GRID_SHOWN} more`);
    // Every row takes the height of the tallest card, so all cards are the same size.
    expect(html).toContain("auto-rows-fr");
  });

  it("shows three whole rows before Show all at three, four and five columns", () => {
    expect(gridShown(3)).toBe(GRID_SHOWN);
    for (const cols of [3, 4, 5] as const) expect(gridShown(cols) % cols).toBe(0);
    // 14 books at 5 columns: two whole rows first, not 5+5+4; fewer books than one row show as they are.
    expect(firstPage(14, 5)).toBe(10);
    expect(firstPage(14, 3)).toBe(9);
    expect(firstPage(4, 5)).toBe(4);
    for (const total of [1, 6, 9, 13, 20])
      for (const cols of [3, 4, 5] as const) {
        const n = firstPage(total, cols);
        expect(n === total || n % cols === 0).toBe(true);
      }
    expect(render()).toContain("min-[1900px]:grid-cols-4");
  });

  it("tags only books ready to publish, since the step and status lines already say the rest", () => {
    const html = render(sortForGrid(books).filter((b) => groupOf(b) !== "ready"));
    expect(html).not.toContain(">In progress<");
    expect(html).not.toContain(">Published<");
    const ready = books.filter((b) => groupOf(b) === "ready");
    expect(ready.length).toBeGreaterThan(0);
    expect(render(ready)).toContain(">Ready to publish<");
  });

  it("has no Show all button with nine books or fewer", () => {
    const html = render(books.slice(0, 4));
    expect(html.match(/data-grid-card/g)).toHaveLength(4);
    expect(html).toContain("4 of 4");
    expect(html).not.toContain("Show all");
  });

  it("puts books in progress first and published books last", () => {
    const order = sortForGrid(books).map(groupOf);
    const firstPublished = order.indexOf("published");
    expect(firstPublished).toBeGreaterThan(0);
    expect(order.slice(firstPublished).every((g) => g === "published")).toBe(true);
    expect(order.lastIndexOf("progress")).toBeLessThan(order.indexOf("ready") === -1 ? order.length : order.indexOf("ready"));
  });

  it("says each book's step in words beside its eight-segment bar", () => {
    const editing = books.find((b) => b.stage === "editing");
    const idea = books.find((b) => b.stage === "idea");
    const live = books.find((b) => b.stage === "published");
    if (!editing || !idea || !live) throw new Error("The demo needs an editing, an idea and a published book.");
    expect(stepLine(editing)).toBe("Step 5 of 8: Editing");
    expect(stepLine(idea)).toBe("Idea, not started");
    expect(stepLine(live)).toBe("All 8 steps done");
    expect(stepSegments(idea).every((s) => s === "off")).toBe(true);
    expect(stepSegments(live).every((s) => s === "on")).toBe(true);
    expect(stepSegments(editing)).toHaveLength(8);
  });
});

describe("Library stat tiles", () => {
  it("counts each stage from the books on show and marks the chosen stage pressed", () => {
    const html = renderToStaticMarkup(
      <LibraryTiles
        books={books}
        group="ready"
        onGroup={() => undefined}
        progressFoot="6 need you, 1 writing now"
        publishedFoot="7 formats on amazon.co.uk"
        spend={{ month: "October", spentUsd: 4.82, creditUsd: 35.18 }}
      />,
    );
    const progress = books.filter((b) => groupOf(b) === "progress").length;
    const ready = books.filter((b) => groupOf(b) === "ready").length;
    expect(html).toContain(`>${progress}<small`);
    expect(html).toContain(`>${ready}<small`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("October AI spend");
    expect(html).toContain("$35.18 OpenRouter credit left");
    // No monthly cap (D-057): the spend tile never says "of $N".
    expect(html).not.toMatch(/of \$\d/);
  });
});

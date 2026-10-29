import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { books } from "../../demo/books";
import { groupOf, stepLine, stepSegments } from "./bookStatus";
import { GRID_SHOWN, LibraryGrid, sortForGrid } from "./LibraryGrid";
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

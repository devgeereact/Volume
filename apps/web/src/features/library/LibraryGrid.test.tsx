import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { books } from "../../demo/books";
import { groupOf } from "./bookStatus";
import { GRID_SHOWN, LibraryGrid, sortForGrid } from "./LibraryGrid";
import { GroupFilter } from "./LibrarySide";

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
    expect(html).toContain(`Show all ${active.length} books, ${active.length - GRID_SHOWN} more`);
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

  it("counts each stage from the books on show", () => {
    const html = renderToStaticMarkup(<GroupFilter books={books} value="ready" onChange={() => undefined} />);
    const ready = books.filter((b) => groupOf(b) === "ready").length;
    expect(html).toContain(`>${books.length}<span class="sr-only">`);
    expect(html).toContain(`>${ready}<span class="sr-only">`);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
  });
});

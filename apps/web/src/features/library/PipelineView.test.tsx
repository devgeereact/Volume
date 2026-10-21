import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { describe, expect, it } from "vitest";
import { books } from "../../demo/books";
import { columnFor } from "./bookStatus";
import { PipelineView } from "./PipelineView";

describe("Library cover view", () => {
  it("folds a long stage to three books with a Show all button, so the page does not grow with every book", () => {
    const editing = books.find((b) => columnFor(b) === "editing");
    if (!editing) throw new Error("The demo needs a book in editing.");
    const many = Array.from({ length: 5 }, (_, i) => ({ ...editing, id: `${editing.id}-${i}`, title: `Book ${i}` }));
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PipelineView books={many} live={null} />
      </MemoryRouter>,
    );
    expect(html).toContain("Show all 5");
    expect(html.match(/hidden sm:block xl:hidden/g)).toHaveLength(2);
    // The row between phone and wide screens scrolls sideways instead of wrapping.
    expect(html).toContain("sm:overflow-x-auto");
  });

  it("shows no Show all button when a stage has three books or fewer", () => {
    const editing = books.filter((b) => columnFor(b) === "editing").slice(0, 3);
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <PipelineView books={editing} live={null} />
      </MemoryRouter>,
    );
    expect(html).not.toContain("Show all");
    expect(html).not.toContain("hidden sm:block xl:hidden");
  });
});

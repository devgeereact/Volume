import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { books } from "../../demo";
import { conceptsFor, layoutCover } from "./concepts";
import { ArtCover } from "./ArtCover";
import { WrapPreview } from "./WrapPreview";

const book = books[0]!;
const design = conceptsFor(book)[0]!.base;
const props = {
  title: "Steady On Your Feet",
  subtitle: "A guide",
  author: "Harni Muharami",
  design,
  showSubtitle: true,
  blurb: "First paragraph.\n\nSecond paragraph.",
  trim: { w: 6, h: 9 },
  pages: 103,
  paper: "cream" as const,
};

describe("WrapPreview", () => {
  it("shows the build's own page in a frame, with the print guides over it", () => {
    const html = renderToStaticMarkup(
      <WrapPreview page={{ html: "<p>the build's page</p>", widthPx: 1200, heightPx: 900 }} trim={props.trim} pages={props.pages} paper={props.paper} />,
    );
    expect(html).toContain("Trim line");
    expect(html).toContain("Barcode keep-out");
    expect(html).toContain("Spine 0.");
  });

  it("holds its place while the page loads", () => {
    const html = renderToStaticMarkup(<WrapPreview page={undefined} trim={props.trim} pages={props.pages} paper={props.paper} />);
    expect(html).toContain("animate-pulse");
  });
});

describe("larger titles and art scrim", () => {
  it("wraps a larger title onto more lines instead of stopping at its longest line", () => {
    const small = layoutCover(design, { size: 100 });
    const big = layoutCover(design, { size: 180 });
    expect(big.titleLines.join(" ")).toBe(small.titleLines.join(" "));
    expect(big.titleLines.length).toBeGreaterThanOrEqual(small.titleLines.length);
  });

  it("draws the art untouched: no overlay until the art has been measured", () => {
    const html = renderToStaticMarkup(<ArtCover src="/a.webp" title="T" author="A" design={design} />);
    expect(html).not.toContain("linear-gradient");
    expect(html).not.toContain("opacity:0.55");
  });
});

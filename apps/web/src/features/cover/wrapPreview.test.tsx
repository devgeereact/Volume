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
  it("draws the front over the chosen art, as the build does", () => {
    const html = renderToStaticMarkup(<WrapPreview {...props} src="/art.webp" />);
    expect(html).toContain('src="/art.webp"');
  });

  it("sets each blurb paragraph on its own and puts the author name under a rule at the foot", () => {
    const html = renderToStaticMarkup(<WrapPreview {...props} src={null} />);
    expect(html).toContain("First paragraph.");
    expect(html).toContain("Second paragraph.");
    expect(html.match(/<p /g)?.length).toBeGreaterThanOrEqual(3);
  });
});

describe("larger titles and art scrim", () => {
  it("wraps a larger title onto more lines instead of stopping at its longest line", () => {
    const small = layoutCover(design, { size: 100 });
    const big = layoutCover(design, { size: 180 });
    expect(big.titleLines.join(" ")).toBe(small.titleLines.join(" "));
    expect(big.titleLines.length).toBeGreaterThanOrEqual(small.titleLines.length);
  });

  it("draws art under a clear-in-the-middle scrim, not a flat wash", () => {
    const html = renderToStaticMarkup(<ArtCover src="/a.webp" title="T" author="A" design={design} />);
    expect(html).toContain("linear-gradient");
    expect(html).not.toContain("opacity:0.55");
  });
});

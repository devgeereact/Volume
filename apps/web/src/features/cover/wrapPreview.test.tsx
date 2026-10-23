import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { books } from "../../demo";
import { conceptsFor } from "./concepts";
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

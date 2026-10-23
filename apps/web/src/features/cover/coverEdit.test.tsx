import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { conceptsFor, layoutCover, partBoxes } from "./concepts";
import { books } from "../../demo";
import { clampScale, clearTops, dragTop, editsFromSaved, editsToTypography, nudgeTop, setAlign, setTop, stepScale, stepTitleSize } from "./coverEdit";
import { alignOfPart, CoverToolbar } from "./CoverEditor";

const noop = () => undefined;
const book = books[0]!;
const SUBTITLE = "A plain English guide";
const base = conceptsFor(book)[0]!.base;

describe("cover edit rules", () => {
  it("nudges a line up and down by one step and stays on the cover", () => {
    expect(nudgeTop(20, -1)).toBe(19);
    expect(nudgeTop(20, 1)).toBe(21);
    expect(nudgeTop(0, -1)).toBe(0);
    expect(nudgeTop(150, 1)).toBe(150);
  });

  it("makes the subtitle and author smaller or larger within 0.6 to 1.6", () => {
    expect(stepScale(1, 1)).toBe(1.1);
    expect(stepScale(1, -1)).toBe(0.9);
    expect(stepScale(1.6, 1)).toBe(1.6);
    expect(stepScale(0.6, -1)).toBe(0.6);
    expect(clampScale(3)).toBe(1.6);
    expect(stepTitleSize(100, 1)).toBe(105);
    expect(stepTitleSize(180, 1)).toBe(180);
    expect(stepTitleSize(60, -1)).toBe(60);
  });

  it("turns a drag into a position, clamped to 0 to 150", () => {
    expect(dragTop(30, 50, 300)).toBe(55); // 50 of 300 px is 25 units
    expect(dragTop(30, -900, 300)).toBe(0);
    expect(dragTop(140, 900, 300)).toBe(150);
  });

  it("sets alignment and tops per line, and clears the tops when the title position is picked", () => {
    let e = setAlign({}, "author", "right");
    e = setTop(e, "title", 200);
    e = setTop(e, "subtitle", 40);
    expect(e).toEqual({ authorAlign: "right", titleTop: 150, subtitleTop: 40 });
    expect(clearTops(e)).toMatchObject({ authorAlign: "right", titleTop: undefined, subtitleTop: undefined });
  });

  it("saves only the edits that were made", () => {
    expect(editsToTypography({})).toEqual({});
    expect(editsToTypography({ titleAlign: "right", authorTop: 120.123, subtitleSize: 1.2, titleUppercase: false })).toEqual({
      titleAlign: "right",
      authorTopPct: 120.12,
      subtitleSize: 1.2,
      titleUppercase: false,
    });
  });

  it("restores saved edits, ignores bad values, and keeps older covers unchanged", () => {
    const old = { styleId: "x", titleTopPct: 12, sizePct: 100, showSubtitle: true };
    expect(editsFromSaved(old, 12)).toEqual({});
    expect(editsFromSaved({ titleTopPct: 40 }, 12)).toEqual({ titleTop: 40 });
    expect(editsFromSaved({ titleAlign: "centre", authorAlign: "diagonal", authorSize: 9, subtitleTopPct: 60 }, 12)).toEqual({
      titleAlign: "center",
      subtitleTop: 60,
    });
  });
});

describe("cover preview layout with edits", () => {
  it("is unchanged without edits and moves the lines when they are set", () => {
    const plain = layoutCover(base, { subtitle: SUBTITLE });
    expect(layoutCover(base, { subtitle: SUBTITLE, titleTop: undefined, subtitleTop: undefined, authorTop: undefined })).toEqual(plain);
    expect(plain.authorTop).toBeUndefined();
    const moved = layoutCover({ ...base, subtitleTop: 60 }, { subtitle: SUBTITLE, titleTop: 40, subtitleTop: 90, authorTop: 120 });
    expect(moved).toMatchObject({ titleTop: 40, subtitleTop: 90, authorTop: 120 });
    expect(partBoxes(moved, SUBTITLE).author?.top).toBe(120);
  });

  it("falls back to the cover's alignment for a line with none of its own", () => {
    expect(alignOfPart({ ...base, align: "center" }, "title")).toBe("center");
    expect(alignOfPart({ ...base, align: "center", authorAlign: "right" }, "author")).toBe("right");
  });
});

describe("cover toolbar", () => {
  const html = (part: "title" | "subtitle" | "author", design = layoutCover(base, { subtitle: SUBTITLE }), titleSizePct = 100) =>
    renderToStaticMarkup(
      <CoverToolbar
        part={part}
        design={design}
        subtitle={SUBTITLE}
        titleSizePct={titleSizePct}
        onAlign={noop}
        onTop={noop}
        onSmaller={noop}
        onLarger={noop}
        onUppercase={noop}
      />,
    );

  it("uses plain labels for align, move and size", () => {
    const out = html("subtitle");
    for (const label of [
      "Align left",
      "Align centre",
      "Align right",
      "Move the subtitle up",
      "Move the subtitle down",
      "Make the subtitle smaller",
      "Make the subtitle larger",
    ])
      expect(out).toContain(label);
    expect(out).toContain('role="toolbar"');
  });

  it("marks the current alignment as pressed", () => {
    const out = html("author", { ...layoutCover(base, { subtitle: SUBTITLE }), authorAlign: "right" });
    expect(out).toMatch(/aria-pressed="true"[^>]*aria-label="Align right \(author name\)"/);
    expect(out).toMatch(/aria-pressed="false"[^>]*aria-label="Align left \(author name\)"/);
  });

  it("offers capital letters for the title only", () => {
    expect(html("title")).toContain("Capital letters");
    expect(html("author")).not.toContain("Capital letters");
  });

  it("disables the size buttons at the limits", () => {
    expect(html("title", undefined, 180)).toMatch(/aria-label="Make the title larger"[^>]*disabled=""|disabled=""[^>]*aria-label="Make the title larger"/);
    expect(html("subtitle", { ...layoutCover(base, { subtitle: SUBTITLE }), subtitleScale: 0.6 })).toMatch(
      /disabled=""[^>]*aria-label="Make the subtitle smaller"|aria-label="Make the subtitle smaller"[^>]*disabled=""/,
    );
  });
});

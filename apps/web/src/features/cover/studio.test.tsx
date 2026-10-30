import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { kdpRulesFile as rulesFile } from "../../lib/kdpRulesFile";
import { historyReducer, HISTORY_LIMIT, MERGE_MS, startHistory } from "./history";
import { bookPalette, bookPalettes, contrast, coloursFromSaved, PALETTE_FAMILIES, sameColours } from "./palettes";
import { pageCheck, pageRange, paperbackSize, paperFor, ruleTrims, trimInRules } from "./paperback";
import { coverChecks, pagesFrom } from "./StudioParts";
import { ChecksPanel, LayerList } from "./Studio";
import { Type } from "lucide-react";

const rule = (id: string) => rulesFile.rules.find((r) => r.id === id) as { values?: unknown; value?: unknown };

describe("undo and redo", () => {
  const at = 1000;
  it("steps back and forward, and a new change clears redo", () => {
    let h = startHistory(1);
    h = historyReducer(h, { type: "set", next: 2, at });
    h = historyReducer(h, { type: "set", next: 3, at: at + 1 });
    h = historyReducer(h, { type: "undo" });
    expect(h.present).toBe(2);
    h = historyReducer(h, { type: "redo" });
    expect(h.present).toBe(3);
    h = historyReducer(h, { type: "undo" });
    h = historyReducer(h, { type: "set", next: 9, at: at + 2 });
    expect(h.future).toEqual([]);
    expect(h.past).toEqual([1, 2]);
  });

  it("merges a drag into one step, but not after a pause", () => {
    let h = startHistory(0);
    h = historyReducer(h, { type: "set", next: 1, group: "top-title", at });
    h = historyReducer(h, { type: "set", next: 2, group: "top-title", at: at + 50 });
    h = historyReducer(h, { type: "set", next: 3, group: "top-title", at: at + 100 });
    expect(h.past).toEqual([0]);
    h = historyReducer(h, { type: "set", next: 4, group: "top-title", at: at + 100 + MERGE_MS });
    expect(h.past).toEqual([0, 3]);
  });

  it("ignores no-op changes, keeps a bounded past and starts again on replace", () => {
    let h = startHistory({ a: 1 });
    h = historyReducer(h, { type: "set", next: { a: 1 }, at });
    expect(h.past).toHaveLength(0);
    for (let i = 0; i < HISTORY_LIMIT + 10; i++) h = historyReducer(h, { type: "set", next: { a: i + 2 }, at: at + i });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    h = historyReducer(h, { type: "replace", next: { a: 0 } });
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
  });
});

describe("palettes", () => {
  it("has 32 palettes in 8 families, each with all six colour roles", () => {
    expect(PALETTE_FAMILIES).toHaveLength(8);
    const all = PALETTE_FAMILIES.flatMap((f) => f.palettes);
    expect(all).toHaveLength(32);
    for (const p of all) expect(coloursFromSaved(p.colours)).not.toBeNull();
  });

  it("makes the book's own palette from its id, the same every time, with readable inks", () => {
    expect(bookPalette("handover")).toEqual(bookPalette("handover"));
    expect(bookPalette("handover").colours).not.toEqual(bookPalette("the-calm-ward").colours);
    for (const id of ["handover", "the-calm-ward", "sourdough-on-a-weeknight", "milo-and-the-moon-kite"])
      for (const p of bookPalettes(id, 0)) {
        expect(contrast(p.colours.title, p.colours.background)).toBeGreaterThanOrEqual(4.5);
        expect(contrast(p.colours.subtitle, p.colours.background)).toBeGreaterThanOrEqual(4.5);
      }
  });

  it("only takes saved colours back when every role is a hex colour", () => {
    expect(coloursFromSaved({ background: "#000", title: "#fff" })).toBeNull();
    expect(coloursFromSaved("red")).toBeNull();
    const c = PALETTE_FAMILIES[0]!.palettes[0]!.colours;
    expect(sameColours(coloursFromSaved({ ...c }), c)).toBe(true);
  });
});

describe("paperback numbers from the KDP rules", () => {
  it("offers exactly the trims in the rules file", () => {
    const list = (rule("paperback.trimSizes.list").values as { widthIn: number; heightIn: number }[]).map((t) => `${t.widthIn}x${t.heightIn}`);
    expect(ruleTrims.map((t) => `${t.w}x${t.h}`)).toEqual(list);
    expect(trimInRules({ w: 8, h: 10 })).toBe(true);
    // 8.25 x 11 in is a KDP hardcover trim, not a paperback one.
    expect(trimInRules({ w: 8.25, h: 11 })).toBe(false);
  });

  it("changes the spine with the ink and the paper", () => {
    const per = rule("paperback.spine.widthPerPage").values as { white: number; cream: number };
    const colour = rule("paperback.spine.widthPerPage.colour").values as { standardColour: number; premiumColour: number };
    const t = { w: 6, h: 9 };
    expect(paperbackSize(t, 200, "black", "cream").spineIn).toBeCloseTo(200 * per.cream, 6);
    expect(paperbackSize(t, 200, "black", "white").spineIn).toBeCloseTo(200 * per.white, 6);
    expect(paperbackSize(t, 200, "premium", "cream").spineIn).toBeCloseTo(200 * colour.premiumColour, 6);
    expect(paperFor("standard", "cream")).toBe("white");
  });

  it("checks the page count against the trim and ink", () => {
    expect(pageRange({ w: 8.5, h: 11 }, "black", "cream")).toEqual({ min: 24, max: 550 });
    expect(pageRange({ w: 6, h: 9 }, "standard", "white")).toEqual({ min: 72, max: 600 });
    expect(pageCheck({ w: 6, h: 9 }, 60, "standard", "white").ok).toBe(false);
    expect(pageCheck({ w: 6, h: 9 }, 120, "black", "cream").ok).toBe(true);
    expect(pageCheck({ w: 8.25, h: 11 }, 120, "black", "cream").ok).toBeNull();
    // 8 x 10 in black ink on cream: "24 - 776" (rule paperback.trimAndPages, fact 13.2, 2026-10-29 file).
    expect(pageRange({ w: 8, h: 10 }, "black", "cream")).toEqual({ min: 24, max: 776 });
    // 8.27 x 11.69 in has no standard colour on KDP, so the studio has no range for it.
    expect(pageRange({ w: 8.27, h: 11.69 }, "standard", "white")).toBeNull();
    expect(pagesFrom("60", 120, { trim: { w: 6, h: 9 }, ink: "standard", paper: "white" })).toEqual({ pages: 120, typedOk: false, belowMin: false });
    expect(pagesFrom("", 120, { trim: { w: 6, h: 9 }, ink: "black", paper: "white" })).toEqual({ pages: 120, typedOk: true, belowMin: false });
    // A book shorter than the KDP minimum still gets a printable wrap preview, at the minimum.
    expect(pagesFrom("", 2, { trim: { w: 6, h: 9 }, ink: "black", paper: "white" })).toEqual({ pages: 24, typedOk: true, belowMin: true });
  });
});

describe("cover checks and panels", () => {
  const base = {
    author: "Ada Hart",
    colours: { background: "#FFFFFF", title: "#111111", subtitle: "#DDDDDD", author: "#222222", accent: "#C26D48", band: "#1E4A2C" },
    showSubtitle: true,
    titleSize: 12,
    pages: 60,
    paperback: { trim: { w: 6, h: 9 }, ink: "black" as const, paper: "cream" as const },
    blurb: "",
    built: null,
    show: () => undefined,
  };

  it("flags weak contrast, no spine text and a missing blurb", () => {
    const list = coverChecks(base);
    expect(list.find((c) => c.title === "Subtitle contrast")?.status).toBe("fail");
    expect(list.find((c) => c.title === "Title contrast")?.status).toBe("pass");
    expect(list.find((c) => c.title === "No spine text")?.status).toBe("info");
    expect(list.find((c) => c.title === "Back cover blurb")?.status).toBe("warn");
    expect(list.find((c) => c.title === "Page count fits the trim")?.status).toBe("pass");
  });

  it("leaves contrast to the build when the type sits on art", () => {
    const list = coverChecks({ ...base, colours: null });
    expect(list.some((c) => c.title.endsWith("contrast"))).toBe(false);
    expect(list.find((c) => c.title === "Text colour over the art")?.status).toBe("info");
  });

  it("draws the checks with words, not colour alone, and the layers with plain names", () => {
    const html = renderToStaticMarkup(<ChecksPanel checks={coverChecks(base)} />);
    expect(html).toContain("Fails: ");
    expect(html).toContain("Cover health");
    const layers = renderToStaticMarkup(
      <LayerList
        groups={[{ name: "Front", items: [{ id: "title", name: "Title", icon: Type, onToggleLock: () => undefined }] }]}
        selected="title"
        onSelect={() => undefined}
      />,
    );
    expect(layers).toContain('aria-pressed="true"');
    expect(layers).toContain("Lock title");
    expect(layers).toContain("Colours, design and paper");
  });
});

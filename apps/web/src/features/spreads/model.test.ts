import { describe, expect, it } from "vitest";
import { SPREAD_LAYOUTS as CORE_LAYOUTS } from "@volume/core";
import { budgetDetails, PICTURE_ESTIMATE_USD, SPREAD_LAYOUTS } from "../../api/picture";
import { demoCharacters, demoPictureStories, demoSpreads } from "../../demo/pictureBook";
import { bleedPageSize, demoPlan, inchesLabel, spreadOverlay, textPlacement } from "./geometry";
import {
  GENTLE_PROBLEM_RULE,
  messageOptions,
  pageCountFor,
  pictureAgeRanges,
  pictureEstimate,
  pictureEstimateFrom,
  preflightItems,
  runEstimate,
  runEstimateFrom,
  runSteps,
  sortPreflight,
  storyFormFrom,
  storyInput,
  validateStory,
} from "./model";

describe("picture-book model", () => {
  it("uses the same layouts as @volume/core", () => {
    expect([...SPREAD_LAYOUTS]).toEqual([...CORE_LAYOUTS]);
  });

  it("reads the Bedtime Story rules from the template", () => {
    expect(messageOptions).toContain("kindness");
    expect(messageOptions.every((m) => !m.endsWith("."))).toBe(true);
    expect(GENTLE_PROBLEM_RULE.toLowerCase()).toContain("gentle");
    expect(pictureAgeRanges).toContain("3 to 7");
  });

  it("fills the story form from the wizard's genre settings and the idea", () => {
    const f = storyFormFrom(
      { genre: { ageRange: "3 to 8", newWord: "brave", problem: "the kite will not fly", message: "courage" }, chapters: 12 },
      "A fox makes a kite.",
      10,
    );
    expect(f).toMatchObject({ ageRange: "3 to 8", newWord: true, newWordText: "brave", problem: "the kite will not fly", message: "courage", spreads: "12" });
    expect(f.topic).toBe("A fox makes a kite.");
    const off = storyFormFrom({ genre: { newWord: null } }, null, 10);
    expect(off.newWord).toBe(false);
    expect(off.spreads).toBe("10");
    expect(storyFormFrom({ genre: { newWord: "writer suggests" } }, null, null).newWordText).toBe("");
  });

  it("sends the gentle problem as conflict, not in the topic, and leaves out empty fields", () => {
    const base = storyFormFrom({}, "Milo the fox flies a kite to the moon.", 10);
    const input = storyInput({ ...base, problem: "  the kite keeps falling. ", newWord: true, newWordText: "gentle" });
    expect(input.topic).toBe("Milo the fox flies a kite to the moon.");
    expect(input.conflict).toBe("the kite keeps falling.");
    expect(storyInput(base).conflict).toBeUndefined();
    expect(input.newWord).toBe("gentle");
    expect(input.characterIdeas).toBeUndefined();
    expect(storyInput({ ...base, newWord: false, newWordText: "gentle" }).newWord).toBeUndefined();
  });

  it("validates the idea and the spread range", () => {
    const f = storyFormFrom({}, "Too short", 10);
    expect(validateStory(f).topic).toBeDefined();
    expect(validateStory({ ...f, topic: "A long enough idea for a story.", spreads: "20" }).spreads).toBe("Use 8 to 16 spreads.");
    expect(validateStory({ ...f, topic: "A long enough idea for a story." })).toEqual({});
  });

  it("estimates the pictures of a run with the demo figure when there is no server price", () => {
    expect(runEstimate(10)).toBe(`up to about $${(12 * PICTURE_ESTIMATE_USD).toFixed(2)}`);
    expect(pictureEstimateFrom(null)).toBe(pictureEstimate);
  });

  it("prices a run and one picture from the server's estimate for any spread count", () => {
    const e = {
      lowUsd: 0,
      highUsd: 0,
      calls: 15,
      spreads: 10,
      characters: 2,
      text: { lowUsd: 0.05, highUsd: 0.2, model: "m" },
      image: { lowUsd: 0.05, highUsd: 0.1, model: "i", priced: true },
    };
    // 12 spreads + 2 references = 14 pictures.
    expect(runEstimateFrom(e, 12)).toBe(`about $${(0.05 + 14 * 0.05).toFixed(2)} to $${(0.2 + 14 * 0.1).toFixed(2)}`);
    expect(pictureEstimateFrom(e)).toBe("about $0.05 to $0.10");
    expect(pictureEstimateFrom({ ...e, image: { ...e.image, lowUsd: 0.2, highUsd: 0.2 } })).toBe("about $0.20");
  });

  it("fills the gentle problem from a saved conflict first", () => {
    expect(storyFormFrom({ pictureBook: { story: { conflict: "a lost hat" } }, genre: { problem: "old" } }, null, 10).problem).toBe("a lost hat");
  });

  it("turns the run's children into three steps", () => {
    const steps = runSteps([
      { kind: "picture_story", status: "succeeded" },
      { kind: "picture_characters", status: "succeeded" },
      { kind: "spread_image", status: "succeeded" },
      { kind: "spread_image", status: "running" },
      { kind: "spread_image", status: "queued" },
    ]);
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "running"]);
    expect(steps[2]?.detail).toBe("1 of 3");
    expect(runSteps([{ kind: "picture_story", status: "needs_attention" }])[0]?.state).toBe("attention");
    expect(runSteps([])[0]?.state).toBe("queued");
  });

  it("reads the preflight stored on an export record and sorts the picture checks first", () => {
    const items = preflightItems({
      items: [
        { id: "listing.price", area: "listing", severity: "warn", message: "Set a price." },
        { id: "interior.bleed", area: "interior", severity: "pass", message: "Bleed ok." },
        { id: "bad", severity: "maybe", message: "x" },
        "nonsense",
      ],
    });
    expect(items).toHaveLength(2);
    expect(sortPreflight(items)[0]?.id).toBe("interior.bleed");
    expect(preflightItems(null)).toEqual([]);
  });

  it("reads 402 budget details", () => {
    expect(budgetDetails({ scope: "book", limitUsd: 6, spentUsd: 5.9, estimateUsd: 0.2 })).toEqual({
      scope: "book",
      limitUsd: 6,
      spentUsd: 5.9,
      estimateUsd: 0.2,
    });
    expect(budgetDetails({ limitUsd: "6" })).toBeNull();
  });

  it("counts printed pages as the server does", () => {
    expect(pageCountFor(3, 10, 1)).toBe(24);
    expect(pageCountFor(4, 10, 1)).toBe(26);
  });
});

describe("picture-book geometry", () => {
  it("gives the page size with bleed and the default plan from the rules file", () => {
    const size = bleedPageSize();
    expect(size.widthIn).toBeGreaterThan(8.5);
    expect(size.heightIn).toBeGreaterThan(8.5);
    expect(inchesLabel(size)).toMatch(/^\d+(\.\d+)? x \d+(\.\d+)? in$/);
    const plan = demoPlan("premium", 3, 1);
    expect(pageCountFor(3, plan.spreads, 1)).toBe(plan.pages);
  });

  it("keeps the safe area inside the trim on both pages", () => {
    const o = spreadOverlay(24);
    for (const side of ["left", "right"] as const) {
      const t = o.trim[side];
      const s = o.safe[side];
      expect(s.left).toBeGreaterThan(t.left);
      expect(s.top).toBeGreaterThan(t.top);
      expect(s.left + s.width).toBeLessThan(t.left + t.width);
      expect(s.top + s.height).toBeLessThan(t.top + t.height);
    }
    expect(o.aspect).toBeGreaterThan(1.9);
    expect(o.ruleIds).toContain("print.bleed");
  });

  it("places text where the exporter does", () => {
    expect(textPlacement("text-right")).toEqual({ side: "right", align: "middle" });
    expect(textPlacement("text-bottom")).toEqual({ side: "left", align: "bottom" });
  });
});

describe("picture-book demo fixture", () => {
  it("has placeholder pictures and reference pictures for every story", () => {
    for (const [id, story] of Object.entries(demoPictureStories)) {
      const spreads = demoSpreads(id, story, 0);
      expect(spreads).toHaveLength(story.spreads.length);
      expect(spreads.every((s) => s.imageUrl?.startsWith("data:image/svg+xml"))).toBe(true);
      expect(spreads.every((s) => !s.text.includes("—"))).toBe(true);
      expect(demoCharacters(id, story).every((c) => c.referenceUrl?.startsWith("data:image/svg+xml"))).toBe(true);
      // The new word is used at least three times (template storyRules.newWord).
      const uses =
        spreads
          .map((s) => s.text.toLowerCase())
          .join(" ")
          .split(story.newWord).length - 1;
      expect(uses).toBeGreaterThanOrEqual(3);
    }
  });
});

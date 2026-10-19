import { describe, expect, it } from "vitest";
import { blueprintData } from "./adapters";
import type { ApiBlueprintVersion } from "./types";

describe("blueprintData", () => {
  it("keeps the planner's chapter keys so edits and Restore send them back", () => {
    const stored = {
      number: 1,
      title: "Start small",
      summary: "Why one weekend is enough.",
      promise: "You will ship a first version.",
      opening_hook: "A Sunday evening and a blank page.",
      story_ideas: ["The coffee shop launch"],
      source_ids: ["src-1"],
    };
    const version = { data: { title: "Plan", chapters: [stored] } } as unknown as ApiBlueprintVersion;
    const chapter = blueprintData(version).chapters[0];
    expect(chapter).toMatchObject(stored);
    expect(chapter?.word_target).toBe(3000);
  });
});

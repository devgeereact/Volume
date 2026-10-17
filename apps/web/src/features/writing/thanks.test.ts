import { describe, expect, it } from "vitest";
import { parseThanks, thanksText, withThanks } from "./thanks";

describe("acknowledgement names", () => {
  it("reads one name per line, trimmed, without blanks or repeats", () => {
    expect(parseThanks(" Ada Lovelace \n\nMy sister; ada lovelace\nThe Tuesday writing group ")).toEqual([
      "Ada Lovelace",
      "My sister",
      "The Tuesday writing group",
    ]);
  });

  it("shows saved names from a list or a string", () => {
    expect(thanksText({ acknowledgements: ["Ada", "Ben"] })).toBe("Ada\nBen");
    expect(thanksText({ acknowledgements: "Ada; Ben" })).toBe("Ada\nBen");
    expect(thanksText({})).toBe("");
  });

  it("keeps the other book settings when saving names", () => {
    const settings = { pov: "first person", tense: "past", chapters: 12 };
    expect(withThanks(settings, ["Ada"])).toEqual({ ...settings, acknowledgements: ["Ada"] });
    expect(withThanks(settings, [])).toEqual({ ...settings, acknowledgements: null });
  });
});

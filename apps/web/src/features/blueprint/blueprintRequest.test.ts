import { describe, expect, it } from "vitest";
import { blueprintCreateInput } from "./blueprintRequest";

describe("blueprintCreateInput", () => {
  it("passes the wizard's chapter count on as chapterCount", () => {
    expect(blueprintCreateInput({ chapters: 12 })).toEqual({ chapterCount: 12 });
    expect(blueprintCreateInput({ chapters: "12" })).toEqual({ chapterCount: 12 });
  });

  it("leaves it out when the count is missing or out of range, so the server default applies", () => {
    expect(blueprintCreateInput({})).toEqual({});
    expect(blueprintCreateInput({ chapters: null })).toEqual({});
    expect(blueprintCreateInput({ chapters: 0 })).toEqual({});
    expect(blueprintCreateInput({ chapters: 61 })).toEqual({});
    expect(blueprintCreateInput({ chapters: 2.5 })).toEqual({});
  });
});

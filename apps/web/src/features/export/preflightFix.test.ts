import { describe, expect, it } from "vitest";
import { fixAction } from "./preflightFix";

describe("fixAction", () => {
  it("runs checks again for a section", () => {
    expect(fixAction({ label: "Run checks", action: "rerun-checks", sectionId: "s1" }, "b1")).toEqual({
      kind: "rerun-checks",
      sectionId: "s1",
      label: "Run checks again",
    });
  });

  it("needs a section to run checks again", () => {
    expect(fixAction({ label: "Run checks", action: "rerun-checks" }, "b1")).toBeNull();
  });

  it("links the cover item to the own-cover panel", () => {
    expect(fixAction({ route: "cover", label: "Use your own cover", anchor: "own-cover" }, "b1")).toEqual({
      kind: "link",
      to: "/books/b1/cover#own-cover",
      label: "Use your own cover",
    });
  });

  it("keeps absolute routes and has nothing without a route", () => {
    expect(fixAction({ route: "/settings", label: "Open settings" }, "b1")).toEqual({ kind: "link", to: "/settings", label: "Open settings" });
    expect(fixAction({ label: "Nothing" }, "b1")).toBeNull();
    expect(fixAction(undefined, "b1")).toBeNull();
  });
});

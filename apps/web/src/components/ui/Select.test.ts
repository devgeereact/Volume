import { describe, expect, it } from "vitest";
import { scrollTopForOption, selectListClasses } from "./Select";

describe("Select list", () => {
  it("has a height limit and scrolls, so options below the screen can be reached", () => {
    expect(selectListClasses).toMatch(/\bmax-h-\[/);
    expect(selectListClasses).toContain("overflow-y-auto");
  });

  it("scrolls just enough to show the active option", () => {
    const list = { scrollTop: 0, clientHeight: 300 };
    expect(scrollTopForOption(list, { offsetTop: 100, offsetHeight: 40 })).toBe(0);
    expect(scrollTopForOption(list, { offsetTop: 400, offsetHeight: 40 })).toBe(140);
    expect(scrollTopForOption({ scrollTop: 200, clientHeight: 300 }, { offsetTop: 50, offsetHeight: 40 })).toBe(50);
  });
});

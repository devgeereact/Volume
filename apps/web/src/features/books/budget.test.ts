import { describe, expect, it } from "vitest";
import { neededUsd } from "./BudgetPausedBanner";

describe("neededUsd", () => {
  it("reads the amount from the server's budget message", () => {
    expect(neededUsd("This book needs about $0.49 more than its budget allows. Raise the budget or stop here.")).toBe(0.49);
    expect(neededUsd("This book needs about $12 more than its budget allows.")).toBe(12);
    expect(neededUsd(null)).toBeNull();
    expect(neededUsd("Something else")).toBeNull();
  });
});

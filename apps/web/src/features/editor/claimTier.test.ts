import { describe, expect, it } from "vitest";
import { claimNeedsCheck, claimsToCheck } from "./claimTier";

describe("claimNeedsCheck", () => {
  it("needs a check for high risk, harm if wrong, or no risk recorded", () => {
    expect(claimNeedsCheck({ category: "medical", location: { risk: "high", harmIfWrong: false } })).toBe(true);
    expect(claimNeedsCheck({ category: "medical", location: { risk: "low", harmIfWrong: true } })).toBe(true);
    expect(claimNeedsCheck({ category: "medical", location: { start: 1, end: 9 } })).toBe(true);
  });

  it("always needs a check for regulatory and personal claims", () => {
    expect(claimNeedsCheck({ category: "regulatory", location: { risk: "low", harmIfWrong: false } })).toBe(true);
    expect(claimNeedsCheck({ category: "personal", location: { risk: "medium", harmIfWrong: false } })).toBe(true);
  });

  it("lists harmless low and medium risk claims for the record", () => {
    expect(claimNeedsCheck({ category: "medical", location: { risk: "low", harmIfWrong: false } })).toBe(false);
    expect(claimNeedsCheck({ category: "other_fact", location: { risk: "medium", harmIfWrong: false } })).toBe(false);
  });

  it("follows the server's needsCheck when it is sent", () => {
    expect(claimNeedsCheck({ category: "medical", location: {}, needsCheck: false })).toBe(false);
    expect(claimNeedsCheck({ category: "medical", location: { risk: "low", harmIfWrong: false }, needsCheck: true })).toBe(true);
  });
});

describe("claimsToCheck", () => {
  it("keeps only open claims that need a check", () => {
    const list = [
      { id: "a", status: "open", category: "medical", location: { risk: "high" } },
      { id: "b", status: "open", category: "medical", location: { risk: "low", harmIfWrong: false } },
      { id: "c", status: "verified", category: "medical", location: { risk: "high" } },
      { id: "d", status: "open", category: "other_fact", location: {} },
    ];
    expect(claimsToCheck(list).map((c) => c.id)).toEqual(["a", "d"]);
  });
});

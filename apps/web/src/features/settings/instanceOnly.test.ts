import { describe, expect, it } from "vitest";
import type { Budgets } from "../../api/types";
import { canSeeBackups, guestCapError, guestCapOf, parseGuestCap } from "./instanceOnly";

const budgets: Budgets = { bookDefaultUsd: 15, monthlyCapUsd: null, warnRatio: 0.8, monthSpendUsd: 0 };

describe("guestCapOf", () => {
  it("is null when the server leaves the cap out (not the instance owner)", () => {
    expect(guestCapOf({ budgets })).toBeNull();
  });
  it("returns the cap for the instance owner, including 0", () => {
    expect(guestCapOf({ budgets: { ...budgets, guestWorkspacesMonthlyCapUsd: 0 } })).toBe(0);
    expect(guestCapOf({ budgets: { ...budgets, guestWorkspacesMonthlyCapUsd: 25 } })).toBe(25);
  });
});

describe("parseGuestCap and guestCapError", () => {
  it("accepts 0 and dollar amounts", () => {
    expect(parseGuestCap("0")).toBe(0);
    expect(parseGuestCap("$1,250.50")).toBe(1250.5);
    expect(guestCapError("20")).toBeUndefined();
  });
  it("rejects empty, negative, too large and non-numbers", () => {
    for (const bad of ["", " ", "-1", "100001", "ten"]) {
      expect(parseGuestCap(bad)).toBeNull();
      expect(guestCapError(bad)).toMatch(/0 stops their AI runs/);
    }
  });
  it("words the error without em dashes", () => {
    expect(guestCapError("x")).not.toMatch(/—/);
  });
});

describe("canSeeBackups", () => {
  it("is undefined while settings load, false when backups is null, true otherwise", () => {
    expect(canSeeBackups(undefined)).toBeUndefined();
    expect(canSeeBackups({ backups: null })).toBe(false);
    expect(canSeeBackups({ backups: { lastAt: null, count: 0, locationKind: "local_folder", keep: 14, enabled: true, supported: true } })).toBe(true);
  });
});

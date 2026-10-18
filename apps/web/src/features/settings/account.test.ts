import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { accountActions, deleteBlockedReason, deleteErrorText, exportErrorText } from "./account";

describe("accountActions (D-050)", () => {
  it("shows nothing until the caller is known", () => {
    expect(accountActions(null)).toEqual({ download: false, leave: false, deleteWorkspace: false, mainWorkspace: false });
  });
  it("lets the instance owner download but never delete their workspace", () => {
    expect(accountActions({ role: "owner", instanceOwner: true })).toEqual({ download: true, leave: false, deleteWorkspace: false, mainWorkspace: true });
  });
  it("lets a guest workspace owner download and delete, but not leave", () => {
    expect(accountActions({ role: "owner", instanceOwner: false })).toEqual({ download: true, leave: false, deleteWorkspace: true, mainWorkspace: false });
  });
  it("lets editors and viewers leave, and nothing else", () => {
    for (const role of ["editor", "viewer"] as const) {
      expect(accountActions({ role, instanceOwner: false })).toEqual({ download: false, leave: true, deleteWorkspace: false, mainWorkspace: false });
    }
  });
});

describe("deleteBlockedReason", () => {
  it("holds Delete back with a reason while a job runs", () => {
    expect(deleteBlockedReason(true)).toMatch(/job running/);
    expect(deleteBlockedReason(false)).toBeUndefined();
  });
});

describe("error words", () => {
  it("explain the download's 409, 429 and 403", () => {
    expect(exportErrorText(new ApiError(409, "conflict", "x"))).toMatch(/already being prepared/);
    expect(exportErrorText(new ApiError(429, "rate_limited", "x"))).toMatch(/Wait a minute/);
    expect(exportErrorText(new ApiError(403, "forbidden", "x"))).toMatch(/Only the owner/);
    expect(exportErrorText(new ApiError(0, "network_error", "x"))).toMatch(/did not answer/);
  });
  it("explain a refused delete and pass the server's own words through", () => {
    expect(deleteErrorText(new ApiError(403, "forbidden", "x"))).toMatch(/main workspace/);
    const running = "A job is still running in this workspace. Cancel it, then try again.";
    expect(deleteErrorText(new ApiError(409, "invalid_state", running))).toBe(running);
  });
  it("use no em dashes", () => {
    for (const e of [409, 429, 403].map((s) => new ApiError(s, "x", "x"))) expect(exportErrorText(e)).not.toMatch(/—/);
    expect(deleteBlockedReason(true)).not.toMatch(/—/);
  });
});

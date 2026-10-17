import { describe, expect, it } from "vitest";
import { plainJobError, withPlainJobError } from "./jobErrors";

describe("plainJobError", () => {
  it("gives a plain message for guest_ai_disabled", () => {
    const text = plainJobError("server text", "guest_ai_disabled");
    expect(text).toMatch(/not switched on for this workspace/);
    expect(text).toMatch(/owner of this Volume/);
    expect(text).not.toMatch(/—/);
  });
  it("keeps the server text for unknown codes and null for no error", () => {
    expect(plainJobError("Something broke.", "other")).toBe("Something broke.");
    expect(plainJobError(null, null)).toBeNull();
  });
  it("rewrites a failed job record", () => {
    const job = withPlainJobError({ id: "j1", error: "raw", errorCode: "guest_ai_disabled" });
    expect(job.error).toMatch(/Ask them to set one/);
  });
});

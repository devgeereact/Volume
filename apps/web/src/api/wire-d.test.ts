import { describe, expect, it } from "vitest";
import { isApiError } from "./client";
import { canManage, canWrite, demoInvite, membersVisible } from "./wire-d";

describe("role rules (D-047)", () => {
  it("lets owner and editor write, and only the owner manage", () => {
    expect(canWrite("owner")).toBe(true);
    expect(canWrite("editor")).toBe(true);
    expect(canWrite("viewer")).toBe(false);
    expect(canWrite(null)).toBe(false);
    expect(canManage("owner")).toBe(true);
    expect(canManage("editor")).toBe(false);
  });

  it("shows Members only to the owner when invitations are on", () => {
    expect(membersVisible({ role: "owner", accountsMode: "invite" })).toBe(true);
    expect(membersVisible({ role: "owner", accountsMode: "owner-only" })).toBe(false);
    expect(membersVisible({ role: "editor", accountsMode: "invite" })).toBe(false);
    expect(membersVisible(null)).toBe(false);
  });
});

describe("demo invitations", () => {
  const empty = { members: [], invitations: [] };

  it("adds a pending invitation with the address in lower case", () => {
    const s = demoInvite({ email: " New@Example.com ", role: "viewer" }, empty);
    expect(s.invitations[0]).toMatchObject({ email: "new@example.com", role: "viewer", status: "pending" });
  });

  it("changes the role when the address is invited again, as the server does", () => {
    const once = demoInvite({ email: "a@example.com", role: "viewer" }, empty);
    const twice = demoInvite({ email: "a@example.com", role: "editor" }, once);
    expect(twice.invitations).toHaveLength(1);
    expect(twice.invitations[0]?.role).toBe("editor");
  });

  it("refuses an address that is not an email with a field message", () => {
    try {
      demoInvite({ email: "not an email", role: "editor" }, empty);
      throw new Error("expected a refusal");
    } catch (e) {
      expect(isApiError(e) && e.fieldIssues[0]?.path).toBe("email");
    }
  });
});

import { describe, expect, it } from "vitest";
import { claimResultMessage } from "./claimMessages";

// The editor used to say "saved as a new version" after every soften or remove, even when the server changed no text.
// A message about a fix must describe what happened to the book.

describe("claimResultMessage", () => {
  it("says a verified claim was marked verified", () => {
    expect(claimResultMessage("verify", undefined)).toBe("Claim marked verified.");
  });

  it("says a softer wording was saved when the text changed", () => {
    expect(claimResultMessage("soften", true)).toBe("Softer wording saved as a new version.");
  });

  it("says a sentence was removed when the text changed", () => {
    expect(claimResultMessage("remove", true)).toBe("Sentence removed and saved as a new version.");
  });

  it("says the text did not change when a removed sentence was already gone", () => {
    const message = claimResultMessage("remove", false);
    expect(message).toMatch(/already gone/i);
    expect(message).toMatch(/text did not change/i);
    expect(message).not.toMatch(/saved as a new version/i);
  });

  it("never claims a saved version when the server reported none for a softened claim", () => {
    expect(claimResultMessage("soften", false)).not.toMatch(/saved as a new version/i);
  });

  it("treats a reply without the flag as a change, as older servers did", () => {
    expect(claimResultMessage("remove", undefined)).toBe("Sentence removed and saved as a new version.");
  });
});

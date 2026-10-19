import { describe, expect, it } from "vitest";
import { ApiError } from "../../api/client";
import { initialProfileId, MOVE_EXPLAINER, originNoteOf, projectImportErrorText, projectImportProblem } from "./projectMove";

const zip = { name: "the-quiet-garden.volume.zip", size: 2048 };
const ids = ["p1", "p2"];

describe("projectImportProblem", () => {
  it("is ready with a zip and an active pen name", () => {
    expect(projectImportProblem({ file: zip, profileId: "p2", profileIds: ids })).toBeNull();
  });
  it("asks for a file first", () => {
    expect(projectImportProblem({ file: null, profileId: "p1", profileIds: ids })).toBe("Choose the project zip.");
  });
  it("refuses a file that is not a zip, and an empty zip", () => {
    expect(projectImportProblem({ file: { name: "book.md", size: 10 }, profileId: "p1", profileIds: ids })).toMatch(/\.zip file/);
    expect(projectImportProblem({ file: { name: "BOOK.ZIP", size: 10 }, profileId: "p1", profileIds: ids })).toBeNull();
    expect(projectImportProblem({ file: { name: "book.zip", size: 0 }, profileId: "p1", profileIds: ids })).toMatch(/empty/);
  });
  it("needs a pen name from the active list", () => {
    expect(projectImportProblem({ file: zip, profileId: "", profileIds: ids })).toBe("Choose a pen name for the book.");
    expect(projectImportProblem({ file: zip, profileId: "archived", profileIds: ids })).toBe("Choose a pen name for the book.");
    expect(projectImportProblem({ file: zip, profileId: "", profileIds: [] })).toMatch(/Add a pen name/);
  });
});

describe("initialProfileId", () => {
  it("uses the Library filter when it names an active pen name", () => {
    expect(initialProfileId("p2", ids)).toBe("p2");
  });
  it("falls back to the first pen name, or nothing", () => {
    expect(initialProfileId(null, ids)).toBe("p1");
    expect(initialProfileId("gone", ids)).toBe("p1");
    expect(initialProfileId(null, [])).toBe("");
  });
});

describe("projectImportErrorText", () => {
  const cases: [number, string, RegExp][] = [
    [400, "validation_failed", /could not be read/],
    [403, "forbidden", /owner or editor/],
    [404, "not_found", /not in this workspace/],
    [409, "invalid_state", /archived\. Restore it in Profiles/],
    [413, "payload_too_large", /larger than this Volume accepts/],
    [413, "http_error", /larger than this Volume accepts/],
    [415, "unsupported_media_type", /not a zip/],
    [429, "rate_limited", /Wait a minute/],
  ];
  it.each(cases)("explains a %i %s plainly", (status, code, text) => {
    expect(projectImportErrorText(new ApiError(status, code, "server text"))).toMatch(text);
  });
  it("keeps the shared wording when the server is unreachable", () => {
    expect(projectImportErrorText(new ApiError(0, "network_error", "x"))).toMatch(/did not answer/);
    expect(projectImportErrorText(new ApiError(500, "internal_error", "x"))).toMatch(/did not answer/);
  });
  it("never uses an em dash", () => {
    for (const [status, code] of cases) expect(projectImportErrorText(new ApiError(status, code, "x"))).not.toContain("—");
    expect(MOVE_EXPLAINER).not.toContain("—");
  });
});

describe("originNoteOf", () => {
  it("reads the note from the book's settings", () => {
    expect(originNoteOf({ origin: { note: "Moved from another Volume on 19 October 2026.", movedAt: 1 } })).toBe(
      "Moved from another Volume on 19 October 2026.",
    );
  });
  it("is null when there is no usable note", () => {
    expect(originNoteOf(undefined)).toBeNull();
    expect(originNoteOf({})).toBeNull();
    expect(originNoteOf({ origin: "elsewhere" })).toBeNull();
    expect(originNoteOf({ origin: { note: "  " } })).toBeNull();
  });
});

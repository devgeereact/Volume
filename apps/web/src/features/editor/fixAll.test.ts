import { describe, expect, it } from "vitest";
import type { ClaimOverviewItem } from "../../api/types";
import { fixAllClaims, pickAutoOption } from "./fixAll";

const opt = (approach: string, text: string, needsSource = false) => ({ approach, text, rationale: "", needsSource });

describe("pickAutoOption", () => {
  it("prefers soften, then generalise and reframe, never an option that needs a new source", () => {
    expect(pickAutoOption([opt("attribute", "A.", true), opt("reframe", "R."), opt("soften", "S.")])?.approach).toBe("soften");
    expect(pickAutoOption([opt("attribute", "A.", true), opt("reframe", "R.")])?.approach).toBe("reframe");
    expect(pickAutoOption([opt("attribute", "A.", true)])).toBeNull();
    expect(pickAutoOption([opt("attribute", "A.", true), opt("remove", "")])?.approach).toBe("remove");
  });
});

describe("fixAllClaims", () => {
  const claim = (id: string, extra: Partial<ClaimOverviewItem> = {}) =>
    ({ id, status: "open", sentence: `${id}.`, inCurrentText: true, suggestedSoftening: null, ...extra }) as ClaimOverviewItem;

  it("softens from the file, asks the model otherwise, closes gone sentences and counts failures", async () => {
    const calls: string[] = [];
    const report = await fixAllClaims(
      [claim("a", { suggestedSoftening: "Softer." }), claim("b"), claim("c", { inCurrentText: false }), claim("d"), claim("e", { status: "verified" })],
      {
        soften: (id) => Promise.resolve(void calls.push(`soften ${id}`)),
        remove: (id) => Promise.resolve(void calls.push(`remove ${id}`)),
        suggest: (id) =>
          id === "d"
            ? Promise.reject(new Error("model gone"))
            : Promise.resolve({ jobId: "j1", result: { baseVersionId: "v1", options: [opt("soften", "B softer.")] } }),
        apply: (id, input) => Promise.resolve(void calls.push(`apply ${id} ${input.approach} ${input.text} ${input.baseVersionId ?? ""}`)),
      },
    );
    expect(calls).toEqual(["soften a", "apply b soften B softer. v1", "remove c"]);
    expect(report.outcomes).toEqual({ softened: 1, fixed: 1, gone: 1, skipped: 0, failed: 1 });
    expect(report.errors).toEqual(["model gone"]);
    expect(report.done).toBe(4);
  });

  it("stops when cancelled", async () => {
    let n = 0;
    const r = await fixAllClaims(
      [claim("a", { suggestedSoftening: "S." }), claim("b", { suggestedSoftening: "S." })],
      {
        soften: () => Promise.resolve(void n++),
        remove: () => Promise.resolve(undefined),
        suggest: () => Promise.resolve({ jobId: "", result: null }),
        apply: () => Promise.resolve(undefined),
      },
      { cancelled: () => n >= 1 },
    );
    expect(r.done).toBe(1);
  });
});

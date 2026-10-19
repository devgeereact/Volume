import { describe, expect, it } from "vitest";
import type { ClaimOption } from "../../api/types";
import { applyInput, approachLabel, estimateLabel, inContext, readOptions } from "./claimOptions";

const soften: ClaimOption = { text: "Some studies suggest it may help.", approach: "soften", rationale: "Hedged.", needsSource: false };
const remove: ClaimOption = { text: "", approach: "remove", rationale: "Not needed.", needsSource: false };

describe("readOptions", () => {
  it("keeps well-formed options, at most three, and drops the rest", () => {
    const r = readOptions({
      options: [
        soften,
        { text: "Researchers at X found...", approach: "attribute", rationale: "Names it.", needsSource: true },
        { text: "x", approach: "shout", rationale: "" },
        { approach: "reframe" },
        remove,
        { text: "Fourth", approach: "reframe", rationale: "", needsSource: false },
      ],
    });
    expect(r.map((o) => o.approach)).toEqual(["soften", "attribute", "remove"]);
    expect(r[1]!.needsSource).toBe(true);
  });

  it("returns nothing for a result without options", () => {
    expect(readOptions(null)).toEqual([]);
    expect(readOptions({ options: "no" })).toEqual([]);
  });
});

describe("applyInput", () => {
  const sentence = "It cures back pain.";

  it("sends an option as it is", () => {
    expect(applyInput({ kind: "option", option: soften }, sentence)).toEqual({ input: { text: soften.text, approach: "soften" } });
  });

  it("sends an empty text for a remove option", () => {
    expect(applyInput({ kind: "option", option: remove }, sentence)).toEqual({ input: { text: "", approach: "remove" } });
  });

  it("keeps the option's approach for an edited option, trimmed", () => {
    expect(applyInput({ kind: "edited", option: soften, text: "  It may ease back pain. " }, sentence)).toEqual({
      input: { text: "It may ease back pain.", approach: "soften" },
    });
  });

  it("refuses an empty or unchanged own sentence", () => {
    expect(applyInput({ kind: "own", text: "  " }, sentence)).toEqual({ error: "Write the new sentence first." });
    expect(applyInput({ kind: "own", text: sentence }, sentence)).toEqual({ error: "Change the wording first." });
    expect(applyInput({ kind: "own", text: "I found it eased my back." }, sentence)).toEqual({ input: { text: "I found it eased my back.", approach: "own" } });
  });
});

describe("inContext", () => {
  it("finds the paragraph with the new text and rebuilds it as it was", () => {
    const md = "# Title\n\nFirst para.\n\nWalking daily may ease back pain. Then more.\n\nLast.";
    expect(inContext(md, "Walking daily cures back pain.", "Walking daily may ease back pain.")).toEqual({
      before: "Walking daily cures back pain. Then more.",
      after: "Walking daily may ease back pain. Then more.",
    });
  });

  it("gives nothing when the text is not there", () => {
    expect(inContext("A.\n\nB.", "x", "missing")).toBeNull();
    expect(inContext("A.", "x", "")).toBeNull();
  });
});

describe("approachLabel", () => {
  it("names known approaches and capitalises others", () => {
    expect(approachLabel("generalise")).toBe("Generalise");
    expect(approachLabel("other")).toBe("Other");
  });
});

describe("estimateLabel", () => {
  it("names a range, one figure or under a cent", () => {
    expect(estimateLabel({ lowUsd: 0.01, highUsd: 0.02 })).toBe("about $0.01 to $0.02");
    expect(estimateLabel({ lowUsd: 0.02, highUsd: 0.02 })).toBe("about $0.02");
    expect(estimateLabel({ lowUsd: 0, highUsd: 0.004 })).toBe("under $0.01");
  });
});

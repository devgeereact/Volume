import { describe, expect, it } from "vitest";
import { barcodeArea, barcodeInsetIn, safeInsetIn } from "./kdpRules";

describe("barcodeInsetIn", () => {
  it("is the larger of the text safe inset and the barcode rule, as the print build uses", () => {
    expect(barcodeInsetIn).toBe(Math.max(safeInsetIn, barcodeArea.insetFromTrimIn));
  });

  it("is 0.25 in on the current KDP rules, not the safe inset plus 0.25", () => {
    expect(barcodeInsetIn).toBe(0.25);
  });
});

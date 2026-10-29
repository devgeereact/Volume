import { describe, expect, it } from "vitest";
import { isCreditsMessage } from "./BudgetPausedBanner";

describe("isCreditsMessage", () => {
  it("knows the provider out-of-credit pause from other pauses", () => {
    expect(
      isCreditsMessage(
        "OpenRouter has run out of credits. Top up at https://openrouter.ai/settings/credits, then continue. Nothing was charged for this step and finished work is kept.",
      ),
    ).toBe(true);
    expect(isCreditsMessage("This workspace has reached the monthly AI cap the owner of this Volume set. Ask them to raise it to continue.")).toBe(false);
    expect(isCreditsMessage(null)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { brandSubline } from "./Spine";

describe("brandSubline", () => {
  it("shows the sample owner line only in demo mode", () => {
    expect(brandSubline("mock")).toBe("Gakinz, London");
  });

  it("shows nothing in live mode or while checking, so a signed-in person never sees fixed sample text", () => {
    expect(brandSubline("api")).toBeNull();
    expect(brandSubline("checking")).toBeNull();
  });
});

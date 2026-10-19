import { afterEach, describe, expect, it, vi } from "vitest";
import { prefersReducedMotion, scrollBehavior } from "./motion";

function stubReducedMotion(reduce: boolean): void {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({ matches: reduce && query === "(prefers-reduced-motion: reduce)" }),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("scroll behaviour", () => {
  it("scrolls smoothly when the reader has not asked for reduced motion", () => {
    stubReducedMotion(false);
    expect(prefersReducedMotion()).toBe(false);
    expect(scrollBehavior()).toBe("smooth");
  });

  it("jumps straight there under reduced motion", () => {
    stubReducedMotion(true);
    expect(prefersReducedMotion()).toBe(true);
    expect(scrollBehavior()).toBe("auto");
  });

  it("falls back to smooth when matchMedia is not available", () => {
    vi.stubGlobal("window", {});
    expect(scrollBehavior()).toBe("smooth");
  });
});

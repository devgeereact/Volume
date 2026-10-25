import { describe, expect, it } from "vitest";
import { screens } from "../screens";
import pages from "./seo-pages.json";
import { APP_PATH_PREFIXES, INDEXABLE, isAppPath } from "./seo";

const BANNED = /leverage|empower|showcase|transformative|impactful|cutting-edge|revolutionise|synergy|groundbreaking|utilise|elevate|unlock|seamless/i;
import landing from "./LandingPage.tsx?raw";
import how from "./HowItWorksPage.tsx?raw";
import notFound from "./NotFoundPage.tsx?raw";
import layout from "./SiteLayout.tsx?raw";

const SOURCES: [string, string][] = [
  ["LandingPage.tsx", landing],
  ["HowItWorksPage.tsx", how],
  ["NotFoundPage.tsx", notFound],
  ["SiteLayout.tsx", layout],
  ["seo-pages.json", JSON.stringify(pages)],
];

describe("public page metadata", () => {
  it("keeps titles and descriptions within search result lengths and honest", () => {
    for (const [key, p] of Object.entries(pages)) {
      expect(p.title.length, key).toBeLessThanOrEqual(65);
      expect(p.description.length, key).toBeLessThanOrEqual(160);
      expect(`${p.title} ${p.description}`, key).not.toMatch(/guarantee|best-selling|bestseller|rank|#1/i);
    }
  });

  it("indexes only the landing and How it works", () => {
    expect([...INDEXABLE]).toEqual(["home", "how-it-works"]);
  });
});

describe("public page copy", () => {
  it("uses no em dashes and none of the banned words", () => {
    for (const [file, text] of SOURCES) {
      expect(text, file).not.toContain("—");
      expect(text, file).not.toMatch(BANNED);
    }
  });
});

describe("app paths", () => {
  it("recognises every signed-in screen so a signed-out visitor gets sign-in, not not-found", () => {
    for (const s of Object.values(screens)) expect(isAppPath(s.path), s.path).toBe(true);
    expect(isAppPath("/sign-in")).toBe(true);
    expect(isAppPath("/books/abc/export")).toBe(true);
    expect(APP_PATH_PREFIXES).toContain("library");
  });

  it("treats unknown addresses as not found", () => {
    for (const p of ["/", "/how-it-works", "/pricing", "/nope/deeper"]) expect(isAppPath(p), p).toBe(false);
  });
});

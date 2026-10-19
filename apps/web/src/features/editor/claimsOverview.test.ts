import { describe, expect, it } from "vitest";
import type { ClaimOverviewItem } from "../../api/types";
import { filterCount, groupBySection, sectionName, toMsClaim } from "./claimsOverview";

function claim(id: string, section: ClaimOverviewItem["section"], status = "open"): ClaimOverviewItem {
  return {
    id,
    projectId: "b1",
    sectionId: section?.id ?? null,
    versionId: null,
    category: "medical",
    sentence: `Sentence ${id}.`,
    location: {},
    checkNeeded: null,
    status,
    ownerNote: null,
    sourceUrl: null,
    resolvedAt: null,
    createdAt: 1,
    suggestedSoftening: null,
    section,
    inCurrentText: true,
  };
}

const ch1 = { id: "s1", title: "Morning", kind: "chapter", number: 1, enabled: true, position: 1 };
const ch2 = { id: "s2", title: null, kind: "chapter", number: 2, enabled: true, position: 2 };
const intro = { id: "s0", title: null, kind: "introduction", number: null, enabled: true, position: 0 };

describe("groupBySection", () => {
  it("keeps the server's reading order and puts each section once", () => {
    const g = groupBySection([claim("a", intro), claim("b", ch1), claim("c", ch1), claim("d", ch2), claim("e", null)]);
    expect(g.map((x) => [x.name, x.items.map((i) => i.id)])).toEqual([
      ["Introduction", ["a"]],
      ["Chapter 1: Morning", ["b", "c"]],
      ["Chapter 2", ["d"]],
      ["Not in a section", ["e"]],
    ]);
  });
});

describe("filterCount", () => {
  const counts = { open: 3, verified: 2, softened: 1, removed: 0, author_experience: 1 };
  it("reads one status or adds them all", () => {
    expect(filterCount(counts, "open")).toBe(3);
    expect(filterCount(counts, "all")).toBe(7);
    expect(filterCount(undefined, "open")).toBeUndefined();
  });
});

describe("sectionName and toMsClaim", () => {
  it("names front and back matter by kind", () => {
    expect(sectionName({ ...intro, kind: "about_author" })).toBe("About the author");
  });

  it("maps the author's own experience to verified for the shared card", () => {
    expect(toMsClaim(claim("x", ch1, "author_experience"), "Medical").status).toBe("verified");
    expect(toMsClaim(claim("y", ch1), "Medical").check).toBe("Check this statement before you publish.");
  });
});

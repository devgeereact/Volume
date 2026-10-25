import { describe, expect, it } from "vitest";
import { crumbsFor } from "./Breadcrumbs";

describe("crumbsFor", () => {
  it("names an unknown address instead of showing the Library trail", () => {
    const crumbs = crumbsFor("/this-page-does-not-exist", {});
    expect(crumbs.map((c) => c.label)).toEqual(["Library", "Page not found"]);
  });

  it("keeps the Library trail for the Library and the profile list", () => {
    expect(crumbsFor("/library", {}).map((c) => c.label)).toEqual(["Library"]);
    expect(crumbsFor("/profiles", {}).map((c) => c.label)).toEqual(["Profiles"]);
  });
});

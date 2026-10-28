import { afterEach, describe, expect, it, vi } from "vitest";
import pages from "./seo-pages.json";
import { applyPrivateTitle, DEFAULT_TITLE, resetSeo } from "./seo";

/* No DOM in this test environment, so a small fake head stands in for document. */
function fakeDocument() {
  const nodes: { tag: string; attrs: Map<string, string> }[] = [];
  const make = (tag: string) => {
    const node = { tag, attrs: new Map<string, string>() };
    return Object.assign(node, {
      setAttribute: (k: string, v: string) => void node.attrs.set(k, v),
      remove: () => void nodes.splice(nodes.indexOf(node), 1),
    });
  };
  const match = (n: (typeof nodes)[number], sel: string) => {
    const m = /^meta\[(\w+)="([^"]+)"\]$/.exec(sel);
    return !!m && n.tag === "meta" && n.attrs.get(m[1]!) === m[2];
  };
  const doc = {
    title: "",
    createElement: make,
    head: {
      appendChild: (n: ReturnType<typeof make>) => void nodes.push(n),
      querySelector: (sel: string) => nodes.find((n) => match(n, sel)) ?? null,
      querySelectorAll: () => [] as unknown[],
    },
  };
  return { doc, robots: () => nodes.find((n) => n.attrs.get("name") === "robots")?.attrs.get("content") };
}

afterEach(() => vi.unstubAllGlobals());

describe("in-app not found head", () => {
  it("sets a house-style title and noindex, and resetSeo takes them off again", () => {
    const f = fakeDocument();
    vi.stubGlobal("document", f.doc);
    applyPrivateTitle(pages["not-found"].title);
    expect(f.doc.title).toBe("Page not found | Volume");
    expect(f.doc.title).not.toContain("—");
    expect(f.robots()).toBe("noindex, nofollow");
    resetSeo();
    expect(f.doc.title).toBe(DEFAULT_TITLE);
    expect(f.robots()).toBe("noindex, nofollow");
  });
});

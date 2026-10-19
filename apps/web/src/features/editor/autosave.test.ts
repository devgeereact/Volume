import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { autosaveText, browserDraftStore, createAutosaver, draftBehind, draftKey, type AutosaveStatus, type DraftStore, type LocalDraft } from "./autosave";

function memoryStore(): DraftStore & { data: Map<string, LocalDraft> } {
  const data = new Map<string, LocalDraft>();
  return { data, read: (k) => data.get(k) ?? null, write: (k, d) => void data.set(k, d), remove: (k) => void data.delete(k) };
}

class Conflict extends Error {
  constructor(readonly current: string) {
    super("conflict");
  }
}

function setup(save: (md: string, base: string | null, rev: number | null) => Promise<{ versionId: string; revision?: number }>) {
  const store = memoryStore();
  const statuses: AutosaveStatus[] = [];
  const saved: string[] = [];
  const a = createAutosaver({
    sectionId: "s1",
    userId: "u1",
    savedMd: "one",
    baseVersionId: "v1",
    baseRevision: 10,
    save,
    failure: (e) => (e instanceof Conflict ? { conflict: true, currentVersionId: e.current } : { conflict: false, message: String(e) }),
    onStatus: (s) => statuses.push(s),
    onSaved: (md) => saved.push(md),
    store,
    now: () => 1000,
  });
  return { a, store, statuses, saved };
}

describe("autosave", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits two seconds after the last change, then saves once", async () => {
    const save = vi.fn((_md: string, _base: string | null) => Promise.resolve({ versionId: "v2" }));
    const { a } = setup(save);
    a.change("one t");
    await vi.advanceTimersByTimeAsync(1500);
    a.change("one tw");
    await vi.advanceTimersByTimeAsync(1999);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith("one tw", "v1", 10);
    expect(a.status()).toEqual({ kind: "saved", at: 1000 });
  });

  it("builds the next save on the version and revision the server returned", async () => {
    const save = vi.fn((_md: string, _base: string | null, _rev: number | null) => Promise.resolve({ versionId: "v2", revision: 22 }));
    const { a } = setup(save);
    a.change("two");
    await a.flush();
    a.change("three");
    await a.flush();
    expect(save.mock.calls[1]).toEqual(["three", "v2", 22]);
  });

  it("reports the version the next save builds on, after a save in flight ends", async () => {
    let resolve: (v: { versionId: string; revision?: number }) => void = () => {};
    const save = vi.fn(() => new Promise<{ versionId: string; revision?: number }>((r) => (resolve = r)));
    const { a } = setup(save);
    a.change("two");
    const blur = a.flush();
    expect(a.base()).toEqual({ versionId: "v1", revision: 10 });
    const again = a.flush();
    resolve({ versionId: "v2", revision: 20 });
    expect(await blur).toBe(true);
    expect(await again).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    expect(a.base()).toEqual({ versionId: "v2", revision: 20 });
  });

  it("saves at once on flush (blur or leaving) and skips when nothing changed", async () => {
    const save = vi.fn(() => Promise.resolve({ versionId: "v2" }));
    const { a } = setup(save);
    expect(await a.flush()).toBe(true);
    expect(save).not.toHaveBeenCalled();
    a.change("two");
    expect(await a.flush()).toBe(true);
    expect(save).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("keeps a local draft until the server confirms, then clears it", async () => {
    let resolve: (v: { versionId: string }) => void = () => {};
    const save = vi.fn(() => new Promise<{ versionId: string }>((r) => (resolve = r)));
    const { a, store } = setup(save);
    a.change("two");
    expect(store.data.get(draftKey("s1", "u1"))).toEqual({ bodyMd: "two", baseVersionId: "v1", baseRevision: 10, at: 1000 });
    const done = a.flush();
    expect(a.status().kind).toBe("saving");
    expect(store.data.has(draftKey("s1", "u1"))).toBe(true);
    resolve({ versionId: "v2" });
    await done;
    expect(store.data.has(draftKey("s1", "u1"))).toBe(false);
  });

  it("keeps the draft when typing went on during a save, and saves that too", async () => {
    let resolve: (v: { versionId: string }) => void = () => {};
    const save = vi.fn((_md: string, _base: string | null) => new Promise<{ versionId: string }>((r) => (resolve = r)));
    const { a, store } = setup(save);
    a.change("two");
    const first = a.flush();
    a.change("two more");
    resolve({ versionId: "v2" });
    await first;
    expect(store.data.get(draftKey("s1", "u1"))?.bodyMd).toBe("two more");
    expect(a.status().kind).toBe("pending");
    await vi.advanceTimersByTimeAsync(2000);
    resolve({ versionId: "v3" });
    await vi.advanceTimersByTimeAsync(0);
    expect(save.mock.calls[1]).toEqual(["two more", "v2", null]);
    expect(store.data.has(draftKey("s1", "u1"))).toBe(false);
  });

  it("stops on a conflict, keeps the draft and saves nothing more until reset", async () => {
    const save = vi.fn(() => Promise.reject(new Conflict("v9")));
    const { a, store } = setup(save);
    a.change("mine");
    expect(await a.flush()).toBe(false);
    expect(a.status()).toEqual({ kind: "conflict", currentVersionId: "v9" });
    a.change("mine again");
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.data.get(draftKey("s1", "u1"))?.bodyMd).toBe("mine again");
    a.reset("theirs", "v9");
    expect(a.status().kind).toBe("idle");
    expect(store.data.has(draftKey("s1", "u1"))).toBe(false);
    expect(a.dirty()).toBe(false);
  });

  it("shows an error and saves again on Retry", async () => {
    let fail = true;
    const save = vi.fn(() => (fail ? Promise.reject(new Error("offline")) : Promise.resolve({ versionId: "v2" })));
    const { a } = setup(save);
    a.change("two");
    await a.flush();
    expect(a.status()).toEqual({ kind: "error", message: "Error: offline" });
    expect(autosaveText(a.status(), () => "")).toBe("Not saved.");
    fail = false;
    expect(await a.retry()).toBe(true);
    expect(autosaveText(a.status(), () => "06:42")).toBe("Saved at 06:42");
  });

  it("keeps the saved status when told what it just saved", async () => {
    const save = vi.fn(() => Promise.resolve({ versionId: "v2" }));
    const { a } = setup(save);
    a.change("two");
    await a.flush();
    a.reset("two", "v2");
    expect(a.status()).toEqual({ kind: "saved", at: 1000 });
    a.reset("theirs", "v5");
    expect(a.status().kind).toBe("idle");
  });

  it("typing back to the saved text cancels the save and the draft", async () => {
    const save = vi.fn(() => Promise.resolve({ versionId: "v2" }));
    const { a, store } = setup(save);
    a.change("two");
    a.change("one");
    await vi.advanceTimersByTimeAsync(3000);
    expect(save).not.toHaveBeenCalled();
    expect(store.data.size).toBe(0);
    expect(a.status().kind).toBe("idle");
  });
});

describe("draftKey", () => {
  it("keeps users apart", () => {
    expect(draftKey("s1", "u1")).not.toBe(draftKey("s1", "u2"));
  });
});

describe("browserDraftStore", () => {
  it("survives storage that throws", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("full");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const s = browserDraftStore(broken);
    expect(() => s.write("k", { bodyMd: "x", baseVersionId: null, baseRevision: null, at: 1 })).not.toThrow();
    expect(s.read("k")).toBeNull();
    expect(() => s.remove("k")).not.toThrow();
  });

  it("reads back what it wrote and ignores junk", () => {
    const m = new Map<string, string>();
    const s = browserDraftStore({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
    s.write("k", { bodyMd: "x", baseVersionId: "v1", baseRevision: 7, at: 5 });
    expect(s.read("k")).toEqual({ bodyMd: "x", baseVersionId: "v1", baseRevision: 7, at: 5 });
    m.set("j", "{not json");
    expect(s.read("j")).toBeNull();
  });
});

describe("draftBehind", () => {
  const draft = { baseVersionId: "v3", baseRevision: 100 };

  it("is current only when the version and its revision both match", () => {
    expect(draftBehind(draft, { versionId: "v3", revision: 100 })).toBe(false);
  });

  it("is behind when another version is current", () => {
    expect(draftBehind(draft, { versionId: "v4", revision: 100 })).toBe(true);
  });

  it("is behind when the same autosave was updated in place since (another tab)", () => {
    expect(draftBehind(draft, { versionId: "v3", revision: 250 })).toBe(true);
  });

  it("is behind when either revision is unknown, so restoring never updates in place blind", () => {
    expect(draftBehind({ baseVersionId: "v3", baseRevision: null }, { versionId: "v3", revision: 100 })).toBe(true);
    expect(draftBehind(draft, { versionId: "v3", revision: null })).toBe(true);
  });
});

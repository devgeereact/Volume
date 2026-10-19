/* Editor autosave without React: a debounced save of the latest text, a save at once on blur or
   before leaving, and a local draft in localStorage until the server confirms. A 409 stops saving
   until the owner chooses (keep mine as a new version, or load theirs); any other failure waits for
   Retry. The editor wraps this in a hook; the tests drive it with fake timers. */

export const AUTOSAVE_DELAY_MS = 2000;

export type AutosaveStatus =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string }
  | { kind: "conflict"; currentVersionId: string | null };

/** What a failed save means: a conflict (with the server's current version when it said) or another error. */
export type SaveFailure = { conflict: true; currentVersionId: string | null } | { conflict: false; message: string };

/** A draft kept in this browser until the server has the text. */
export interface LocalDraft {
  bodyMd: string;
  baseVersionId: string | null;
  at: number;
}

export interface DraftStore {
  read(key: string): LocalDraft | null;
  write(key: string, draft: LocalDraft): void;
  remove(key: string): void;
}

const PREFIX = "volume:draft:";

/** One draft per user and section, so two accounts on one browser never see each other's typing. */
export function draftKey(sectionId: string, userId: string): string {
  return `${PREFIX}${encodeURIComponent(userId)}:${sectionId}`;
}

/** localStorage, where every call is wrapped so a full or blocked store never stops typing. */
export function browserDraftStore(storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = safeLocalStorage()): DraftStore {
  return {
    read(key) {
      try {
        const raw = storage?.getItem(key);
        if (!raw) return null;
        const v = JSON.parse(raw) as Partial<LocalDraft>;
        if (typeof v.bodyMd !== "string" || typeof v.at !== "number") return null;
        return { bodyMd: v.bodyMd, baseVersionId: typeof v.baseVersionId === "string" ? v.baseVersionId : null, at: v.at };
      } catch {
        return null;
      }
    },
    write(key, draft) {
      try {
        storage?.setItem(key, JSON.stringify(draft));
      } catch {
        // Full or blocked storage: the server save still runs.
      }
    },
    remove(key) {
      try {
        storage?.removeItem(key);
      } catch {
        // Nothing to do.
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export interface AutosaveOptions {
  /** Section and user, for the local draft key. */
  sectionId: string;
  userId: string;
  /** The text as last loaded or saved. */
  savedMd: string;
  /** The version the next save builds on. */
  baseVersionId: string | null;
  /** Saves the text on the server; resolves with the new (or coalesced) version id. */
  save: (bodyMd: string, baseVersionId: string | null) => Promise<{ versionId: string }>;
  /** Turns a thrown error into a conflict or a message. */
  failure: (e: unknown) => SaveFailure;
  onStatus: (s: AutosaveStatus) => void;
  /** Runs after each confirmed save, with the text and version saved. */
  onSaved?: (bodyMd: string, versionId: string) => void;
  store?: DraftStore | undefined;
  delayMs?: number | undefined;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (t: unknown) => void;
}

export interface Autosaver {
  /** The text on screen changed: keep the draft locally and save after the pause. */
  change(bodyMd: string): void;
  /** Save now (blur, leaving, before a server-side change). True when the server has the text. */
  flush(): Promise<boolean>;
  /** Try again after an error. */
  retry(): Promise<boolean>;
  /** New saved state (section reloaded, conflict resolved, a version saved another way). Clears the draft. */
  reset(savedMd: string, baseVersionId: string | null): void;
  status(): AutosaveStatus;
  /** True while the text on screen is not on the server. */
  dirty(): boolean;
  dispose(): void;
}

export function createAutosaver(o: AutosaveOptions): Autosaver {
  const delay = o.delayMs ?? AUTOSAVE_DELAY_MS;
  const now = o.now ?? (() => Date.now());
  const setTimer = o.setTimer ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const clearTimer = o.clearTimer ?? ((t: unknown) => clearTimeout(t as ReturnType<typeof setTimeout>));
  const key = draftKey(o.sectionId, o.userId);
  let saved = o.savedMd;
  let base = o.baseVersionId;
  let latest = o.savedMd;
  let timer: unknown = null;
  let inFlight: Promise<boolean> | null = null;
  let state: AutosaveStatus = { kind: "idle" };
  let disposed = false;

  function set(s: AutosaveStatus) {
    state = s;
    if (!disposed) o.onStatus(s);
  }
  function cancelTimer() {
    if (timer !== null) clearTimer(timer);
    timer = null;
  }
  const blocked = () => state.kind === "conflict";

  async function run(): Promise<boolean> {
    cancelTimer();
    if (inFlight) {
      // One save at a time; once it ends, save whatever came in meanwhile.
      await inFlight;
      return latest === saved ? true : blocked() ? false : run();
    }
    if (latest === saved) return true;
    if (blocked()) return false;
    const md = latest;
    set({ kind: "saving" });
    inFlight = (async () => {
      try {
        const r = await o.save(md, base);
        saved = md;
        base = r.versionId;
        if (latest === md) o.store?.remove(key);
        o.onSaved?.(md, r.versionId);
        set(latest === md ? { kind: "saved", at: now() } : { kind: "pending" });
        return true;
      } catch (e) {
        const f = o.failure(e);
        set(f.conflict ? { kind: "conflict", currentVersionId: f.currentVersionId } : { kind: "error", message: f.message });
        return false;
      } finally {
        inFlight = null;
      }
    })();
    const ok = await inFlight;
    if (ok && latest !== saved && !disposed) schedule();
    return ok;
  }

  function schedule() {
    cancelTimer();
    timer = setTimer(() => {
      timer = null;
      void run();
    }, delay);
  }

  return {
    change(bodyMd) {
      if (disposed || bodyMd === latest) return;
      latest = bodyMd;
      if (bodyMd === saved) {
        cancelTimer();
        o.store?.remove(key);
        if (state.kind === "pending") set({ kind: "idle" });
        return;
      }
      o.store?.write(key, { bodyMd, baseVersionId: base, at: now() });
      if (blocked()) return; // keep the draft; the owner resolves the conflict first
      if (state.kind !== "saving" && state.kind !== "error") set({ kind: "pending" });
      if (state.kind !== "error") schedule();
    },
    flush: () => run(),
    retry() {
      if (state.kind === "error") set({ kind: "pending" });
      return run();
    },
    reset(savedMd, baseVersionId) {
      // The save that just finished already says this: keep "Saved at".
      if (savedMd === saved && savedMd === latest && baseVersionId === base && state.kind !== "conflict" && state.kind !== "error") return;
      cancelTimer();
      saved = savedMd;
      latest = savedMd;
      base = baseVersionId;
      o.store?.remove(key);
      set({ kind: "idle" });
    },
    status: () => state,
    dirty: () => latest !== saved,
    dispose() {
      cancelTimer();
      disposed = true;
    },
  };
}

/** The status line under the editor title. */
export function autosaveText(s: AutosaveStatus, time: (at: number) => string): string {
  switch (s.kind) {
    case "saving":
      return "Saving";
    case "saved":
      return `Saved at ${time(s.at)}`;
    case "error":
      return "Not saved.";
    case "conflict":
      return "Not saved. The section changed somewhere else.";
    case "pending":
      return "Unsaved changes";
    default:
      return "";
  }
}

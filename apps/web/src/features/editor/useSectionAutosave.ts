import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isApiError } from "../../api/client";
import { useAutosaveSection } from "../../api/hooks";
import type { ApiSectionVersion } from "../../api/types";
import { errorText } from "../../api/wire-c";
import { browserDraftStore, createAutosaver, type Autosaver, type AutosaveStatus, type SaveFailure } from "./autosave";

/** The server's current version from a 409 body, when it sent one. */
export function conflictVersion(details: unknown): string | null {
  if (!details || typeof details !== "object") return null;
  const d = details as Record<string, unknown>;
  if (typeof d.currentVersionId === "string") return d.currentVersionId;
  const cur = d.current;
  if (cur && typeof cur === "object" && typeof (cur as Record<string, unknown>).id === "string") return (cur as { id: string }).id;
  return null;
}

export function saveFailure(e: unknown): SaveFailure {
  if (isApiError(e) && (e.isConflict || e.status === 409)) return { conflict: true, currentVersionId: conflictVersion(e.details) };
  return { conflict: false, message: errorText(e) };
}

export const draftStore = browserDraftStore();

/**
 * One autosaver per open section. `doc` is the saved state on screen (null while loading); when it
 * changes while nothing is unsaved, the autosaver takes it as the new saved text.
 */
export function useSectionAutosave(o: {
  bookId: string;
  sectionId: string;
  doc: { sectionId: string; savedMd: string; versionId: string | null } | null;
  onSaved: (bodyMd: string, v: ApiSectionVersion, sectionId: string) => void;
}) {
  const { bookId, sectionId, doc } = o;
  const mutation = useAutosaveSection();
  const [status, setStatus] = useState<AutosaveStatus>({ kind: "idle" });
  const ref = useRef<{ sectionId: string; a: Autosaver } | null>(null);
  const onSaved = useRef(o.onSaved);
  const mutate = useRef(mutation.mutateAsync);
  useEffect(() => {
    onSaved.current = o.onSaved;
    mutate.current = mutation.mutateAsync;
  });
  const ready = !!doc && doc.sectionId === sectionId;

  // Create when the section's text is on screen; on leaving the section (or the screen), save what is left.
  useEffect(() => {
    if (!ready || !doc) return;
    if (ref.current?.sectionId === sectionId) return;
    const versions = new Map<string, ApiSectionVersion>();
    const a = createAutosaver({
      sectionId,
      savedMd: doc.savedMd,
      baseVersionId: doc.versionId,
      store: draftStore,
      save: async (bodyMd, baseVersionId) => {
        const v = await mutate.current({ bookId, sectionId, input: { bodyMd, baseVersionId } });
        versions.set(v.id, v);
        return { versionId: v.id };
      },
      failure: saveFailure,
      onStatus: setStatus,
      onSaved: (md, id) => {
        const v = versions.get(id);
        if (v) onSaved.current(md, v, sectionId);
      },
    });
    ref.current = { sectionId, a };
    setStatus({ kind: "idle" });
  }, [ready, doc, sectionId, bookId]);

  useEffect(
    () => () => {
      const cur = ref.current;
      if (cur && cur.sectionId === sectionId) {
        void cur.a.flush().finally(() => cur.a.dispose());
        ref.current = null;
      }
    },
    [sectionId],
  );

  // Text saved another way (reload, restore, an applied fix, Save version): take it as saved.
  const savedMd = ready ? doc.savedMd : null;
  const versionId = ready ? doc.versionId : null;
  useEffect(() => {
    const cur = ref.current;
    if (!cur || cur.sectionId !== sectionId || savedMd === null || cur.a.dirty()) return;
    cur.a.reset(savedMd, versionId);
  }, [savedMd, versionId, sectionId]);

  const get = useCallback(() => (ref.current?.sectionId === sectionId ? ref.current.a : null), [sectionId]);
  return useMemo(
    () => ({
      status,
      change: (md: string) => get()?.change(md),
      flush: () => get()?.flush() ?? Promise.resolve(true),
      retry: () => get()?.retry() ?? Promise.resolve(true),
      reset: (md: string, base: string | null) => get()?.reset(md, base),
      dirty: () => get()?.dirty() ?? false,
    }),
    [status, get],
  );
}

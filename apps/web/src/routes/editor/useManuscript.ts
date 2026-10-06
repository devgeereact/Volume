import { useCallback, useMemo, useState } from "react";
import { DEMO_NOW } from "../../data";
import type { Manuscript, MsBlock, MsClaim, MsNote, MsSection, MsSuggestion, MsVersion, SuggestionPass, VersionOrigin } from "./manuscript";
import { findIssues } from "./textTools";

/* Local editor state for the demo: blocks, versions, claims and suggestions. Every save is a version;
   restore adds a new version, so nothing is lost. Nothing leaves the browser. */

export type SuggestionState = "pending" | "accepted" | "rejected" | "stale";

let idSeq = 0;
export const newId = () => `nb${Date.now().toString(36)}${++idSeq}`;

function sameBlocks(a: MsBlock[], b: MsBlock[]): boolean {
  return a.length === b.length && a.every((x, i) => x.kind === b[i]?.kind && x.text === b[i]?.text);
}

export function useManuscript(initial: Manuscript, fallbackDate: string) {
  const [ms, setMs] = useState<Manuscript>(() => {
    const versions: Record<string, MsVersion[]> = { ...initial.versions };
    for (const s of initial.sections) {
      if (!versions[s.id] && s.blocks.length > 0)
        versions[s.id] = [
          {
            number: 1,
            at: fallbackDate,
            origin: s.source === "writer" ? "AI write" : "Restore",
            note: s.source === "writer" ? "First draft from the writer" : "Set by the app",
            blocks: s.blocks,
          },
        ];
    }
    if (initial.sections.some((s) => s.source !== "writer"))
      for (const s of initial.sections)
        if (s.source !== "writer" && versions[s.id]?.[0])
          versions[s.id] = [{ ...versions[s.id]![0]!, origin: "Owner", note: s.source === "profile" ? "From the pen name profile" : "Made by the app" }];
    return { ...initial, versions };
  });
  const [suggestionState, setSuggestionState] = useState<Record<string, SuggestionState>>({});

  const updateSection = useCallback((sectionId: string, fn: (s: MsSection) => MsSection) => {
    setMs((m) => ({ ...m, sections: m.sections.map((s) => (s.id === sectionId ? fn(s) : s)) }));
  }, []);

  const setBlockText = useCallback(
    (sectionId: string, blockId: string, text: string) =>
      updateSection(sectionId, (s) => ({ ...s, blocks: s.blocks.map((b) => (b.id === blockId ? { ...b, text, rev: b.rev + 1 } : b)) })),
    [updateSection],
  );

  /** Replace the first occurrence of `original` in a block (at `near` when it still matches there). */
  const replaceInBlock = useCallback((sectionId: string, blockId: string, original: string, proposed: string, near?: number) => {
    setMs((m) => ({
      ...m,
      sections: m.sections.map((s) => {
        if (s.id !== sectionId) return s;
        return {
          ...s,
          blocks: s.blocks.map((b) => {
            if (b.id !== blockId) return b;
            const at = near !== undefined && b.text.slice(near, near + original.length) === original ? near : b.text.indexOf(original);
            if (at < 0) return b;
            let next = b.text.slice(0, at) + proposed + b.text.slice(at + original.length);
            if (proposed === "")
              next = next
                .replace(/\s{2,}/g, " ")
                .replace(/\s+([.,;:])/g, "$1")
                .trim();
            return { ...b, text: next, rev: b.rev + 1 };
          }),
        };
      }),
    }));
  }, []);

  const splitBlock = useCallback(
    (sectionId: string, blockId: string, offset: number, liveText: string): string => {
      const id = newId();
      updateSection(sectionId, (s) => {
        const i = s.blocks.findIndex((b) => b.id === blockId);
        if (i < 0) return s;
        const b = s.blocks[i]!;
        const first: MsBlock = { ...b, text: liveText.slice(0, offset).trimEnd(), rev: b.rev + 1 };
        const second: MsBlock = { id, kind: "p", text: liveText.slice(offset).trimStart(), rev: 0 };
        return { ...s, blocks: [...s.blocks.slice(0, i), first, second, ...s.blocks.slice(i + 1)] };
      });
      return id;
    },
    [updateSection],
  );

  const addParagraph = useCallback(
    (sectionId: string, text = ""): string => {
      const id = newId();
      updateSection(sectionId, (s) => ({ ...s, blocks: [...s.blocks, { id, kind: "p", text, rev: 0 }] }));
      return id;
    },
    [updateSection],
  );

  const removeEmptyBlock = useCallback(
    (sectionId: string, blockId: string) =>
      updateSection(sectionId, (s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId || b.text.trim() !== "") })),
    [updateSection],
  );

  const setBlocks = useCallback(
    (sectionId: string, blocks: MsBlock[]) => updateSection(sectionId, (s) => ({ ...s, blocks: blocks.map((b) => ({ ...b, rev: b.rev + 100 })) })),
    [updateSection],
  );

  const saveVersion = useCallback((sectionId: string, origin: VersionOrigin, note: string): number => {
    let num = 0;
    setMs((m) => {
      const s = m.sections.find((x) => x.id === sectionId);
      if (!s) return m;
      const list = m.versions[sectionId] ?? [];
      num = (list[list.length - 1]?.number ?? 0) + 1;
      return { ...m, versions: { ...m.versions, [sectionId]: [...list, { number: num, at: DEMO_NOW, origin, note, blocks: s.blocks }] } };
    });
    return num;
  }, []);

  const setClaim = useCallback((id: string, patch: Partial<MsClaim>) => {
    setMs((m) => ({ ...m, claims: m.claims.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  }, []);

  const addSuggestions = useCallback((sectionId: string, pass: SuggestionPass, list: MsSuggestion[]) => {
    setMs((m) => ({
      ...m,
      suggestions: [...m.suggestions.filter((s) => !(s.sectionId === sectionId && s.pass === pass)), ...list],
      passesRun: { ...m.passesRun, [sectionId]: [...new Set([...(m.passesRun[sectionId] ?? []), pass])] },
    }));
  }, []);

  const replaceSnapshot = useCallback((next: Manuscript) => setMs(next), []);

  /** Insert new blocks after a block (author notes woven in or expanded). Returns the first new id. */
  const insertAfter = useCallback(
    (sectionId: string, afterBlockId: string, blocks: MsBlock[]) =>
      updateSection(sectionId, (s) => {
        const i = s.blocks.findIndex((b) => b.id === afterBlockId);
        const at = i < 0 ? s.blocks.length : i + 1;
        return { ...s, blocks: [...s.blocks.slice(0, at), ...blocks, ...s.blocks.slice(at)] };
      }),
    [updateSection],
  );

  const addNote = useCallback((sectionId: string, afterBlockId: string): string => {
    const id = newId();
    setMs((m) => ({ ...m, notes: [...m.notes, { id, sectionId, afterBlockId, text: "", status: "draft", mode: null, proposed: [] }] }));
    return id;
  }, []);

  const updateNote = useCallback((id: string, patch: Partial<MsNote>) => {
    setMs((m) => ({ ...m, notes: m.notes.map((n) => (n.id === id ? { ...n, ...patch } : n)) }));
  }, []);

  const removeNote = useCallback((id: string) => {
    setMs((m) => ({ ...m, notes: m.notes.filter((n) => n.id !== id) }));
  }, []);

  const isDirty = useCallback(
    (sectionId: string): boolean => {
      const s = ms.sections.find((x) => x.id === sectionId);
      const list = ms.versions[sectionId];
      const last = list?.[list.length - 1];
      if (!s) return false;
      if (!last) return s.blocks.some((b) => b.text.trim() !== "");
      return !sameBlocks(s.blocks, last.blocks);
    },
    [ms],
  );

  return useMemo(
    () => ({
      ms,
      suggestionState,
      setSuggestionState,
      setBlockText,
      replaceInBlock,
      splitBlock,
      addParagraph,
      removeEmptyBlock,
      setBlocks,
      saveVersion,
      setClaim,
      addSuggestions,
      replaceSnapshot,
      isDirty,
      insertAfter,
      addNote,
      updateNote,
      removeNote,
    }),
    [
      ms,
      suggestionState,
      setBlockText,
      replaceInBlock,
      splitBlock,
      addParagraph,
      removeEmptyBlock,
      setBlocks,
      saveVersion,
      setClaim,
      addSuggestions,
      replaceSnapshot,
      isDirty,
      insertAfter,
      addNote,
      updateNote,
      removeNote,
    ],
  );
}

/** Demo suggestions for a pass the section has not run yet. */
export function makeSuggestions(section: MsSection, next: MsSection | undefined, pass: SuggestionPass): MsSuggestion[] {
  const out: MsSuggestion[] = [];
  const paras = section.blocks.filter((b) => b.kind === "p" && b.text.trim());
  if (pass === "line") {
    for (const issue of findIssues(paras)) {
      if (issue.kind === "spelling" && issue.fix)
        out.push({ id: newId(), pass, sectionId: section.id, blockId: issue.blockId, original: issue.found, proposed: issue.fix, reason: "British spelling." });
    }
    for (const b of paras) {
      const m = b.text.match(/\b(really|very|just|actually|a little bit|quite) (\w+)/i);
      if (m && out.length < 4)
        out.push({
          id: newId(),
          pass,
          sectionId: section.id,
          blockId: b.id,
          original: m[0],
          proposed: m[2] ?? "",
          reason: `"${m[1]}" softens the sentence without adding meaning.`,
        });
    }
  }
  if (pass === "structure") {
    const last = paras[paras.length - 1];
    if (last && next && next.group === "body" && !last.text.includes("next chapter")) {
      const end = last.text.trim();
      out.push({
        id: newId(),
        pass,
        sectionId: section.id,
        blockId: last.id,
        original: end,
        proposed: `${end} The next chapter, ${next.title}, picks up from here.`,
        reason: "The chapter ends without a bridge to the next one.",
      });
    }
  }
  if (pass === "voice") {
    const first = paras.find((b) => /The first skill is \w+\./.test(b.text));
    const m = first?.text.match(/The first skill is (\w+)\./);
    if (first && m)
      out.push({
        id: newId(),
        pass,
        sectionId: section.id,
        blockId: first.id,
        original: m[0],
        proposed: `The first skill I learnt in charge was ${m[1]}.`,
        reason: "Harni writes in the first person. This line is a natural place for it.",
      });
  }
  return out;
}

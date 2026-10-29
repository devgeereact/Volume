import { useCallback, useReducer } from "react";

/* Undo and redo for the cover studio's look (colours, design, type, positions). A pure reducer, so it is easy
   to test, and a small hook around it. Changes that share a `group` within a short time (one drag, one slider
   pull, several key presses) become one undo step. */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** The group and time of the last change, for merging a drag into one step. */
  last: { group: string; at: number } | null;
}

export type HistoryAction<T> =
  { type: "set"; next: T; group?: string | undefined; at: number } | { type: "undo" } | { type: "redo" } | { type: "replace"; next: T };

/** How many steps back the studio keeps. */
export const HISTORY_LIMIT = 60;
/** Changes in the same group closer together than this are one step. */
export const MERGE_MS = 800;

export function historyReducer<T>(h: History<T>, a: HistoryAction<T>): History<T> {
  switch (a.type) {
    case "set": {
      if (Object.is(a.next, h.present) || JSON.stringify(a.next) === JSON.stringify(h.present)) return h;
      const merge = a.group !== undefined && h.last?.group === a.group && a.at - h.last.at < MERGE_MS && h.past.length > 0;
      const past = merge ? h.past : [...h.past, h.present].slice(-HISTORY_LIMIT);
      return { past, present: a.next, future: [], last: a.group !== undefined ? { group: a.group, at: a.at } : null };
    }
    case "undo": {
      const prev = h.past[h.past.length - 1];
      if (prev === undefined) return h;
      return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future], last: null };
    }
    case "redo": {
      const next = h.future[0];
      if (next === undefined) return h;
      return { past: [...h.past, h.present], present: next, future: h.future.slice(1), last: null };
    }
    case "replace":
      // A fresh start (another concept picked, a save from the server): no steps to go back to.
      return { past: [], present: a.next, future: [], last: null };
  }
}

export const startHistory = <T>(present: T): History<T> => ({ past: [], present, future: [], last: null });

export interface UseHistory<T> {
  value: T;
  /** Change the look. `group` merges quick repeats into one undo step. */
  set: (next: T | ((cur: T) => T), group?: string) => void;
  undo: () => void;
  redo: () => void;
  /** Start again from `next` with an empty history. */
  replace: (next: T) => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistory<T>(initial: () => T): UseHistory<T> {
  const [h, dispatch] = useReducer(historyReducer<T>, undefined, () => startHistory(initial()));
  const present = h.present;
  const set = useCallback(
    (next: T | ((cur: T) => T), group?: string) => {
      const value = typeof next === "function" ? (next as (cur: T) => T)(present) : next;
      dispatch({ type: "set", next: value, group, at: Date.now() });
    },
    [present],
  );
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  const replace = useCallback((next: T) => dispatch({ type: "replace", next }), []);
  return { value: present, set, undo, redo, replace, canUndo: h.past.length > 0, canRedo: h.future.length > 0 };
}

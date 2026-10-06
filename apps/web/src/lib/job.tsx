import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { handoverJob } from "../data/writingJob";
import type { WritingJob } from "../data/types";

/* Mock of the one live writing job (Handover). It streams the current paragraph chunk by chunk
   (at most every 250 ms in the real app; slower here so it reads calmly), and counts words and cost.
   Pause stops it. Nothing runs while the tab is hidden. */

const CHUNK_MS = 1400;
const COST_PER_WORD = 0.00009;

interface JobContextValue {
  job: WritingJob;
  running: boolean;
  paused: boolean;
  /** How many streaming chunks have arrived. */
  chunksShown: number;
  wordsWritten: number;
  chapterWords: number;
  costSpent: number;
  /** 0 to 1 across the whole book. */
  progress: number;
  /** 0 to 1 across the current chapter. */
  chapterProgress: number;
  pause: () => void;
  resume: () => void;
  cancel: () => void;
}

const JobContext = createContext<JobContextValue | null>(null);

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}

export function JobProvider({ children }: { children: ReactNode }) {
  const job = handoverJob;
  const [paused, setPaused] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [chunksShown, setChunksShown] = useState(2);
  const total = job.current.streamingChunks.length;

  useEffect(() => {
    if (paused || cancelled) return;
    const tick = () => {
      if (document.visibilityState === "visible") setChunksShown((n) => (n >= total ? n : n + 1));
    };
    const timer = window.setInterval(tick, CHUNK_MS);
    return () => window.clearInterval(timer);
  }, [paused, cancelled, total]);

  // Mark the document while hidden so CSS can pause live indicators too.
  useEffect(() => {
    const onVis = () => document.documentElement.setAttribute("data-hidden", String(document.visibilityState === "hidden"));
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const streamedWords = useMemo(() => job.current.streamingChunks.slice(0, chunksShown).reduce((sum, c) => sum + countWords(c), 0), [job, chunksShown]);
  const wordsWritten = job.words.written + streamedWords;
  const chapterWords = job.current.wordsSoFar + streamedWords;
  const costSpent = job.cost.spent + streamedWords * COST_PER_WORD;

  const pause = useCallback(() => setPaused(true), []);
  const resume = useCallback(() => {
    setCancelled(false);
    setPaused(false);
  }, []);
  const cancel = useCallback(() => setCancelled(true), []);

  const value = useMemo<JobContextValue>(
    () => ({
      job,
      running: !cancelled,
      paused,
      chunksShown,
      wordsWritten,
      chapterWords,
      costSpent,
      progress: wordsWritten / job.words.target,
      chapterProgress: chapterWords / job.current.wordTarget,
      pause,
      resume,
      cancel,
    }),
    [job, cancelled, paused, chunksShown, wordsWritten, chapterWords, costSpent, pause, resume, cancel],
  );
  return <JobContext.Provider value={value}>{children}</JobContext.Provider>;
}

export function useWritingJob(): JobContextValue {
  const ctx = useContext(JobContext);
  if (!ctx) throw new Error("useWritingJob must be used inside JobProvider");
  return ctx;
}

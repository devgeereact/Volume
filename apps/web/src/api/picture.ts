/* Picture books (phase 7, P7-5 and P7-6, D-044, D-045): the server's picture-book routes, their types and
   their hooks (apps/server/src/routes/spreads.ts, types in apps/server/src/jobs/picture-book.ts). Writes need
   the editor role; viewers read.

   POST  /books/:id/picture-book          start the run: story, scene prompts, references, one picture per spread
   GET   /books/:id/spreads               PictureBookView
   GET   /books/:id/characters            { characters: CharacterView[] }
   POST  /books/:id/picture-book/export   full-bleed print PDF, preflight and pack
   PATCH /spreads/:id                     one spread's text or layout
   POST  /spreads/:id/image               paint one spread again (402 budget_exceeded when it would pass the budget)
   POST  /books/:id/picture-book/estimate what a run and one picture would cost (apps/server/src/routes/estimate.ts)

   The types repeat the server's shapes in plain TypeScript, as types.ts does for the other areas. */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, seg, type RequestOptions } from "./client";
import { queryKeys, rememberJob } from "./hooks";
import type { AcceptedJob } from "./types";

type Opts = Pick<RequestOptions, "signal">;

/** Where the text sits on a spread. Same values as SPREAD_LAYOUTS in @volume/core (checked by picture.test.ts). */
export const SPREAD_LAYOUTS = ["text-left", "text-right", "text-top", "text-bottom"] as const;
export type SpreadLayout = (typeof SPREAD_LAYOUTS)[number];

export function isSpreadLayout(v: unknown): v is SpreadLayout {
  return typeof v === "string" && (SPREAD_LAYOUTS as readonly string[]).includes(v);
}

/** Spread count the server accepts on start (StartBody in routes/spreads.ts, the template's range). */
export const SPREAD_COUNT = { min: 8, max: 16 } as const;

/**
 * The server's budget reservation for one picture (IMAGE_HIGH_ESTIMATE_USD in apps/server/src/jobs/runner.ts). Only
 * for screens with no book on the server to price (demo books, the new-book wizard); real books use
 * POST /books/:id/picture-book/estimate.
 */
export const PICTURE_ESTIMATE_USD = 0.2;

/** POST /books/:id/picture-book/estimate (PictureEstimate in apps/server/src/routes/estimate.ts). */
export interface PictureEstimate {
  lowUsd: number;
  highUsd: number;
  calls: number;
  spreads: number;
  characters: number;
  /** Story, scene prompts and character reference prompts together. */
  text: { lowUsd: number; highUsd: number; model: string | null };
  /** One picture. priced false: no price in the model list, so both ends are the job's budget reservation. */
  image: { lowUsd: number; highUsd: number; model: string | null; priced: boolean };
}

export interface PictureEstimateInput {
  spreads?: number;
  characters?: number;
}

/** What the owner tells the story stage (PictureStoryInputSchema). Every field is optional. */
export interface PictureStoryInput {
  topic?: string;
  newWord?: string;
  /** For example "3 to 7". */
  ageRange?: string;
  characterIdeas?: string;
  characterCount?: number;
  theme?: string;
  /** The gentle problem (template storyRules.conflict). */
  conflict?: string;
  artStyle?: string;
  wordLimit?: number;
  rhyme?: boolean;
  goodnightMessage?: boolean;
  alsoBy?: boolean;
  cta?: string;
}

export interface PictureStartInput {
  story?: PictureStoryInput;
  /** 8 to 16; the page plan from the KDP colour rules when left out. */
  spreads?: number;
  regenerateStory?: boolean;
}

export interface SpreadView {
  sectionId: string;
  n: number;
  text: string;
  /** Send back as baseVersionId when editing the text. */
  versionId: string | null;
  wordCount: number;
  layout: SpreadLayout;
  sceneSummary: string;
  imagePrompt: string | null;
  characters: string[];
  imageAssetId: string | null;
  /** Same-origin download URL of the picture (inline), or null. */
  imageUrl: string | null;
  enabled: boolean;
  status: string;
  updatedAt: number;
}

export interface CharacterView {
  id: string;
  name: string;
  sheet: string;
  main: boolean;
  referencePrompt: string | null;
  referenceAssetId: string | null;
  referenceUrl: string | null;
}

export interface PictureJobView {
  id: string;
  kind: string;
  status: string;
  progress: number;
  error: string | null;
  errorCode: string | null;
}

export interface PictureBookPlan {
  pages: number;
  spreads: number;
  frontPages: number;
  backPages: number;
  ruleIds: string[];
  warnings: string[];
}

export interface PictureBookView {
  bookId: string;
  trim: string;
  ink: "premium" | "standard";
  /** Every PDF page: trim plus bleed (rule print.bleed). */
  pageSizeIn: { widthIn: number; heightIn: number };
  pageCount: number;
  plan: PictureBookPlan;
  story: PictureStoryInput;
  title: string | null;
  newWord: string | null;
  styleLine: string | null;
  safety: { passed: boolean; notes: string[] } | null;
  spreads: SpreadView[];
  /** The latest picture_book run, or null. */
  job: PictureJobView | null;
}

export interface SpreadPatch {
  text?: string;
  layout?: SpreadLayout;
  baseVersionId?: string | null;
}

/** details of a 402 budget_exceeded from POST /spreads/:id/image. */
export interface PictureBudgetDetails {
  scope: string;
  limitUsd: number;
  spentUsd: number;
  estimateUsd: number;
}

export function budgetDetails(details: unknown): PictureBudgetDetails | null {
  if (typeof details !== "object" || details === null) return null;
  const d = details as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const limitUsd = num(d["limitUsd"]);
  const spentUsd = num(d["spentUsd"]);
  const estimateUsd = num(d["estimateUsd"]);
  if (limitUsd === null || spentUsd === null || estimateUsd === null) return null;
  return { scope: typeof d["scope"] === "string" ? d["scope"] : "book", limitUsd, spentUsd, estimateUsd };
}

/* ---------- Endpoints ---------- */

export const pictureApi = {
  start: (bookId: string, input: PictureStartInput = {}, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/picture-book`, input, o),
  view: (bookId: string, o?: Opts) => api.get<PictureBookView>(`/books/${seg(bookId)}/spreads`, o),
  characters: (bookId: string, o?: Opts) => api.get<{ characters: CharacterView[] }>(`/books/${seg(bookId)}/characters`, o),
  exportBook: (bookId: string, o?: Opts) => api.post<AcceptedJob>(`/books/${seg(bookId)}/picture-book/export`, {}, o),
  patchSpread: (sectionId: string, patch: SpreadPatch, o?: Opts) => api.patch<{ spread: SpreadView }>(`/spreads/${seg(sectionId)}`, patch, o),
  paintSpread: (sectionId: string, o?: Opts) => api.post<AcceptedJob>(`/spreads/${seg(sectionId)}/image`, {}, o),
  estimate: (bookId: string, input: PictureEstimateInput = {}, o?: Opts) => api.post<PictureEstimate>(`/books/${seg(bookId)}/picture-book/estimate`, input, o),
};

/* ---------- Hooks ---------- */

export function usePictureBook(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.spreads(bookId ?? ""),
    queryFn: ({ signal }) => pictureApi.view(bookId ?? "", { signal }),
    enabled: !!bookId,
  });
}

/** The cost of a run and of one picture, priced by the server from the model list. */
export function usePictureEstimate(bookId: string | undefined, input: PictureEstimateInput = {}) {
  return useQuery({
    queryKey: [...queryKeys.book.spreads(bookId ?? ""), "estimate", input] as const,
    queryFn: ({ signal }) => pictureApi.estimate(bookId ?? "", input, { signal }),
    enabled: !!bookId,
    staleTime: 60_000,
    retry: false,
  });
}

export function usePictureCharacters(bookId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.book.characters(bookId ?? ""),
    queryFn: ({ signal }) => pictureApi.characters(bookId ?? "", { signal }),
    enabled: !!bookId,
    select: (r) => r.characters,
  });
}

export function useStartPictureBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; input?: PictureStartInput }) => pictureApi.start(v.bookId, v.input ?? {}),
    onSuccess: (r, v) => {
      rememberJob(qc, r);
      void qc.invalidateQueries({ queryKey: queryKeys.book.spreads(v.bookId) });
    },
  });
}

export function usePatchSpread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string; patch: SpreadPatch }) => pictureApi.patchSpread(v.sectionId, v.patch),
    onSuccess: (r, v) => {
      qc.setQueryData<PictureBookView>(queryKeys.book.spreads(v.bookId), (old) =>
        old ? { ...old, spreads: old.spreads.map((s) => (s.sectionId === r.spread.sectionId ? r.spread : s)) } : old,
      );
      void qc.invalidateQueries({ queryKey: queryKeys.book.preflight(v.bookId) });
      void qc.invalidateQueries({ queryKey: queryKeys.book.exports(v.bookId) });
    },
  });
}

export function usePaintSpread() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string; sectionId: string }) => pictureApi.paintSpread(v.sectionId),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

export function useExportPictureBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { bookId: string }) => pictureApi.exportBook(v.bookId),
    onSuccess: (r) => rememberJob(qc, r),
  });
}

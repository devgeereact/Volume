import type { BlueprintCreateInput } from "../../api/types";

/** Largest chapter count the server's POST /books/:id/blueprints accepts (routes/planning.ts). */
const MAX_CHAPTERS = 60;

/**
 * The body for building a blueprint. The wizard saves the owner's chapter count in book settings `chapters`, but the
 * blueprint job only reads `chapterCount` from this request, so it is passed on here. Without a valid count the server
 * falls back to the workspace default.
 */
export function blueprintCreateInput(settings: Record<string, unknown>): BlueprintCreateInput {
  const raw = settings["chapters"];
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : Number.NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_CHAPTERS ? { chapterCount: n } : {};
}

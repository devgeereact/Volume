import { ebookCoverMaxMb, ebookCoverTypes } from "../export/kdpRules";

/* "Use my own cover": what the owner may pick before it is sent. The server checks the file's first bytes and the
   final preflight checks the KDP limits (config/kdp-rules); this only stops an obvious wrong pick early. */

export type OwnCoverSlot = "ebook" | "wrap";

const EXT_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", tif: "image/tiff", tiff: "image/tiff", pdf: "application/pdf" };

/** The upload type for a picked file: its own type when the browser knows it, else from the extension. */
export function ownCoverMime(file: { name: string; type: string }): string {
  if (file.type) return file.type;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXT_MIME[ext] ?? "application/octet-stream";
}

/** eBook cover types from rule ebook.cover (jpeg, jpg, tif, tiff) as upload types. */
const EBOOK_MIMES = new Set(ebookCoverTypes.map((t) => EXT_MIME[t.toLowerCase()]).filter((m): m is string => !!m));

/** A plain reason the file cannot be used in that slot, or null. */
export function ownCoverProblem(slot: OwnCoverSlot, file: { name: string; type: string; size: number }): string | null {
  const mime = ownCoverMime(file);
  if (slot === "ebook") {
    if (!EBOOK_MIMES.has(mime)) return `Choose a ${ebookCoverTypes.map((t) => t.toUpperCase()).join(", ")} image for the eBook cover.`;
    if (file.size >= ebookCoverMaxMb * 1024 * 1024) return `The eBook cover must be under ${ebookCoverMaxMb} MB.`;
    return null;
  }
  return mime === "application/pdf" ? null : "Choose the paperback wrap as one PDF (back, spine and front).";
}

/** Asset kind for each slot (apps/server/src/routes/assets.ts). */
export const OWN_COVER_KIND = { ebook: "own_ebook_cover", wrap: "own_wrap_pdf" } as const;

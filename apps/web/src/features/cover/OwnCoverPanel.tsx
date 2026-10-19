import { useRef, useState, type RefObject } from "react";
import { Check, Upload } from "lucide-react";
import { Banner, Button } from "../../components/ui";
import { assetsApi } from "../../api/assets";
import { useOwnCover } from "../../api/hooks";
import type { ApiCover } from "../../api/types";
import { errorText } from "../../api/wire-c";
import { coverBleedIn, coverMinDpi, ebookCoverPx, ebookCoverTypes } from "../export/kdpRules";
import { OWN_COVER_KIND, ownCoverMime, ownCoverProblem, type OwnCoverSlot } from "./ownCover";

/* "Use my own cover": the owner uploads a front cover image for the eBook and a full paperback wrap PDF instead of
   paying for AI concepts. The pack uses them as uploaded; the final preflight checks them against the KDP rules. */

export function OwnCoverPanel({
  bookId,
  cover,
  canWrite,
  wrapHint,
  onAnnounce,
}: {
  bookId: string;
  cover: ApiCover | null | undefined;
  canWrite: boolean;
  /** The wrap size for the current page count, for example "12.5202 x 9.25 in for 120 pages". */
  wrapHint: string;
  onAnnounce: (text: string) => void;
}) {
  const own = useOwnCover();
  const [busy, setBusy] = useState<OwnCoverSlot | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const ebookInput = useRef<HTMLInputElement>(null);
  const wrapInput = useRef<HTMLInputElement>(null);
  const spec = cover?.wrapSpec ?? {};
  const has = { ebook: spec["ownEbook"] === true && !!cover?.ebookAssetId, wrap: spec["ownWrap"] === true && !!cover?.wrapAssetId };

  async function send(slot: OwnCoverSlot, file: File) {
    setProblem(null);
    const why = ownCoverProblem(slot, file);
    if (why) {
      setProblem(why);
      return;
    }
    setBusy(slot);
    try {
      const asset = await assetsApi.upload(file, { kind: OWN_COVER_KIND[slot], filename: file.name, mime: ownCoverMime(file), projectId: bookId });
      await own.mutateAsync(slot === "ebook" ? { bookId, ebookAssetId: asset.id } : { bookId, wrapAssetId: asset.id });
      onAnnounce(slot === "ebook" ? "Your eBook cover is in use." : "Your paperback wrap is in use.");
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  async function remove(slot: OwnCoverSlot) {
    setProblem(null);
    setBusy(slot);
    try {
      await own.mutateAsync(slot === "ebook" ? { bookId, ebookAssetId: null } : { bookId, wrapAssetId: null });
      onAnnounce(slot === "ebook" ? "Your eBook cover was taken out." : "Your paperback wrap was taken out.");
    } catch (e) {
      setProblem(errorText(e));
    } finally {
      setBusy(null);
    }
  }

  const types = ebookCoverTypes.filter((t) => t === "jpeg" || t === "tiff").map((t) => t.toUpperCase());
  const row = (slot: OwnCoverSlot, title: string, help: string, accept: string, input: RefObject<HTMLInputElement | null>) => (
    <div className="grid gap-2 rounded-md border border-border p-4">
      <p className="text-label font-semibold text-ink">{title}</p>
      <p className="text-small text-ink-secondary">{help}</p>
      {has[slot] && (
        <p className="flex items-center gap-1.5 text-small text-success">
          <Check size={14} strokeWidth={2} aria-hidden />
          Your file is in use. Building covers keeps it and makes only the other one.
        </p>
      )}
      {canWrite && (
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept={accept}
            className="sr-only"
            aria-label={title}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void send(slot, f);
            }}
          />
          <Button variant="secondary" onClick={() => input.current?.click()} disabled={busy !== null}>
            <Upload size={16} aria-hidden />
            {busy === slot ? "Uploading" : has[slot] ? "Replace" : "Upload"}
          </Button>
          {has[slot] && (
            <Button variant="secondary" onClick={() => void remove(slot)} disabled={busy !== null}>
              Take it out
            </Button>
          )}
        </div>
      )}
    </div>
  );

  return (
    <section aria-labelledby="own-cover-title" className="rounded-md border border-border bg-sheet p-5 sm:p-6">
      <h2 id="own-cover-title" className="font-book text-heading text-ink">
        Use my own cover
      </h2>
      <p className="mt-1 text-small text-ink-secondary">
        Made your cover elsewhere? Upload it here instead of making concepts. The upload pack uses your files as they are, and the export preflight checks them
        against KDP's rules.
      </p>
      {problem && (
        <Banner tone="error" title="That file was not used" className="mt-3">
          {problem}
        </Banner>
      )}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {row(
          "ebook",
          "eBook cover",
          `Front cover only, ${types.join(" or ")}, RGB. KDP's ideal is ${ebookCoverPx.width} x ${ebookCoverPx.height} px.`,
          ".jpg,.jpeg,.tif,.tiff,image/jpeg,image/tiff",
          ebookInput,
        )}
        {row(
          "wrap",
          "Paperback wrap",
          `One PDF with back, spine and front, ${coverBleedIn} in bleed on every outer edge, images at ${coverMinDpi} DPI or more. Size: ${wrapHint}.`,
          ".pdf,application/pdf",
          wrapInput,
        )}
      </div>
    </section>
  );
}

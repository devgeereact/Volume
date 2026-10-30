import { useEffect, type ReactNode } from "react";
import { Barcode, BookOpen, Image as ImageIcon, RectangleHorizontal, Type, UserRound, type LucideIcon } from "lucide-react";
import { Skeleton } from "../../components/ui";
import type { Paper } from "@volume/core";
import { cn } from "../../lib/cn";
import { barcodeArea, coverBleedIn, coverMinDpi, ebookCoverPx, ebookMinRatio, inches, safeInsetIn, spineTextMinPages } from "../export/kdpRules";
import type { CoverBrief } from "./concepts";
import type { CoverPart } from "./coverEdit";
import { contrast, type CoverColours } from "./palettes";
import { INKS, pageCheck, pageRange, paperbackSize, paperFor, ruleTrims, trimInRules, trimLabel, type Ink, type Trim } from "./paperback";
import { fieldInput, fieldLabel, Section, Toggles, type GuideKeyItem, type LayerItem, type StudioCheck, type StudioView } from "./Studio";

/* Pieces both cover studios (sample books and server books) use inside the studio frame. */

/** Every part of the cover the studio lists in its layers. */
export type LayerId = CoverPart | "art" | "spine" | "blurb" | "bio" | "barcode";

export const LAYER_NAME: Record<LayerId, string> = {
  title: "Title",
  subtitle: "Subtitle",
  author: "Author name",
  art: "Artwork",
  spine: "Spine text",
  blurb: "Blurb",
  bio: "About the author",
  barcode: "Barcode area",
};

export const LAYER_ICON: Record<LayerId, LucideIcon> = {
  title: Type,
  subtitle: Type,
  author: Type,
  art: ImageIcon,
  spine: BookOpen,
  blurb: Type,
  bio: UserRound,
  barcode: Barcode,
};

export const LAYER_SURFACE: Record<LayerId, "Front" | "Spine" | "Back"> = {
  title: "Front",
  subtitle: "Front",
  author: "Front",
  art: "Front",
  spine: "Spine",
  blurb: "Back",
  bio: "Back",
  barcode: "Back",
};

export const isPart = (id: LayerId | null): id is CoverPart => id === "title" || id === "subtitle" || id === "author";

/** The view a layer is seen in: back and spine parts on the wrap, front parts on the eBook (or the wrap when it is open). */
export const viewForLayer = (id: LayerId, view: StudioView): StudioView => (LAYER_SURFACE[id] === "Front" ? (view === "wrap" ? "wrap" : "ebook") : "wrap");

export function layerGroups({
  hasSubtitle,
  showSubtitle,
  onToggleSubtitle,
  locked,
  onToggleLock,
  spineText,
  hasArt,
  artName,
}: {
  hasSubtitle: boolean;
  showSubtitle: boolean;
  onToggleSubtitle?: (() => void) | undefined;
  locked: readonly CoverPart[];
  onToggleLock: (part: CoverPart) => void;
  spineText: boolean;
  hasArt: boolean;
  artName: string;
}): { name: string; items: LayerItem[] }[] {
  const text = (id: CoverPart, extra: Partial<LayerItem> = {}): LayerItem => ({
    id,
    name: LAYER_NAME[id],
    icon: LAYER_ICON[id],
    locked: locked.includes(id),
    onToggleLock: () => onToggleLock(id),
    ...extra,
  });
  return [
    {
      name: "Front",
      items: [
        text("title"),
        ...(hasSubtitle ? [text("subtitle", { off: !showSubtitle, onToggleHide: onToggleSubtitle })] : []),
        text("author"),
        { id: "art", name: hasArt ? artName : "Artwork", icon: LAYER_ICON.art },
      ],
    },
    {
      name: "Spine",
      items: [
        { id: "spine", name: LAYER_NAME.spine, icon: LAYER_ICON.spine, off: !spineText, note: spineText ? undefined : `Needs ${spineTextMinPages} pages` },
      ],
    },
    {
      name: "Back",
      items: [
        { id: "blurb", name: LAYER_NAME.blurb, icon: LAYER_ICON.blurb },
        { id: "bio", name: LAYER_NAME.bio, icon: LAYER_ICON.bio },
        { id: "barcode", name: LAYER_NAME.barcode, icon: RectangleHorizontal, fixed: true },
      ],
    },
  ];
}

/* ---------- concepts in the left panel ---------- */

export interface ConceptTileData {
  id: string;
  /** "A", "B" ... */
  letter: string;
  name: string;
  inUse: boolean;
  /** The cover drawn small, or null while it is made. */
  art: ReactNode | null;
  failed?: { onRetry: () => void } | undefined;
}

/** The concepts as small covers, one radio each (the step action then uses the picked one). */
export function ConceptGrid({
  tiles,
  checked,
  onPick,
  caption,
}: {
  tiles: ConceptTileData[];
  checked: string | null;
  onPick: (id: string) => void;
  caption?: ReactNode;
}) {
  return (
    <div className="grid gap-1.5 max-[760px]:flex-none">
      <div role="radiogroup" aria-label="Concepts" className="grid grid-cols-4 gap-1.5 px-1 max-[760px]:w-[220px]">
        {tiles.map((t) =>
          t.failed ? (
            <div key={t.id} className="grid content-start justify-items-center gap-1">
              <button
                type="button"
                onClick={t.failed.onRetry}
                className="grid aspect-[2/3] w-full place-items-center rounded-[3px] border border-dashed border-claim bg-claim-wash text-[10px] font-semibold text-claim"
              >
                Retry
                <span className="sr-only"> {t.name}. It failed and was not charged.</span>
              </button>
              <b className="text-[11px] text-ink-2">{t.letter}</b>
            </div>
          ) : t.art === null ? (
            <div key={t.id} role="status" aria-label={`Making ${t.name}`} className="grid content-start justify-items-center gap-1">
              <Skeleton variant="cover" className="w-full" />
              <b className="text-[11px] text-ink-3">{t.letter}</b>
            </div>
          ) : (
            <label
              key={t.id}
              title={t.name}
              className={cn(
                "grid cursor-pointer content-start justify-items-center gap-1 rounded-[10px] border border-transparent px-[3px] pt-1 pb-[5px] text-[11px] text-ink-2 hover:bg-soft",
                "has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-select",
                checked === t.id && "border-mint bg-panel-2 text-ink shadow-[0_0_0_3px_var(--vol-mint-wash)]",
              )}
            >
              <input type="radio" name="concept" className="sr-only" checked={checked === t.id} onChange={() => onPick(t.id)} />
              <span className="block w-full leading-none">{t.art}</span>
              <b className="font-bold">
                {t.letter}
                <span className="sr-only">, {t.name}</span>
              </b>
              {t.inUse && <span className="text-[9.5px] leading-none font-semibold text-good">In use</span>}
            </label>
          ),
        )}
      </div>
      {caption && <div className="px-2 pt-1.5 text-[12px] text-ink-2 max-[760px]:hidden">{caption}</div>}
    </div>
  );
}

/** The brief, folded under the concepts. */
export function BriefSummary({ brief, onEdit }: { brief: CoverBrief; onEdit?: (() => void) | undefined }) {
  const row = (k: string, v: string) => (
    <>
      <dt className="mt-1.5 text-[11px] font-semibold text-ink-3">{k}</dt>
      <dd className="text-[12px] text-ink">{v}</dd>
    </>
  );
  return (
    <details className="group/b px-2 pt-1.5 max-[760px]:hidden">
      <summary className="w-max cursor-pointer text-[13px] font-semibold text-ink-2 hover:text-ink">Brief</summary>
      <dl className="mt-1 grid">
        {row("Genre", brief.genre.join(", ") || "None yet")}
        {row("Mood", brief.mood.join(", ") || "None yet")}
        {row("Colours", brief.colours.join(", ") || "Open")}
        {row("Symbols", brief.symbols.join(", ") || "Open")}
        {row("Avoid", brief.avoid || "Nothing listed")}
      </dl>
      {onEdit && (
        <button type="button" onClick={onEdit} className="mt-2 text-[12.5px] font-semibold text-select underline-offset-2 hover:underline">
          Edit brief
        </button>
      )}
    </details>
  );
}

/* ---------- paperback what-if ---------- */

export interface PaperbackState {
  trim: Trim;
  ink: Ink;
  paper: Paper;
}

/**
 * The page count to use: the typed one when it fits the trim and ink, else `fallback` (the real or sample count),
 * held inside the trim's KDP page range so the wrap preview always has a printable size. `belowMin` says the real
 * count is under the range's minimum, so the preview shows the shortest printable wrap.
 */
export function pagesFrom(text: string, fallback: number, v: PaperbackState): { pages: number; typedOk: boolean; belowMin: boolean } {
  const range = pageRange(v.trim, v.ink, v.paper) ?? { min: 24, max: 828 };
  const held = Math.min(range.max, Math.max(range.min, fallback));
  const belowMin = fallback < range.min;
  if (text === "") return { pages: held, typedOk: true, belowMin };
  const n = Number.parseInt(text, 10);
  const ok = Number.isFinite(n) && n >= range.min && n <= range.max;
  return { pages: ok ? n : held, typedOk: ok, belowMin: !ok && belowMin };
}

/** Ink to start with: picture books print in colour, everything else in black. */
export const startInk = (template: string | undefined): Ink => (template === "picture-book" ? "premium" : "black");

/**
 * Trim, ink, paper and page count for the spine and the page-range check. Only trims from the KDP rules are offered
 * (the book's own trim stays listed if it is an older one). `note` says what the preview and build use.
 */
export function PaperbackPanel({
  value,
  onChange,
  bookTrim,
  pagesText,
  onPagesText,
  pages,
  pagesHint,
  note,
  disabled,
}: {
  value: PaperbackState;
  onChange: (v: PaperbackState) => void;
  bookTrim: Trim;
  pagesText: string;
  onPagesText: (t: string) => void;
  /** The count the numbers use (typed, else the real one). */
  pages: number;
  /** Where the page count comes from. */
  pagesHint: string;
  note?: string | undefined;
  disabled?: boolean | undefined;
}) {
  const { trim, ink, paper } = value;
  const options = trimInRules(bookTrim) ? ruleTrims : [bookTrim, ...ruleTrims];
  const key = (t: Trim) => `${t.w}x${t.h}`;
  const size = paperbackSize(trim, pages, ink, paper);
  const range = pageRange(trim, ink, paper);
  const typed = Number.parseInt(pagesText, 10);
  const typedOk = pagesText === "" || (Number.isFinite(typed) && (!range || (typed >= range.min && typed <= range.max)));
  const check = pageCheck(trim, pages, ink, paper);
  const usedPaper = paperFor(ink, paper);
  return (
    <Section title="Paperback">
      <label className="grid gap-[5px]">
        <span className={fieldLabel}>Trim size</span>
        <select
          className={fieldInput}
          value={key(trim)}
          disabled={disabled}
          onChange={(e) => {
            const t = options.find((o) => key(o) === e.target.value);
            if (t) onChange({ ...value, trim: t });
          }}
        >
          {options.map((t) => (
            <option key={key(t)} value={key(t)}>
              {trimLabel(t)}
              {key(t) === key(bookTrim) ? ", the book's trim" : ""}
              {trimInRules(t) ? "" : " (not in the KDP rules)"}
            </option>
          ))}
        </select>
      </label>
      <p className={cn("text-[12px] leading-[1.45]", trimInRules(trim) ? "text-ink-2" : "text-accent-text")}>
        {trimInRules(trim)
          ? "Confirmed in config/kdp-rules (paperback.trimSizes.list)."
          : "Not in the KDP rules file. Check this size on KDP before you publish."}
      </p>
      <div className="grid gap-[5px]">
        <span className={fieldLabel}>Ink</span>
        <Toggles
          label="Ink"
          full
          value={ink}
          onChange={(v) => onChange({ ...value, ink: v, paper: paperFor(v, paper) })}
          options={INKS.map((i) => ({ value: i.value, label: i.label }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="grid gap-[5px]">
          <span className={fieldLabel}>Page count</span>
          <span className="relative block">
            <input
              inputMode="numeric"
              value={pagesText}
              placeholder={String(pages)}
              disabled={disabled}
              onChange={(e) => onPagesText(e.target.value.replace(/[^\d]/g, ""))}
              aria-invalid={!typedOk}
              aria-describedby="cv-pages-hint"
              className={cn(fieldInput, "num pr-7 placeholder:text-ink-3", !typedOk && "border-red text-red")}
            />
            <i aria-hidden className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-ink-3 not-italic">
              pp
            </i>
          </span>
        </label>
        <div className="grid gap-[5px]">
          <span className={fieldLabel}>Paper</span>
          <Toggles
            label="Paper"
            full
            value={usedPaper}
            onChange={(v) => onChange({ ...value, paper: v })}
            options={[
              { value: "white", label: "White" },
              { value: "cream", label: "Cream", disabledReason: ink === "black" ? undefined : "Colour ink prints on white paper" },
            ]}
          />
        </div>
      </div>
      <p id="cv-pages-hint" role={typedOk ? undefined : "alert"} className={cn("text-[12px] leading-[1.45]", typedOk ? "text-ink-2" : "text-red")}>
        {typedOk ? pagesHint : range ? `Use ${range.min} to ${range.max} pages for ${trimLabel(trim)} with this ink.` : pagesHint}
      </p>
      <p className={cn("text-[12px] leading-[1.45]", check.ok === false ? "text-red" : "text-ink-2")}>{check.text}</p>
      <p className="num text-[12px] leading-[1.45] text-ink-2">
        Spine {inches(size.spineIn, 3)} ({pages} x {Number(size.perPageIn.toFixed(6))} in,{" "}
        {ink === "black" ? `${usedPaper} paper` : INKS.find((i) => i.value === ink)?.label.toLowerCase()}). Wrap {inches(size.widthIn, 3)} x{" "}
        {inches(size.heightIn, 3)} with {inches(coverBleedIn, 3)} bleed.{" "}
        {size.spineText ? `Spine text on from ${spineTextMinPages} pages.` : `No spine text under ${spineTextMinPages} pages.`}
      </p>
      {note && <p className="text-[12px] leading-[1.45] text-ink-2">{note}</p>}
    </Section>
  );
}

/* ---------- guides key and shortcuts ---------- */

export function guideItems(view: StudioView): GuideKeyItem[] {
  const wrap = view === "wrap";
  return [
    { kind: "trim", name: "Trim", note: "where the book is cut" },
    ...(wrap ? [{ kind: "bleed" as const, name: "Bleed", note: `${inches(coverBleedIn, 3)} past each outer edge` }] : []),
    ...(wrap ? [{ kind: "fold" as const, name: "Spine folds", note: "where the cover bends" }] : []),
    { kind: "safe", name: "Safe area", note: `keep text ${inches(safeInsetIn, 3)} inside the trim` },
    ...(wrap
      ? [{ kind: "barcode" as const, name: "Barcode area", note: `${barcodeArea.widthIn} x ${barcodeArea.heightIn} in, kept clear (${barcodeArea.status})` }]
      : []),
    { kind: "thirds", name: "Thirds grid", note: "thirds and the centre, from the toolbar" },
  ];
}

export const SHORTCUTS: [string, string][] = [
  ["Drag", "Move a line up or down"],
  ["Arrows", "Nudge the focused line"],
  ["Shift + arrows", "Nudge it further"],
  ["Ctrl Z", "Undo"],
  ["Ctrl Shift Z", "Redo"],
  ["Esc", "Cover settings"],
];

/** Undo, redo and Escape for the studio, while focus is not in a text field. */
export function useStudioKeys(on: boolean, keys: { undo: () => void; redo: () => void; escape: () => void }) {
  const { undo, redo, escape } = keys;
  useEffect(() => {
    if (!on) return;
    const down = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable);
      if (typing || e.defaultPrevented) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === "Escape" && !document.querySelector("[role=dialog][aria-modal=true]")) escape();
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [on, undo, redo, escape]);
}

/* ---------- checks ---------- */

export interface ChecksInput {
  author: string;
  /** Colours the type sits on, or null when the art is behind the type (the build picks the ink from the art). */
  colours: CoverColours | null;
  showSubtitle: boolean;
  /** Title size in cover-width percent, or null until measured. */
  titleSize: number | null;
  pages: number;
  paperback: PaperbackState;
  blurb: string;
  /** Built files: null when nothing is built yet. */
  built: { stale: boolean } | null;
  show: (id: LayerId) => void;
  /** Contrast checks for a cover with layers (layers.ts layerChecks); they replace the plain colour checks. */
  layerChecks?: StudioCheck[] | null | undefined;
}

export function coverChecks(i: ChecksInput): StudioCheck[] {
  const out: StudioCheck[] = [];
  out.push(
    i.author
      ? { status: "pass", title: "Title and author on the front", detail: `Set by Volume from the book and the pen name, ${i.author}.` }
      : {
          status: "fail",
          title: "Title and author on the front",
          detail: "This book has no pen name, so the cover has no author.",
          onShow: () => i.show("author"),
        },
  );
  if (i.titleSize === null) out.push({ status: "info", title: "Readable as a thumbnail", detail: "Measured when the preview has loaded." });
  else {
    const px = (i.titleSize / 100) * 160;
    out.push({
      status: px >= 14 ? "pass" : px >= 10 ? "warn" : "fail",
      title: "Readable as a thumbnail",
      detail: `At 160 px wide the title is set at ${Math.round(px)} px. Volume aims for 14 px or more.`,
      onShow: () => i.show("title"),
    });
  }
  if (i.layerChecks) out.push(...i.layerChecks);
  else if (!i.colours)
    out.push({
      status: "info",
      title: "Text colour over the art",
      detail: "The build picks the ink from the art behind the type, so the contrast is set there. Check it by eye at thumbnail size.",
    });
  else {
    const parts: [CoverPart, number, string][] = [
      ["title", 3, i.colours.title],
      ...(i.showSubtitle ? ([["subtitle", 4.5, i.colours.subtitle]] as [CoverPart, number, string][]) : []),
      ["author", 4.5, i.colours.author],
    ];
    for (const [id, need, ink] of parts) {
      const c = contrast(ink, i.colours.background);
      out.push({
        status: c >= need ? "pass" : c >= need * 0.75 ? "warn" : "fail",
        title: `${LAYER_NAME[id]} contrast`,
        detail: `${c.toFixed(1)} to 1 on the background. ${id === "title" ? "Large type needs 3 to 1." : "Small type needs 4.5 to 1."}`,
        onShow: () => i.show(id),
      });
    }
  }
  const { trim, ink, paper } = i.paperback;
  const size = paperbackSize(trim, i.pages, ink, paper);
  out.push(
    size.spineText
      ? { status: "pass", title: "Spine text", detail: `${i.pages} pages give a ${inches(size.spineIn, 3)} spine, so the spine carries the title and author.` }
      : {
          status: "info",
          title: "No spine text",
          detail: `${i.pages} pages. Spine text starts at ${spineTextMinPages} pages in the KDP rules.`,
          onShow: () => i.show("spine"),
        },
  );
  if (!trimInRules(trim))
    out.push({ status: "warn", title: "Trim size", detail: `${trimLabel(trim)} is not in Volume's KDP rules file. Check it on KDP before you publish.` });
  const pc = pageCheck(trim, i.pages, ink, paper);
  out.push({ status: pc.ok === null ? "warn" : pc.ok ? "pass" : "fail", title: "Page count fits the trim", detail: pc.text });
  const words = i.blurb.split(/\s+/).filter(Boolean).length;
  out.push(
    !words
      ? { status: "warn", title: "Back cover blurb", detail: "No blurb yet. It comes from the blueprint's listing.", onShow: () => i.show("blurb") }
      : {
          status: words <= 240 ? "pass" : "warn",
          title: "Back cover blurb",
          detail: `${words} words.${words > 240 ? " Shorter reads better at this size." : ""}`,
          onShow: () => i.show("blurb"),
        },
  );
  out.push({
    status: "pass",
    title: "eBook file",
    detail: `${ebookCoverPx.width} x ${ebookCoverPx.height} px, RGB JPEG. Height to width ${(ebookCoverPx.height / ebookCoverPx.width).toFixed(2)}, KDP needs ${ebookMinRatio} or more.`,
  });
  out.push({
    status: "pass",
    title: "Paperback wrap size",
    detail: `${inches(size.widthIn, 3)} x ${inches(size.heightIn, 3)} with bleed. ${Math.round(size.widthIn * coverMinDpi)} x ${Math.round(size.heightIn * coverMinDpi)} px at ${coverMinDpi} DPI.`,
  });
  if (i.built)
    out.push(
      i.built.stale
        ? { status: "warn", title: "Built files up to date", detail: "Something changed after the covers were built. Build them again for the pack." }
        : { status: "pass", title: "Built files up to date", detail: "The built covers match what you see." },
    );
  return out;
}

/* ---------- inspector bodies for the parts that are set elsewhere ---------- */

export function FixedLayerInfo({
  id,
  blurb,
  author,
  spineText,
  spineIn,
  children,
}: {
  id: LayerId;
  blurb: string;
  author: string;
  spineText: boolean;
  spineIn: number;
  children?: ReactNode;
}) {
  if (id === "spine")
    return (
      <Section title="Spine">
        <p className="text-[13px] leading-normal text-ink">
          {spineText
            ? `The spine carries the title and ${author || "the author"}, sized by the build for a ${inches(spineIn, 3)} spine.`
            : `No spine text: KDP allows it from ${spineTextMinPages} pages and this book is shorter.`}
        </p>
        <p className="text-[12px] leading-[1.45] text-ink-2">Without colours of its own, the spine follows the palette's band colour.</p>
      </Section>
    );
  if (id === "blurb")
    return (
      <Section title="Blurb">
        {blurb ? (
          <p className="text-[13px] leading-normal whitespace-pre-line text-ink">{blurb}</p>
        ) : (
          <p className="text-[13px] leading-normal text-ink-2">No blurb yet.</p>
        )}
        <p className="text-[12px] leading-[1.45] text-ink-2">
          The back cover blurb comes from the blueprint's listing. Change it there, and the cover follows. Longer blurbs are set a little smaller, as in the
          build.
        </p>
      </Section>
    );
  if (id === "bio")
    return (
      <Section title="About the author">
        <p className="text-[13px] leading-normal text-ink">{author || "No pen name yet"}</p>
        <p className="text-[12px] leading-[1.45] text-ink-2">
          The name and the short bio come from the pen name's profile, word for word. Change them on the profile.
        </p>
      </Section>
    );
  if (id === "barcode")
    return (
      <Section title="Barcode area">
        <p className="text-[13px] leading-normal text-ink">
          KDP prints the barcode here: {barcodeArea.widthIn} x {barcodeArea.heightIn} in, lower right of the back cover (rule status: {barcodeArea.status}). It
          cannot be moved, and the build keeps it clear.
        </p>
      </Section>
    );
  return <>{children}</>;
}

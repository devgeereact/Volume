import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Check, CircleAlert, Flag, Pencil, Star } from "lucide-react";
import { Button, IconButton, Input } from "../../components/ui";
import { TITLE_SUBTITLE_MAX, titleLength, type TitleOption } from "../../data";
import { cn } from "../../lib/cn";
import { checkTitle } from "./titlesExtras";

interface TitleCardProps {
  option: TitleOption;
  directionName: string;
  favourite: boolean;
  onFavourite: () => void;
  onChoose: () => void;
  onSave: (title: string, subtitle: string) => void;
  /** Fresh from a regeneration: ink in once. */
  fresh: boolean;
}

/** Character count against the KDP limit as a short line and a hairline meter. */
export function CharCounter({ length, className }: { length: number; className?: string | undefined }) {
  const over = length > TITLE_SUBTITLE_MAX;
  return (
    <div className={cn("grid gap-1", className)}>
      <span className={cn("num text-small", over ? "text-claim" : "text-ink-secondary")}>
        {length} of {TITLE_SUBTITLE_MAX} characters
      </span>
      <span aria-hidden className="block h-[3px] overflow-hidden rounded-pill bg-sunken">
        <span
          className={cn("block h-full origin-left rounded-pill transition-transform duration-(--vol-dur-slow) ease-out", over ? "bg-claim" : "bg-progress")}
          style={{ transform: `scaleX(${Math.min(1, length / TITLE_SUBTITLE_MAX)})` }}
        />
      </span>
    </div>
  );
}

/** One title option: title and subtitle, counter, checks, favourite, inline edit and choose. */
export function TitleCard({ option, directionName, favourite, onFavourite, onChoose, onSave, fresh }: TitleCardProps) {
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(option.title);
  const [draftSubtitle, setDraftSubtitle] = useState(option.subtitle);
  const titleRef = useRef<HTMLInputElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const invalid = option.invalidReason !== null;
  const length = titleLength(option.title, option.subtitle);
  const draftCheck = checkTitle(draftTitle, draftSubtitle);

  useEffect(() => {
    if (editing) titleRef.current?.focus();
  }, [editing]);

  function open() {
    setDraftTitle(option.title);
    setDraftSubtitle(option.subtitle);
    setEditing(true);
  }
  function close() {
    setEditing(false);
    requestAnimationFrame(() => editRef.current?.focus());
  }
  function save() {
    if (!draftTitle.trim()) return;
    onSave(draftTitle.trim(), draftSubtitle.trim());
    close();
  }
  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.stopPropagation();
      close();
    } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      save();
    }
  }

  return (
    <li
      id={`title-${option.id}`}
      tabIndex={-1}
      aria-current={option.chosen ? "true" : undefined}
      className={cn(
        "relative grid content-start gap-3 rounded-md border p-4 focus:outline-none focus-visible:outline-2 focus-visible:outline-select sm:p-5",
        option.chosen ? "vol-pencil-edge border-select bg-select-wash" : invalid ? "border-border bg-sunken" : "border-border bg-sheet",
        fresh && "animate-ink-in",
      )}
    >
      <div className="absolute top-2 right-2 flex items-start gap-3 sm:top-3 sm:right-3">
        {/* The direction is the group heading above the card; screen readers still hear it here. */}
        <p className="sr-only">{directionName}</p>
        <div className="flex gap-1">
          <IconButton icon={Star} size="sm" label={favourite ? "Remove from favourites" : "Add to favourites"} pressed={favourite} onClick={onFavourite} />
          <IconButton ref={editRef} icon={Pencil} size="sm" label="Edit title" pressed={editing} onClick={() => (editing ? close() : open())} />
        </div>
      </div>

      {editing ? (
        <div className="grid gap-3 pt-9" onKeyDown={onKey}>
          <Input ref={titleRef} label="Main title" value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} />
          <Input label="Subtitle" value={draftSubtitle} onChange={(e) => setDraftSubtitle(e.target.value)} />
          <CharCounter length={titleLength(draftTitle.trim(), draftSubtitle.trim())} />
          {draftCheck.invalidReason && (
            <p className="flex items-start gap-1.5 text-small text-claim" role="alert">
              <CircleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              {draftCheck.invalidReason}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabledReason={draftTitle.trim() ? undefined : "Add a main title first."}>
              Save edit
            </Button>
            <Button size="sm" variant="ghost" onClick={close}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <h3 className={cn("pr-20 font-book", invalid && "text-ink-disabled")}>
            <span className={cn("block text-[21px] leading-[27px] font-medium", invalid ? "text-ink-secondary" : option.chosen ? "text-select" : "text-ink")}>
              {option.title}
              {option.subtitle && <span className="sr-only">:</span>}
            </span>
            {option.subtitle && (
              <span className={cn("mt-1 block text-[16px] leading-[22px] italic", invalid ? "text-ink-tertiary" : "text-ink-secondary")}>
                {option.subtitle}
              </span>
            )}
          </h3>
          <CharCounter length={length} />
          <ul className="flex flex-wrap gap-1.5" aria-label="Checks">
            {option.checks.map((c) => (
              <li
                key={c.label}
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-pill px-2 text-caption",
                  c.passed ? "bg-success-wash text-success" : "bg-claim-wash text-claim",
                )}
              >
                {c.passed ? <Check size={12} strokeWidth={2.25} aria-hidden /> : <Flag size={12} strokeWidth={2.25} aria-hidden />}
                {c.label}
                <span className="sr-only">{c.passed ? ", passed" : ", failed"}</span>
              </li>
            ))}
          </ul>
          {invalid && (
            <p className="flex items-start gap-1.5 text-small text-claim">
              <CircleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              {option.invalidReason}
            </p>
          )}
          <div className="flex items-center gap-3 pt-1">
            {option.chosen ? (
              <p className="flex h-8 items-center gap-1.5 text-label font-semibold text-select">
                <Check size={16} strokeWidth={2} aria-hidden /> Chosen title
              </p>
            ) : (
              <Button size="sm" onClick={onChoose} disabledReason={invalid ? "Fix this option before you choose it." : undefined}>
                Use this title
              </Button>
            )}
          </div>
        </>
      )}
    </li>
  );
}

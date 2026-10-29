import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useCanWrite } from "../../lib/access";
import { AlertCircle, Check, CircleAlert, Pencil, Star } from "lucide-react";
import { Button, Card, IconButton, Input } from "../../components/ui";
import { TITLE_SUBTITLE_MAX, titleLength, type Book, type TitleOption } from "../../demo";
import { cn } from "../../lib/cn";
import { StorePreview, TitleLengthBar } from "./StorePreview";
import { checkTitle } from "./titlesExtras";

/* Title pieces from the approved Volume Studio design (stTitles): a card per direction with its options as
   rows (a round mark, the title in the book face, the subtitle and a length bar), and the right card with
   the neutral store preview, the length meter, the checks and Use this title. */

/** Why the choose button is held, or undefined when it can be pressed. */
export function chooseHeldReason({ invalid, saving, busy }: { invalid: boolean; saving: boolean; busy: boolean }): string | undefined {
  if (invalid) return "Fix this option before you choose it.";
  if (busy && !saving) return "Wait until the other title is saved.";
  return undefined;
}

/** Use this title. While the choice saves it shows Saving, is marked busy and ignores further presses. */
export function ChooseTitleButton({
  invalid,
  saving = false,
  busy = false,
  fullWidth = false,
  onChoose,
}: {
  invalid: boolean;
  saving?: boolean;
  busy?: boolean;
  fullWidth?: boolean;
  onChoose: () => void;
}) {
  return (
    <Button
      size={fullWidth ? "md" : "sm"}
      variant={fullWidth ? "primary" : "secondary"}
      fullWidth={fullWidth}
      icon={fullWidth ? Check : undefined}
      onClick={onChoose}
      loading={saving}
      loadingLabel="Saving"
      disabledReason={chooseHeldReason({ invalid, saving, busy })}
    >
      Use this title
    </Button>
  );
}

/** Character count against the KDP limit as a short line and a hairline meter (used while editing). */
export function CharCounter({ length, className }: { length: number; className?: string | undefined }) {
  const over = length > TITLE_SUBTITLE_MAX;
  return (
    <div className={cn("grid gap-1", className)}>
      <span className={cn("num text-small", over ? "text-claim" : "text-ink-2")}>
        {length} of {TITLE_SUBTITLE_MAX} characters
      </span>
      <span aria-hidden className="block h-[5px] overflow-hidden rounded-pill bg-track">
        <span
          className={cn("block h-full origin-left rounded-pill transition-transform duration-(--vol-dur-slow) ease-out", over ? "bg-claim" : "bg-mint")}
          style={{ transform: `scaleX(${Math.min(1, length / TITLE_SUBTITLE_MAX)})` }}
        />
      </span>
    </div>
  );
}

/** One direction (.card with .dir-h): its name, its pitch, the number of options, its tools and its rows. */
export function DirectionCard({
  index,
  name,
  pitch,
  count,
  details,
  tools,
  children,
}: {
  index: number;
  name: string;
  pitch: string;
  count: number;
  details?: { label: string; value: string }[] | undefined;
  tools?: ReactNode;
  children: ReactNode;
}) {
  const headingId = `direction-${index}`;
  return (
    <Card as="section" aria-labelledby={headingId}>
      <div className="mb-3.5 flex items-start justify-between gap-2.5">
        <div className="grid min-w-0 gap-0.5">
          <h3 id={headingId} className="text-[15px] font-bold text-ink">
            <span className="sr-only">Direction {index + 1}: </span>
            {name}
          </h3>
          {pitch && <p className="text-small text-ink-2">{pitch}</p>}
        </div>
        <span className="num grid h-6 min-w-6 shrink-0 place-items-center rounded-pill bg-soft px-2 text-[12px] font-semibold text-ink-2">
          {count}
          <span className="sr-only"> {count === 1 ? "option" : "options"}</span>
        </span>
      </div>
      {children}
      {(details?.some((d) => d.value) || tools) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          {details?.some((d) => d.value) ? (
            <details className="group min-w-0 flex-1 text-small">
              <summary className="cursor-pointer text-ink-2 hover:text-ink">About this direction</summary>
              <dl className="mt-2 grid gap-2">
                {details
                  .filter((d) => d.value)
                  .map((d) => (
                    <div key={d.label} className="grid gap-0.5">
                      <dt className="font-semibold text-ink-2">{d.label}</dt>
                      <dd className="text-ink">{d.value}</dd>
                    </div>
                  ))}
              </dl>
            </details>
          ) : (
            <span />
          )}
          {tools}
        </div>
      )}
    </Card>
  );
}

interface TitleRowProps {
  option: TitleOption;
  directionName: string;
  favourite: boolean;
  onFavourite: () => void;
  onSave: (title: string, subtitle: string) => void;
  /** Fresh from a regeneration: ink in once. */
  fresh: boolean;
  /** Shows this option in the right card. */
  onPreview: () => void;
  /** This option is the one in the right card. */
  previewing: boolean;
}

/** One title option as a row (.to): press it to see it in the right card; star and edit sit beside it. */
export function TitleRow({ option, directionName, favourite, onFavourite, onSave, fresh, onPreview, previewing }: TitleRowProps) {
  const canWrite = useCanWrite();
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
      data-title-option
      data-previewing={previewing ? "true" : "false"}
      aria-current={option.chosen ? "true" : undefined}
      className={cn(
        "relative rounded-[14px] border transition-[border-color,background-color,box-shadow] duration-(--vol-dur-fast) ease-out focus:outline-none focus-visible:outline-2 focus-visible:outline-select",
        previewing ? "border-mint bg-panel-2 shadow-[0_0_0_3px_var(--vol-mint-wash)]" : "border-line bg-soft hover:bg-panel-2",
        fresh && "animate-ink-in",
      )}
    >
      {editing ? (
        <div className="grid gap-3 p-3.5" onKeyDown={onKey}>
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1">
          <button
            type="button"
            aria-pressed={previewing}
            onClick={onPreview}
            className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-[14px] py-3 pl-3.5 text-left min-[561px]:grid-cols-[auto_minmax(0,1fr)_120px]"
          >
            <span aria-hidden className={cn("relative block size-[18px] shrink-0 rounded-full border-[1.5px]", previewing ? "border-mint" : "border-line-2")}>
              {previewing && <span className="absolute inset-[3px] rounded-full bg-mint" />}
            </span>
            <span className="min-w-0">
              <span className="sr-only">{directionName}: </span>
              <span
                data-title-text
                className={cn("block font-book text-[15.5px] leading-[1.3] font-semibold [overflow-wrap:anywhere]", invalid ? "text-ink-3" : "text-ink")}
              >
                {option.title}
              </span>
              {option.subtitle && (
                <span className={cn("mt-0.5 block text-[13px] [overflow-wrap:anywhere]", invalid ? "text-ink-3" : "text-ink-2")}>{option.subtitle}</span>
              )}
              {(option.chosen || invalid) && (
                <span className={cn("mt-1 inline-flex items-center gap-1 text-small font-semibold", option.chosen ? "text-good" : "text-claim")}>
                  {option.chosen ? <Check size={13} strokeWidth={2.25} aria-hidden /> : <AlertCircle size={13} strokeWidth={2} aria-hidden />}
                  {option.chosen ? "Chosen title" : "Needs an edit"}
                </span>
              )}
            </span>
            <span className="col-start-2 grid gap-1 min-[561px]:col-start-3">
              <span aria-hidden className="block h-[5px] overflow-hidden rounded-pill bg-track">
                <span
                  className={cn("block h-full origin-left rounded-pill", length > TITLE_SUBTITLE_MAX ? "bg-claim" : "bg-mint")}
                  style={{ transform: `scaleX(${Math.min(1, length / TITLE_SUBTITLE_MAX)})` }}
                />
              </span>
              <small className="num text-[11.5px] text-ink-3">
                {length} / {TITLE_SUBTITLE_MAX}
                <span className="sr-only"> characters</span>
              </small>
            </span>
          </button>
          {canWrite && (
            <span className="flex gap-0.5 pr-2">
              <IconButton icon={Star} size="sm" label={favourite ? "Remove from favourites" : "Add to favourites"} pressed={favourite} onClick={onFavourite} />
              <IconButton ref={editRef} icon={Pencil} size="sm" label="Edit title" pressed={editing} onClick={open} />
            </span>
          )}
        </div>
      )}
    </li>
  );
}

/** The right card's store part: the neutral listing preview, the length meter and the checks of the option shown. */
export function TitleSide({
  book,
  option,
  chosen,
  action,
  children,
}: {
  book: Book;
  /** The option on show, or the book's saved title. */
  option: { title: string; subtitle: string; checks: TitleOption["checks"]; invalidReason: string | null } | null;
  /** The option on show is the book's chosen title. */
  chosen: boolean;
  /** Use this title, or nothing when it cannot be chosen here. */
  action?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <>
      <h2 className="mb-2.5 text-[14px] font-bold text-ink">How it reads in a store listing</h2>
      {option ? (
        <>
          <StorePreview book={book} title={option.title} subtitle={option.subtitle} />
          <TitleLengthBar className="mt-3" title={option.title} subtitle={option.subtitle} />
          {option.checks.length > 0 && (
            <>
              <h3 className="mt-4 text-[14px] font-bold text-ink">Checks</h3>
              <ul className="my-3 grid gap-2 text-[13px] text-ink">
                {option.checks.map((c) => (
                  <li key={c.label} className="flex items-start gap-2">
                    {c.passed ? (
                      <Check size={16} strokeWidth={2} aria-hidden className="mt-px shrink-0 text-mint-ink" />
                    ) : (
                      <AlertCircle size={16} strokeWidth={2} aria-hidden className="mt-px shrink-0 text-claim" />
                    )}
                    {c.label}
                    <span className="sr-only">{c.passed ? ", passed" : ", failed"}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {option.invalidReason && (
            <p className="mb-3 flex items-start gap-1.5 text-small text-claim">
              <CircleAlert size={14} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
              {option.invalidReason}
            </p>
          )}
          {chosen ? (
            <p className="flex h-10 items-center justify-center gap-1.5 rounded-control bg-good-wash text-label font-semibold text-good">
              <Check size={16} strokeWidth={2} aria-hidden /> This is the chosen title
            </p>
          ) : (
            action
          )}
        </>
      ) : (
        <p className="text-small text-ink-2">The preview appears when there is a title to show.</p>
      )}
      {children}
    </>
  );
}

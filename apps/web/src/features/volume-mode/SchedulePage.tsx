import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, ShieldCheck, Trash2 } from "lucide-react";
import { Banner, Button, IconButton, Input, Modal, SegmentedControl, Select, Skeleton } from "../../components/ui";
import { isApiError } from "../../api/client";
import { TITLE_FORMATS, type ApiTitleLimit, type ApiTitleSlot, type TitleFormat } from "../../api/types";
import { apiErrorText, useWireMode } from "../../api/wire-a";
import { useVolumeMe } from "../../api/wire-d";
import { cn } from "../../lib/cn";
import { formatDate } from "../../lib/format";
import { InlineStatus } from "../settings/PanelHeader";
import {
  DAY_MS,
  formatLabels,
  formatNouns,
  fromIsoDate,
  gateSummary,
  isoDate,
  isQualityGate,
  isTitleLimitDetails,
  refusalText,
  sameDay,
  windowDays,
  windowRange,
  windowUse,
} from "./model";
import { LoadError, ReadOnlyNote, VolumeHeader, volumePageClasses } from "./parts";
import { useToday, usePickableBooks, useVolumeActions, useVolumeSchedule } from "./useVolume";

const dayLabelFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const iso = (ms: number) => new Date(ms).toISOString();
const bookTitle = (s: ApiTitleSlot) => s.book.title ?? s.book.idea ?? "Untitled book";

/* The lanes grid (approved design, .lanes): a 150 px name column, then the 7 days. Scrolls sideways on phones. */
const laneCols = "grid grid-cols-[150px_repeat(7,minmax(0,1fr))]";

function ScheduleSkeleton() {
  return (
    <div role="status" aria-label="Loading the schedule" className="grid gap-3">
      <Skeleton className="h-4 w-2/5" />
      <div className="grid gap-2 rounded-lg border border-line p-3">
        {TITLE_FORMATS.map((f) => (
          <Skeleton key={f} className="h-16 w-full" />
        ))}
      </div>
    </div>
  );
}

/* .evc: a confirmed release in the accent mint, a planned one in blue, each with its word. */
function SlotButton({ slot, onOpen }: { slot: ApiTitleSlot; onOpen: (s: ApiTitleSlot) => void }) {
  const confirmed = slot.status === "confirmed";
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className={cn(
        "block w-full min-w-0 rounded-[7px] border-l-[3px] px-[7px] py-1 text-left text-[11.5px] leading-[1.3] font-semibold hover:brightness-[0.98]",
        confirmed ? "border-mint bg-mint-wash text-mint-ink" : "border-blue bg-blue-wash text-blue",
      )}
    >
      <span className="block truncate">{bookTitle(slot)}</span>
      <span className="sr-only">, {slot.book.penName}, </span>
      <small className="block truncate text-[11.5px] font-medium opacity-85">{confirmed ? "Confirmed" : "Planned"}</small>
    </button>
  );
}

/** One format's lane: its name and how full the 7 days are, then a cell per day with that day's releases. */
function FormatLane({
  format,
  days,
  slots,
  limit,
  start,
  today,
  onOpen,
}: {
  format: TitleFormat;
  days: number[];
  slots: ApiTitleSlot[];
  limit: ApiTitleLimit;
  start: number;
  today: number;
  onOpen: (s: ApiTitleSlot) => void;
}) {
  const use = windowUse(slots, format, start, limit);
  const mine = slots.filter((s) => s.format === format);
  const headingId = `format-${format}`;
  return (
    <section aria-labelledby={headingId} className={cn(laneCols, "border-t border-line")}>
      <div className="grid content-center gap-0.5 p-3">
        <h3 id={headingId} className="text-[13px] font-bold text-ink">
          {formatLabels[format]}
        </h3>
        <p className={cn("num text-[12.5px]", use.full ? "text-red" : "text-ink-2")}>
          {use.used} of {use.max}
          <span className="sr-only"> new titles in these 7 days</span>
          {use.full && ", full"}
        </p>
      </div>
      {days.map((d) => {
        const onDay = mine.filter((s) => sameDay(s.plannedAt, d));
        return (
          <div key={d} className={cn("flex min-h-[78px] min-w-0 flex-col gap-1 border-l border-line p-1.5", sameDay(d, today) && "bg-mint-wash/55")}>
            {onDay.length > 0 && <span className="sr-only">{formatDate(iso(d))}:</span>}
            {onDay.map((s) => (
              <SlotButton key={s.id} slot={s} onOpen={onOpen} />
            ))}
          </div>
        );
      })}
    </section>
  );
}

interface Refusal {
  title: string;
  body: string;
  nextFreeAt: number | null;
  nextFree: string | null;
  tone: "attention" | "error";
}

function refusalFrom(e: unknown, format: TitleFormat): Refusal {
  if (isApiError(e) && e.code === "title_limit" && isTitleLimitDetails(e.details)) {
    const r = refusalText(e.details, format);
    return { title: r.title, body: r.body, nextFreeAt: e.details.nextFreeAt, nextFree: r.nextFree, tone: "attention" };
  }
  return { title: "The release was not planned", body: apiErrorText(e), nextFreeAt: null, nextFree: null, tone: "error" };
}

function PlanDialog({ open, start, onClose, onPlanned }: { open: boolean; start: number; onClose: () => void; onPlanned: (msg: string) => void }) {
  const mode = useWireMode();
  const books = usePickableBooks(mode);
  const actions = useVolumeActions(mode);
  const [bookId, setBookId] = useState<string | null>(null);
  const [format, setFormat] = useState<TitleFormat>("paperback");
  const [date, setDate] = useState(() => isoDate(start));
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [tried, setTried] = useState(false);
  const plannedAt = fromIsoDate(date);
  const dateError = tried && plannedAt === null ? "Enter a date, like 12 October 2026." : undefined;
  const bookError = tried && !bookId ? "Pick a book." : undefined;

  function close() {
    setRefusal(null);
    setTried(false);
    setBusy(false);
    onClose();
  }
  function submit() {
    setTried(true);
    if (!bookId || plannedAt === null) return;
    setBusy(true);
    setRefusal(null);
    const title = books.books.find((b) => b.id === bookId)?.title ?? "The book";
    actions.addSlot({ bookId, format, plannedAt }).then(
      () => {
        setBusy(false);
        setTried(false);
        setBookId(null);
        onPlanned(`${title} is planned as a ${formatNouns[format]} on ${formatDate(iso(plannedAt))}.`);
      },
      (e: unknown) => {
        setBusy(false);
        setRefusal(refusalFrom(e, format));
      },
    );
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="Plan a release"
      description="Holds a slot for one book in one format. All pen names in this workspace share one KDP account, so they share its limit on new titles."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button variant="primary" icon={CalendarPlus} loading={busy} loadingLabel="Checking" onClick={submit}>
            Plan release
          </Button>
        </>
      }
    >
      <form
        className="grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Select
          label="Book"
          value={bookId}
          onChange={(v) => {
            setBookId(v);
            setRefusal(null);
          }}
          placeholder={books.state === "loading" ? "Loading books" : "Choose a book"}
          disabled={books.state !== "ready" || books.books.length === 0}
          disabledReason={
            books.state === "error" ? (books.error ?? "Could not load your books.") : books.books.length === 0 ? "No books to plan yet." : undefined
          }
          error={bookError}
          options={books.books.map((b) => ({ value: b.id, label: b.title, hint: b.penName }))}
        />
        <div className="grid gap-1.5">
          <span className="text-label font-medium text-ink">Format</span>
          <SegmentedControl
            label="Format"
            value={format}
            onChange={(v) => {
              setFormat(v);
              setRefusal(null);
            }}
            options={TITLE_FORMATS.map((f) => ({ value: f, label: formatLabels[f] }))}
          />
        </div>
        <Input
          label="Release date"
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value);
            setRefusal(null);
          }}
          error={dateError}
          hint="Dates are whole days. The limit counts any 7 days in a row, not calendar weeks."
        />
        {refusal && (
          <Banner tone={refusal.tone} title={refusal.title}>
            <p>{refusal.body}</p>
            {refusal.nextFreeAt !== null && refusal.nextFree && (
              <Button
                size="sm"
                className="mt-2.5"
                onClick={() => {
                  if (refusal.nextFreeAt !== null) setDate(isoDate(refusal.nextFreeAt));
                  setRefusal(null);
                }}
              >
                Use {refusal.nextFree}
              </Button>
            )}
          </Banner>
        )}
      </form>
    </Modal>
  );
}

function SlotDialog({ slot, canWrite, onClose, onDone }: { slot: ApiTitleSlot | null; canWrite: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const mode = useWireMode();
  const actions = useVolumeActions(mode);
  const [busy, setBusy] = useState<"confirm" | "remove" | null>(null);
  const [askRemove, setAskRemove] = useState(false);
  const [error, setError] = useState<{ title: string; body: string; gateLinks: boolean } | null>(null);

  function close() {
    setAskRemove(false);
    setError(null);
    onClose();
  }
  if (!slot) return <Modal open={false} onClose={close} title="Release" />;
  const s = slot;
  const title = bookTitle(s);

  function confirm() {
    setBusy("confirm");
    setError(null);
    actions.confirmSlot(s.id).then(
      () => {
        setBusy(null);
        onDone(`${title} is confirmed for ${formatDate(iso(s.plannedAt))}.`);
      },
      (e: unknown) => {
        setBusy(null);
        if (isApiError(e) && e.code === "quality_gate" && isQualityGate(e.details)) {
          setError({ title: `Not confirmed: ${gateSummary(e.details).toLowerCase()}`, body: e.message, gateLinks: true });
        } else setError({ title: "Not confirmed", body: apiErrorText(e), gateLinks: false });
      },
    );
  }
  function remove() {
    setBusy("remove");
    setError(null);
    actions.removeSlot(s.id).then(
      () => {
        setBusy(null);
        setAskRemove(false);
        onDone(`The ${formatNouns[s.format]} slot for ${title} is free again.`);
      },
      (e: unknown) => {
        setBusy(null);
        setError({ title: "The slot was not removed", body: apiErrorText(e), gateLinks: false });
      },
    );
  }

  return (
    <Modal
      open
      onClose={close}
      title={title}
      description={`${s.book.penName}. ${formatLabels[s.format]} on ${formatDate(iso(s.plannedAt))}.`}
      footer={
        canWrite ? (
          askRemove ? (
            <>
              <Button variant="ghost" onClick={() => setAskRemove(false)}>
                Keep it
              </Button>
              <Button variant="danger" icon={Trash2} loading={busy === "remove"} loadingLabel="Removing" onClick={remove}>
                Remove slot
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" icon={Trash2} onClick={() => setAskRemove(true)}>
                Remove from schedule
              </Button>
              {s.status === "planned" && (
                <Button variant="primary" icon={ShieldCheck} loading={busy === "confirm"} loadingLabel="Checking" onClick={confirm}>
                  Confirm release
                </Button>
              )}
            </>
          )
        ) : (
          <Button variant="ghost" onClick={close}>
            Close
          </Button>
        )
      }
    >
      <div className="grid gap-3">
        <p className="inline-flex items-center gap-1.5 text-body text-ink">
          {s.status === "confirmed" ? <Check size={16} aria-hidden className="text-success" /> : <Clock size={16} aria-hidden className="text-ink-secondary" />}
          {s.status === "confirmed" && s.confirmedAt
            ? `Confirmed on ${formatDate(iso(s.confirmedAt))}. It passed preflight and claims review.`
            : "Planned. Confirming checks preflight and open claims first."}
        </p>
        {askRemove && <p className="text-body text-ink-secondary">Remove this slot? The book stays as it is, and the date becomes free for another title.</p>}
        {error && (
          <Banner tone="error" title={error.title}>
            {error.body}{" "}
            {error.gateLinks && (
              <span className="inline-flex flex-wrap gap-x-3">
                <Link to={`/books/${s.bookId}/export`} className="font-semibold text-select underline-offset-2 hover:underline">
                  Open preflight
                </Link>
                <Link to={`/books/${s.bookId}/editor`} className="font-semibold text-select underline-offset-2 hover:underline">
                  Review claims
                </Link>
              </span>
            )}
          </Banner>
        )}
      </div>
    </Modal>
  );
}

/**
 * Release schedule (phase 8, P8-4, D-046): 7 days at a time, one lane per format, each showing how many of KDP's
 * new titles are used. The limit comes from the server (config/kdp-rules, rule titles.creationLimit). Planning a
 * release over the limit is refused with the clash and the next free date; confirming a release needs the book
 * to pass the quality gate. Viewers read only.
 */
export default function SchedulePage() {
  const mode = useWireMode();
  const me = useVolumeMe();
  const [offsetDays, setOffsetDays] = useState(0);
  const today = useToday(mode);
  const start = today + offsetDays * DAY_MS;
  const range = useMemo(() => windowRange(start), [start]);
  const days = useMemo(() => windowDays(start), [start]);
  const data = useVolumeSchedule(mode, range);
  const [planning, setPlanning] = useState(false);
  const [open, setOpen] = useState<ApiTitleSlot | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const first = days[0] ?? start;
  const last = days[days.length - 1] ?? start;
  const rangeLabel = `${formatDate(iso(first))} to ${formatDate(iso(last))}`;
  const limit = data.limit;

  return (
    <div className={volumePageClasses}>
      <VolumeHeader
        title="Release schedule"
        actions={
          me.canWrite ? (
            <Button
              variant="primary"
              icon={CalendarPlus}
              onClick={() => {
                setStatus(null);
                setPlanning(true);
              }}
            >
              Plan a release
            </Button>
          ) : undefined
        }
      />
      <ReadOnlyNote me={me} />
      {status && <InlineStatus>{status}</InlineStatus>}

      <section aria-labelledby="schedule-range" className="vol-glass grid min-w-0 grid-cols-1 gap-4 rounded-card p-4.5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="schedule-range" aria-live="polite" className="text-[15px] leading-6 font-bold text-ink">
            {rangeLabel}
          </h2>
          <div className="flex items-center gap-1.5">
            <IconButton icon={ChevronLeft} label="Previous 7 days" variant="secondary" size="sm" onClick={() => setOffsetDays((d) => d - 7)} />
            <Button size="sm" disabledReason={offsetDays === 0 ? "Already showing today." : undefined} onClick={() => setOffsetDays(0)}>
              Today
            </Button>
            <IconButton icon={ChevronRight} label="Next 7 days" variant="secondary" size="sm" onClick={() => setOffsetDays((d) => d + 7)} />
          </div>
        </div>

        {data.state === "loading" && <ScheduleSkeleton />}
        {data.state === "error" && <LoadError title="Could not load the schedule" message={data.error} retry={data.retry} />}
        {data.state === "ready" && limit && (
          <>
            <p className="text-body text-ink-2">
              Up to {limit.maxNewTitlesPerFormat} new titles per format in any {limit.periodDays} days, shared by every pen name.
            </p>
            {data.slots.length === 0 && (
              <p className="text-small text-ink-2">
                Nothing planned in these 7 days.{" "}
                {me.canWrite ? "Plan a release to hold a slot for a book and format." : "No releases are planned for these days yet."}
              </p>
            )}
            <div className="-mx-4.5 min-w-0 overflow-x-auto px-4.5">
              <div className="relative min-w-[760px] overflow-hidden rounded-lg border border-line">
                <div aria-hidden className={cn(laneCols, "bg-soft")}>
                  <span />
                  {days.map((d) => (
                    <small
                      key={d}
                      className={cn(
                        "border-l border-line px-2 py-2.5 text-[12px] whitespace-nowrap",
                        sameDay(d, today) ? "font-bold text-mint-ink" : "font-medium text-ink-3",
                      )}
                    >
                      {dayLabelFmt.format(d)}
                    </small>
                  ))}
                </div>
                {TITLE_FORMATS.map((f) => (
                  <FormatLane key={f} format={f} days={days} slots={data.slots} limit={limit} start={start} today={today} onOpen={setOpen} />
                ))}
              </div>
            </div>
            <p className="text-[12.5px] leading-[18px] text-ink-2">
              The limit comes from KDP rule {limit.ruleId} in rules version {limit.rulesVersion}. Volume counts any {limit.periodDays} days in a row, which is
              never looser than a calendar week. So a date can be refused even when these 7 days show space: the check looks {limit.periodDays} days either side
              of it.
            </p>
          </>
        )}
      </section>

      <PlanDialog
        key={planning ? `plan-${start}` : "plan-closed"}
        open={planning}
        start={start}
        onClose={() => setPlanning(false)}
        onPlanned={(msg) => {
          setPlanning(false);
          setStatus(msg);
        }}
      />
      <SlotDialog
        key={open?.id ?? "none"}
        slot={open}
        canWrite={me.canWrite}
        onClose={() => setOpen(null)}
        onDone={(msg) => {
          setOpen(null);
          setStatus(msg);
        }}
      />
    </div>
  );
}

import { useMemo, useState } from "react";
import { Link } from "react-router";
import { CalendarPlus, Check, ChevronLeft, ChevronRight, Clock, Flag, ShieldCheck, Trash2 } from "lucide-react";
import { Banner, Button, Input, Modal, ProgressBar, SegmentedControl, Select, Skeleton } from "../../components/ui";
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
import { LoadError, ReadOnlyNote, VolumeHeader } from "./parts";
import { useToday, usePickableBooks, useVolumeActions, useVolumeSchedule } from "./useVolume";

const weekdayFmt = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const dayNumFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const iso = (ms: number) => new Date(ms).toISOString();
const bookTitle = (s: ApiTitleSlot) => s.book.title ?? s.book.idea ?? "Untitled book";

function ScheduleSkeleton() {
  return (
    <div role="status" aria-label="Loading the schedule" className="grid gap-4">
      {TITLE_FORMATS.map((f) => (
        <div key={f} className="grid gap-3 rounded-md border border-border bg-sheet p-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

function SlotButton({ slot, onOpen }: { slot: ApiTitleSlot; onOpen: (s: ApiTitleSlot) => void }) {
  const confirmed = slot.status === "confirmed";
  return (
    <button
      type="button"
      onClick={() => onOpen(slot)}
      className="grid w-full min-h-11 gap-0.5 rounded-sm border border-border bg-canvas px-2.5 py-2 text-left hover:bg-sunken"
    >
      <span className="line-clamp-2 text-small font-semibold text-ink">{bookTitle(slot)}</span>
      <span className="truncate text-[12.5px] text-ink-secondary">{slot.book.penName}</span>
      <span className={cn("inline-flex items-center gap-1 text-[12.5px] font-semibold", confirmed ? "text-success" : "text-ink-secondary")}>
        {confirmed ? <Check size={14} strokeWidth={2} aria-hidden /> : <Clock size={14} strokeWidth={2} aria-hidden />}
        {confirmed ? "Confirmed" : "Planned"}
      </span>
    </button>
  );
}

/** One format's row: how full the 7 days are, then each day with its slots (a list on phones). */
function FormatRow({
  format,
  days,
  slots,
  limit,
  start,
  onOpen,
}: {
  format: TitleFormat;
  days: number[];
  slots: ApiTitleSlot[];
  limit: ApiTitleLimit;
  start: number;
  onOpen: (s: ApiTitleSlot) => void;
}) {
  const use = windowUse(slots, format, start, limit);
  const mine = slots.filter((s) => s.format === format);
  const headingId = `format-${format}`;
  return (
    <section aria-labelledby={headingId} className="grid gap-3 rounded-md border border-border bg-sheet p-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 id={headingId} className="text-subhead text-ink">
          {formatLabels[format]}
        </h3>
        <span className="num text-small text-ink-secondary">
          {use.used} of {use.max} new titles in these 7 days
        </span>
        <ProgressBar
          value={use.used}
          max={use.max}
          size="thin"
          label={`${formatLabels[format]} slots used`}
          valueText={`${use.used} of ${use.max}`}
          className="w-24"
        />
        {use.full && (
          <span className="inline-flex h-6 items-center gap-1.5 rounded-pill bg-accent-wash px-2.5 text-[12.5px] font-semibold text-accent-text">
            <Flag size={14} strokeWidth={2} aria-hidden />
            Full
          </span>
        )}
      </div>
      {/* Wide screens: a day per column. */}
      <ol className="hidden grid-cols-7 gap-2 lg:grid">
        {days.map((d) => {
          const today = mine.filter((s) => sameDay(s.plannedAt, d));
          return (
            <li key={d} className="grid min-h-24 content-start gap-1.5 rounded-sm bg-sunken/60 p-1.5" aria-label={formatDate(iso(d))}>
              <span aria-hidden className="px-1 text-[12.5px] text-ink-secondary">
                {weekdayFmt.format(d)} {dayNumFmt.format(d)}
              </span>
              {today.map((s) => (
                <SlotButton key={s.id} slot={s} onOpen={onOpen} />
              ))}
            </li>
          );
        })}
      </ol>
      {/* Phones and tablets: only the days with a release. */}
      <div className="lg:hidden">
        {mine.length === 0 ? (
          <p className="text-small text-ink-secondary">Nothing planned for {formatNouns[format]} in these 7 days.</p>
        ) : (
          <ul className="grid gap-2">
            {mine.map((s) => (
              <li key={s.id} className="grid grid-cols-[88px_minmax(0,1fr)] items-start gap-3">
                <span className="pt-2 text-small text-ink-secondary">
                  {weekdayFmt.format(s.plannedAt)} {dayNumFmt.format(s.plannedAt)}
                </span>
                <SlotButton slot={s} onOpen={onOpen} />
              </li>
            ))}
          </ul>
        )}
      </div>
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
 * Release schedule (phase 8, P8-4, D-046): 7 days at a time, one row per format, each showing how many of KDP's
 * new titles are used. The limit comes from the server (config/kdp-rules, rule titles.creationLimit). Planning a
 * release over the limit is refused with the clash and the next free date; confirming a release needs the book
 * to pass the quality gate. Viewers read only.
 */
export default function SchedulePage() {
  const mode = useWireMode();
  const me = useVolumeMe();
  const [offsetDays, setOffsetDays] = useState(0);
  const start = useToday(mode) + offsetDays * DAY_MS;
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
    <div className="mx-auto grid w-full max-w-[1240px] grid-cols-1 content-start gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <VolumeHeader
        title="Release schedule"
        summary={limit ? `Up to ${limit.maxNewTitlesPerFormat} new titles per format in any ${limit.periodDays} days, shared by every pen name.` : undefined}
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

      <div className="flex flex-wrap items-center gap-3">
        <h2 aria-live="polite" className="font-book text-heading text-ink">
          {rangeLabel}
        </h2>
        <div className="flex items-center gap-1 sm:ml-auto">
          <Button icon={ChevronLeft} onClick={() => setOffsetDays((d) => d - 7)}>
            Previous 7 days
          </Button>
          <Button variant="ghost" disabledReason={offsetDays === 0 ? "Already showing today." : undefined} onClick={() => setOffsetDays(0)}>
            Today
          </Button>
          <Button iconRight={ChevronRight} onClick={() => setOffsetDays((d) => d + 7)}>
            Next 7 days
          </Button>
        </div>
      </div>
      {status && <InlineStatus>{status}</InlineStatus>}

      {data.state === "loading" && <ScheduleSkeleton />}
      {data.state === "error" && <LoadError title="Could not load the schedule" message={data.error} retry={data.retry} />}
      {data.state === "ready" && limit && (
        <>
          {data.slots.length === 0 && (
            <Banner tone="info" title="Nothing planned in these 7 days">
              {me.canWrite ? "Plan a release to hold a slot for a book and format." : "No releases are planned for these days yet."}
            </Banner>
          )}
          <div className="grid gap-4">
            {TITLE_FORMATS.map((f) => (
              <FormatRow key={f} format={f} days={days} slots={data.slots} limit={limit} start={start} onOpen={setOpen} />
            ))}
          </div>
          <p className="max-w-[80ch] text-small text-ink-secondary">
            The limit comes from KDP rule {limit.ruleId} in rules version {limit.rulesVersion}. Volume counts any {limit.periodDays} days in a row, which is
            never looser than a calendar week. So a date can be refused even when these 7 days show space: the check looks {limit.periodDays} days either side
            of it.
          </p>
        </>
      )}

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

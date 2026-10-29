import { useId, type ReactNode } from "react";
import { Link } from "react-router";
import { BookOpen, Check, ChevronRight, FileText, Flag, Globe, Image, KeyRound, Package, ShieldCheck, Tablet, User } from "lucide-react";
import { Card, Cover, StageChip, StatusChip, buttonClasses, type ChipTone } from "../../components/ui";
import { activity, bookSteps, currentStep, getBookType, stepState, type Book, type BookStepId, type PenName, type StepState } from "../../demo";
import { cn } from "../../lib/cn";
import { formatDate, formatNumber, formatRelative, formatUsd } from "../../lib/format";
import { bookStepPath } from "../../screens";
import { stepCopy, stepIcons } from "../../shell/stepCopy";
import { libraryCover } from "../library/draftCover";
import { RoyaltyCard, ReleasesCard } from "./LedgerCards";

const stateWord: Record<StepState, string> = {
  done: "Done",
  attention: "Needs you",
  running: "Writing now",
  "in-progress": "In progress",
  "not-started": "Not started",
};
const stateTone: Record<StepState, ChipTone> = { done: "good", attention: "warn", running: "run", "in-progress": "run", "not-started": "info" };

/** "Today, 14:12" for a demo book (against the demo's today) or a server book (against now). */
function when(now: string, iso: string): string {
  return formatRelative(iso, now);
}

/** Small round figure (.ring in the approved design). The arc only shows a real share; spend has none (D-057). */
function Ring({ share, value, small }: { share: number | null; value: string; small: string }) {
  const r = 38;
  const c = 2 * Math.PI * r;
  const f = share === null ? 0 : Math.max(0, Math.min(1, share));
  return (
    <svg viewBox="0 0 92 92" aria-hidden className="size-[92px] max-[560px]:size-[76px]">
      <circle cx="46" cy="46" r={r} fill="none" stroke="var(--vol-track)" strokeWidth="9" />
      {f > 0 && (
        <circle
          cx="46"
          cy="46"
          r={r}
          fill="none"
          stroke="var(--vol-mint)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${(f * c).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 46 46)"
        />
      )}
      <text x="46" y="48" textAnchor="middle" className="fill-ink text-[19px] font-bold">
        {value}
      </text>
      <text x="46" y="62" textAnchor="middle" className="fill-ink-3 text-[9.5px] font-medium">
        {small}
      </text>
    </svg>
  );
}

function RingCard({ label, words, highlight, children }: { label: string; words: string; highlight?: boolean; children: ReactNode }) {
  return (
    <Card padding="none" className={cn("grid justify-items-center gap-2 px-2.5 py-3.5 text-center", highlight && "border-transparent bg-mint-wash")}>
      {children}
      <p className="text-small font-medium text-ink-2">
        {label}
        <span className="sr-only">: {words}</span>
      </p>
    </Card>
  );
}

function CardHead({ id, title, aside }: { id: string; title: string; aside?: ReactNode }) {
  return (
    <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2.5">
      <h2 id={id} className="text-[15px] font-bold text-ink">
        {title}
      </h2>
      {aside}
    </div>
  );
}

/** The five things a book holds, each linked to the step that makes it. */
function bookFiles(book: Book, states: Record<BookStepId, StepState>) {
  const published = book.stage === "published";
  const word = (s: StepState, done = "Done") => (s === "done" ? done : s === "not-started" ? "Not started" : stateWord[s]);
  const packWord = published || book.exported ? "Built" : "Not built";
  return [
    { name: "Research notes", detail: "Audience, angles and sources", icon: FileText, tone: "mint", state: word(states.research), step: "research" as const },
    {
      name: "Blueprint",
      detail: "Outline, matter and listing",
      icon: FileText,
      tone: "mint",
      state: word(states.blueprint, "Approved"),
      step: "blueprint" as const,
    },
    {
      name: "Manuscript",
      detail: `${formatNumber(book.words.written)} words, versioned`,
      icon: FileText,
      tone: "blue",
      state: word(states.editor),
      step: "editor" as const,
    },
    {
      name: "Cover and wrap",
      detail: book.cover || book.coverImage ? "eBook cover and paperback wrap" : "No concept yet",
      icon: Image,
      tone: "amber",
      state: word(states.cover),
      step: "cover" as const,
    },
    { name: "KDP upload pack", detail: "PDF, EPUB, DOCX, covers, listing", icon: Package, tone: "red", state: packWord, step: "export" as const },
  ];
}

const fileTone: Record<string, string> = {
  mint: "bg-mint-wash text-mint-ink",
  blue: "bg-blue-wash text-blue",
  amber: "bg-amber-wash text-amber",
  red: "bg-red-wash text-red",
};

function chipToneFor(word: string): ChipTone {
  return word === "Done" || word === "Approved" || word === "Built"
    ? "good"
    : word === "Needs you"
      ? "warn"
      : word === "In progress" || word === "Writing now"
        ? "run"
        : "info";
}

export function BookOverview({ book, pen, runningBookId, now }: { book: Book; pen: PenName | undefined; runningBookId: string | null; now: string }) {
  const ids = { facts: useId(), steps: useId(), files: useId(), notes: useId() };
  const states = Object.fromEntries(bookSteps.map((s) => [s.id, stepState(book, s.id, runningBookId)])) as Record<BookStepId, StepState>;
  const done = bookSteps.filter((s) => states[s.id] === "done").length;
  const here = bookSteps.findIndex((s) => s.id === currentStep(book));
  const attention = book.attentionSteps[0];
  const nextId: BookStepId = attention ?? currentStep(book);
  const nextLabel = bookSteps.find((s) => s.id === nextId)?.label ?? "Research";
  const published = book.stage === "published";
  const type = getBookType(book.bookTypeId);
  const notes = activity.filter((a) => a.bookId === book.id);
  const { design, draft, image } = libraryCover(book);
  const author = pen?.name ?? "";
  const disclosure = book.published?.aiDisclosure ?? (book.template === "picture-book" ? "AI-generated text and images" : "AI-generated text");
  const stepLine = published ? "All 8 steps done" : `Step ${here + 1} of ${bookSteps.length}: ${bookSteps[here]?.label ?? ""}`;
  const files = bookFiles(book, states);

  return (
    <div className="px-4 pb-6 min-[861px]:px-6">
      <div className="grid items-start gap-4 min-[861px]:grid-cols-[270px_minmax(0,1fr)] min-[1280px]:grid-cols-[290px_minmax(0,1fr)_310px]">
        {/* Profile column */}
        <div className="grid min-w-0 content-start gap-4">
          <Card as="section" aria-label="The book" className="grid justify-items-center gap-1.5 pt-6 text-center">
            <span className="mb-2.5 block w-[158px]">
              <Cover title={book.title} subtitle={book.subtitle} author={author} design={design} image={image} hideSubtitle={draft} lift className="w-full" />
            </span>
            <h1 className="font-book text-[19px] leading-tight font-semibold text-ink">{book.title}</h1>
            <p className="text-small text-ink-2">{book.subtitle || "No subtitle"}</p>
            <div className="mt-1.5 mb-1 flex flex-wrap items-center justify-center gap-1.5">
              <StageChip stage={book.stage} live={runningBookId === book.id} />
              {type && <span className="rounded-[7px] border border-line bg-soft px-2 py-[3px] font-mono text-[11px] font-medium text-ink-2">{type.name}</span>}
            </div>
            <dl className="mt-2.5 grid w-full border-t border-line text-[13px]">
              <Row label="Profile">
                <span className="inline-flex items-center gap-2 whitespace-nowrap">
                  {pen && (
                    <span aria-hidden className="grid size-[26px] place-items-center rounded-full bg-mint-wash text-[10px] font-bold text-mint-ink">
                      {pen.initials}
                    </span>
                  )}
                  {author || "Not set"}
                </span>
              </Row>
              <Row label="Trim">{book.trim}</Row>
              <Row label="Started">{formatDate(book.createdAt)}</Row>
              <Row label="Updated">{when(now, book.updatedAt)}</Row>
              {book.series && (
                <Row label="Series">
                  {book.series.name}, book {book.series.number}
                </Row>
              )}
              <Row label="Formats">
                <span className="flex gap-1.5">
                  <FormatIcon label="Kindle eBook">
                    <Tablet size={15} strokeWidth={1.8} aria-hidden />
                  </FormatIcon>
                  <FormatIcon label="Paperback">
                    <BookOpen size={15} strokeWidth={1.8} aria-hidden />
                  </FormatIcon>
                </span>
              </Row>
            </dl>
          </Card>

          <Card as="section" aria-labelledby={ids.facts}>
            <CardHead id={ids.facts} title="Book facts" />
            <ul className="grid gap-0.5">
              <Fact icon={<User size={17} strokeWidth={1.8} />} label={pen?.realPerson ? "Real person" : "Pen name"}>
                {author || "Not set"}
                {pen?.imprint ? `, ${pen.imprint}` : ""}
              </Fact>
              <Fact icon={<Globe size={17} strokeWidth={1.8} />} label="Language">
                British English
              </Fact>
              <Fact icon={<ShieldCheck size={17} strokeWidth={1.8} />} label="KDP AI disclosure">
                {disclosure}
              </Fact>
              <Fact icon={<KeyRound size={17} strokeWidth={1.8} />} label="ISBN">
                {book.published ? "From KDP, entered by you" : "Not entered yet"}
              </Fact>
              <Fact icon={<FileText size={17} strokeWidth={1.8} />} label="About the author">
                Profile bio, word for word
              </Fact>
            </ul>
          </Card>
        </div>

        {/* Working column */}
        <div className="grid min-w-0 content-start gap-4">
          <section aria-label="Next step" className="flex flex-wrap items-center gap-3.5 rounded-card bg-btn px-[18px] py-4 text-on-btn">
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-[11px] bg-on-btn/12">
              {attention ? <Flag size={17} strokeWidth={1.8} /> : <ChevronRight size={17} strokeWidth={1.8} />}
            </span>
            <p className="min-w-[200px] flex-1">
              <small className="block text-small opacity-80">{attention ? "Needs you" : published ? "Live on Amazon" : "Next step"}</small>
              <b className="text-[16px] font-bold">{published ? book.statusLine : `${nextLabel}: ${book.statusLine}`}</b>
            </p>
            <Link
              to={bookStepPath(book.id, nextId)}
              className="inline-flex h-10 items-center justify-center gap-1.5 rounded-control bg-mint px-4 text-label font-semibold text-on-mint hover:brightness-105 max-[560px]:w-full"
            >
              Open {nextLabel}
              <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
            </Link>
          </section>

          <div className="grid grid-cols-2 gap-3 min-[561px]:grid-cols-4">
            <RingCard label="Words" words={`${formatNumber(book.words.written)} of ${formatNumber(book.words.target)} written`} highlight>
              <Ring
                share={book.words.target ? book.words.written / book.words.target : null}
                value={kilo(book.words.written)}
                small={`of ${kilo(book.words.target)}`}
              />
            </RingCard>
            <RingCard label="Steps done" words={`${done} of ${bookSteps.length}`}>
              <Ring share={done / bookSteps.length} value={`${done}/${bookSteps.length}`} small="steps" />
            </RingCard>
            <RingCard label="AI cost" words={`${formatUsd(book.cost.spent)} spent so far`}>
              <Ring share={null} value={formatUsd(book.cost.spent)} small="so far" />
            </RingCard>
            <RingCard label="Needs you" words={book.attentionSteps.length ? `${book.attentionSteps.length} to do` : "nothing to do"}>
              <Ring
                share={book.attentionSteps.length ? 1 : 0}
                value={String(book.attentionSteps.length)}
                small={book.attentionSteps.length ? "to do" : "clear"}
              />
            </RingCard>
          </div>

          <Card as="section" aria-labelledby={ids.steps}>
            <CardHead id={ids.steps} title="Progress through the steps" aside={<small className="text-small text-ink-3">{stepLine}</small>} />
            <ol className="grid grid-cols-4 gap-1.5 min-[561px]:grid-cols-8">
              {bookSteps.map((s) => {
                const st = states[s.id];
                const Icon = stepIcons[s.id];
                return (
                  <li key={s.id} className="min-w-0">
                    <Link
                      to={bookStepPath(book.id, s.id)}
                      className="grid w-full justify-items-center gap-1.5 rounded-control px-0.5 py-2.5 text-center hover:bg-soft"
                    >
                      <span
                        aria-hidden
                        className={cn(
                          "grid size-[38px] place-items-center rounded-control",
                          st === "done"
                            ? "bg-btn text-on-btn"
                            : st === "attention"
                              ? "bg-amber-wash text-amber shadow-[inset_0_0_0_2px_var(--vol-amber)]"
                              : st === "in-progress" || st === "running"
                                ? "bg-mint-wash text-mint-ink shadow-[inset_0_0_0_2px_var(--vol-mint)]"
                                : "bg-soft text-ink-3",
                        )}
                      >
                        {st === "done" ? (
                          <Check size={17} strokeWidth={2} />
                        ) : st === "attention" ? (
                          <Flag size={17} strokeWidth={1.8} />
                        ) : (
                          <Icon size={17} strokeWidth={1.8} />
                        )}
                      </span>
                      <b className="max-w-full text-[11.5px] leading-tight font-semibold tracking-[-0.01em] text-ink">{s.label}</b>
                      <small className="text-[11px] leading-tight text-ink-3">{stateWord[st]}</small>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </Card>

          <Card as="section" aria-labelledby={ids.files}>
            <CardHead id={ids.files} title="Files" />
            <ul className="grid gap-1.5">
              {files.map((f) => (
                <li key={f.name}>
                  <Link
                    to={bookStepPath(book.id, f.step)}
                    className="flex w-full items-center gap-2.5 rounded-control border border-line p-2.5 text-left hover:bg-soft"
                  >
                    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-[10px]", fileTone[f.tone])}>
                      <f.icon size={17} strokeWidth={1.8} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <b className="block text-[13px] font-semibold text-ink">{f.name}</b>
                      <small className="block text-small text-ink-2">{f.detail}</small>
                    </span>
                    <StatusChip tone={chipToneFor(f.state)}>{f.state}</StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          <Card as="section" aria-labelledby={ids.notes}>
            <CardHead id={ids.notes} title="Notes from the jobs" />
            <ul className="grid gap-3">
              {notes.length > 0 ? (
                notes.map((a) => (
                  <li key={a.id} className={cn("grid gap-1 rounded-[14px] p-3.5", book.attentionSteps.length ? "bg-amber-wash" : "bg-mint-wash")}>
                    <b className="text-[13px] font-semibold text-ink">{capitalise(a.title.replace(`${book.title}, `, ""))}</b>
                    <small className="text-small text-ink-2">{when(now, a.at)}</small>
                    <p className="mt-1 text-[12.5px] text-ink-2">{a.detail}</p>
                  </li>
                ))
              ) : (
                <li className="grid gap-1 rounded-[14px] bg-mint-wash p-3.5">
                  <b className="text-[13px] font-semibold text-ink">{book.statusLine}</b>
                  <small className="text-small text-ink-2">{when(now, book.updatedAt)}</small>
                  <p className="mt-1 text-[12.5px] text-ink-2">No job notes yet for this book.</p>
                </li>
              )}
            </ul>
          </Card>
        </div>

        {/* Ledger column */}
        <div className="grid min-w-0 content-start gap-4 min-[861px]:col-span-2 min-[861px]:grid-cols-2 min-[1280px]:col-span-1 min-[1280px]:grid-cols-1">
          <RoyaltyCard book={book} />
          <ReleasesCard book={book} now={now} />
        </div>
      </div>

      <UpNextResearch book={book} state={states.research} />
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2.5 border-b border-line px-0.5 py-[11px]">
      <dt className="text-ink-3">{label}</dt>
      <dd className="text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

function FormatIcon({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span title={label} className="grid size-[30px] place-items-center rounded-[9px] border border-line bg-soft text-ink-2">
      {children}
      <span className="sr-only">{label}</span>
    </span>
  );
}

function Fact({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span aria-hidden className="grid size-[34px] shrink-0 place-items-center rounded-[11px] bg-soft text-ink-2">
        {icon}
      </span>
      <span className="min-w-0">
        <small className="block text-small text-ink-3">{label}</small>
        <b className="block text-[13px] font-semibold text-ink">{children}</b>
      </span>
    </li>
  );
}

/** The Up next card for the Overview: step 1, Research (same look as the shell's Up next card). */
function UpNextResearch({ book, state }: { book: Book; state: StepState }) {
  const id = useId();
  const Icon = stepIcons.research;
  return (
    <section
      aria-labelledby={id}
      className="mt-[22px] grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4 rounded-card border border-dashed border-line-2 bg-panel px-[18px] py-4 min-[761px]:grid-cols-[auto_minmax(0,1fr)_auto]"
    >
      <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-[14px] bg-mint-wash text-mint-ink">
        <Icon size={20} strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="num text-[11px] leading-[1.4] font-bold tracking-[0.08em] text-ink-3 uppercase">Up next, step 1 of {bookSteps.length}</p>
        <h2 id={id} className="my-px text-[16px] leading-[1.35] font-bold text-ink">
          Research
        </h2>
        <p className="text-[13px] text-ink-2">{stepCopy.research.short}</p>
      </div>
      <div className="col-span-2 flex flex-wrap items-center gap-2.5 min-[761px]:col-span-1 min-[761px]:justify-end">
        <StatusChip tone={stateTone[state]}>{stateWord[state]}</StatusChip>
        <Link to={bookStepPath(book.id, "research")} className={cn(buttonClasses("primary", "md"), "max-[760px]:flex-1")}>
          Open Research
          <ChevronRight size={16} strokeWidth={1.8} aria-hidden />
        </Link>
      </div>
    </section>
  );
}

function kilo(n: number): string {
  if (n >= 1000) return `${Math.round(n / 100) / 10}K`.replace(".0K", "K");
  return String(n);
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

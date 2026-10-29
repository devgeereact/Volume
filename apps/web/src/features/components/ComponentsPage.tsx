import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Check, Flag, LayoutGrid, Pause, Plus, RotateCcw, Rows3, Search, Trash2 } from "lucide-react";
import {
  Banner,
  Button,
  Card,
  ChapterBars,
  Checkbox,
  Chip,
  ClaimFlag,
  ClaimMark,
  Cover,
  EmptyState,
  Figure,
  GalleySheet,
  IconButton,
  Input,
  Inspector,
  InspectorSection,
  Kbd,
  KeyValueList,
  Loader,
  MarginNote,
  Modal,
  ModelName,
  ModelPicker,
  OutlineItem,
  PageHeader,
  ProgressBar,
  SegmentedControl,
  Select,
  Skeleton,
  StageChip,
  StageTrack,
  StatusChip,
  StreamText,
  Switch,
  Tabs,
  Textarea,
  Toast,
  Tooltip,
  modKey,
  tabPanelProps,
  type ChapterSegment,
} from "../../components/ui";
import { books, stageOrder } from "../../demo/books";
import { calmWardBlueprint } from "../../demo/blueprint";
import { models } from "../../demo/models";
import { getPenName, penNames } from "../../demo/penNames";
import type { Status } from "../../components/ui/StatusChip";
import { cn } from "../../lib/cn";
import { formatNumber, formatUsd } from "../../lib/format";
import { useCommandPalette } from "../../lib/commandPalette";
import { useWritingJob } from "../../lib/job";
import { useToast } from "../../lib/toast";

/* Living style guide: every shared component in its states, drawn twice, once in each theme
   (the token variables switch per subtree with data-theme). Popovers, tooltips and dialogs render
   at the page level and follow the page theme. */

function Row({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 border-t border-border pt-5 lg:grid-cols-[200px_minmax(0,1fr)] lg:gap-8">
      <div>
        <h3 className="font-book text-[20px] leading-[26px] font-medium text-ink">{title}</h3>
        {note && <p className="mt-1.5 text-small text-ink-secondary">{note}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[12.5px] leading-none font-medium text-ink-tertiary">{children}</p>;
}

const statuses: Status[] = ["writing", "attention", "claim", "passed", "queued", "locked", "demo"];

function Gallery({ theme }: { theme: "light" | "dark" }) {
  const toast = useToast();
  const palette = useCommandPalette();
  const { job, chapterProgress, chunksShown } = useWritingJob();
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("The Calm Ward");
  const [longTitle, setLongTitle] = useState(
    "The Calm Ward: De-escalation, Compassion and Safety in NHS Practice for Nurses, Nursing Associates, Healthcare Assistants, Students on Placement and the Ward Leaders Who Support Them Every Day",
  );
  const [bio, setBio] = useState(getPenName("harni-muharami")?.shortBio ?? "");
  const [template, setTemplate] = useState<string | null>("nonfiction");
  const [keepSubs, setKeepSubs] = useState(true);
  const [checkLinks, setCheckLinks] = useState(false);
  const [useSource, setUseSource] = useState(true);
  const [tab, setTab] = useState("checks");
  const [view, setView] = useState<"covers" | "ledger">("covers");
  const [pen, setPen] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [instruction, setInstruction] = useState("Open with a scene at the nurses' station, then slow the moment down.");
  const [writer, setWriter] = useState("~anthropic/claude-sonnet-latest");
  const [turnKey, setTurnKey] = useState(0);
  const [fill, setFill] = useState(0.35);
  const [selected, setSelected] = useState(4);
  const id = `cs-${theme}`;

  const segments: ChapterSegment[] = job.sections
    .filter((s) => s.number !== null)
    .map((s) => (s.status === "writing" ? { state: "current", progress: chapterProgress } : s.status === "queued" ? { state: "queued" } : { state: "done" }));

  const bp = calmWardBlueprint;
  const ch4 = bp.chapters[3];
  const claim = bp.claims[0];

  return (
    <div className="grid grid-cols-1 gap-11">
      <Row title="Buttons" note="40 px tall with a 44 px hit area. Labels say what happens. Hover, focus and press are live.">
        <div className="grid grid-cols-1 gap-4">
          {(["primary", "secondary", "ghost", "danger"] as const).map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-[13.5px] font-medium text-ink-secondary capitalize">{v}</span>
              <Button variant={v}>{v === "danger" ? "Delete version" : v === "ghost" ? "Cancel" : v === "primary" ? "Build pack" : "Regenerate part"}</Button>
              <Button variant={v} icon={v === "danger" ? Trash2 : v === "primary" ? Check : RotateCcw}>
                {v === "danger" ? "Delete version" : v === "ghost" ? "Open" : v === "primary" ? "Approve blueprint" : "Regenerate part"}
              </Button>
              <Button variant={v} disabledReason="Fix 2 missing parts first: the chapter 9 summary and the listing keywords.">
                {v === "primary" ? "Approve blueprint" : "Unavailable"}
              </Button>
              <Button variant={v} loading loadingLabel={v === "primary" ? "Building" : "Working"}>
                {v === "primary" ? "Build pack" : "Regenerate part"}
              </Button>
              <Button variant={v} size="sm">
                Small
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-[13.5px] font-medium text-ink-secondary">Cost first</span>
            <Button variant="secondary" icon={RotateCcw} estimate="about $0.04">
              Regenerate part
            </Button>
            <Button variant="primary" loading={loading} loadingLabel="Writing" estimate="about $2.40 to $3.60" onClick={() => setLoading(true)}>
              Write book
            </Button>
            {loading && (
              <Button variant="ghost" onClick={() => setLoading(false)}>
                Stop demo
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-24 text-[13.5px] font-medium text-ink-secondary">Icon</span>
            <IconButton icon={Pause} label="Pause" variant="secondary" />
            <IconButton icon={Search} label="Search" shortcut={[modKey(), "K"]} />
            <IconButton icon={Plus} label="Add profile" size="sm" variant="secondary" />
            <IconButton icon={LayoutGrid} label="Cover view" pressed />
            <IconButton icon={Trash2} label="Delete" disabled />
          </div>
        </div>
      </Row>

      <Row title="Fields" note="Labels above, hints below, errors in words with an icon.">
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
          <Input label="Pen name" defaultValue="Harni Muharami" hint="Shown on the cover and the title page." />
          <Input label="Working title" value={title} onChange={(e) => setTitle(e.target.value)} icon={Search} hint="Type to see the focus ring." />
          <Input
            label="Title and subtitle"
            value={longTitle}
            onChange={(e) => setLongTitle(e.target.value)}
            maxCount={199}
            error={longTitle.length > 199 ? `Keep title and subtitle under 200 characters. This one has ${longTitle.length}.` : undefined}
          />
          <Input label="ISBN" placeholder="Add one from KDP or Nielsen" disabled disabledReason="Locked while the blueprint is approved." />
          <Select
            label="Book template"
            value={template}
            onChange={setTemplate}
            options={[
              { value: "nonfiction", label: "Non-fiction guide", hint: "10 to 14 chapters" },
              { value: "workbook", label: "Workbook", hint: "Exercises in each chapter" },
              { value: "picture-book", label: "Picture book", hint: "32 pages" },
              { value: "fiction", label: "Fiction", hint: "Scenes, no subheadings" },
            ]}
          />
          <div className="grid grid-cols-1 content-start">
            <Switch label="Keep subheadings" checked={keepSubs} onChange={setKeepSubs} />
            <Switch label="Check research links on the web" checked={checkLinks} onChange={setCheckLinks} />
            <Checkbox label="Use in book" description="NHS England (example source)" checked={useSource} onChange={setUseSource} />
            <Checkbox label="Locked option" checked={false} onChange={() => undefined} disabled />
          </div>
          <Textarea
            label="Short bio"
            prose
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            showWordCount
            hint="Printed word for word in About the Author."
            className="md:col-span-2"
          />
        </div>
      </Row>

      <Row title="Tabs, toggles and chips" note="Selection is always announced. Colour never works alone.">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <Tabs
              label="Inspector"
              idBase={`${id}-tabs`}
              value={tab}
              onChange={setTab}
              items={[
                { id: "checks", label: "Checks", count: 5 },
                { id: "claims", label: "Claims", count: 3, countTone: "claim" },
                { id: "suggestions", label: "Suggestions", count: 12 },
                { id: "versions", label: "Versions", count: 4 },
              ]}
            />
            <div {...tabPanelProps(`${id}-tabs`, tab)} className="pt-3 text-small text-ink-secondary">
              Panel for {tab}. Arrow keys move between tabs.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <SegmentedControl
              label="View"
              value={view}
              onChange={setView}
              options={[
                { value: "covers", label: "Covers", icon: LayoutGrid },
                { value: "ledger", label: "Ledger", icon: Rows3 },
              ]}
            />
            <span className="text-small text-ink-secondary">The thumb slides with transform.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip pressed={pen === null} count={books.length} onClick={() => setPen(null)}>
              All
            </Chip>
            {penNames.map((p) => (
              <Chip key={p.id} pressed={pen === p.id} count={books.filter((b) => b.penNameId === p.id).length} onClick={() => setPen(p.id)}>
                {p.name}
              </Chip>
            ))}
          </div>
          <div>
            <Label>Status chips</Label>
            <div className="flex flex-wrap gap-2">
              {statuses.map((s) => (
                <StatusChip key={s} status={s} />
              ))}
              <StatusChip status="writing">Running for 1 h 12 min</StatusChip>
            </div>
          </div>
          <div>
            <Label>Stage chips</Label>
            <div className="flex flex-wrap gap-2">
              {stageOrder.map((s) => (
                <StageChip key={s} stage={s} live={s === "writing"} />
              ))}
            </div>
          </div>
        </div>
      </Row>

      <Row title="Stage track and progress" note="Ink fills, the gilt nib marks the live edge. Stage links move with the arrow keys.">
        <div className="grid grid-cols-1 gap-6">
          <div>
            <Label>Handover, writing (running)</Label>
            <StageTrack current="writing" loading="writing" />
          </div>
          <div>
            <Label>The Calm Ward, links to each step</Label>
            <StageTrack
              current="blueprint"
              hrefFor={(s) =>
                s === "research"
                  ? "/books/the-calm-ward/research"
                  : s === "title"
                    ? "/books/the-calm-ward/titles"
                    : s === "blueprint"
                      ? "/books/the-calm-ward/blueprint"
                      : undefined
              }
            />
          </div>
          <div>
            <Label>Compact (labels hidden except the current stage)</Label>
            <StageTrack current="cover" loading="export" compact />
          </div>
          <div className="grid grid-cols-1 max-w-[560px] gap-5">
            <div>
              <div className="mb-2 flex justify-between text-small text-ink-secondary">
                <span>Words written</span>
                <span className="num">
                  {formatNumber(job.words.written)} of {formatNumber(job.words.target)}
                </span>
              </div>
              <ProgressBar
                value={job.words.written}
                max={job.words.target}
                live
                label="Words written"
                valueText={`${formatNumber(job.words.written)} of ${formatNumber(job.words.target)} words`}
              />
            </div>
            <div>
              <p className="mb-2 text-small text-ink-secondary">Chapters, one segment each</p>
              <ChapterBars segments={segments} />
            </div>
            <div className="rounded-md bg-spine p-4">
              <p className="mb-2 text-small text-ink-on-spine-muted">Thin meter on the spine</p>
              <ProgressBar value={62} max={100} tone="spine" size="thin" label="Book written" valueText="62% written" />
            </div>
          </div>
        </div>
      </Row>

      <Row title="Overlays" note="Modal, toast, tooltip and the command menu. Escape closes; focus returns to the trigger.">
        <div className="grid grid-cols-1 gap-6">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" icon={RotateCcw} onClick={() => setModalOpen(true)}>
              Regenerate chapter 4
            </Button>
            <Button
              variant="secondary"
              onClick={() =>
                toast.show({
                  tone: "success",
                  title: "Handover, chapter 5 passed checks",
                  body: "3,720 words. One claim went to the verify list.",
                  action: { label: "Open", onClick: () => undefined },
                })
              }
            >
              Show a toast
            </Button>
            <Button variant="secondary" icon={Search} onClick={() => palette.setOpen(true)}>
              Open command menu
            </Button>
            <Kbd keys={[modKey(), "K"]} className="self-center" />
          </div>
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <Toast
              tone="success"
              title="Handover, chapter 5 passed checks"
              body="3,720 words. One claim went to the verify list."
              action={{ label: "Open", onClick: () => undefined }}
            />
            <Toast
              tone="attention"
              title="Sourdough on a Weeknight needs a look"
              body="Preflight found 2 warnings before the pack can build."
              onDismiss={() => undefined}
            />
            <Toast tone="error" title="OpenRouter is busy" body="We will try again in 10 seconds." onDismiss={() => undefined} />
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Tooltip content="Fix 2 missing parts first: the chapter 9 summary and the listing keywords.">
              <span tabIndex={0} className="rounded-sm text-small text-ink-secondary underline decoration-dotted underline-offset-4">
                Hover or focus for a tooltip
              </span>
            </Tooltip>
          </div>
          <Modal
            open={modalOpen}
            onClose={() => setModalOpen(false)}
            title="Regenerate chapter 4"
            footer={
              <>
                <Button variant="ghost" onClick={() => setModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={() => setModalOpen(false)}>
                  Regenerate chapter 4
                </Button>
              </>
            }
          >
            <Textarea label="Instruction, optional" value={instruction} onChange={(e) => setInstruction(e.target.value)} rows={3} />
            <Switch label="Keep subheadings" checked={keepSubs} onChange={setKeepSubs} />
            <div className="flex items-center justify-between rounded-sm bg-canvas px-3 py-2.5 text-[13.5px] text-ink-secondary">
              <span>
                Uses <ModelName slug={bp.model} />
              </span>
              <b className="font-semibold text-ink">About $0.04</b>
            </div>
          </Modal>
        </div>
      </Row>

      <Row title="Empty, loading and error" note="Every view has these. Skeletons breathe with opacity only.">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <EmptyState
            title="No profiles yet"
            body="Add your first one. Each profile keeps its own bio, voice and defaults."
            drawing="pen"
            headingLevel={3}
            action={
              <Button variant="primary" icon={Plus}>
                Add profile
              </Button>
            }
          />
          <div className="grid grid-cols-1 content-start gap-3">
            <div role="status" aria-label="Loading books" className="grid grid-cols-3 gap-4 rounded-md border border-border bg-sheet p-4">
              {[0, 1, 2].map((i) => (
                <div key={i}>
                  <Skeleton variant="cover" />
                  <Skeleton className="mt-3 w-4/5" />
                  <Skeleton className="mt-2 h-2.5 w-1/2" />
                </div>
              ))}
            </div>
            <Banner tone="error" title="Could not load your books" action={<Button size="sm">Retry</Button>}>
              The local server did not answer. Check it is running, then retry.
            </Banner>
            <Banner tone="attention" title="AI credits have run out">
              Top up, then continue. Nothing is lost.
            </Banner>
            <p className="flex items-center gap-2 text-small text-ink-secondary">
              <Loader /> Reading 6 of 18 sources
            </p>
          </div>
        </div>
      </Row>

      <Row title="Inspector" note="320 px, sections separated by a hairline, figures in Literata, a fixed footer for actions.">
        <div className="max-w-[340px] overflow-hidden rounded-md border border-border">
          <Inspector
            className="lg:w-full lg:border-l-0"
            footer={
              <>
                <p className="text-small text-ink-secondary">
                  Selected part: <b className="font-semibold text-select">Chapter 4</b>
                </p>
                <Button variant="secondary" icon={RotateCcw} estimate="about $0.04" fullWidth size="lg">
                  Regenerate part
                </Button>
                <Button variant="primary" icon={Check} fullWidth size="lg">
                  Approve blueprint
                </Button>
              </>
            }
          >
            <InspectorSection title="Word targets">
              <Figure value={formatNumber(bp.wordTargets.total)} unit="words" />
              <KeyValueList
                className="mt-3"
                items={[
                  { label: "10 chapters", value: "3,600 to 4,400 each" },
                  { label: "Front matter", value: formatNumber(bp.wordTargets.frontMatter) },
                  { label: "Back matter", value: formatNumber(bp.wordTargets.backMatter) },
                ]}
              />
            </InspectorSection>
            <InspectorSection title="Cost so far">
              <Figure value={formatUsd(0.46)} unit="so far" />
              <KeyValueList className="mt-3" items={bp.costBreakdown.map((c) => ({ label: c.label, value: formatUsd(c.usd) }))} />
            </InspectorSection>
            <InspectorSection title={`Claims to verify, ${bp.claims.length}`} tone="claim" icon={Flag}>
              <ul className="grid grid-cols-1 gap-1.5 text-[13.5px] leading-[19px]">
                {bp.claims.map((c) => (
                  <li key={c.id}>
                    {c.location}: {c.text}
                  </li>
                ))}
              </ul>
            </InspectorSection>
          </Inspector>
        </div>
      </Row>

      <Row title="Model picker" note="Price before the click. These are example prices; the app shows live OpenRouter prices with the date.">
        <ModelPicker
          label="Writer model"
          models={models.filter((m) => !("perImage" in m.examplePrice))}
          value={writer}
          onChange={setWriter}
          notes={{ "~anthropic/claude-sonnet-latest": "Anthropic, current writer" }}
        />
      </Row>

      <Row title="Covers" note="Drawn from data. 2:3, 3 px radius, spine shade. Hover or focus a cover to see the lift.">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 xl:grid-cols-9">
          {books.map((b) => (
            <Link key={b.id} to={`/books/${b.id}`} className="group block rounded-sm">
              <Cover title={b.title} subtitle={b.subtitle} author={getPenName(b.penNameId)?.name ?? ""} design={b.cover} lift className="w-full" />
              <p className="mt-3 text-[13px] leading-[18px] font-semibold text-ink">{b.title}</p>
            </Link>
          ))}
          <div>
            <Cover
              title="Handover"
              subtitle="Clear Communication for Busy Wards"
              author="Harni Muharami"
              design={books[3]?.cover ?? null}
              lift
              lifted
              className="w-full"
            />
            <p className="mt-3 text-[13px] leading-[18px] text-ink-secondary">Lifted</p>
          </div>
        </div>
      </Row>

      <Row title="Book content" note="Galley sheet, outline, claims in proof red, margin notes and the live stream with the gilt caret.">
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
          <div className="grid grid-cols-1 content-start gap-0.5">
            {bp.chapters.slice(2, 8).map((c) => (
              <OutlineItem
                key={c.number}
                number={c.number}
                title={c.title}
                current={selected === c.number}
                claims={c.claimIds.length}
                subheadings={c.subheadings}
                onSelect={() => setSelected(c.number)}
              />
            ))}
            <OutlineItem title="Back matter" meta="5 parts" onSelect={() => undefined} />
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-[minmax(0,1fr)_176px]">
            <GalleySheet label="Blueprint galley sheet" metaLeft="Blueprint, version 3 of 3" metaRight="Non-fiction, 10 chapters">
              <h4 className="opsz-display mt-6 font-book text-[34px] leading-[38px] font-medium tracking-[-0.02em] text-ink sm:text-display">{bp.title}</h4>
              <p className="mt-2 font-book text-[19px] leading-[26px] text-ink-secondary italic">{bp.subtitle}</p>
              <hr className="my-6 w-12 border-0 border-t border-ink" />
              {ch4 && claim && (
                <div className="vol-pencil-edge -mx-4 rounded-sm bg-select-wash px-4 pt-2.5 pb-3">
                  <h5 className="mb-1 font-book text-[17px] leading-6 font-medium text-select">
                    <span className="mr-2">4</span>
                    {ch4.title}
                  </h5>
                  <p className="font-book text-prose-sm text-ink">
                    Opens with a scene at the nurses&rsquo; station at three in the morning. <ClaimMark noteId={`${id}-claim-note`}>{claim.text}</ClaimMark> The
                    chapter slows that moment down.
                  </p>
                </div>
              )}
            </GalleySheet>
            <div className="grid grid-cols-1 content-start gap-6">
              <MarginNote kind="profile" label="Profile match">
                First person, warm and steady, as the profile asks.
              </MarginNote>
              <MarginNote kind="selection" label="Selected: chapter 4">
                Regenerate part rewrites this chapter&rsquo;s plan only.
              </MarginNote>
              <MarginNote kind="claim" label="Claim to verify" id={`${id}-claim-note`}>
                A general fact about incidents. Add a source or soften it.
              </MarginNote>
            </div>
          </div>
          <Card padding="lg" className="xl:col-span-2">
            <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-accent-text">
              <StatusChip status="writing">Chapter 6, writing now</StatusChip>
              <ClaimFlag count={1} label="1 claim in chapter 3" />
            </p>
            <div className="max-w-[640px]">
              <StreamText
                lead="So the handover begins not with the patient list but with a breath. "
                chunks={job.current.streamingChunks.slice(0, chunksShown)}
              />
            </div>
          </Card>
        </div>
      </Row>

      <Row
        title="Signature motion"
        note="150 to 300 ms, transform and opacity only. Each plays once in the app; reduced motion swaps each for a fade or nothing."
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="grid grid-cols-1 content-start gap-3">
            <div className="grid grid-cols-1 h-24 place-items-center">
              <StageTrack key={turnKey} current="writing" stages={["blueprint", "writing"]} compact />
            </div>
            <p className="text-label font-semibold">Page turn</p>
            <Button size="sm" onClick={() => setTurnKey((k) => k + 1)}>
              Replay
            </Button>
          </Card>
          <Card className="grid grid-cols-1 content-start gap-3">
            <div className="grid grid-cols-1 h-24 place-items-center px-2">
              <ProgressBar className="w-full" value={fill} max={1} live label="Ink fill demo" />
            </div>
            <p className="text-label font-semibold">Ink fill</p>
            <Button size="sm" onClick={() => setFill((f) => (f >= 0.95 ? 0.15 : Math.min(1, f + 0.2)))}>
              Add progress
            </Button>
          </Card>
          <Card className="grid grid-cols-1 content-start gap-3">
            <Link to="/books/the-calm-ward" className="group mx-auto block rounded-sm">
              <Cover title="The Calm Ward" author="Harni Muharami" design={books[2]?.cover ?? null} width={64} lift hideSubtitle />
            </Link>
            <p className="text-label font-semibold">Cover lift</p>
            <p className="text-small text-ink-secondary">Hover or focus the cover.</p>
          </Card>
          <Card className="grid grid-cols-1 content-start gap-3">
            <div className="min-h-24">
              <StreamText size="prose-sm" chunks={job.current.streamingChunks.slice(Math.max(0, chunksShown - 2), chunksShown)} />
            </div>
            <p className="text-label font-semibold">Ink in</p>
            <p className="text-small text-ink-secondary">Chunks arrive from the running writing job.</p>
          </Card>
          <Card className="grid grid-cols-1 content-start gap-3">
            <div className="grid grid-cols-1 gap-0.5">
              {[3, 4, 5].map((n) => (
                <OutlineItem key={n} number={n} title={`Chapter ${n}`} current={selected === n} onSelect={() => setSelected(n)} />
              ))}
            </div>
            <p className="text-label font-semibold">Blue pencil</p>
            <p className="text-small text-ink-secondary">Click a chapter.</p>
          </Card>
        </div>
      </Row>
    </div>
  );
}

export default function ComponentsPage() {
  return (
    <div className="mx-auto grid w-full max-w-[1280px] grid-cols-1 gap-8 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader
        title="Components"
        summary="Every shared control in its states, in both themes. Primary gilt appears once per screen, blue pencil marks selection and focus, proof red is kept for claims and errors."
      />
      {(["light", "dark"] as const).map((t) => (
        <section
          key={t}
          data-theme={t}
          aria-labelledby={`theme-${t}`}
          className={cn("grid grid-cols-1 gap-6 rounded-lg border border-border bg-canvas p-4 text-ink sm:p-8")}
        >
          <h2 id={`theme-${t}`} className="font-book text-heading text-ink">
            {t === "light" ? "Light theme" : "Dark theme"}
          </h2>
          <Gallery theme={t} />
        </section>
      ))}
    </div>
  );
}

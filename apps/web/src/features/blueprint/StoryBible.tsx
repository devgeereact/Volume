import { useMemo, useState, type ReactNode } from "react";
import { MapPin, Plus, Trash2, Users } from "lucide-react";
import { Banner, Button, IconButton, Input, Modal, SegmentedControl, Select, Skeleton, Textarea } from "../../components/ui";
import type { ApiLedgerItem, StoryBible, StoryCharacter } from "../../api/types";
import { cn } from "../../lib/cn";

/* The fiction story bible (D-043) and the character and setting ledger (P6-5).
   The bible is the plan: who the people are, where the story happens, the timeline and the rules of the
   world. It lives in the blueprint data as `storyBible`, so an edit saves a new blueprint version.
   The ledger is the record: what the writer noted about each character and setting as each chapter
   was saved. It is read only. */

export type Tense = "past" | "present";

const text = (v: unknown): string => (typeof v === "string" ? v : "");
const texts = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : []);
const rec = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export function emptyCharacter(): StoryCharacter {
  return { name: "", role: "", want: "", need: "", flaw: "", voiceNotes: "", appearance: "" };
}

export function emptyBible(): StoryBible {
  return { logline: "", themes: [], characters: [], settings: [], timeline: [], worldRules: [], povPlan: "", ending: "" };
}

/** The blueprint's `storyBible`, with every field present, or null when the plan has none. Extra keys are kept. */
export function storyBibleOf(v: unknown): StoryBible | null {
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const b = rec(v);
  return {
    ...b,
    logline: text(b["logline"]),
    themes: texts(b["themes"]),
    characters: (Array.isArray(b["characters"]) ? b["characters"] : []).map((c) => {
      const r = rec(c);
      return {
        ...r,
        name: text(r["name"]),
        role: text(r["role"]),
        want: text(r["want"]),
        need: text(r["need"]),
        flaw: text(r["flaw"]),
        voiceNotes: text(r["voiceNotes"]),
        appearance: text(r["appearance"]),
      };
    }),
    settings: (Array.isArray(b["settings"]) ? b["settings"] : []).map((s) => {
      const r = rec(s);
      return { ...r, name: text(r["name"]), description: text(r["description"]) };
    }),
    timeline: texts(b["timeline"]),
    worldRules: texts(b["worldRules"]),
    povPlan: text(b["povPlan"]),
    ending: text(b["ending"]),
  };
}

/** The bible as it is saved: blank characters and settings dropped, lists trimmed. */
export function cleanBible(b: StoryBible): StoryBible {
  const trim = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean);
  return {
    ...b,
    logline: b.logline.trim(),
    themes: trim(b.themes),
    characters: b.characters.filter((c) => c.name.trim()).map((c) => ({ ...c, name: c.name.trim() })),
    settings: b.settings.filter((s) => s.name.trim()).map((s) => ({ ...s, name: s.name.trim(), description: s.description.trim() })),
    timeline: trim(b.timeline),
    worldRules: trim(b.worldRules),
    povPlan: b.povPlan.trim(),
    ending: b.ending.trim(),
  };
}

export function tenseLabel(t: Tense | null | undefined): string {
  return t === "present" ? "Present tense" : "Past tense";
}

/* ---------- View ---------- */

/** The bible on the galley sheet: logline, people, places, timeline and rules. */
export function StoryBibleView({ bible, pov, tense }: { bible: StoryBible; pov: string | null; tense: Tense | null }) {
  return (
    <div className="grid gap-6">
      <Rows
        items={[
          { label: "Logline", value: bible.logline },
          { label: "Point of view", value: [pov || "Close third person", tenseLabel(tense).toLowerCase()].join(", ") },
          { label: "Viewpoint plan", value: bible.povPlan },
          { label: "Ending", value: bible.ending },
        ]}
      />
      {bible.themes.length > 0 && <Bullets title="Themes" items={bible.themes} />}
      <div className="grid gap-2">
        <p className="text-small text-ink-secondary">Characters</p>
        {bible.characters.length === 0 ? (
          <p className="text-small text-ink-tertiary">No characters in the plan yet.</p>
        ) : (
          <ul className="grid gap-3 @min-[640px]:grid-cols-2">
            {bible.characters.map((c, i) => (
              <li key={`${i}-${c.name}`} className="grid content-start gap-1.5 rounded-md border border-border bg-canvas p-4">
                <p className="font-book text-heading text-ink">{c.name}</p>
                {c.role && <p className="text-small text-ink-secondary">{c.role}</p>}
                <dl className="mt-1 grid gap-1">
                  {(
                    [
                      ["Wants", c.want],
                      ["Needs", c.need],
                      ["Flaw", c.flaw],
                      ["Voice", c.voiceNotes],
                      ["Looks", c.appearance],
                    ] as const
                  )
                    .filter(([, v]) => v)
                    .map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
                        <dt className="text-small text-ink-secondary">{k}</dt>
                        <dd className="font-book text-prose-sm text-ink">{v}</dd>
                      </div>
                    ))}
                </dl>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="grid gap-2">
        <p className="text-small text-ink-secondary">Settings</p>
        {bible.settings.length === 0 ? (
          <p className="text-small text-ink-tertiary">No settings in the plan yet.</p>
        ) : (
          <dl className="grid gap-2.5">
            {bible.settings.map((s, i) => (
              <div key={`${i}-${s.name}`} className="grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
                <dt className="text-label text-ink">{s.name}</dt>
                <dd className="font-book text-prose-sm text-ink">{s.description || <span className="text-ink-tertiary">No description</span>}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {bible.timeline.length > 0 && <Bullets title="Timeline" items={bible.timeline} ordered />}
      {bible.worldRules.length > 0 && <Bullets title="Rules of the world" items={bible.worldRules} />}
    </div>
  );
}

function Rows({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-2.5">
      {items.map((i) => (
        <div key={i.label} className="grid gap-0.5 sm:grid-cols-[150px_minmax(0,1fr)] sm:gap-4">
          <dt className="text-small text-ink-secondary">{i.label}</dt>
          <dd className={cn("font-book text-prose-sm [overflow-wrap:anywhere]", i.value ? "text-ink" : "text-ink-tertiary")}>{i.value || "Not set yet"}</dd>
        </div>
      ))}
    </dl>
  );
}

function Bullets({ title, items, ordered }: { title: string; items: string[]; ordered?: boolean }) {
  const List = ordered ? "ol" : "ul";
  return (
    <div className="grid gap-1.5">
      <p className="text-small text-ink-secondary">{title}</p>
      <List className="grid gap-1.5">
        {items.map((t, i) => (
          <li key={`${i}-${t}`} className="border-l-2 border-border-strong pl-3 font-book text-prose-sm text-ink">
            {ordered ? <span className="num mr-2 font-ui text-small text-ink-tertiary">{i + 1}.</span> : null}
            {t}
          </li>
        ))}
      </List>
    </div>
  );
}

/* ---------- Edit ---------- */

const lines = (v: string): string[] => v.split("\n");
const joined = (xs: string[]): string => xs.join("\n");

/** Edit every part of the bible. Saving makes a new blueprint version; the open one stays in Versions. */
export function StoryBibleEditor({
  open,
  initial,
  description,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  initial: StoryBible;
  description?: string | undefined;
  saving: boolean;
  error?: ReactNode;
  onClose: () => void;
  onSave: (bible: StoryBible) => void;
}) {
  const [draft, setDraft] = useState<StoryBible>(initial);
  const [opened, setOpened] = useState(open);
  // Each time the dialog opens it starts from the current plan (adjusted during render, not in an effect).
  if (open !== opened) {
    setOpened(open);
    if (open) setDraft(initial);
  }
  const set = <K extends keyof StoryBible>(k: K, v: StoryBible[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setChar = (i: number, patch: Partial<StoryCharacter>) =>
    setDraft((d) => ({ ...d, characters: d.characters.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const setPlace = (i: number, patch: { name?: string; description?: string }) =>
    setDraft((d) => ({ ...d, settings: d.settings.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const unnamed =
    draft.characters.some((c) => !c.name.trim() && (c.role || c.want || c.need || c.flaw)) || draft.settings.some((s) => !s.name.trim() && s.description);

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Edit the story bible"
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={saving}
            loadingLabel="Saving"
            disabledReason={unnamed ? "Give every character and setting a name." : undefined}
            onClick={() => onSave(cleanBible(draft))}
          >
            Save the story bible
          </Button>
        </>
      }
    >
      <div className="grid gap-5">
        {error}
        <Textarea
          label="Logline"
          rows={2}
          value={draft.logline}
          onChange={(e) => set("logline", e.target.value)}
          hint="One or two sentences: who wants what, and what stands in the way."
        />
        <Textarea label="Themes" rows={3} value={joined(draft.themes)} onChange={(e) => set("themes", lines(e.target.value))} hint="One theme per line." />
        <Textarea
          label="Viewpoint plan"
          rows={2}
          value={draft.povPlan}
          onChange={(e) => set("povPlan", e.target.value)}
          hint="Whose eyes each part is seen through."
        />

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-label text-ink">Characters</legend>
          {draft.characters.length === 0 && <p className="text-small text-ink-tertiary">No characters yet. Add the first one.</p>}
          {draft.characters.map((c, i) => (
            <div key={i} className="grid gap-3 rounded-md border border-border bg-canvas p-4">
              <div className="flex items-end gap-2">
                <Input
                  className="flex-1"
                  label={`Character ${i + 1} name`}
                  value={c.name}
                  maxLength={120}
                  onChange={(e) => setChar(i, { name: e.target.value })}
                />
                <IconButton
                  icon={Trash2}
                  label={`Remove ${c.name || `character ${i + 1}`}`}
                  onClick={() => setDraft((d) => ({ ...d, characters: d.characters.filter((_, j) => j !== i) }))}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Role" value={c.role} onChange={(e) => setChar(i, { role: e.target.value })} hint="For example: lead, rival, mentor" />
                <Input label="Flaw" value={c.flaw} onChange={(e) => setChar(i, { flaw: e.target.value })} />
                <Textarea label="Wants" rows={2} value={c.want} onChange={(e) => setChar(i, { want: e.target.value })} />
                <Textarea label="Needs" rows={2} value={c.need} onChange={(e) => setChar(i, { need: e.target.value })} />
                <Textarea label="Voice notes" rows={2} value={c.voiceNotes} onChange={(e) => setChar(i, { voiceNotes: e.target.value })} />
                <Textarea label="Appearance" rows={2} value={c.appearance} onChange={(e) => setChar(i, { appearance: e.target.value })} />
              </div>
            </div>
          ))}
          <div>
            <Button size="sm" icon={Plus} onClick={() => setDraft((d) => ({ ...d, characters: [...d.characters, emptyCharacter()] }))}>
              Add a character
            </Button>
          </div>
        </fieldset>

        <fieldset className="grid gap-3">
          <legend className="mb-2 text-label text-ink">Settings</legend>
          {draft.settings.length === 0 && <p className="text-small text-ink-tertiary">No settings yet. Add the first one.</p>}
          {draft.settings.map((s, i) => (
            <div key={i} className="grid gap-3 rounded-md border border-border bg-canvas p-4">
              <div className="flex items-end gap-2">
                <Input
                  className="flex-1"
                  label={`Setting ${i + 1} name`}
                  value={s.name}
                  maxLength={120}
                  onChange={(e) => setPlace(i, { name: e.target.value })}
                />
                <IconButton
                  icon={Trash2}
                  label={`Remove ${s.name || `setting ${i + 1}`}`}
                  onClick={() => setDraft((d) => ({ ...d, settings: d.settings.filter((_, j) => j !== i) }))}
                />
              </div>
              <Textarea label="Description" rows={2} value={s.description} onChange={(e) => setPlace(i, { description: e.target.value })} />
            </div>
          ))}
          <div>
            <Button size="sm" icon={Plus} onClick={() => setDraft((d) => ({ ...d, settings: [...d.settings, { name: "", description: "" }] }))}>
              Add a setting
            </Button>
          </div>
        </fieldset>

        <Textarea
          label="Timeline"
          rows={4}
          value={joined(draft.timeline)}
          onChange={(e) => set("timeline", lines(e.target.value))}
          hint="One event per line, in story order."
        />
        <Textarea
          label="Rules of the world"
          rows={3}
          value={joined(draft.worldRules)}
          onChange={(e) => set("worldRules", lines(e.target.value))}
          hint="One rule per line. The writer never breaks these."
        />
        <Textarea label="Ending" rows={2} value={draft.ending} onChange={(e) => set("ending", e.target.value)} />
      </div>
    </Modal>
  );
}

/** Point of view and tense for a fiction book (book settings pov and tense). */
export function NarrationEditor({
  open,
  pov,
  tense,
  saving,
  error,
  onClose,
  onSave,
}: {
  open: boolean;
  pov: string;
  tense: Tense;
  saving: boolean;
  error?: ReactNode;
  onClose: () => void;
  onSave: (v: { pov: string; tense: Tense }) => void;
}) {
  const [draft, setDraft] = useState({ pov, tense });
  const [opened, setOpened] = useState(open);
  if (open !== opened) {
    setOpened(open);
    if (open) setDraft({ pov, tense });
  }
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Point of view and tense"
      description="The planner and the writer use these for every chapter written from now on. Chapters already written keep their text."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={saving} loadingLabel="Saving" onClick={() => onSave({ pov: draft.pov.trim(), tense: draft.tense })}>
            Save point of view
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {error}
        <Input
          label="Point of view"
          value={draft.pov}
          maxLength={200}
          onChange={(e) => setDraft((d) => ({ ...d, pov: e.target.value }))}
          hint="For example: close third person, or first person, Mara. Leave blank for close third person."
        />
        <Select
          label="Tense"
          value={draft.tense}
          onChange={(v) => setDraft((d) => ({ ...d, tense: v === "present" ? "present" : "past" }))}
          options={[
            { value: "past", label: "Past tense" },
            { value: "present", label: "Present tense" },
          ]}
        />
      </div>
    </Modal>
  );
}

/* ---------- Ledger ---------- */

type LedgerKind = "character" | "setting";

interface LedgerGroup {
  key: string;
  notes: { detail: string; where: string | null }[];
}

/** Ledger rows grouped by name, in the order the writer first noted them. */
export function groupLedger(items: ApiLedgerItem[], kind: LedgerKind, sectionName: (id: string) => string | null): LedgerGroup[] {
  const groups = new Map<string, LedgerGroup>();
  for (const it of items) {
    if (it.kind !== kind || !it.key.trim()) continue;
    const id = it.key.trim().toLowerCase();
    const g = groups.get(id) ?? { key: it.key.trim(), notes: [] };
    if (it.detail?.trim()) g.notes.push({ detail: it.detail.trim(), where: it.sectionId ? sectionName(it.sectionId) : null });
    groups.set(id, g);
  }
  return [...groups.values()];
}

/**
 * The character and setting ledger: what the writer recorded about each one, chapter by chapter.
 * Names in the ledger that are not in the story bible are marked, so a stray character is easy to spot.
 */
export function StoryLedgerPanel({
  state,
  items,
  bible,
  sectionName,
  onRetry,
}: {
  state: "loading" | "error" | "ready";
  items: ApiLedgerItem[];
  bible: StoryBible | null;
  sectionName: (id: string) => string | null;
  onRetry?: (() => void) | undefined;
}) {
  const [kind, setKind] = useState<LedgerKind>("character");
  const groups = useMemo(() => groupLedger(items, kind, sectionName), [items, kind, sectionName]);
  // Planned names by lower case, so a ledger key the writer lower-cased shows with the bible's spelling.
  const planned = useMemo(
    () => new Map((kind === "character" ? (bible?.characters ?? []) : (bible?.settings ?? [])).map((x) => [x.name.trim().toLowerCase(), x.name.trim()])),
    [bible, kind],
  );
  const counts = useMemo(
    () => ({
      character: groupLedger(items, "character", () => null).length,
      setting: groupLedger(items, "setting", () => null).length,
    }),
    [items],
  );

  return (
    <section aria-labelledby="story-ledger-title" className="grid gap-4 rounded-md border border-border bg-sheet p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="grid gap-0.5">
          <h2 id="story-ledger-title" className="font-book text-heading text-ink">
            Characters and settings so far
          </h2>
          <p className="text-small text-ink-secondary">What the writer noted as each chapter was saved. The continuity check reads this ledger.</p>
        </div>
        <SegmentedControl
          label="Ledger kind"
          size="sm"
          value={kind}
          onChange={setKind}
          options={[
            { value: "character", label: `Characters${state === "ready" ? ` (${counts.character})` : ""}`, icon: Users },
            { value: "setting", label: `Settings${state === "ready" ? ` (${counts.setting})` : ""}`, icon: MapPin },
          ]}
        />
      </div>
      {state === "loading" && (
        <div role="status" aria-label="Loading the ledger" className="grid gap-2">
          <Skeleton className="w-2/5" />
          <Skeleton className="w-full" />
          <Skeleton className="w-3/5" />
        </div>
      )}
      {state === "error" && (
        <Banner
          tone="error"
          title="Could not load the ledger"
          action={
            onRetry ? (
              <Button size="sm" onClick={onRetry}>
                Retry
              </Button>
            ) : undefined
          }
        >
          The Volume server did not send it. Nothing has been lost.
        </Banner>
      )}
      {state === "ready" && groups.length === 0 && (
        <p className="text-small text-ink-secondary">
          {kind === "character" ? "No characters noted yet." : "No settings noted yet."} The ledger fills in as the writer saves each chapter.
        </p>
      )}
      {state === "ready" && groups.length > 0 && (
        <ul className="grid gap-3">
          {groups.map((g) => {
            const known = planned.size === 0 || planned.has(g.key.toLowerCase());
            return (
              <li key={g.key} className="grid gap-1.5 border-l-2 border-border-strong pl-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-label text-ink">{planned.get(g.key.toLowerCase()) ?? g.key}</span>
                  {!known && (
                    <span className="inline-flex h-6 items-center rounded-pill bg-accent-wash px-2.5 text-caption text-accent-text">
                      Not in the story bible
                    </span>
                  )}
                </p>
                {g.notes.length === 0 ? (
                  <p className="text-small text-ink-tertiary">Named, with no notes yet.</p>
                ) : (
                  <ul className="grid gap-1">
                    {g.notes.map((n, i) => (
                      <li key={i} className="font-book text-prose-sm text-ink">
                        {n.where && <span className="mr-2 font-ui text-small text-ink-secondary">{n.where}:</span>}
                        {n.detail}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

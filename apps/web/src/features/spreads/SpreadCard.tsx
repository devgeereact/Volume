import { useId, useRef, useState, type KeyboardEvent } from "react";
import { Check, Paintbrush, PenLine } from "lucide-react";
import { SPREAD_LAYOUTS, isSpreadLayout, type SpreadLayout, type SpreadView } from "../../api/picture";
import { Button, Select, Textarea } from "../../components/ui";
import { cn } from "../../lib/cn";
import type { SpreadOverlay } from "./geometry";
import { WORDS_PER_SPREAD, layoutLabels, pictureEstimate } from "./model";
import { SpreadPicture } from "./SpreadPicture";

interface SpreadCardProps {
  spread: SpreadView;
  overlay: SpreadOverlay;
  showSafeArea: boolean;
  painting: number | null;
  canWrite: boolean;
  onSaveText: (text: string) => Promise<void>;
  onLayout: (layout: SpreadLayout) => Promise<void>;
  onPaint: () => void;
  /** One picture's cost in words; the demo figure when left out. */
  pictureCost?: string | undefined;
}

const countWords = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

/** One spread on the board: the picture with its text box, the story text (editable), the layout and Paint again. */
export function SpreadCard({
  spread,
  overlay,
  showSafeArea,
  painting,
  canWrite,
  onSaveText,
  onLayout,
  onPaint,
  pictureCost = pictureEstimate,
}: SpreadCardProps) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(spread.text);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const words = countWords(draft);

  function startEdit() {
    setDraft(spread.text);
    setError(null);
    setSaved(null);
    setEditing(true);
    requestAnimationFrame(() => textRef.current?.focus());
  }

  function cancel() {
    setEditing(false);
    setError(null);
    requestAnimationFrame(() => editRef.current?.focus());
  }

  function save() {
    if (draft.trim() === spread.text.trim()) {
      cancel();
      return;
    }
    setSaving(true);
    setError(null);
    onSaveText(draft.trim()).then(
      () => {
        setSaving(false);
        setEditing(false);
        setSaved("Text saved");
        requestAnimationFrame(() => editRef.current?.focus());
      },
      (e: unknown) => {
        setSaving(false);
        setError(e instanceof Error ? e.message : "The text was not saved. Try again.");
      },
    );
  }

  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      save();
    }
  }

  function changeLayout(v: string) {
    if (!isSpreadLayout(v) || v === spread.layout) return;
    setSaved(null);
    setError(null);
    onLayout(v).then(
      () => setSaved("Layout saved"),
      (e: unknown) => setError(e instanceof Error ? e.message : "The layout was not saved. Try again."),
    );
  }

  return (
    <article aria-labelledby={headingId} className="grid content-start gap-3 rounded-md border border-border bg-sheet p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 id={headingId} className="text-subhead text-ink">
          Spread {spread.n}
        </h3>
        <p className="num text-small text-ink-secondary">
          {spread.wordCount} {spread.wordCount === 1 ? "word" : "words"}
        </p>
      </header>

      <SpreadPicture spread={spread} overlay={overlay} showSafeArea={showSafeArea} painting={painting} />

      {spread.sceneSummary && <p className="text-small text-ink-secondary">Scene: {spread.sceneSummary}</p>}
      {spread.characters.length > 0 && <p className="text-small text-ink-tertiary">In the picture: {spread.characters.join(", ")}</p>}

      {editing ? (
        <div className="grid gap-2">
          <Textarea
            label={`Text for spread ${spread.n}`}
            prose
            rows={4}
            value={draft}
            maxLength={5000}
            ref={textRef}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            error={error ?? undefined}
            hint={`${words} ${words === 1 ? "word" : "words"}. ${WORDS_PER_SPREAD.min} to ${WORDS_PER_SPREAD.max} suit one spread. Esc cancels.`}
          />
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={Check} loading={saving} loadingLabel="Saving" onClick={save}>
              Save text
            </Button>
            <Button size="sm" variant="ghost" onClick={cancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className={cn("font-book text-prose-sm text-ink", !spread.text.trim() && "text-ink-tertiary italic")}>{spread.text.trim() || "No text yet."}</p>
      )}

      <div className="flex flex-wrap items-end gap-x-3 gap-y-2 border-t border-border pt-3">
        {canWrite ? (
          <>
            <Select
              label="Layout"
              className="min-w-52 flex-1"
              options={SPREAD_LAYOUTS.map((l) => ({ value: l, label: layoutLabels[l] }))}
              value={spread.layout}
              onChange={changeLayout}
            />
            {!editing && (
              <Button ref={editRef} size="sm" variant="ghost" icon={PenLine} onClick={startEdit} className="mb-1">
                Edit text
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              icon={Paintbrush}
              className="mb-1"
              estimate={pictureCost}
              onClick={onPaint}
              disabledReason={
                painting !== null
                  ? "A new picture is being made."
                  : !spread.imagePrompt
                    ? "This spread has no scene prompt yet. Make the picture book first."
                    : undefined
              }
            >
              Paint again
            </Button>
          </>
        ) : (
          <p className="text-small text-ink-secondary">Layout: {layoutLabels[spread.layout]}</p>
        )}
      </div>
      <p role="status" className={cn("min-h-0 text-small", error && !editing ? "text-claim" : "text-success")}>
        {!editing && error ? error : saved}
      </p>
    </article>
  );
}

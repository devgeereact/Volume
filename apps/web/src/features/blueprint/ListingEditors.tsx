import { useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button, Input, Textarea } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";

/* Listing fields on the blueprint's galley: Amazon description with its 4,000 character counter
   (config/kdp-rules listing.description.maxChars, HTML counts), 3 categories and 7 keywords
   (listing.categories, listing.keywords). */

export const DESCRIPTION_MAX = 4000;
export const KEYWORDS_MAX = 7;
export const CATEGORIES_COUNT = 3;

export function DescriptionEditor({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  const over = value.length > DESCRIPTION_MAX;
  return (
    <div className="grid gap-2">
      <Textarea
        label="Amazon description"
        rows={9}
        value={value}
        disabled={disabled}
        disabledReason={disabled ? "The blueprint is approved and locked." : undefined}
        onChange={(e) => onChange(e.target.value)}
        error={over ? `${formatNumber(value.length - DESCRIPTION_MAX)} characters over the limit. Shorten it before you approve.` : undefined}
        hint="Line breaks become paragraphs. Bold, italics and lists are allowed; HTML tags count towards the limit."
      />
      <div className="grid gap-1">
        <span className={cn("num text-small", over ? "text-claim" : "text-ink-secondary")}>
          {formatNumber(value.length)} of {formatNumber(DESCRIPTION_MAX)} characters
        </span>
        <span aria-hidden className="block h-[3px] overflow-hidden rounded-pill bg-sunken">
          <span
            className={cn("block h-full origin-left transition-transform duration-(--vol-dur-slow) ease-out", over ? "bg-claim" : "bg-progress")}
            style={{ transform: `scaleX(${Math.min(1, value.length / DESCRIPTION_MAX)})` }}
          />
        </span>
      </div>
    </div>
  );
}

export function CategoriesEditor({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  return (
    <div className="grid gap-3">
      {value.map((c, i) => (
        <Input
          key={i}
          label={`Category ${i + 1}`}
          value={c}
          disabled={disabled}
          onChange={(e) => onChange(value.map((x, j) => (j === i ? e.target.value : x)))}
          error={c.trim() ? undefined : "Add a category, or ask the writer for a suggestion."}
        />
      ))}
      <p className="text-small text-ink-tertiary">Suggestions only. You pick each category in KDP's own chooser.</p>
    </div>
  );
}

export function KeywordsEditor({ value, onChange, disabled }: { value: string[]; onChange: (v: string[]) => void; disabled: boolean }) {
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const full = value.length >= KEYWORDS_MAX;

  function add(e: FormEvent) {
    e.preventDefault();
    const k = draft.trim();
    if (!k) {
      setError("Type a keyword or short phrase first.");
      return;
    }
    if (value.some((v) => v.toLowerCase() === k.toLowerCase())) {
      setError("That keyword is already in the list.");
      return;
    }
    onChange([...value, k]);
    setDraft("");
    setError(null);
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-label text-ink">Keywords</span>
        <span className={cn("num text-small", value.length === KEYWORDS_MAX ? "text-success" : "text-accent-text")}>
          {value.length} of {KEYWORDS_MAX}
        </span>
      </div>
      <ul className="flex flex-wrap gap-2" aria-label="Keywords">
        {value.map((k) => (
          <li key={k} className="inline-flex h-[30px] items-center gap-1 rounded-pill border border-border-strong bg-sheet pr-1 pl-3 text-[13px] text-ink">
            {k}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onChange(value.filter((v) => v !== k))}
              aria-label={`Remove keyword ${k}`}
              className="hit-44 grid size-6 place-items-center rounded-full text-ink-tertiary hover:bg-sunken hover:text-ink disabled:cursor-not-allowed"
            >
              <X size={12} strokeWidth={2} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
      {!full && !disabled && (
        <form onSubmit={add} className="flex items-start gap-2">
          <Input
            label="Add a keyword"
            className="flex-1"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            error={error ?? undefined}
            hint={`${KEYWORDS_MAX - value.length} more needed. Avoid quality claims and words like "new".`}
          />
          <Button type="submit" icon={Plus} className="mt-7">
            Add
          </Button>
        </form>
      )}
    </div>
  );
}

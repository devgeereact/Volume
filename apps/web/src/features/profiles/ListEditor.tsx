import { useId, useState, type FormEvent } from "react";
import { Plus, X } from "lucide-react";
import { Button, IconButton } from "../../components/ui";
import { fieldBoxClasses } from "../../components/ui/FieldShell";
import { cn } from "../../lib/cn";

interface ListEditorProps {
  label: string;
  hint?: string | undefined;
  items: string[];
  onChange: (items: string[]) => void;
  /** Spoken and visible label of the add field. */
  addLabel: string;
  placeholder?: string | undefined;
  /** chips: a wrapping row of pills (tone, banned phrases). rows: one line each (credentials). */
  variant?: "chips" | "rows" | undefined;
  emptyText?: string | undefined;
}

/** Edit a short list of strings: remove any item, add one with Enter or the Add button. Duplicates are ignored. */
export function ListEditor({ label, hint, items, onChange, addLabel, placeholder, variant = "chips", emptyText }: ListEditorProps) {
  const id = useId();
  const [text, setText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  function add(e: FormEvent) {
    e.preventDefault();
    const v = text.trim();
    if (!v) return;
    if (items.some((i) => i.toLowerCase() === v.toLowerCase())) {
      setNote(`“${v}” is already on the list.`);
      return;
    }
    onChange([...items, v]);
    setText("");
    setNote(null);
  }

  return (
    <fieldset className="grid gap-2.5">
      <legend className="mb-1 text-label text-ink">{label}</legend>
      {hint && <p className="-mt-1.5 text-small text-ink-tertiary">{hint}</p>}
      {items.length === 0 ? (
        <p className="text-small text-ink-tertiary">{emptyText ?? "None yet."}</p>
      ) : variant === "chips" ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item}
              className="inline-flex h-8 items-center gap-1 rounded-pill border border-border bg-sheet pr-0.5 pl-3 text-[13px] font-medium text-ink"
            >
              {item}
              <IconButton icon={X} size="sm" label={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className="grid overflow-hidden rounded-md border border-border bg-sheet">
          {items.map((item) => (
            <li key={item} className="flex min-h-11 items-center gap-2 border-t border-border pr-1.5 pl-3 text-body text-ink first:border-t-0">
              <span className="flex-1">{item}</span>
              <IconButton icon={X} size="sm" label={`Remove ${item}`} onClick={() => onChange(items.filter((i) => i !== item))} />
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <span className="grid min-w-0 flex-1 basis-56 gap-1.5">
          <label htmlFor={id} className="text-small text-ink-secondary">
            {addLabel}
          </label>
          <input
            id={id}
            value={text}
            placeholder={placeholder}
            onChange={(e) => {
              setText(e.target.value);
              setNote(null);
            }}
            aria-describedby={note ? `${id}-note` : undefined}
            className={cn(fieldBoxClasses({ error: false, disabled: false }), "h-11")}
          />
        </span>
        <Button type="submit" icon={Plus} disabledReason={text.trim() ? undefined : "Type something to add first"}>
          Add
        </Button>
      </form>
      {note && (
        <p id={`${id}-note`} role="status" className="text-small text-ink-secondary">
          {note}
        </p>
      )}
    </fieldset>
  );
}

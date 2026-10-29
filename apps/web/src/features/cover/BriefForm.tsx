import { useState } from "react";
import { X } from "lucide-react";
import { Button, Chip, Textarea } from "../../components/ui";
import { genreOptions, moodOptions, type CoverBrief } from "./concepts";
import { Section } from "./Studio";

/** The cover brief as a form for the studio's inspector: genre and mood chips, colours, symbols and what to avoid. */
export function BriefForm({ brief, onChange }: { brief: CoverBrief; onChange: (b: CoverBrief) => void }) {
  const [colourText, setColourText] = useState("");
  const [symbolText, setSymbolText] = useState("");
  const toggle = (key: "genre" | "mood", v: string) =>
    onChange({ ...brief, [key]: brief[key].includes(v) ? brief[key].filter((x) => x !== v) : [...brief[key], v] });

  return (
    <>
      <p className="pb-3 text-[12.5px] leading-[1.45] text-ink-2 max-[1240px]:col-span-full">
        Written from the blueprint and the pen name's brand. Change anything before making concepts.
      </p>
      <Section title="Genre signals">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Genre signals">
          {genreOptions.map((g) => (
            <Chip key={g} pressed={brief.genre.includes(g)} onClick={() => toggle("genre", g)}>
              {g}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Mood">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mood">
          {moodOptions.map((m) => (
            <Chip key={m} pressed={brief.mood.includes(m)} onClick={() => toggle("mood", m)}>
              {m}
            </Chip>
          ))}
        </div>
      </Section>
      <Section title="Colours and symbols">
        <TagField
          label="Colours"
          items={brief.colours}
          text={colourText}
          setText={setColourText}
          onChange={(colours) => onChange({ ...brief, colours })}
          placeholder="For example: plum"
        />
        <TagField
          label="Symbols"
          items={brief.symbols}
          text={symbolText}
          setText={setSymbolText}
          onChange={(symbols) => onChange({ ...brief, symbols })}
          placeholder="For example: open door"
        />
      </Section>
      <Section title="Avoid">
        <Textarea label="What to avoid" rows={3} value={brief.avoid} onChange={(e) => onChange({ ...brief, avoid: e.target.value })} />
      </Section>
    </>
  );
}

function TagField({
  label,
  items,
  text,
  setText,
  onChange,
  placeholder,
}: {
  label: string;
  items: string[];
  text: string;
  setText: (s: string) => void;
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const id = `tag-${label.toLowerCase()}`;
  function add() {
    const v = text.trim();
    if (v && !items.includes(v)) onChange([...items, v]);
    setText("");
  }
  return (
    <div className="grid content-start gap-1.5">
      <label htmlFor={id} className="text-[12.5px] text-ink-2">
        {label}
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          className="h-10 min-w-0 flex-1 rounded-[10px] border border-line-2 bg-panel-2 px-2.5 text-[13px] text-ink placeholder:text-ink-3 focus:border-mint focus:shadow-[0_0_0_3px_var(--vol-mint-wash)] focus:outline-none"
        />
        <Button size="sm" onClick={add}>
          Add
        </Button>
      </div>
      {items.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {items.map((it) => (
            <li key={it} className="inline-flex h-8 items-center gap-1 rounded-pill bg-soft pr-1 pl-3 text-[12.5px] text-ink">
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((x) => x !== it))}
                className="grid size-6 place-items-center rounded-full text-ink-2 hit-44 hover:bg-line hover:text-ink"
              >
                <X size={12} strokeWidth={2} aria-hidden />
                <span className="sr-only">Remove {it}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

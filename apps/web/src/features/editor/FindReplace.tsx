import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp, Replace, Undo2, X } from "lucide-react";
import { Button, Checkbox, IconButton, Input, SegmentedControl } from "../../components/ui";

export type FindScope = "section" | "book";

export interface FindState {
  query: string;
  replace: string;
  matchCase: boolean;
  wholeWord: boolean;
  scope: FindScope;
}

interface FindReplaceProps {
  state: FindState;
  onChange: (patch: Partial<FindState>) => void;
  onClose: () => void;
  countInSection: number;
  countInBook: number;
  sectionsWithMatches: number;
  current: number;
  onStep: (dir: 1 | -1) => void;
  onReplaceOne: () => void;
  onReplaceAll: () => void;
  result: string | null;
  onUndo: (() => void) | null;
}

/** Find and replace across one section or the whole book, with match case, whole word, count and undo. */
export function FindReplace({
  state,
  onChange,
  onClose,
  countInSection,
  countInBook,
  sectionsWithMatches,
  current,
  onStep,
  onReplaceOne,
  onReplaceAll,
  result,
  onUndo,
}: FindReplaceProps) {
  const findRef = useRef<HTMLInputElement>(null);
  useEffect(() => findRef.current?.focus(), []);
  const count = state.scope === "section" ? countInSection : countInBook;
  const summary = !state.query
    ? "Type a word or phrase to find."
    : count === 0
      ? "No matches."
      : state.scope === "section"
        ? `${current + 1} of ${count} in this section`
        : `${countInBook} ${countInBook === 1 ? "match" : "matches"} in ${sectionsWithMatches} ${sectionsWithMatches === 1 ? "section" : "sections"}`;

  return (
    <section
      aria-label="Find and replace"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
        if (e.key === "Enter" && e.target instanceof HTMLInputElement && e.target === findRef.current) {
          e.preventDefault();
          onStep(e.shiftKey ? -1 : 1);
        }
      }}
      className="rounded-lg border border-line bg-panel-2 p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-subhead text-ink">Find and replace</h2>
        <IconButton icon={X} label="Close find and replace" size="sm" variant="ghost" onClick={onClose} shortcut={["Esc"]} />
      </div>
      <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        <Input ref={findRef} label="Find" value={state.query} onChange={(e) => onChange({ query: e.target.value })} autoComplete="off" />
        <Input label="Replace with" value={state.replace} onChange={(e) => onChange({ replace: e.target.value })} autoComplete="off" />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1">
        <Checkbox label="Match case" checked={state.matchCase} onChange={(v) => onChange({ matchCase: v })} />
        <Checkbox label="Whole word" checked={state.wholeWord} onChange={(v) => onChange({ wholeWord: v })} />
        <SegmentedControl
          size="sm"
          label="Where to look"
          value={state.scope}
          onChange={(v) => onChange({ scope: v })}
          options={[
            { value: "section", label: "This section" },
            { value: "book", label: "Whole book" },
          ]}
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <p role="status" aria-live="polite" className="num mr-auto text-small text-ink-secondary">
          {summary}
        </p>
        {state.scope === "section" && (
          <>
            <IconButton icon={ChevronUp} label="Previous match" size="sm" disabled={countInSection === 0} onClick={() => onStep(-1)} />
            <IconButton icon={ChevronDown} label="Next match" size="sm" disabled={countInSection === 0} onClick={() => onStep(1)} />
            <Button size="sm" disabledReason={countInSection === 0 ? "No match to replace." : undefined} onClick={onReplaceOne}>
              Replace
            </Button>
          </>
        )}
        <Button size="sm" icon={Replace} disabledReason={count === 0 ? "No matches to replace." : undefined} onClick={onReplaceAll}>
          Replace all
        </Button>
      </div>
      {result && (
        <p role="status" className="mt-3 flex flex-wrap items-center gap-2 rounded-sm bg-success-wash px-3 py-2 text-small text-success">
          {result}
          {onUndo && (
            <Button size="sm" variant="ghost" icon={Undo2} onClick={onUndo} className="ml-auto">
              Undo
            </Button>
          )}
        </p>
      )}
    </section>
  );
}

import { useEffect, useRef, type CSSProperties, type KeyboardEvent } from "react";
import { Check, ListPlus, WandSparkles, X } from "lucide-react";
import { Button, Kbd, Loader, modKey } from "../../components/ui";
import { cn } from "../../lib/cn";
import type { MsBlock, MsNote } from "./manuscript";

interface NoteCardProps {
  note: MsNote;
  /** First name of the author, for "in Harni's voice". */
  voiceOf: string;
  focus: boolean;
  onFocused: () => void;
  onText: (text: string) => void;
  onWeave: () => void;
  onExpand: () => void;
  onDiscard: () => void;
}

/**
 * An author note in the margin (or under its paragraph on narrow sheets): rough words or intent, then
 * Weave in (finished prose in the author's voice at this spot), Expand into a section, or Discard.
 * Ctrl or Cmd Enter weaves it in. The result appears in the text in blue pencil to accept or reject.
 */
export function NoteCard({ note, voiceOf, focus, onFocused, onText, onWeave, onExpand, onDiscard }: NoteCardProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!focus) return;
    ref.current?.focus();
    ref.current?.scrollIntoView({ block: "nearest" });
    onFocused();
  }, [focus, onFocused]);

  const empty = note.text.trim() === "";
  const why = empty ? "Write a few words first." : undefined;
  function onKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !empty) {
      e.preventDefault();
      onWeave();
    }
  }

  return (
    <aside aria-label="Your note" data-note-id={note.id} className={cn("rounded-sm border-l-2 border-select bg-select-wash/50 py-2.5 pr-2.5 pl-3 font-ui")}>
      <label htmlFor={`note-${note.id}`} className="flex items-center justify-between gap-2 text-caption font-semibold text-select">
        Your note
        {note.status === "draft" && (
          <span className="hidden font-normal text-ink-tertiary sm:inline">
            <Kbd keys={[modKey(), "Enter"]} /> weaves it in
          </span>
        )}
      </label>
      <textarea
        ref={ref}
        id={`note-${note.id}`}
        value={note.text}
        rows={2}
        readOnly={note.status !== "draft"}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={onKey}
        placeholder="Rough words are fine. For example: the night the bleep never stopped, and what I said to the student."
        className="mt-1 block w-full resize-none bg-transparent font-book text-[15px] leading-[22px] text-ink italic [field-sizing:content] placeholder:text-ink-tertiary focus:outline-none read-only:text-ink-secondary"
      />
      {note.status === "draft" && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" icon={WandSparkles} onClick={onWeave} disabledReason={why}>
            Weave in
          </Button>
          <Button size="sm" variant="ghost" icon={ListPlus} onClick={onExpand} disabledReason={why}>
            Expand into a section
          </Button>
          <Button size="sm" variant="ghost" icon={X} onClick={onDiscard}>
            Discard
          </Button>
        </div>
      )}
      {note.status === "working" && (
        <p role="status" className="mt-2 flex items-center gap-2 text-small text-ink-secondary">
          <Loader />
          {note.mode === "expand" ? "Writing a new section from your note" : `Weaving it in, in ${voiceOf}'s voice`}
        </p>
      )}
      {note.status === "ready" && (
        <p className="mt-2 text-small text-ink-secondary">Ready. The new text is in blue pencil in the page. Accept or reject it there.</p>
      )}
    </aside>
  );
}

interface ProposedTextProps {
  note: MsNote;
  body: CSSProperties | undefined;
  heading: CSSProperties | undefined;
  onAccept: () => void;
  onReject: () => void;
}

/** The editor's result for a note, in place in the text: added words in blue pencil, then Accept or Reject. */
export function ProposedText({ note, body, heading, onAccept, onReject }: ProposedTextProps) {
  const acceptRef = useRef<HTMLButtonElement>(null);
  useEffect(() => acceptRef.current?.focus({ preventScroll: false }), []);
  return (
    <div
      role="group"
      aria-label={note.mode === "expand" ? "New section from your note" : "Text woven in from your note"}
      className="vol-pencil-edge relative my-3 rounded-sm bg-select-wash/60 py-3 pr-3 pl-4"
    >
      <p className="font-ui text-caption font-semibold text-select">{note.mode === "expand" ? "New section from your note" : "Woven in from your note"}</p>
      <div className="mt-1">
        {note.proposed.map((b: MsBlock) =>
          b.kind === "h" ? (
            <h3 key={b.id} className="mt-3 mb-1 font-ui text-subhead text-ink" style={heading}>
              <ins className="no-underline">
                <span className="sr-only">added: </span>
                {b.text}
              </ins>
            </h3>
          ) : (
            <p key={b.id} className="mt-2 first:mt-0" style={body}>
              <ins className="text-ink underline decoration-select/70 decoration-1 underline-offset-[5px]">
                <span className="sr-only">added: </span>
                {b.text}
              </ins>
            </p>
          ),
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 font-ui">
        <Button ref={acceptRef} size="sm" icon={Check} onClick={onAccept}>
          Accept
        </Button>
        <Button size="sm" variant="ghost" icon={X} onClick={onReject}>
          Reject
        </Button>
        <span className="self-center text-small text-ink-secondary">Reject keeps your note so you can change it.</span>
      </div>
    </div>
  );
}

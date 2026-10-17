import { useState } from "react";
import { RotateCcw } from "lucide-react";
import { Banner, Button, Textarea } from "../../components/ui";
import { useUpdateBook, useWriteSection } from "../../api/hooks";
import { plainError } from "../../api/wire-b";
import { useCanWrite } from "../../lib/access";
import { OWNER_PLACEHOLDER_SOURCE, parseThanks, thanksText, withThanks } from "./thanks";

/* Acknowledgements thank only people the owner named (book settings `acknowledgements`). With no names the writer
   saves a placeholder and preflight blocks the pack ("front.owner-placeholder.acknowledgements", fix route Writing).
   This panel sits on that section in Writing: add the names, save them, and write the section again. */

export function AcknowledgementsNotice({
  bookId,
  sectionId,
  settings,
  versionSource,
  className,
}: {
  bookId: string;
  sectionId: string;
  settings: Record<string, unknown>;
  versionSource: string | undefined;
  className?: string;
}) {
  const canWrite = useCanWrite();
  const updateBook = useUpdateBook();
  const writeSection = useWriteSection();
  const saved = thanksText(settings);
  const [text, setText] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const placeholder = versionSource === OWNER_PLACEHOLDER_SOURCE;
  const names = parseThanks(text);
  const busy = updateBook.isPending || writeSection.isPending;

  if (!canWrite) {
    return placeholder ? (
      <Banner tone="attention" title="Acknowledgements need names" className={className}>
        <p>This page is a placeholder until someone with edit access adds the people to thank.</p>
      </Banner>
    ) : null;
  }

  function save(rewrite: boolean) {
    setError(null);
    setDone(null);
    updateBook.mutate(
      { bookId, patch: { settings: withThanks(settings, names) } },
      {
        onError: (e) => setError(plainError(e)),
        onSuccess: () => {
          if (!rewrite) {
            setDone(names.length ? "Names saved." : "Names cleared.");
            return;
          }
          writeSection.mutate(
            { bookId, sectionId },
            {
              onError: (e) => setError(`Names saved, but writing did not start. ${plainError(e)}`),
              onSuccess: () => setDone("Names saved. Writing the acknowledgements again."),
            },
          );
        },
      },
    );
  }

  return (
    <section className={className} aria-label="People to thank">
      <div className="grid gap-3 rounded-md border border-border bg-raised px-4 py-4">
        {placeholder && (
          <Banner tone="attention" title="Acknowledgements need names">
            <p>The writer only thanks people you name. Add them below, then write this section again, or switch the section off.</p>
          </Banner>
        )}
        <Textarea
          label="People to thank"
          hint="One name or group per line, for example My sister Ada or The Tuesday writing group."
          value={text}
          rows={4}
          onChange={(e) => {
            setText(e.target.value);
            setDone(null);
          }}
          error={error ?? undefined}
        />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            icon={RotateCcw}
            onClick={() => save(true)}
            loading={busy}
            loadingLabel="Saving"
            disabledReason={names.length === 0 ? "Add at least one name first." : undefined}
          >
            Save and write it again
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => save(false)} disabled={busy || text.trim() === saved.trim()}>
            Save names only
          </Button>
          {done && (
            <p role="status" className="text-small text-ink-secondary">
              {done}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

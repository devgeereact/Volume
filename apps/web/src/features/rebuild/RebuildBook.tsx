import { useState } from "react";
import { useNavigate } from "react-router";
import { RefreshCw, RotateCcw } from "lucide-react";
import { Banner, Button, Input, Modal } from "../../components/ui";
import { useRebuildBook, useRebuilds, useUndoRebuild } from "../../api/hooks";
import { isTerminalJob, type ApiRebuild } from "../../api/types";
import { plainError, whenMs } from "../../api/wire-b";
import { useCanWrite } from "../../lib/access";
import { cn } from "../../lib/cn";
import { bookStepPath } from "../../screens";

/**
 * Rebuild the whole book from the start (owner, 22 October 2026). One title field and one button: the server builds a
 * new blueprint for the title, then writes every section again, front matter to back matter, and the listing. Each new
 * version is named after the rebuild ("Rebuild 2 from new title: ..."), and each past rebuild can be undone, which puts
 * the title, the blueprint and every section back as they were. Shown on the Blueprint step, and on Titles once the
 * book has text.
 */
export function RebuildBook({
  bookId,
  title,
  onlyWithText = false,
  className,
}: {
  bookId: string;
  title: string;
  /** Hide until the book has text (Titles: nothing to rebuild before writing). */
  onlyWithText?: boolean | undefined;
  className?: string | undefined;
}) {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const rebuilds = useRebuilds(bookId);
  const rebuild = useRebuildBook();
  const undo = useUndoRebuild();
  const [next, setNext] = useState(title);
  // The field follows the book's title when it changes (a choice on Titles, a rebuild, an undo) without remounting,
  // so the message about what just happened stays on screen.
  const [shownTitle, setShownTitle] = useState(title);
  if (shownTitle !== title) {
    setShownTitle(title);
    setNext(title);
  }
  const [confirm, setConfirm] = useState(false);
  const [undoing, setUndoing] = useState<ApiRebuild | null>(null);
  const [done, setDone] = useState("");

  const items = rebuilds.data?.rebuilds ?? [];
  const running = items.find((r) => !isTerminalJob(r.status)) ?? null;
  const wanted = next.trim();
  // A title chosen on Titles is already the book's title; the text still follows the plan's title until a rebuild.
  const planTitle = rebuilds.data?.planTitle ?? title;
  const titleChanged = wanted.length > 0 && wanted !== planTitle;

  function start() {
    rebuild.mutate(wanted !== title ? { bookId, title: wanted } : { bookId }, {
      onSuccess: (r) => {
        setConfirm(false);
        setDone(`${r.note} started. Follow it on Writing.`);
        void navigate(bookStepPath(bookId, "writing"));
      },
    });
  }

  function goBack(r: ApiRebuild) {
    undo.mutate(
      { bookId, jobId: r.jobId },
      {
        onSuccess: (res) => {
          setUndoing(null);
          setDone(`${res.note}: ${res.restored} ${res.restored === 1 ? "section" : "sections"} put back. The rebuild's text stays in Versions.`);
        },
      },
    );
  }

  if (onlyWithText && !rebuilds.data?.hasText) return null;
  return (
    <section aria-labelledby="rebuild-heading" className={cn("grid gap-3 rounded-md border border-border bg-sheet p-4", className)}>
      <div className="grid gap-1">
        <h2 id="rebuild-heading" className="text-body font-semibold text-ink">
          Rebuild the whole book
        </h2>
        <p className="text-small text-ink-secondary">
          A new blueprint for the title, then every section written again, from the front matter to the end of the book. Your current text stays in Versions,
          and you can go back to it in one step.
        </p>
      </div>

      {titleChanged && wanted === title && (
        <Banner tone="attention" title="The text still follows the old title">
          The blueprint and the chapters were planned for &ldquo;{planTitle}&rdquo;. Rebuild the book so every section follows &ldquo;{title}&rdquo;.
        </Banner>
      )}

      {canWrite && (
        <div className="grid gap-2">
          <Input label="Title for the rebuild" value={next} maxCount={255} onChange={(e) => setNext(e.target.value)} disabled={running !== null} />
          <div>
            <Button icon={RefreshCw} disabled={running !== null || wanted.length === 0} onClick={() => setConfirm(true)}>
              {titleChanged ? "Rebuild for this title" : "Rebuild from the start"}
            </Button>
          </div>
          {running && <p className="text-small text-ink-secondary">{running.note ?? "A rebuild"} is running. Follow it on Writing.</p>}
        </div>
      )}

      {done && (
        <p role="status" className="text-small text-ink">
          {done}
        </p>
      )}
      {undo.isError && !undoing && (
        <Banner tone="error" title="The book was not put back">
          {plainError(undo.error)}
        </Banner>
      )}

      {items.length > 0 && (
        <div className="grid gap-2 border-t border-border pt-3">
          <h3 className="text-small font-semibold text-ink">Past rebuilds</h3>
          <ol className="grid gap-2.5">
            {items.map((r) => (
              <li key={r.jobId} className="grid gap-0.5 text-small">
                <span className="font-semibold text-ink">{r.note ?? "Rebuild"}</span>
                <span className="text-ink-secondary">
                  {whenMs(r.createdAt)}
                  {r.fromTitle && r.toTitle && r.fromTitle !== r.toTitle ? `, from "${r.fromTitle}"` : ""}
                  {r.undoneAt ? `, undone ${whenMs(r.undoneAt)}` : !isTerminalJob(r.status) ? ", running" : ""}
                </span>
                {canWrite && !r.undoneAt && isTerminalJob(r.status) && (
                  <div>
                    <Button size="sm" variant="ghost" icon={RotateCcw} disabled={running !== null} onClick={() => setUndoing(r)}>
                      Go back to before this rebuild
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={titleChanged ? `Rebuild the book as "${wanted}"` : "Rebuild the book from the start"}
        description="This runs the AI on the whole book, so it uses your budget. The book and monthly limits still apply."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirm(false)}>
              Cancel
            </Button>
            <Button icon={RefreshCw} loading={rebuild.isPending} onClick={start}>
              Rebuild the book
            </Button>
          </>
        }
      >
        <ol className="grid list-decimal gap-1.5 pl-5 text-small text-ink">
          {titleChanged && <li>The title becomes "{wanted}".</li>}
          <li>A new blueprint is built for the title. The old blueprint stays in Versions.</li>
          <li>Parts and chapters follow the new plan. Chapters it drops are switched off, not deleted.</li>
          <li>Every section the AI writes is written again in order, then the listing.</li>
          <li>Each new version is named after this rebuild, so you can see where it began.</li>
        </ol>
        <p className="mt-3 text-small text-ink-secondary">
          The cover, About the author and pages only you fill are not changed. If the title changes, make the cover again in the Cover studio.
        </p>
        {rebuild.isError && (
          <Banner tone="error" title="The rebuild did not start" className="mt-3">
            {plainError(rebuild.error)}
          </Banner>
        )}
      </Modal>

      <Modal
        open={undoing !== null}
        onClose={() => setUndoing(null)}
        closeOnScrim={false}
        title="Go back to before this rebuild"
        description={undoing?.note ?? undefined}
        footer={
          <>
            <Button variant="ghost" onClick={() => setUndoing(null)}>
              Cancel
            </Button>
            <Button icon={RotateCcw} loading={undo.isPending} onClick={() => undoing && goBack(undoing)}>
              Put the book back
            </Button>
          </>
        }
      >
        <p className="text-small text-ink">
          The title{undoing?.fromTitle ? ` ("${undoing.fromTitle}")` : ""}, the approved blueprint and every section go back to how they were before the
          rebuild. Each section gets a new version named "Back to before rebuild {undoing?.number ?? ""}", so the rebuild&apos;s text also stays in Versions.
        </p>
        {undo.isError && (
          <Banner tone="error" title="The book was not put back" className="mt-3">
            {plainError(undo.error)}
          </Banner>
        )}
      </Modal>
    </section>
  );
}

import { useState } from "react";
import { Link } from "react-router";
import { Check, Flag } from "lucide-react";
import { Button, Chip, EmptyState, Input, PageHeader, Textarea } from "../../components/ui";
import { useClaimsOverview, useEstimate, useResolveClaim } from "../../api/hooks";
import type { ClaimOverviewFilter, ClaimOverviewItem } from "../../api/types";
import { errorText } from "../../api/wire-c";
import { useCanWrite } from "../../lib/access";
import { cn } from "../../lib/cn";
import { useBook } from "../../lib/useBook";
import { ErrorPanel, LoadingBlock } from "../writing/screenState";
import { ClaimRewrite } from "./ClaimRewrite";
import { FixWholeBook } from "./FixWholeBook";
import { categoryLabel, FILTERS, filterCount, groupBySection, toMsClaim } from "./claimsOverview";

/* Claims (API mode): every claim of the book in one place, in reading order, older books included. The
   same fixes as the editor's Claims tab: suggested replacements, your own sentence, verify, soften and
   remove. A claim whose sentence left the text offers only verify, remove and opening its section. */

const STATUS_TEXT: Record<string, string> = {
  open: "Open",
  verified: "Verified",
  softened: "Softened",
  removed: "Removed",
  author_experience: "Your experience",
};

export default function ClaimsPage() {
  const { book, from } = useBook();
  if (!book || from !== "api")
    return (
      <div className="px-4 py-6 sm:px-8 lg:px-10">
        <PageHeader title="Claims" />
        <EmptyState
          className="mt-6 max-w-[640px]"
          drawing="page"
          title="Claims need the Volume server"
          body="Start the server to sort every claim in this book. The demo books show claims in the editor."
        />
      </div>
    );
  return <Claims bookId={book.id} />;
}

function Claims({ bookId }: { bookId: string }) {
  const [filter, setFilter] = useState<ClaimOverviewFilter>("open");
  const [announce, setAnnounce] = useState("");
  const q = useClaimsOverview(bookId, filter);
  const canWrite = useCanWrite();
  const estimate = useEstimate(bookId, "claim_fix", { enabled: canWrite && (q.data?.counts.open ?? 0) > 0 });
  const groups = q.data ? groupBySection(q.data.items) : [];
  const openQ = useClaimsOverview(bookId, "open");

  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader title="Claims" summary="Every statement to check before you publish, in reading order." />
      {canWrite && openQ.data && (
        <FixWholeBook
          bookId={bookId}
          claims={openQ.data.items}
          estimate={estimate.data ?? null}
          onDone={() => {
            void q.refetch();
            void openQ.refetch();
          }}
        />
      )}
      <div role="group" aria-label="Show claims" className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Chip key={f.id} pressed={filter === f.id} count={filterCount(q.data?.counts, f.id)} onClick={() => setFilter(f.id)}>
            {f.label}
          </Chip>
        ))}
      </div>

      <div className="mt-6 max-w-[860px]">
        {q.isError ? (
          <ErrorPanel title="Could not load the claims" body={errorText(q.error)} onRetry={() => void q.refetch()} />
        ) : q.isPending ? (
          <LoadingBlock label="Loading the claims" rows={6} />
        ) : groups.length === 0 ? (
          <EmptyState
            drawing="page"
            title={filter === "open" ? "No open claims" : "No claims here"}
            body={
              filter === "open"
                ? "Nothing medical, legal or statistical is waiting for a check. Preflight has nothing to warn about here."
                : "Pick another filter to see the rest."
            }
            action={
              filter !== "all" ? (
                <Button variant="secondary" onClick={() => setFilter("all")}>
                  Show all claims
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="grid gap-8">
            {groups.map((g) => (
              <section key={g.key} aria-labelledby={`claims-${g.key}`}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <h2 id={`claims-${g.key}`} className="font-book text-heading text-ink">
                    {g.name}
                  </h2>
                  {g.sectionId && (
                    <Link to={`/books/${bookId}/editor/${g.sectionId}`} className="text-small font-semibold text-select underline-offset-2 hover:underline">
                      Open section
                    </Link>
                  )}
                </div>
                <ul className="mt-3 grid gap-3">
                  {g.items.map((c) => (
                    <ClaimRow
                      key={c.id}
                      bookId={bookId}
                      claim={c}
                      readOnly={!canWrite}
                      estimate={estimate.data ?? null}
                      estimateLoading={estimate.isFetching}
                      estimateError={estimate.isError ? errorText(estimate.error) : null}
                      onRetryEstimate={() => void estimate.refetch()}
                      onReload={() => void q.refetch()}
                      onAnnounce={setAnnounce}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {announce}
      </span>
    </div>
  );
}

function ClaimRow({
  bookId,
  claim,
  readOnly,
  estimate,
  estimateLoading,
  estimateError,
  onRetryEstimate,
  onReload,
  onAnnounce,
}: {
  bookId: string;
  claim: ClaimOverviewItem;
  readOnly: boolean;
  estimate: { lowUsd: number; highUsd: number } | null;
  estimateLoading: boolean;
  estimateError: string | null;
  onRetryEstimate: () => void;
  onReload: () => void;
  onAnnounce: (text: string) => void;
}) {
  const [mode, setMode] = useState<"idle" | "verify" | "soften">("idle");
  const [note, setNote] = useState("");
  const [softer, setSofter] = useState(claim.suggestedSoftening?.trim() || claim.sentence);
  const [problem, setProblem] = useState<string | null>(null);
  const resolve = useResolveClaim();
  const open = claim.status === "open";
  const ms = toMsClaim(claim, categoryLabel(claim.category));

  async function act(action: "verify" | "soften" | "remove") {
    setProblem(null);
    try {
      if (action === "verify") await resolve.mutateAsync({ bookId, claimId: claim.id, action, input: { note: note.trim() || "marked as checked by you" } });
      else if (action === "soften") await resolve.mutateAsync({ bookId, claimId: claim.id, action, input: { replacement: softer.trim() } });
      else await resolve.mutateAsync({ bookId, claimId: claim.id, action, input: {} });
      setMode("idle");
      onAnnounce(
        action === "verify"
          ? "Claim marked verified."
          : action === "soften"
            ? "Softer wording saved as a new version."
            : "Sentence removed and saved as a new version.",
      );
    } catch (e) {
      setProblem(errorText(e));
    }
  }

  return (
    <li className={cn("rounded-md border p-4", open ? "border-transparent bg-claim-wash" : "border-border bg-sheet")}>
      <p className="flex flex-wrap items-center justify-between gap-2 text-caption">
        <span className={cn("inline-flex items-center gap-1 font-semibold", open ? "text-claim" : "text-ink-secondary")}>
          <Flag size={12} strokeWidth={2} aria-hidden />
          {ms.category}
        </span>
        <span className={cn("font-semibold", open ? "text-claim" : claim.status === "removed" ? "text-ink-secondary" : "text-success")}>
          {STATUS_TEXT[claim.status] ?? claim.status}
        </span>
      </p>
      <p className={cn("mt-2 font-book text-[16px] leading-[25px] text-ink", claim.status === "removed" && "line-through decoration-ink-tertiary")}>
        {claim.sentence}
      </p>
      {open && <p className="mt-1.5 text-small text-ink-secondary">{ms.check}</p>}
      {ms.note && <p className="mt-1.5 text-small text-ink-secondary">Checked: {ms.note}</p>}
      {open && !claim.inCurrentText && (
        <p className="mt-1.5 text-small text-ink">
          This sentence is no longer in the section&apos;s text. Verify it, remove the claim, or open the section to check.
        </p>
      )}
      {problem && (
        <p className="mt-2 text-small text-claim" role="alert">
          {problem}
        </p>
      )}

      {open && !readOnly && mode === "idle" && (
        <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Button size="sm" onClick={() => setMode("verify")}>
              Verify
            </Button>
            {claim.inCurrentText && (
              <Button size="sm" onClick={() => setMode("soften")}>
                Soften
              </Button>
            )}
            <Button size="sm" variant="ghost" loading={resolve.isPending} loadingLabel="Saving" onClick={() => void act("remove")}>
              Remove
            </Button>
          </div>
          {claim.inCurrentText && (
            <ClaimRewrite
              bookId={bookId}
              claim={ms}
              estimate={estimate}
              estimateLoading={estimateLoading}
              estimateError={estimateError}
              onRetryEstimate={onRetryEstimate}
              beforeApply={() => Promise.resolve(true)}
              onReload={onReload}
              onAnnounce={onAnnounce}
            />
          )}
        </>
      )}
      {open && mode === "verify" && (
        <div className="mt-3 grid gap-2">
          <Input
            label="Where you checked it"
            hint="For example the trust policy page or a source title."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Button size="sm" icon={Check} loading={resolve.isPending} loadingLabel="Saving" onClick={() => void act("verify")}>
              Mark verified
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {open && mode === "soften" && (
        <div className="mt-3 grid gap-2">
          <Textarea
            label="Softer wording"
            hint="Change the sentence so it claims only what you can stand behind."
            rows={3}
            value={softer}
            onChange={(e) => setSofter(e.target.value)}
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              icon={Check}
              loading={resolve.isPending}
              loadingLabel="Saving"
              disabledReason={softer.trim() === "" || softer.trim() === claim.sentence.trim() ? "Change the wording first." : undefined}
              onClick={() => void act("soften")}
            >
              Use softer wording
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

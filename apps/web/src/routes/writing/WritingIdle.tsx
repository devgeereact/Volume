import { Link } from "react-router";
import { Check } from "lucide-react";
import { EmptyState, Figure, PageHeader } from "../../components/ui";
import { calmWardBlueprint, stageOrder, type Book } from "../../data";
import { formatNumber, formatUsd } from "../../lib/format";
import { useStepAction, type StepAction } from "../../lib/stepAction";

/* Writing for books that are not the live job: before the blueprint is approved (empty state), ready to
   write, or already written (summary and Open editor). */

const linkSecondary =
  "inline-flex h-10 items-center gap-2 rounded-sm border border-border-strong bg-sheet px-4 text-label font-semibold text-ink hover:bg-sunken";

export function WritingIdle({ book, forcedEmpty }: { book: Book; forcedEmpty: boolean }) {
  const stageIdx = stageOrder.indexOf(book.stage);
  const blueprintIdx = stageOrder.indexOf("blueprint");
  const writingIdx = stageOrder.indexOf("writing");

  let body;
  let action: StepAction | null = null;
  if (forcedEmpty || stageIdx < blueprintIdx) {
    body = (
      <EmptyState
        drawing="pen"
        title="Approve the blueprint first"
        body="The writer needs an approved blueprint to know the chapters, subheadings and word targets."
        action={
          <Link to={`/books/${book.id}/blueprint`} className={linkSecondary}>
            Open the blueprint
          </Link>
        }
      />
    );
  } else if (stageIdx === blueprintIdx) {
    const plan = book.id === calmWardBlueprint.bookId ? calmWardBlueprint : null;
    const sections = plan ? plan.chapters.length + 2 : 12;
    const low = book.words.target * 0.00006;
    const high = book.words.target * 0.00009;
    body = (
      <EmptyState
        drawing="pen"
        title={`Ready to write ${sections} sections`}
        body={`About ${formatNumber(book.words.target)} words in book order: front matter, ${plan ? plan.chapters.length : 10} chapters, then back matter. The blueprint still needs your approval.`}
      />
    );
    action = {
      label: "Write book",
      estimate: `about ${formatUsd(low)} to ${formatUsd(high)}`,
      disabledReason: "Approve the blueprint first. Writing follows the approved plan.",
    };
  } else if (stageIdx > writingIdx) {
    action = { label: "Open editor", to: `/books/${book.id}/editor` };
    body = (
      <section aria-labelledby="written-title" className="grid max-w-[720px] gap-5 rounded-md border border-border bg-sheet p-6">
        <div>
          <p className="flex items-center gap-1.5 text-label font-semibold text-success">
            <Check size={16} strokeWidth={2} aria-hidden />
            Written and checked
          </p>
          <h2 id="written-title" className="mt-1 font-book text-heading text-ink">
            The draft is finished
          </h2>
          <p className="mt-1 text-body text-ink-secondary">
            Every section passed its checks or went to the claims report. Open editor, at the foot of the page, to work on the text.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <p className="text-small text-ink-secondary">Words</p>
            <Figure value={formatNumber(book.words.written)} unit={`of ${formatNumber(book.words.target)}`} />
          </div>
          <div>
            <p className="text-small text-ink-secondary">AI spend on this book</p>
            <Figure value={formatUsd(book.cost.spent)} unit={`of ${formatUsd(book.cost.budget)}`} />
          </div>
        </div>
      </section>
    );
  } else {
    body = (
      <EmptyState
        drawing="pen"
        title="Nothing is writing right now"
        body="Start the writer from here once the blueprint is approved."
        action={
          <Link to={`/books/${book.id}/blueprint`} className={linkSecondary}>
            Open the blueprint
          </Link>
        }
      />
    );
  }

  useStepAction(action);

  return (
    <div className="px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader title="Writing" summary="The writer drafts every section in book order and checks each one as it lands." />
      <div className="mt-6">{body}</div>
    </div>
  );
}

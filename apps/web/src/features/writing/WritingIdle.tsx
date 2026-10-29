import { Link } from "react-router";
import { Check } from "lucide-react";
import { EmptyState, PageHeader } from "../../components/ui";
import { buttonClasses } from "../../components/ui/Button";
import { cn } from "../../lib/cn";
import { stepBody } from "./studio";
import { calmWardBlueprint, stageOrder, type Book } from "../../demo";
import { formatNumber, formatUsd } from "../../lib/format";
import { useStepAction, type StepAction } from "../../lib/stepAction";

/* Writing for books that are not the live job: before the blueprint is approved (empty state), ready to
   write, or already written (summary and Open editor). */

const linkSecondary = buttonClasses("secondary", "md");

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
      <section aria-labelledby="written-title" className="vol-glass grid justify-items-center gap-2 rounded-card px-5 py-9 text-center">
        <span aria-hidden className="grid size-[42px] place-items-center rounded-[14px] bg-panel-2 text-mint-ink shadow-control">
          <Check size={20} strokeWidth={2} />
        </span>
        <p className="mt-1 text-[12px] leading-4 font-semibold text-good">Written and checked</p>
        <h2 id="written-title" className="text-[16px] leading-[1.35] font-semibold tracking-[-0.01em] text-ink">
          The draft is finished
        </h2>
        <p className="max-w-[56ch] text-[13.5px] leading-[1.55] text-ink-2">
          Every section passed its checks or went to the claims report. Open the editor to work on the text.
        </p>
        <dl className="mt-2 flex flex-wrap justify-center gap-2.5">
          <div className="grid rounded-[16px] border border-edge bg-panel-2 px-3.5 py-2.5 text-left">
            <dt className="order-2 text-[12px] text-ink-2">of {formatNumber(book.words.target)} words</dt>
            <dd className="num order-1 text-[20px] leading-[1.2] font-bold text-ink">{formatNumber(book.words.written)}</dd>
          </div>
          <div className="grid rounded-[16px] border border-edge bg-panel-2 px-3.5 py-2.5 text-left">
            <dt className="order-2 text-[12px] text-ink-2">AI spend on this book</dt>
            <dd className="num order-1 text-[20px] leading-[1.2] font-bold text-ink">{formatUsd(book.cost.spent)}</dd>
          </div>
        </dl>
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
    <div className={cn(stepBody, "grid gap-4")}>
      <PageHeader title="Writing" summary="Volume writes each section in order and checks it against the house style before the next one starts." />
      {body}
    </div>
  );
}

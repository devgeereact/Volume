import { useNavigate } from "react-router";
import { OutlineItem, ProgressBar, Select } from "../../components/ui";
import { formatNumber } from "../../lib/format";
import { treeMeta } from "./generatedPage";
import { groupLabels, type MsGroup, type MsSection } from "./manuscript";

interface ManuscriptTreeProps {
  bookId: string;
  sections: MsSection[];
  current: string;
  wordsFor: (s: MsSection) => number;
  claimsFor: (sectionId: string) => number;
  dirty: (sectionId: string) => boolean;
  totalWords: number;
  targetWords: number;
}

const groups: MsGroup[] = ["front", "body", "back"];

/** Manuscript tree: front matter, chapters and back matter with words, claims and unsaved marks. */
export function ManuscriptTree({ bookId, sections, current, wordsFor, claimsFor, dirty, totalWords, targetWords }: ManuscriptTreeProps) {
  const navigate = useNavigate();
  const meta = (s: MsSection) => treeMeta(s, wordsFor(s), dirty(s.id));
  return (
    <>
      <div className="px-4 pt-4 pb-1 sm:px-8 xl:hidden">
        <Select
          label="Section"
          value={current}
          onChange={(id) => void navigate(`/books/${bookId}/editor/${id}`)}
          options={sections.map((s) => ({ value: s.id, label: s.number !== null ? `${s.number}. ${s.title}` : s.title, hint: meta(s) }))}
        />
      </div>
      <nav aria-label="Manuscript" className="hidden min-h-0 flex-col border-r border-border bg-canvas xl:flex xl:h-full">
        <div className="border-b border-border px-5 pt-5 pb-4">
          <p className="text-subhead text-ink">Manuscript</p>
          <p className="num mt-0.5 text-small text-ink-secondary">
            {targetWords > 0 ? `${formatNumber(totalWords)} of ${formatNumber(targetWords)} words` : `${formatNumber(totalWords)} words, no target set`}
            {targetWords > 0 && totalWords > targetWords && (
              <span className="block text-accent-text">{formatNumber(totalWords - targetWords)} over the book's target</span>
            )}
          </p>
          <ProgressBar
            className="mt-2"
            size="thin"
            value={targetWords > 0 ? Math.min(100, (totalWords / targetWords) * 100) : 0}
            max={100}
            label="Manuscript words"
            valueText={`${formatNumber(totalWords)} of ${formatNumber(targetWords)} words`}
          />
        </div>
        <div className="relative min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {groups.map((g) => (
            <section key={g} aria-labelledby={`tree-${g}`} className="mb-4">
              <h2 id={`tree-${g}`} className="px-2.5 pb-1.5 text-[13px] font-semibold text-ink-secondary">
                {groupLabels[g]}
              </h2>
              <ul className="grid gap-0.5">
                {sections
                  .filter((s) => s.group === g)
                  .map((s) => (
                    <li key={s.id}>
                      <OutlineItem
                        number={s.number}
                        title={s.title}
                        current={s.id === current}
                        claims={claimsFor(s.id)}
                        meta={claimsFor(s.id) > 0 ? undefined : meta(s)}
                        to={`/books/${bookId}/editor/${s.id}`}
                        subheadings={s.blocks.filter((b) => b.kind === "h").map((b) => b.text)}
                      />
                    </li>
                  ))}
              </ul>
            </section>
          ))}
        </div>
      </nav>
    </>
  );
}

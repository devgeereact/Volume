import { Link, useNavigate } from "react-router";
import { Select } from "../../components/ui";
import { cn } from "../../lib/cn";
import { formatNumber } from "../../lib/format";
import { cardTitle, glassCard, RowDot, RowNumber, rowClasses, smallLabel } from "../writing/studio";
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

/** The manuscript card (.sec-list): front matter, chapters and back matter with words, claims and unsaved marks. A picker on phones. */
export function ManuscriptTree({ bookId, sections, current, wordsFor, claimsFor, dirty, totalWords, targetWords }: ManuscriptTreeProps) {
  const navigate = useNavigate();
  const meta = (s: MsSection) => treeMeta(s, wordsFor(s), dirty(s.id));
  return (
    <>
      <div className="min-[861px]:hidden">
        <Select
          label="Section"
          value={current}
          onChange={(id) => void navigate(`/books/${bookId}/editor/${id}`)}
          options={sections.map((s) => ({ value: s.id, label: s.number !== null ? `${s.number}. ${s.title}` : s.title, hint: meta(s) }))}
        />
      </div>
      <nav aria-label="Manuscript" className={cn(glassCard, "hidden content-start gap-0.5 p-2.5 min-[861px]:grid")}>
        <h2 className={cn(cardTitle, "mx-2 mt-1.5")}>Manuscript</h2>
        <p className="num mx-2 mb-2 text-[12px] leading-4 text-ink-3">
          {targetWords > 0 ? `${formatNumber(totalWords)} of ${formatNumber(targetWords)} words` : `${formatNumber(totalWords)} words, no target set`}
          {targetWords > 0 && totalWords > targetWords && (
            <span className="block text-amber">{formatNumber(totalWords - targetWords)} over the book's target</span>
          )}
        </p>
        {groups.map((g) => {
          const list = sections.filter((s) => s.group === g);
          if (list.length === 0) return null;
          return (
            <section key={g} aria-labelledby={`tree-${g}`} className="mb-1.5">
              <h3 id={`tree-${g}`} className={cn(smallLabel, "mx-2 mt-2 mb-1")}>
                {groupLabels[g]}
              </h3>
              <ul className="grid gap-0.5">
                {list.map((s) => {
                  const claims = claimsFor(s.id);
                  const on = s.id === current;
                  return (
                    <li key={s.id} className="min-w-0">
                      <Link to={`/books/${bookId}/editor/${s.id}`} aria-current={on ? "true" : undefined} className={rowClasses(on)}>
                        <RowNumber n={s.number} />
                        <span className="min-w-0 flex-1 truncate" title={s.title}>
                          {s.title}
                        </span>
                        {claims > 0 ? (
                          <RowDot tone="warn" label={`${claims} ${claims === 1 ? "claim" : "claims"} to check`} />
                        ) : (
                          <small className="num shrink-0 text-[11.5px] font-normal text-ink-3">{meta(s)}</small>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </nav>
    </>
  );
}

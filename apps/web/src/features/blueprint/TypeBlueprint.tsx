import type { ReactNode } from "react";
import { Lock, Sparkles } from "lucide-react";
import { Button, EmptyState, GalleySheet, PageHeader } from "../../components/ui";
import { getBookType, getCoverStyle, getInteriorTheme, getPenName, type Book, type BookType } from "../../demo";
import { formatNumber } from "../../lib/format";
import { about } from "../research/sim";

/* Blueprint for any book other than The Calm Ward, drawn from the book type in config/book-types.json
   and the profile in config/profiles/. It shows what the plan holds for that kind of book (fiction,
   children's, non-fiction, workbooks and journals), so every category reads properly even before the
   writer for it ships. Before a title is chosen it is a preview with "Build the blueprint"; after
   approval it is the locked plan. */

const BUILD_COST = 0.11;

const matterNames: Record<string, string> = {
  "about-the-author": "About the author",
  "also-by": "Also by the author",
  "review-request": "Review request",
  "newsletter-socials": "Newsletter and socials",
  "how-to-use": "How to use this book",
  "glossary-of-nhs-terms": "Glossary of NHS terms",
  "recipe-or-extra": "Recipe or extra",
  "word-of-the-day": "Word of the day",
  "goodnight-message": "Goodnight message",
  "new-words-list": "New words list",
  "notes-pages": "Notes pages",
  "year-goals": "Goals for the year",
};

function matterLabel(id: string): string {
  const known = matterNames[id];
  if (known) return known;
  const words = id.replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function sentence(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const categoryWord: Record<BookType["category"], string> = {
  fiction: "Fiction",
  childrens: "Children's",
  nonfiction: "Non-fiction",
  "workbooks-journals": "Workbooks and journals",
};

export function TypeBlueprint({ book }: { book: Book }) {
  const type = getBookType(book.bookTypeId);
  const pen = getPenName(book.penNameId);
  const profile = pen?.profile;
  const theme = getInteriorTheme(book.interiorThemeId);
  const cover = getCoverStyle(book.coverStyleId);
  const before = book.stage === "idea" || book.stage === "research" || book.stage === "title";
  const unit = type?.structure.bodyUnit ?? "chapters";
  const units = type?.chapterRange.default ?? 10;

  if (!type) {
    return (
      <div className="grid content-start gap-7 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
        <PageHeader title="Blueprint" summary="The whole plan for the book, part by part, ready to approve." />
        <EmptyState drawing="page" title="This book has no book type yet" body="Set the book type in the book's settings, then build the blueprint." />
      </div>
    );
  }

  /* Category fields: what the plan records for this kind of book. */
  const story: { label: string; value: ReactNode }[] = [];
  const voice = profile?.voice;
  if (type.category === "fiction" || type.templateFile === "fiction.json") {
    if (voice?.pov) story.push({ label: "Point of view", value: voice.pov });
    if (voice?.heatLevel) story.push({ label: "Heat level", value: sentence(voice.heatLevel) });
    story.push({
      label: "Series",
      value: book.series
        ? `${book.series.name}, book ${book.series.number}`
        : voice?.series?.ready
          ? `Stand-alone for now. ${voice.series.note}`
          : "Stand-alone",
    });
    if (voice?.planning) {
      const plans = [voice.planning.twistPlan && "twist plan", voice.planning.clueLedger && "clue ledger"].filter(Boolean).join(" and ");
      if (plans) story.push({ label: "Planning", value: `${sentence(plans)}. ${voice.planning.note}` });
    }
  }
  if (type.category === "childrens") {
    const age = voice?.audience ? `${voice.audience.ageMin} to ${voice.audience.ageMax}` : type.genreRules.readerAge;
    if (age) story.push({ label: "Reader age", value: age });
    if (voice?.newWordPerBook || type.structure.frontMatter.includes("word-of-the-day"))
      story.push({ label: "New word", value: "One new word, used at least three times and explained" });
    story.push({ label: "Interior", value: type.interior === "colour" ? "Full colour, one scene prompt per spread" : "Black and white" });
  }
  if (type.templateFile === "workbook.json")
    story.push({ label: "Exercises", value: "Two to four per chapter: reflection, checklist, fill-in, tracker and scenario blocks" });
  if (type.templateFile === "journal.json")
    story.push({ label: "Pages", value: type.lowContent ? "Low-content pages: prompts, trackers and lined pages" : "Prompts with room to write" });
  if (type.templateFile === "poetry.json") story.push({ label: "Poems", value: `About ${units} poems, grouped into sections` });

  const meta = (
    <span className="inline-flex items-center gap-1.5">
      {!before && <Lock size={12} strokeWidth={2} aria-hidden />}
      {before ? "What the blueprint will hold" : "Blueprint, approved and locked"}
    </span>
  );

  return (
    <div className="grid content-start gap-6 px-4 py-6 sm:px-8 lg:px-10 lg:py-7">
      <PageHeader
        title="Blueprint"
        summary={
          before
            ? `The planner builds the whole plan for this ${type.name.toLowerCase()} once a title is chosen.`
            : "Approved. Writing follows this plan; changes start a new draft version."
        }
        actions={
          before ? (
            <Button icon={Sparkles} estimate={about(BUILD_COST)} disabledReason="Choose a title first.">
              Build the blueprint
            </Button>
          ) : undefined
        }
      />

      <GalleySheet className="sm:px-8! sm:py-8! lg:px-10!" label={`Blueprint for ${book.title}`} metaLeft={meta} metaRight={`${type.name}, ${units} ${unit}`}>
        <div className="mt-6 grid gap-8 @container">
          <header className="max-w-[72ch]">
            <p className="opsz-display font-book text-[34px] leading-[40px] font-medium tracking-[-0.02em] text-ink">{book.title}</p>
            {book.subtitle && <p className="mt-2 font-book text-[20px] leading-7 text-ink-secondary italic">{book.subtitle}</p>}
            <p className="mt-3 font-book text-[17px] text-ink-secondary">{pen?.name}</p>
            <p className="mt-5 font-book text-prose-sm text-ink">{type.description}</p>
          </header>

          <div className="grid gap-8 @min-[760px]:grid-cols-2">
            <Block title="Shape">
              <Rows
                items={[
                  { label: "Category", value: categoryWord[type.category] },
                  { label: "Word target", value: `${formatNumber(book.words.target)} words` },
                  { label: sentence(unit), value: `${units}, from ${type.chapterRange.min} to ${type.chapterRange.max}` },
                  { label: "Trim", value: book.trim },
                  { label: "Interior theme", value: theme?.name ?? "Not set" },
                  { label: "Cover style", value: cover?.name ?? "Not set" },
                ]}
              />
            </Block>
            {story.length > 0 && (
              <Block
                title={
                  type.category === "childrens"
                    ? "For young readers"
                    : type.category === "fiction" || type.templateFile === "fiction.json"
                      ? "Story plan"
                      : "Pages"
                }
              >
                <Rows items={story} />
              </Block>
            )}
            <Block title="Front matter">
              <List items={type.structure.frontMatter.map(matterLabel)} />
            </Block>
            <Block title="Back matter">
              <List items={type.structure.backMatter.map(matterLabel)} />
            </Block>
            <Block title="What readers expect">
              <List items={type.genreRules.expectations} />
            </Block>
            <Block title="The plan must include">
              <List items={type.genreRules.mustHaves} />
            </Block>
            <Block title="Kept out">
              <List items={type.genreRules.avoid} />
            </Block>
            {type.genreRules.tropes && type.genreRules.tropes.length > 0 && (
              <Block title="Tropes the planner may use">
                <ul className="flex flex-wrap gap-2">
                  {type.genreRules.tropes.map((t) => (
                    <li key={t} className="inline-flex h-[30px] items-center rounded-pill border border-border bg-canvas px-3 text-[13px] text-ink">
                      {sentence(t)}
                    </li>
                  ))}
                </ul>
              </Block>
            )}
          </div>
        </div>
      </GalleySheet>
    </div>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid content-start gap-3">
      <h2 className="border-b border-border pb-2 text-[13px] font-semibold text-ink-secondary">{title}</h2>
      {children}
    </section>
  );
}

function Rows({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid gap-2.5">
      {items.map((i) => (
        <div key={i.label} className="grid gap-0.5 sm:grid-cols-[140px_minmax(0,1fr)] sm:gap-4">
          <dt className="text-small text-ink-secondary">{i.label}</dt>
          <dd className="font-book text-[15.5px] leading-[23px] text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <ul className="grid gap-1.5">
      {items.map((t) => (
        <li key={t} className="border-l-2 border-border-strong pl-3 font-book text-[15.5px] leading-[23px] text-ink">
          {t}
        </li>
      ))}
    </ul>
  );
}

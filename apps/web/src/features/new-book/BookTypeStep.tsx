import { useState, type ReactNode } from "react";
import { bookCategories, bookTypes, bookTypesIn, getBookType, type AuthorProfile, type BookType } from "../../demo";
import { Tabs, tabPanelProps } from "../../components/ui";
import { formatNumber } from "../../lib/format";
import { ChoiceCard } from "./ChoiceCard";
import { writingArrives } from "./wizardData";

/* Book type step: every type in config/book-types.json, grouped by its four categories in tabs (no
   search box). When a profile is chosen, its own types come first in a tab of their own and its default
   type is already selected. Each card is a radio, so arrow keys move within a tab. */

interface BookTypeStepProps {
  value: string | null;
  profile: AuthorProfile | undefined;
  error: string | undefined;
  onChoose: (t: BookType) => void;
}

const PROFILE_TAB = "profile";

function firstName(name: string): string {
  return name.split(" ")[0] ?? name;
}

export function BookTypeStep({ value, profile, error, onChoose }: BookTypeStepProps) {
  const selected = getBookType(value ?? undefined);
  const profileTypes = profile ? profile.bookTypes.map((id) => getBookType(id)).filter((t): t is BookType => t !== undefined) : [];
  const [tab, setTab] = useState<string>(profileTypes.length > 0 ? PROFILE_TAB : (selected?.category ?? bookCategories[0]?.id ?? "nonfiction"));

  const items = [
    ...(profileTypes.length > 0 && profile ? [{ id: PROFILE_TAB, label: `${firstName(profile.name)}'s types`, count: profileTypes.length }] : []),
    ...bookCategories.map((c) => ({ id: c.id, label: c.name, count: bookTypesIn(c.id).length })),
  ];
  const category = bookCategories.find((c) => c.id === tab);
  const shown = tab === PROFILE_TAB ? profileTypes : category ? bookTypesIn(category.id) : bookTypes;
  const note = selected ? writingArrives(selected) : null;

  return (
    <div className="grid gap-4">
      <p role="status" className="text-body text-ink-2">
        {selected ? (
          <>
            Selected: <b className="font-semibold text-ink">{selected.name}</b>, {bookCategories.find((c) => c.id === selected.category)?.name.toLowerCase()}
            {profile?.publishing.defaultBookType === selected.id ? `, ${firstName(profile.name)}'s usual type.` : "."}
            {note && ` Research, titles and the blueprint work now; automatic writing for it arrives in ${note}.`}
          </>
        ) : (
          `Choose one of ${bookTypes.length} book types. It sets the structure, length, interior and cover.`
        )}
      </p>

      <Tabs label="Book categories" idBase="booktype" items={items} value={tab} onChange={setTab} />

      <div {...tabPanelProps("booktype", tab)} className="grid gap-3 focus:outline-none focus-visible:outline-2 focus-visible:outline-select">
        {category && <p className="text-small text-ink-2">{category.description}</p>}
        {tab === PROFILE_TAB && profile && <p className="text-small text-ink-2">The types {profile.name} writes. Every other type is in the category tabs.</p>}
        <fieldset aria-describedby={error ? "type-error" : undefined}>
          <legend className="sr-only">Book type</legend>
          <div id="field-bookTypeId" tabIndex={-1} className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-2.5 focus:outline-none">
            {shown.map((t) => (
              <ChoiceCard key={t.id} name="book-type" value={t.id} checked={value === t.id} onChange={() => onChoose(t)} describedBy={`type-${t.id}`}>
                <span className="pr-8 text-[14px] leading-6 font-bold text-ink">{t.name}</span>
                <span className="text-small text-ink-2">{t.description}</span>
                <span id={`type-${t.id}`} className="num flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-small text-ink">
                  <span>
                    {formatNumber(t.wordRange.default)} words, {t.chapterRange.default} {t.structure.bodyUnit}
                  </span>
                  {t.interior === "colour" && <Tag>Colour</Tag>}
                  {t.lowContent && <Tag>Low content</Tag>}
                  {t.genreRules.readerAge && <Tag>Ages {t.genreRules.readerAge}</Tag>}
                  {tab !== PROFILE_TAB && profile?.bookTypes.includes(t.id) && <Tag>{firstName(profile.name)}'s type</Tag>}
                </span>
              </ChoiceCard>
            ))}
          </div>
        </fieldset>
      </div>
      {error && (
        <p id="type-error" role="alert" className="text-small text-claim">
          {error}
        </p>
      )}
    </div>
  );
}

function Tag({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-pill border border-edge bg-panel-2 px-2 text-caption text-ink-2">{children}</span>;
}

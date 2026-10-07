import { useRef } from "react";
import { Chip, Input, Select, Switch, Textarea } from "../../components/ui";
import { bookCategories, bookTypesIn, coverStyles, getBookType, interiorThemes } from "../../demo/config";
import { formatNumber } from "../../lib/format";
import { SectionTitle, type TabProps } from "./IdentityTab";
import { ListEditor } from "./ListEditor";
import { PLACEHOLDERS, PREVIEW_YEAR, copyrightHolder, errorFor } from "./profileRules";

/** Trim sizes from config/kdp-rules/2026-10-06.json (verified paperback.trimSizes.list). */
export const TRIM_OPTIONS = [
  { value: "5 x 8 in", label: "5 x 8 in" },
  { value: "5.25 x 8 in", label: "5.25 x 8 in" },
  { value: "5.5 x 8.5 in", label: "5.5 x 8.5 in" },
  { value: "6 x 9 in", label: "6 x 9 in", hint: "Most common" },
  { value: "7 x 10 in", label: "7 x 10 in" },
  { value: "8.5 x 8.5 in", label: "8.5 x 8.5 in", hint: "Picture books" },
  { value: "8.5 x 11 in", label: "8.5 x 11 in", hint: "Workbooks" },
];
export const TRIM_HINT = "From the KDP rules file dated 3 October 2026. The trim list is still marked unverified there.";

const themeOptions = interiorThemes.map((t) => ({ value: t.id, label: t.name }));
const coverOptions = coverStyles.map((c) => ({ value: c.id, label: c.name }));

/**
 * Publishing defaults: what the profile writes (subjects and book types), where a new book starts
 * (book type, length, trim, interior theme, cover style, imprint), the copyright page and the
 * illustrative line. All of it comes from the profile file; each book can still change it.
 */
export function PublishingTab({ draft, update, errors }: TabProps) {
  const copyrightRef = useRef<HTMLTextAreaElement>(null);
  const pub = draft.publishing;
  const setPub = (patch: Partial<typeof pub>) => update((d) => ({ ...d, publishing: { ...d.publishing, ...patch } }));
  const words = String(pub.defaultWordTarget || "");
  const defaultType = getBookType(pub.defaultBookType);
  const wordsError =
    defaultType && pub.defaultWordTarget > 0 && (pub.defaultWordTarget < defaultType.wordRange.min || pub.defaultWordTarget > defaultType.wordRange.max)
      ? `A ${defaultType.name.toLowerCase()} runs ${formatNumber(defaultType.wordRange.min)} to ${formatNumber(defaultType.wordRange.max)} words.`
      : undefined;

  function toggleType(id: string) {
    update((d) => {
      const on = d.bookTypes.includes(id);
      const bookTypes = on ? d.bookTypes.filter((t) => t !== id) : [...d.bookTypes, id];
      const defaultBookType = bookTypes.includes(d.publishing.defaultBookType) ? d.publishing.defaultBookType : (bookTypes[0] ?? "");
      return { ...d, bookTypes, publishing: { ...d.publishing, defaultBookType } };
    });
  }

  function chooseDefaultType(id: string) {
    const t = getBookType(id);
    setPub(
      t
        ? {
            defaultBookType: id,
            defaultWordTarget: t.wordRange.default,
            trim: t.defaultTrim,
            defaultInteriorTheme: t.defaultInteriorTheme,
            defaultCoverStyle: t.defaultCoverStyle,
          }
        : { defaultBookType: id },
    );
  }

  function insert(token: string) {
    const el = copyrightRef.current;
    const text = pub.copyright;
    const start = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? text.length;
    setPub({ copyright: text.slice(0, start) + token + text.slice(end) });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  return (
    <div className="grid gap-12">
      <section className="grid gap-6" aria-labelledby="p-writes">
        <SectionTitle id="p-writes" title="What this profile writes" body="The new book wizard offers these book types first when this profile is chosen." />
        <ListEditor
          label="Subjects and genres"
          items={draft.genres}
          onChange={(genres) => update((d) => ({ ...d, genres }))}
          addLabel="Add a subject"
          placeholder="For example, Wellbeing for healthcare staff"
          emptyText="No subjects yet."
        />
        <fieldset className="grid gap-4">
          <legend className="mb-1 text-label text-ink">
            Book types <span className="font-normal text-ink-secondary">({draft.bookTypes.length} chosen)</span>
          </legend>
          {bookCategories.map((c) => (
            <div key={c.id} role="group" aria-labelledby={`p-cat-${c.id}`} className="grid gap-2">
              <p id={`p-cat-${c.id}`} className="text-small font-semibold text-ink-secondary">
                {c.name}
              </p>
              <div className="flex flex-wrap gap-2">
                {bookTypesIn(c.id).map((t) => (
                  <Chip key={t.id} pressed={draft.bookTypes.includes(t.id)} onClick={() => toggleType(t.id)} title={t.description}>
                    {t.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </fieldset>
      </section>

      <section className="grid gap-5" aria-labelledby="p-start">
        <SectionTitle
          id="p-start"
          title="New books start with"
          body="Choosing a default book type fills in its length, trim, interior and cover style. Change any of them after."
        />
        <div className="grid gap-5 sm:grid-cols-2">
          <Select
            label="Default book type"
            value={pub.defaultBookType || null}
            placeholder={draft.bookTypes.length === 0 ? "Choose book types above first" : "Choose a book type"}
            disabledReason={draft.bookTypes.length === 0 ? "Choose at least one book type above." : undefined}
            options={draft.bookTypes.map((id) => ({ value: id, label: getBookType(id)?.name ?? id }))}
            onChange={chooseDefaultType}
            className="sm:col-span-2"
          />
          <Input
            label="Word target"
            inputMode="numeric"
            value={words}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/[,\s]/g, ""));
              setPub({ defaultWordTarget: Number.isFinite(n) ? n : 0 });
            }}
            error={wordsError}
            hint={
              defaultType && !wordsError
                ? `${formatNumber(defaultType.wordRange.min)} to ${formatNumber(defaultType.wordRange.max)} for this book type.`
                : undefined
            }
          />
          <Select label="Trim size" value={pub.trim} onChange={(trim) => setPub({ trim })} options={TRIM_OPTIONS} hint={TRIM_HINT} />
          <Select
            label="Interior theme"
            value={pub.defaultInteriorTheme}
            onChange={(defaultInteriorTheme) => setPub({ defaultInteriorTheme })}
            options={themeOptions}
            hint="Typefaces, sizes and margins for the inside pages."
          />
          <Select
            label="Cover style"
            value={pub.defaultCoverStyle}
            onChange={(defaultCoverStyle) => setPub({ defaultCoverStyle })}
            options={coverOptions}
            hint="The preview on the right shows it."
          />
          <Input
            label="Imprint"
            value={pub.imprint}
            placeholder="For example, Kestrel Row Press"
            onChange={(e) => setPub({ imprint: e.target.value })}
            hint="Leave empty to print the name alone."
            className="sm:col-span-2"
          />
        </div>
      </section>

      <section className="grid gap-5" aria-labelledby="p-copyright">
        <SectionTitle id="p-copyright" title="Copyright page" body="Use placeholders, never a fixed year. The preview shows the page as it will print." />
        <Input
          label="Copyright name"
          value={pub.copyrightName}
          placeholder={draft.name.trim() || "The name on the book"}
          onChange={(e) => setPub({ copyrightName: e.target.value })}
          hint={`Fills {name}. Prints as “${copyrightHolder(draft)}”. Some authors use their legal name here.`}
        />
        <div className="grid gap-2">
          <p id="p-chips" className="text-small text-ink-secondary">
            Insert a placeholder
          </p>
          <div role="group" aria-labelledby="p-chips" className="flex flex-wrap gap-2">
            {PLACEHOLDERS.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => insert(t)}
                className="hit-44 inline-flex h-[30px] items-center rounded-pill border border-border bg-sheet px-3 font-mono text-[12.5px] text-ink-secondary hover:bg-sunken hover:text-ink"
              >
                {t}
              </button>
            ))}
          </div>
        </div>
        <Textarea
          ref={copyrightRef}
          label="Copyright line"
          rows={3}
          value={pub.copyright}
          onChange={(e) => setPub({ copyright: e.target.value })}
          error={errorFor(errors, "copyright")}
          hint={`{year} prints as ${PREVIEW_YEAR} for a book published this year. {title} prints the book's title.`}
        />
        <Textarea
          label="Disclaimer"
          rows={4}
          value={pub.disclaimer}
          onChange={(e) => setPub({ disclaimer: e.target.value })}
          error={errorFor(errors, "disclaimer")}
        />
      </section>

      <section className="grid gap-5" aria-labelledby="p-illus">
        <SectionTitle
          id="p-illus"
          title="Stories are illustrative"
          body="For real people who draw on their own work. The line goes on the copyright page of new books."
        />
        {draft.realPerson ? (
          <Switch
            label="Add the illustrative line"
            description="You can switch it off for a single book."
            checked={pub.illustrative}
            onChange={(illustrative) => setPub({ illustrative })}
          />
        ) : (
          <p className="text-small text-ink-secondary">Only for real people. Turn on “Real person” in Identity to use it.</p>
        )}
        {draft.realPerson && pub.illustrative && (
          <Textarea
            label="Illustrative line"
            rows={3}
            value={pub.illustrativeLine}
            onChange={(e) => setPub({ illustrativeLine: e.target.value })}
            error={errorFor(errors, "illustrativeLine")}
          />
        )}
      </section>
    </div>
  );
}

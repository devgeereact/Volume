# Book templates

Each file sets the default structure, word targets and rules for one kind of book. A new book copies its template's sections into the database as an ordered list. The owner can then switch sections off, reorder them or change targets for that book only. The template itself ships complete and is never trimmed to save effort.

| File | Book type | Phase |
|---|---|---|
| `nonfiction.json` | Non-fiction, first person, narrative (default) or practical variant | 1 to 5 |
| `fiction.json` | Novels and novellas: scene breaks, no subheadings, no takeaways, story bible | 6 |
| `workbook.json` | Non-fiction with exercises, fill-in pages and notes pages | 6 |
| `picture-book.json` | Bedtime picture books: spreads, a new word, gentle conflict, nothing scary | 7 |
| `cookbook.json` | Recipes grouped into chapters: headnote, serves, timings, metric ingredients, numbered method | 6 |
| `journal.json` | Guided journals, planners and children's activity books: pages built from page kinds (low-content) | 6 |
| `poetry.json` | Poetry collections: poems on new pages, line breaks kept exactly | 6 |

`config/book-types.json` maps about 30 book types onto these seven templates (D-017).

## Section fields

- `id`: stable key used by the database, export and prompts.
- `kind`: `front`, `part`, `chapter`, `back` or `package` (kept with the book but not printed, such as the summary).
- `title`: printed heading. `{n}`, `{roman}`, `{chapterTitle}`, `{partTitle}` and `{penName}` are filled by the app.
- `required`: the section cannot be deleted, only edited (it can still be switched off by the owner where `defaultOn` allows, with a preflight warning).
- `defaultOn`: whether a new book starts with it switched on.
- `source`: where the words come from.
  - `profile`: the author profile, copied as written (about the author is always the profile bio word for word).
  - `owner`: entered or approved by the owner (title page, epigraph, foreword, references).
  - `ai`: written by a pipeline prompt; `promptId` names it.
  - `app`: built by code with no AI (contents, title check, AI disclosure note, notes pages).
- `kdpRuleIds`: rules in `config/kdp-rules/` the section must satisfy.
- `writesAs` (optional): the section is written like another one (`glossary-of-nhs-terms` is written as a glossary).

## Book types

`config/book-types.json` lists each type's front and back matter in order (`structure.frontMatter`, `structure.backMatter`), and every id there is a section in the type's `templateFile` (a server test checks all 35). New books get exactly those sections: AI pages switched on, pages built by the app at export, and pages only the owner can supply (a disclaimer, a map, practical information) switched off until the owner fills them. Required template sections a type leaves out count as switched off on purpose. The blueprint and the writer get the type's structure, word range and genre rules with the template rules.

## Chapter rules

`chapterRules` sets the chapter count, word target per chapter, subheading count (non-fiction: 3 or more, title case), the Key Takeaways block (3 to 5, on by default for non-fiction, off for fiction), the opening hook style (one style for the whole book), and the bridge to the next chapter. Word targets have a 15% tolerance, the phase 3 acceptance figure.

## Packages

Every template lists a publishing package (back cover blurb, short bio, Amazon description, categories, keywords, title check, AI disclosure note, claims report) and a marketing package (TikTok scripts, Instagram captions, launch email). Limits such as the 4,000-character description or 7 keywords are not copied here: sections point to the KDP rule ids so the numbers live in one place.

## Honesty rules built into the templates

- ISBN appears on the copyright page only when the owner entered one. It is never generated.
- The year on the copyright page is filled automatically.
- Foreword only from a real named person the owner adds. Epigraph and quote hooks only from quotes the owner supplied or that appear word for word in the research sources.
- References and resources only from research `url_citation` sources or owner entries.
- "Also by" lists only books marked Published under the same pen name.
- The review request offers nothing in return and never asks for a positive review.
- When a profile is a real person, the "stories are illustrative" copyright line is offered by default.

## Changing a template

Templates are configuration, not prompts, so they can be edited in place. Bump `version`, add a line to `CHANGELOG.md`, and record any structural change (a new required section, a changed default) in `DECISIONS.md`. Existing books keep the structure they were created with.

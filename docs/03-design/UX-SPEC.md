# 09 Screens and flows

Every screen uses the app shell from `docs/03-design/DESIGN-SYSTEM.md`: left nav, main canvas, right inspector, and a job bar while work runs. Requirements behind each screen are in `docs/01-product/PRODUCT-SPEC.md` (module numbers in brackets).

## Route map

| Route | Screen |
|---|---|
| `/` | Library (signed in). Signed-out visitors on a hosted build see the landing hero here (D-053) |
| `/welcome` | Landing hero, inside the app (D-053) |
| `/how-it-works` | How it works hero: the seven stages on a sample book (D-053) |
| `/sign-in` | Branded sign-in. Signed out, every other path shows it too; signed in, it opens the Library (D-053) |
| `/profiles` | Profiles |
| `/profiles/:id` | Profile editor (`/profiles/new` to add) |
| `/books/new` | New book wizard |
| `/books/:id/research` | Research |
| `/books/:id/titles` | Titles |
| `/books/:id/blueprint` | Blueprint |
| `/books/:id/writing` | Writing |
| `/books/:id/editor/:sectionId?` | Editor |
| `/books/:id/cover` | Cover studio |
| `/books/:id/export` | Export |
| `/books/:id/marketing` | Marketing |
| `/settings/:tab?` | Settings (models, budgets, key, backups, house style, KDP rules) |
| `/archive` | Archive |

## Screens

Implemented corrections: Library imports Markdown into a new book or a project ZIP; saved profiles accept JPEG/PNG portraits; API blueprint versions compare and restore as a new draft; writing confirms high estimated costs; Export accepts prices before publication. These flows have targeted browser evidence in LOCAL-VALIDATION-2026-10-06.md. The descriptions below are the wider UX acceptance contract, not an exhaustive runtime audit.

### Library [M2]
- **Purpose:** see every book by pen name and status; open or start one.
- **Regions:** header with search, filters (pen name, status, template) and "New book"; grid of book cards (list view toggle); inspector shows the selected book's summary, spend and last jobs.
- **Components:** book card (cover thumbnail, title, pen name, status chip, words, spend, live progress), filter chips, view toggle.
- **Primary action:** New book.
- **Empty:** "No books yet. Start one from an idea or a working title." with New book. If no profile exists, the action is "Add a pen name first".
- **Loading:** six card skeletons. **Error:** "Could not load your books" with Retry.

### Profiles [M1]
- **Purpose:** manage pen names and real-person profiles.
- **Regions:** list of profile cards (pen name, real-person badge, books count, default writer model); inspector shows bio preview.
- **Primary action:** Add pen name.
- **Empty:** "No pen names yet. Add your first one." **Loading:** card skeletons. **Error:** retry banner.

### Profile editor [M1]
- **Purpose:** edit one profile's identity, bio, voice, brand, templates and models.
- **Regions:** tabs (Identity, Bio, Voice DNA, Brand, Templates, Models, Memory); inspector shows a live preview of the copyright page and About the Author as they will print.
- **Components:** text fields with counts, credential and link lists, sample editor with word counts, real-person switch with explanation, template fields with placeholder chips (`{year}`, `{pen_name}`, `{title}`, `{edition}`, `{isbn_line}`), per-stage model rows, memory list with switches.
- **Primary action:** Save profile.
- **Empty:** each tab explains what to add (for example "Paste a few paragraphs that sound like this author").
- **Error:** inline field errors, for example "Use {year} instead of a fixed year."

### New book wizard [M3]
- **Purpose:** start a book in under a minute.
- **Regions:** step header (1 Profile, 2 Template, 3 Idea, 4 Format and budget, 5 Review); single-column form; inspector hidden.
- **Primary action:** per step "Next"; last step "Start research" (secondary: "Skip to titles").
- **Empty:** not applicable. **Error:** inline; network failure keeps entered values.

### Research [M4]
- **Purpose:** understand audience and gaps with real sources.
- **Regions:** run header (model, cost, date, run selector); results in sections (audience, problems, angles, competing themes, gaps, keyword ideas); inspector lists sources with tick boxes "use in book".
- **Components:** source card (title, domain, open link), angle cards, keyword chips, run history menu.
- **Primary action:** Choose titles (secondary: Run again).
- **Empty:** "Research has not run yet" with Run research and its cost estimate.
- **Loading:** live status lines from SSE ("Searching the web", "Reading 6 sources"). **Error:** model without web search, budget paused, provider error, each with its fix.

### Titles [M5]
- **Purpose:** pick a title and subtitle.
- **Regions:** 5 direction columns or rows; 10 option cards grouped by direction; inspector shows the chosen option with character count and checks.
- **Components:** option card (title, subtitle, character counter against 200, check badges, edit, choose), direction header with "More like this".
- **Primary action:** Use this title.
- **Empty:** "Generate title options" with cost. **Error:** invalid options are greyed with the reason.

### Blueprint [M6]
- **Purpose:** shape and approve the whole plan.
- **Regions:** outline tree (front, parts and chapters, back, listing) on the left of the canvas; selected part's form on the right of the canvas; inspector shows validation, word total against range, and versions.
- **Components:** chapter card (title, subheadings, summary with word count, target), "Regenerate this part" with optional instruction, version compare, approve bar.
- **Primary action:** Approve blueprint (disabled with the list of what is missing).
- **Empty:** "Build the blueprint" with cost. **Loading:** parts fill in as they arrive. **Error:** schema failure shows "The plan came back incomplete. Try again or pick another model."

### Writing [M7]
- **Purpose:** watch the book being written and handle anything that needs attention.
- **Regions:** section list with status (queued, writing, checking, done, needs attention); live preview of the current section; inspector shows words so far, checks, cost so far against budget, model.
- **Components:** progress header (sections done of total, time running), streamed text pane, check badges, pause, resume, cancel, regenerate section.
- **Primary action:** Write book (with estimate) before the run; Open editor after it.
- **Empty:** "Approve the blueprint first" with a link, or "Ready to write 12 sections".
- **Error:** budget paused ("This book needs about $1.20 more. Raise the budget or stop here."), model unavailable (offer fallback), needs attention list.

### Editor [M9]
- **Purpose:** read, edit and polish every section.
- **Regions:** section list with badges; TipTap editor; inspector tabs: Checks, Claims, Suggestions, Versions.
- **Components:** toolbar (headings, bold, italic, list, takeaways, scene break), suggestion card (original, proposed, reason, accept, reject), version compare, find and replace panel, selection menu "Rewrite with instruction", editor pass menu (structure, line, voice).
- **Primary action:** Save version (`Cmd S`).
- **Empty:** a section with no text shows "Write this section" and "Paste your own".
- **Error:** save conflicts show both versions to choose from.

### Cover studio [M10]
- **Purpose:** from brief to final eBook cover and paperback wrap.
- **Regions:** brief editor; concept grid (3 to 4); typography controls; preview switcher (eBook, wrap, thumbnail at 160 px); inspector shows spec (size, spine, page count used, DPI).
- **Primary action:** steps in order: Write brief, Make concepts, Use this concept, Build covers.
- **Empty:** "Write a cover brief" with cost. **Loading:** concept placeholders with progress. **Error:** image failed (no charge), wrap blocked until the interior PDF exists.

### Export [M11]
- **Purpose:** build files, check them and download the pack.
- **Regions:** preflight list grouped by area with pass, warn, block and "Fix" links; format list with last build time and stale flag; calculator (printing cost, minimum price, royalty per format with rule date); inspector shows the selected file's details.
- **Primary action:** Build pack (disabled while blocks remain).
- **Empty:** "Nothing built yet". **Error:** each failed export shows its log summary and Retry.

### Marketing [M12]
- **Purpose:** launch content per book.
- **Regions:** tabs (TikTok, Instagram, Email); item cards; inspector shows the selected item with copy buttons.
- **Primary action:** Generate (per tab, with cost).
- **Empty:** "No scripts yet for this book." **Error:** standard retry.

### Settings [M13]
- **Purpose:** key status, models, budgets, backups, house style and rules.
- **Regions:** tabs on the left of the canvas; tab content; inspector shows help for the selected field.
- **Components:** key status card (present, valid, credit; never the key), model picker table (stage, model, price per million input and output tokens, context, capability badges, fallback list), budget fields with month-to-date spend, backup card, rules version card.
- **Primary action:** Save (per tab).
- **Empty:** no key: "Add OPENROUTER_API_KEY to the server .env file, then restart. Volume runs with the mock writer until then."
- **Error:** model list could not load: show cached list with its date.

### Archive [M2]
- **Purpose:** find and restore archived books, profiles and marketing items.
- **Regions:** tabs (Books, Pen names, Marketing); list with archived date; inspector with restore.
- **Primary action:** Restore. **Empty:** "Nothing archived."

## Main flows

### New book to export

1. Library: New book.
2. Wizard: pick profile, template, enter idea, trim, paper, budget; Start research.
3. Research runs (job, SSE). Owner ticks sources to use; Choose titles.
4. Titles: generate, compare, edit one; Use this title.
5. Blueprint: generate; regenerate any part; fix validation; Approve blueprint.
6. Writing: Write book (confirm estimate). Sections write in order with checks. Owner may leave; the Library card shows progress.
7. Writing shows "needs attention" items; owner opens each in the Editor.
8. Editor: run line and voice passes, accept suggestions, resolve claims (verify, soften, remove).
9. Matter and metadata run as part of Write book; owner reviews listing fields in Blueprint (listing) or Export.
10. Cover studio: brief, concepts, choose, typography, Build covers (wrap uses the real interior page count).
11. Export: preflight, fix blocks, tick warnings, Build pack, download zip.
12. Marketing: generate scripts, captions and email once writing is complete (D-049: every section the AI or the owner writes has real text, placeholders do not count). Items already made stay visible; only Generate is locked. Counts come from the template (5 TikTok scripts and 5 Instagram captions).
13. After upload to KDP, Export or the Library card: Mark as published, with a date of today or earlier (adds to Also by and the Published shelf). Archive sits beside it with an Undo.

### Regenerate a chapter

1. Writing or Editor: select the chapter; choose Regenerate.
2. Dialog: optional instruction, keep subheadings (default on), model (current shown), estimate.
3. A `write_section` job runs; the current version stays visible until the new one is saved.
4. Checks run; the new version becomes current; the old one stays in Versions.
5. If later chapters referenced the old text, a consistency warning appears on them (no automatic rewrite).

### Change the model for a stage

1. Settings, Models (workspace); or Profile editor, Models (pen name); or the model menu in any book screen's inspector (this book only).
2. Pick the stage row, open the picker, filter by capability, compare prices, choose.
3. Set fallbacks (optional). Save.
4. The next job of that stage uses the new model; running jobs finish on the old one. `prompt_runs` records which answered.

### Add a pen name

1. Profiles: Add pen name.
2. Identity: pen name, imprint, real-person switch (explains the illustrative line).
3. Bio: third-person bio, short bio, credentials, links.
4. Voice DNA: characteristics, samples that sound like and do not sound like the author.
5. Templates: review the copyright and disclaimer defaults with `{year}`.
6. Models: keep workspace defaults or choose a different writer.
7. Save profile; it appears in the wizard.

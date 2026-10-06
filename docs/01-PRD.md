# 01 Product requirements

What Volume does, module by module. Each module has user stories ("As the owner, I want...") and acceptance criteria (AC) a tester can check. Screens are in `09-UX-FLOWS.md`, data in `03-DATA-MODEL.md`, AI stages in `04-AI-PIPELINE.md`, files in `06-EXPORT-SPEC.md`. KDP numbers cite fact IDs from `docs/reference-kdp-facts-2026-10-03.md` (FACTS) and are read at run time from `config/kdp-rules/`.

## The book structure every book follows

This section is copied in full from the approved plan. It is the contract for the book model, the templates and every export.

Every book is stored as an ordered list of sections. Each section can be switched off or reordered, but the template ships complete:

1. **Front matter:** half title (optional); title page (title, subtitle, author, imprint); copyright page (© year and name, all rights reserved, reproduction notice, disclaimer, edition, ISBN only if the owner entered one, "stories are illustrative" line when chosen); dedication; epigraph (optional); contents (chapters with their subheadings, as in the drafts); foreword (optional, only from a real named person the owner adds); preface (optional); acknowledgements; introduction.
2. **Body:** optional Parts (Part I, Part II...), each with a title; chapters numbered and titled in title case; each chapter has an opening hook (quote, question or scene, consistent across the book), 3 or more subheadings in title case, flowing prose, optional "Key Takeaways" (3 to 5) and a bridge to the next chapter.
3. **Back matter:** conclusion or epilogue; appendix, resources, glossary and references (optional, references only from real sources); about the author (third person, the profile bio); also by (only published books under the pen name); a polite review request with no incentive; newsletter or social links.
4. **Publishing package (with every book):** back cover blurb and short author bio; Amazon description (up to 4,000 characters including HTML); 3 categories; 7 keywords; title and subtitle check (under 200 characters); KDP AI disclosure note; claims to verify report.
5. **Marketing package:** TikTok scripts with hooks, Instagram captions, a launch email.

Book templates set the defaults: non-fiction (as above, 10 chapters, 25,000 to 50,000 words), fiction (no takeaways, scene breaks, chapters without subheadings), workbook (exercises and fill-in pages), picture book (spreads, a new word, gentle conflict, nothing scary).

## M1 Profiles and pen names

Stories:
- As the owner, I want several author profiles so each pen name has its own voice, bio and brand.
- As the owner, I want to mark a profile as a real person so the app offers the "stories are illustrative" line and treats claims with extra care.
- As the owner, I want the copyright year filled in automatically so I never ship "© 2025" in a 2026 book.
- As the owner, I want a pen name to use a different writing model from the others.

Profile fields:

| Group | Fields |
|---|---|
| Identity | pen name (display), legal name (private, never exported), imprint name, location, language (default en-GB), status (active, archived) |
| Real-person flag | `is_real_person`; when on, "stories are illustrative" line offered by default (owner can switch off per book) |
| Bio | third-person bio (used verbatim as About the Author), short bio (back cover, up to 60 words), credentials (list, each one line), links (label and URL; Instagram, website, newsletter) |
| Voice DNA | characteristics (list, for example "warm, never clinical"), point of view (default first person), sounds-like samples, does-not-sound-like samples, sentence rhythm notes, humour level (none, light, frequent), favourite metaphors and themes, ending preference, phrases to avoid (added to the house list), phrases to keep, dialect and spelling (British by default) |
| Brand | cover style notes, colours (hex), preferred cover and interior fonts, logo asset |
| Templates | copyright template, disclaimer template, illustrative-stories line, review request text, newsletter line; placeholders `{year}`, `{pen_name}`, `{title}`, `{edition}`, `{isbn_line}` |
| Models | per-stage model choice that overrides the workspace default (see M12) |
| Memory | learned preferences from accepted edits (read-only list, each item can be switched off or deleted) |

AC:
- AC1.1 Creating, editing, archiving and restoring a profile works; archived profiles are hidden from the new book wizard but their books stay in the Library.
- AC1.2 `{year}` renders as the book's publication year, defaulting to the current year at export. No template contains a fixed year after save (validation rejects four-digit years 1900 to 2099 in templates, with a hint to use `{year}`).
- AC1.3 `{isbn_line}` renders "ISBN: <value>" only when the owner entered an ISBN for that format; otherwise the line is removed.
- AC1.4 The bio is stored once; About the Author in every book under that profile is byte-identical to it (preflight checks a hash).
- AC1.5 Turning on the real-person flag sets the illustrative line on for new books under that profile.
- AC1.6 Voice DNA samples accept up to 10 entries of up to 1,500 words each, with a live word count.
- AC1.7 Deleting a profile with books is blocked; the owner must archive it.

## M2 Library

Stories: as the owner, I want to see every book by pen name and status, and find one quickly.

AC:
- AC2.1 Books show as cards with cover thumbnail (or a placeholder), title, pen name, status, word count, last change and AI spend.
- AC2.2 Filters: pen name, status (idea, research, titles, blueprint, writing, editing, cover, export, published, archived), template. Search by title and subtitle.
- AC2.3 A running job shows live progress on its card through SSE.
- AC2.4 Marking a book Published asks for the date and adds it to "Also by" for that pen name.
- AC2.5 Archive and restore work; the Archive screen lists archived books and archived marketing items.
- AC2.6 Import a manuscript in the Volume Markdown dialect (`06-EXPORT-SPEC.md`) as a new book.

## M3 New book wizard

Stories: as the owner, I want to start a book from a rough idea or a working title in under a minute.

Steps: 1 profile; 2 template (non-fiction in v1; others shown as "coming in phase 6/7"); 3 idea or working title, optional notes, audience hint, target length (from the template range); 4 trim size (5 x 8, 5.5 x 8.5, 6 x 9 default, 8.5 x 11), paper (white or cream), book budget (US dollars, default from Settings); 5 review and start research.

AC:
- AC3.1 The wizard creates a project with all template sections in order, status `idea`.
- AC3.2 Back and Next keep entered values; closing the wizard asks before discarding.
- AC3.3 "Start research" queues the research job and opens the Research screen.
- AC3.4 "Skip research" is allowed; titles then use the idea and profile only.

## M4 Research

Stories: as the owner, I want real, clickable sources and a clear view of the audience and gaps before I choose a title.

AC:
- AC4.1 Research runs the research stage through OpenRouter web search (`:online` or the `web` plugin; see `02-ARCHITECTURE.md`).
- AC4.2 Sources are taken only from `url_citation` annotations on the response. A URL that appears only in the model's text is discarded and logged.
- AC4.3 Output shows audience, reader problems, angles, competing themes, gaps, keyword ideas and the source list (title, domain, link). Links open in the system browser.
- AC4.4 The owner can tick sources as "use in book"; only ticked sources can appear in References.
- AC4.5 Re-running research creates a new run and keeps the old ones.
- AC4.6 Phase 2 acceptance: a live run returns 3 or more working sources.

## M5 Titles

Stories: as the owner, I want 5 directions and 10 title and subtitle options I can compare and edit.

AC:
- AC5.1 One run returns 5 directions (angle, audience, promise) and 10 options (title, subtitle, direction).
- AC5.2 Each option shows its combined character count; any option at 200 characters or more is marked invalid and cannot be chosen (FACTS 5.4: "fewer than 200 characters").
- AC5.3 Options are checked for British spelling and banned phrases; failures are marked.
- AC5.4 The owner can edit an option, regenerate all, or regenerate one direction's options.
- AC5.5 Choosing an option sets the project title and subtitle and moves status to `blueprint`.

## M6 Blueprint

Stories: as the owner, I want a complete plan I can change part by part, then approve.

Blueprint fields: title; subtitle; summary (200 to 500 words); target audience; unique selling points (3 to 5); tone notes; opening hook style (quote, question or scene); Parts (optional, each with number and title); chapters (number, title in title case, part, 3 or more subheadings in title case, 200 to 300 word summary, word target, key points, takeaways on or off, bridge note); front matter plan (title page, copyright, dedication text, acknowledgements notes, introduction summary and word target, preface on or off with summary, epigraph on or off, foreword only if a named person is added); back matter plan (conclusion summary and word target, appendix, resources, glossary and references on or off, about the author from profile, also by from published books, review request, newsletter line); back cover blurb; Amazon description draft; 3 categories; 7 keywords.

AC:
- AC6.1 Every field above is present and editable. Validation shows counts (summary words, chapter summary words, subheadings per chapter, keywords exactly 7, categories exactly 3).
- AC6.2 Each part regenerates on its own: summary, audience and selling points, one chapter, all chapters, front matter plan, back matter plan, listing fields. Regeneration sends the rest of the blueprint as fixed context.
- AC6.3 Every save creates a new blueprint version; versions can be compared and restored.
- AC6.4 Approve is enabled only when validation passes. Approval locks the version, creates or updates chapter sections, and enables Writing.
- AC6.5 Editing an approved blueprint creates a new draft version; chapters already written are marked "blueprint changed" and are not rewritten automatically.
- AC6.6 Word targets add up; the total shows against the template range.

## M7 Writing (fully automatic)

Stories: as the owner, I want to press one button and watch the book being written chapter by chapter, then come back to a finished, checked draft.

AC:
- AC7.1 "Write book" estimates cost (low and high) from the model prices and word targets, and asks for confirmation if the high estimate is over half the remaining book budget.
- AC7.2 One parent job and one child job per section in book order: introduction, chapters, conclusion, then front and back matter through the matter stage. Each child job writes, checks and saves a version.
- AC7.3 Live progress over SSE: current section, words so far, streamed preview, checks passed, cost so far.
- AC7.4 The story ledger records examples, anecdotes, people, places, metaphors and promises used in each chapter; later chapters receive it and must not repeat entries.
- AC7.5 Each chapter receives earlier chapter summaries and the end of the previous chapter, so bridges connect.
- AC7.6 Pause, resume and cancel work. After a server restart, unfinished jobs resume from the next unfinished section.
- AC7.7 The job pauses (not fails) when the book budget would be exceeded, and says how much more is needed.
- AC7.8 Regenerate one chapter, with optional instructions, creates a new version and leaves others untouched.
- AC7.9 Phase 3 acceptance: a 3-chapter test book completes with zero em dashes and zero banned phrases, chapters within 15% of target, and resumes after a restart.

## M8 Checkers and claims report

AC:
- AC8.1 Deterministic checks on every saved version: em dashes, US spellings (map in `config/house-style.json`), banned phrases, word count against target, repeated sentences and phrases, heading case, subheading count, structure (hook, takeaways when on, bridge), and guardrail patterns (ISBN-like numbers, percentages, "studies show", named awards, quotes with attribution, testimonials, URLs not in research sources).
- AC8.2 Fix order: automatic fixes (em dashes, spellings), then one targeted AI rewrite for the remaining blocking issues, then status "needs attention" with the list.
- AC8.3 The claims report lists every medical, clinical, legal, safety, financial or statistical statement with chapter, sentence, category and the check it needs. Status per claim: open, verified, softened, removed, author's experience.
- AC8.4 Preflight warns while any claim is open, and the pack includes the claims report.

## M9 Editor

AC:
- AC9.1 Chapter list with status, word count and check badges; TipTap editor for the selected section (free extensions only).
- AC9.2 Every save is a version (origin: owner, AI write, AI rewrite, AI edit, checker fix, import, restore). Compare any two versions side by side and restore any version.
- AC9.3 Editor passes (structure, line edit in British English, voice) return suggestions with reason; accept or reject one by one or all. Accepted edits are offered to the profile memory.
- AC9.4 Select text and ask for a rewrite with an instruction; the result is a suggestion, never a silent change.
- AC9.5 Find and replace across one section or the whole book, with match case and whole word, preview count and undo as one version per section.
- AC9.6 Sections can be reordered, switched off, renamed and added from the template list.

## M10 Cover studio

AC:
- AC10.1 The cover stage writes a brief from the blueprint and profile brand; the owner can edit it.
- AC10.2 3 to 4 concepts are generated as background art without text; the owner picks one or regenerates.
- AC10.3 Title, subtitle and author are set by the app with the chosen fonts, never painted by the image model.
- AC10.4 eBook cover: 1600 x 2560 px JPEG, RGB (FACTS 10.5).
- AC10.5 Paperback wrap PDF: back, spine and front with 0.125 in bleed on all outer edges (FACTS 3.8), spine width from page count and paper (FACTS 3.9), spine text only at 80 pages or more (FACTS 3.10), images at 300 DPI or more.
- AC10.6 Phase 4 acceptance: wrap sizes match KDP's cover calculator for 3 page counts on white and cream.

## M11 Export and preflight

AC:
- AC11.1 Exports: print PDF per trim, DOCX, EPUB 3, TXT (owner's `====` format), Markdown, eBook cover, paperback wrap, upload pack zip (`06-EXPORT-SPEC.md`).
- AC11.2 Preflight runs before any pack and shows pass, warn or block per check, with a link to fix.
- AC11.3 A calculator shows printing cost, minimum list price and royalty per format from `config/kdp-rules/` (FACTS 2.1 to 2.4, 3.1, 3.3, 3.4, 10.1), with the rule date.
- AC11.4 The pack is blocked while any block-level check fails; warnings need a tick to continue.
- AC11.5 Phase 1 acceptance: the Windowsill Herbs manuscript imports and its exports match the Python build (page count, trim, fonts, text).

## M12 Marketing

AC:
- AC12.1 TikTok scripts: hook (first line, under 3 seconds spoken), body beats, on-screen text, call to action, suggested length; 5 per run by default.
- AC12.2 Instagram captions (5 by default) with hashtags (up to 10) and a call to action.
- AC12.3 One launch email with subject line options (3), preview text and body.
- AC12.4 All items saved per book with status (draft, used, archived), editable, and exported as text in the pack.
- AC12.5 Marketing copy follows the same guardrails: no invented reviews, testimonials, rankings or awards; no review incentive (FACTS 10.6, 10.7).

## M13 Settings

AC:
- AC13.1 OpenRouter key check: shows present or missing, valid or invalid, and remaining credit or limit when OpenRouter returns it. The key itself is never shown, logged or sent to the browser, not even in part.
- AC13.2 Model picker per stage key from `config/models.defaults.json` (research, titles, blueprint, writing, summarise, checks, editing, matter_metadata, cover_brief, cover_image, marketing), filled from `GET /api/v1/models`, filtered by capability (text, image output, web search), showing input and output price per million tokens and context length.
- AC13.3 Choices saved at workspace level here; profile and book levels override (book wins over profile, profile over workspace, workspace over `config/models.defaults.json`).
- AC13.4 Budgets: default book budget, monthly cap, warning threshold (default 80%). Month-to-date spend shown.
- AC13.5 Backups: on or off, time, last backup, "back up now", folder path.
- AC13.6 House style viewer (read only in v1), KDP rules version and date, with a reminder when the rules are more than 90 days old.

## Phases and acceptance (from the plan)

| Phase | Scope | Done when |
|---|---|---|
| 0 | Workspace, rules, agents, docs, design directions, prototype | Owner picks a direction; prototype covers every main screen, checked at 1440 and 390 wide, no console errors, keyboard navigation works |
| 1 | Foundation, no AI: repo, database, profiles, library, editor with versions, Markdown import, PDF, DOCX, EPUB, TXT, MD exports, KDP rules and calculator | Windowsill Herbs imports and exports match the Python build |
| 2 | Research, titles, blueprint, providers, cost meter | A live run gives 3 or more working sources, 10 valid titles and a complete approved blueprint |
| 3 | Automatic writing, live preview, checkers, claims report, editor passes, selection rewrite | 3-chapter test book: zero em dashes and banned phrases, chapters within 15% of target, resumes after restart |
| 4 | Covers and images | Wrap sizes match KDP's cover calculator for 3 page counts on white and cream |
| 5 | Publishing pack and marketing | Owner uploads one pack to a KDP draft and it is accepted (manual check) |
| 6 | Fiction and workbook templates | See `12-ROADMAP.md` |
| 7 | Picture books | See `12-ROADMAP.md` |
| 8 | Volume mode and accounts | See `12-ROADMAP.md` |

The owner reviews at the end of every phase before the next one starts.

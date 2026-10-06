# Glossary

Terms used across Volume's docs, code and screens. FACTS refers to `docs/reference-kdp-facts-2026-10-03.md`.

| Term | Meaning |
|---|---|
| About the author | Back matter page in the third person. Always the profile bio, word for word |
| AI disclosure | KDP's question about AI content. AI-generated means AI created the content, even if edited afterwards; AI-assisted means the author wrote it and AI only edited or checked (FACTS 5.5). Volume sets it automatically |
| Also by | Back matter list of other books under the same pen name. Only books marked Published |
| Approve | The owner's sign-off on a blueprint. Locks that version and enables writing |
| Back matter | Everything after the last chapter: conclusion, appendix, resources, glossary, references, about the author, also by, review request, links |
| Banned phrases | Stock AI phrases and words that must not appear in books or UI copy. List in `config/house-style.json` |
| Bleed | Extra area beyond the trim edge so colour or images reach the edge after cutting. Covers: 0.125 in on all outer edges (FACTS 3.8). Interiors with bleed: plus 0.125 in width and 0.25 in height (FACTS 3.7) |
| Blueprint | The full plan of a book: title, summary, audience, chapters with subheadings and summaries, front and back matter plans, listing drafts. Versioned and approved before writing |
| Body | The chapters, optionally grouped into Parts |
| Bridge | The closing lines of a chapter that lead into the next one |
| Budget | Spending limit in US dollars for a book or a month. Jobs pause before passing it |
| Checker gate | The sequence after each write: code checks, automatic fixes, model checks, one targeted rewrite, then done or needs attention |
| Claims report | List of medical, clinical, legal, safety, financial and statistical statements for the owner to verify, soften or remove. Included in the pack |
| Context packing | Building an AI request from prioritised blocks (rules, voice, task, book frame, continuity, ledger, allowed facts) that fit the model |
| Cream and white paper | Paper options for paperbacks. They change spine width (FACTS 3.9) |
| Fallback model | The next model offered when the chosen one is unavailable. Never used silently |
| Front matter | Everything before the first chapter: half title, title page, copyright, dedication, epigraph, contents, foreword, preface, acknowledgements, introduction |
| Golden file | A stored expected output that a test compares against exactly or after normalising |
| Hook | A chapter's opening: a quote, a question or a scene, the same style across the book |
| House style | The writing rules for books: British English, no em dashes, no banned phrases, varied sentences, first person |
| Imprint | The publisher name on the title and copyright pages. With KDP's free ISBN it shows as "Independently published" (FACTS 4.1) |
| ISBN | International Standard Book Number. Entered by the owner from KDP or Nielsen, or left empty. Volume never generates one (FACTS 4.1 to 4.4) |
| Job | A unit of background work (research, write section, export) in the SQLite queue, with retries and progress |
| KDP | Kindle Direct Publishing, Amazon's self-publishing service |
| KDP rules | Facts and limits from official KDP pages, stored in `config/kdp-rules/` with fact ID, source and date |
| KDP Select | Optional 90-day Kindle exclusivity programme that adds Kindle Unlimited (FACTS 2.6) |
| KENP | Kindle Edition Normalized Pages, the unit for Kindle Unlimited page-read payments, capped at 3,000 per title per customer (FACTS 2.7) |
| Key Takeaways | Optional box of 3 to 5 points at the end of a non-fiction chapter |
| Ledger (story ledger) | Per-book record of examples, anecdotes, people, places, metaphors, phrases and promises already used, so later chapters do not repeat them |
| Listing | The KDP product details: title, subtitle, description, keywords, categories, prices |
| Matter | Short for front and back matter |
| Mirrored margins | Margins that swap on left and right pages so the inside (binding) margin is always the larger one |
| Mock provider | A stand-in AI provider with fixed answers, used in tests and when no key is set |
| Model tier | A class of model for a stage: top, mid, small, search, image |
| OpenRouter | The single AI gateway Volume uses, with one API key for many model makers |
| Pack (upload pack) | The zip of everything needed to publish: interior PDF, EPUB, DOCX, TXT, MD, covers, listing, reports, marketing |
| Part | Optional grouping of chapters (Part I, Part II), with its own title page |
| Pen name | A name an author publishes under. Each pen name is a profile with its own voice, bio and brand |
| Preflight | The checks run before building the pack. Each passes, warns or blocks |
| Profile | The record behind a pen name or real author: identity, bio, voice DNA, brand, templates, model choices, memory |
| Profile memory | Preferences learned from edits the owner accepted and chose to remember |
| Prompt run | One call to an AI model, stored with prompt id and version, model, tokens, cost and result |
| Real-person flag | Marks a profile as a real, identifiable person. Turns on the "stories are illustrative" line by default and stricter story rules |
| Running head | The line at the top of interior pages: book title on left pages, chapter title on right pages |
| Section | One unit of a book (title page, chapter, about the author). Books are ordered lists of sections |
| Spine | The edge of a paperback between front and back covers. Width = page count x 0.002252 in (white) or 0.0025 in (cream) (FACTS 3.9). Text allowed from 80 pages in Volume (FACTS 3.10) |
| SSE | Server-Sent Events, the one-way stream the server uses to send live progress to the browser |
| Stage | One step of the AI pipeline (research, titles, blueprint, writing, checks, editing, matter and metadata, cover, marketing), each with its own model choice |
| Template (book template) | Defaults for a kind of book: sections, word targets and rules. Non-fiction, fiction, workbook, picture book |
| Trim (trim size) | The finished page size of a printed book, for example 6 x 9 in (FACTS 3.6) |
| ULID | A sortable unique id used for every row |
| `url_citation` | The annotation type on an OpenRouter web search response that carries a real source URL. The only place Volume takes sources from |
| Version | A saved state of a section. Every AI or owner change makes one; any version can be compared or restored |
| Voice DNA | The profile fields that describe how an author writes: characteristics, point of view, rhythm, humour, metaphors, endings, samples, phrases to avoid and keep |
| Volume mode | Later feature for producing many books across pen names, with KDP's limit of 2 new titles per format each week (FACTS 5.7) |
| Workspace | The top-level owner of all data. One in v1; the basis for accounts later |
| Wrap (paperback wrap) | The single cover PDF with back, spine and front, plus bleed |

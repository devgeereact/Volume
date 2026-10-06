# 00 Vision

Volume helps one person run a small publishing business: several pen names, each with its own voice, producing finished books that are honest, well structured and ready for Amazon KDP.

## The problem

The owner already has a working method. It lives in long prompts (Book Architect Pro, the Blueprint template, BOOK CREATION, the Bedtime Story Writer) that are pasted into chat tools one stage at a time. That method has real limits:

- **It is tied to one author.** Harni Muharami's bio, credentials and voice are pasted into every prompt, and the copies have drifted ("MSC in business" in one draft, "MSc in Management and Leadership in Health" in another, "Copyright © 2025" fixed in place).
- **Nothing is saved as structured data.** Titles, blueprints, chapters and marketing scripts live in chat history. Going back a stage means scrolling and re-pasting.
- **Long books break the chat.** A 30,000-word manuscript does not fit one reply, and the model forgets what earlier chapters said, so examples repeat.
- **Quality checks are by eye.** Em dashes, American spellings and stock AI phrases slip through.
- **The last mile is manual.** Turning text into a print PDF with mirrored margins, a Word file, an EPUB, a correctly sized cover and a KDP listing takes hours, and KDP's rules change.
- **Some draft instructions are unsafe.** "Generate a realistic ISBN" and "readers never suspect AI" would break KDP's rules and mislead readers.

The P02 demo book, *Windowsill Herbs*, showed the target: a clean manuscript, a typeset 6 x 9 in PDF, a Word file and a cover, all built from one Markdown file. Volume makes that repeatable for any book and any pen name.

## Who it is for

| When | Who | What they need |
|---|---|---|
| Now (v1) | The owner, on his Mac | Several pen names, fully automatic writing he can trust, a pack he can upload to KDP the same day |
| Later | Side-hustle self-publishers | Their own accounts, their own pen names, the same guardrails, KDP limits enforced for them |

v1 is built for one user, but every row carries a `workspace_id` and IDs are ULIDs, so adding accounts later is an extension, not a rewrite (see `02-ARCHITECTURE.md`).

## Principles

1. **AI assists the business, not just the sentence.** The app thinks "manage an author's publishing business" rather than "make me a book". The book is one output among the listing, the cover, the marketing and the records.
2. **Author identity lives in the profile.** Each pen name has one source of truth: name, bio, credentials, links, voice DNA, brand, copyright and disclaimer templates, and model choices. Every book reads from it. Nothing about an author is typed into a prompt by hand.
3. **Every book is complete.** Front matter, body, back matter, publishing package and marketing package ship with every book (see `01-PRD.md`). Sections can be switched off, but the template is never thin.
4. **Honesty is not optional, even in fully automatic mode.**
   - Never invent ISBNs, statistics, studies, quotes, testimonials, reviews, awards or sources.
   - Medical, clinical, legal, safety and statistical statements go to a claims-to-verify report.
   - About the author is the profile bio, word for word.
   - KDP's AI disclosure is set automatically when AI wrote the text or made the images (FACTS 5.5).
   - Real people are flagged; illustrative stories are labelled when the owner chooses.
5. **The owner always has the final say.** Every stage can be regenerated, every AI change is a version that can be compared and rolled back, and no model is switched silently.
6. **Rules are data, not memory.** KDP numbers come from `config/kdp-rules/` with fact IDs and dates. House style comes from `config/house-style.json`. Prompts are versioned files.
7. **Local first, private by default.** The app binds to 127.0.0.1, data stays in `data/` on the owner's disk, and the only outside call is to OpenRouter.
8. **Calm, visible progress.** Long jobs run in the background with live progress, costs and a clear next step.

## Long-term direction: Volume as a publishing operating system

The owner's BOOK.md draft describes the long-term product. It is kept as direction, not as v1 scope:

- **Author identity layer:** profiles, many pen names per account, an AI memory that learns each author's vocabulary, rhythm, humour, ending preference, favourite metaphors and repeated values.
- **Creative layer:** ideas, research, world building, characters, outlines and manuscripts, with genre engines that know the conventions of romance, thriller, children's books and more.
- **Production layer:** editing, formatting, cover design, front and back matter, print preparation.
- **Publishing layer:** metadata, ISBNs entered by the owner, distribution, exports.
- **Business layer:** royalties, analytics, launches, marketing calendar, a dashboard per pen name.
- **Volume mode:** many books across many pen names, with quality gates and KDP's limit of 2 new titles per format each week (FACTS 5.7) built into the scheduler.
- **Series management** and shared characters and worlds across books.

What changes from the draft: 60 AI agents, microservices, a marketplace and 2,500 pages of specs become 9 pipeline stages in one Node server. The specialist roles in BOOK.md (Research AI, Editor AI, Cover Designer AI, Marketing AI and so on) map onto those stages in `04-AI-PIPELINE.md`.

## v1 scope (phases 1 to 5)

In scope:

- Author profiles and pen names with voice DNA, real-person flag and templates.
- Library, new book wizard, research with cited sources, titles, blueprint, fully automatic writing, checkers and claims report, editor with versions.
- Cover studio (eBook cover and paperback wrap), print PDF, DOCX, EPUB, TXT and Markdown exports, preflight and the upload pack.
- Listing copy and marketing package (TikTok scripts, Instagram captions, launch email).
- Settings with model choice per stage, prices, budgets and a key check.
- The non-fiction template first.

Out of scope for v1:

- Fiction and workbook templates (phase 6) and picture books (phase 7).
- Volume mode, scheduler and real logins (phase 8).
- Direct publishing to KDP or any store. Volume builds the pack; the owner uploads it.
- ISBN generation of any kind. ISBNs are typed in by the owner or left empty.
- Sales and royalty tracking, business dashboard, series management, world building.
- Audiobooks, translations, hardcover wraps.
- Any AI provider other than OpenRouter, and any hosted or cloud deployment.
- Mobile apps. The web app works at phone width for checking progress only.

## What success looks like

- The owner goes from idea to a complete KDP pack for a 10-chapter non-fiction book in one sitting, with his attention needed only at title choice, blueprint approval, claims review and final preflight.
- The pack is accepted by a KDP draft upload without changes (phase 5 acceptance).
- No em dashes, no banned phrases, no invented sources and no open claims in any exported book.
- Running cost per book is known before the run and never goes over the book's budget.

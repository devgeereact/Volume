# Prompt library

Every prompt Volume sends to a model is a Markdown file in this folder. Code never holds prompt text. The loader in `packages/ai` reads the file, fills the variables and sends the System part as the system message and the User part as the user message, to the model chosen for the prompt's `stage` (see `config/models.defaults.json`).

Index of every prompt: `docs/05-PROMPTS.md`.

## File name and versions

`prompts/<folder>/<name>.v<N>.md`, for example `prompts/writing/chapter.v1.md`. The prompt id is `<folder>.<name>` (`writing.chapter`).

- Never edit a released version. Copy it to `.v2.md`, change the copy, set `version: 2`, and add a line under "Changes" at the bottom of the new file.
- A typo fix that does not change behaviour still gets a new version once the prompt has been used in a live run, so every saved output can be traced to the exact text that produced it.
- The app uses the highest version unless a book pins an older one. Each AI call stores the prompt id and version with its output.
- Update `docs/05-PROMPTS.md` in the same change.

## Front matter

```yaml
id: writing.chapter          # folder.name
version: 1
stage: writing               # key in config/models.defaults.json "stages"
tier: mid                    # top | mid | small | search | image
inputs:                      # every variable the prompt uses
  - "{{profile.voice}}"
output: markdown             # "markdown", or a short JSON schema summary
derived_from:                # owner drafts and P02 BOK ids it was adapted from
  - "draft: Book Architect Pro"
  - "BOK-09"
guardrails:                  # rules the checker enforces on the output
  - no invented statistics, studies, quotes, testimonials, awards or ISBNs
```

Drafts are named by their title without the "Prompt" prefix, so `draft: Book Architect Pro` is the file in `docs/source-drafts/` whose name ends in "Book Architect Pro (Book Creation System).md". "Book Blueprint Architect Pro" is the section of that name inside the "Rewrite Request Full Book Production App" draft.

## Body

Two headed parts, in this order:

- `# System`: role, rules, honesty guardrails and the output contract.
- `# User`: the job, with the filled-in variables.

Anything after a `# Changes` heading is ignored by the loader. HTML comments (such as the `<!-- house-style:off -->` markers that let the style hook skip a deliberate list) are stripped before sending.

## Variables

Variables use double braces. The loader fills them from the database and config before the call and fails the call (rather than sending a blank) when a required one is missing. Optional variables are marked in the prompt text with "(may be empty)"; the loader sends "None" for them.

| Variable | Filled from |
|---|---|
| `{{profile.penName}}` | Author profile: the name on the book |
| `{{profile.perspective}}` | One line on who the author is and what they know |
| `{{profile.bio}}`, `{{profile.shortBio}}`, `{{profile.credentials}}` | Profile, verbatim |
| `{{profile.voice}}`, `{{profile.voiceSample}}` | Profile voice notes and a sample of the author's own writing |
| `{{profile.acceptedEdits}}` | Voice observations the owner accepted earlier (profile memory) |
| `{{profile.isRealPerson}}` | Profile flag, `true` or `false` |
| `{{profile.links}}`, `{{profile.brand}}` | Profile links and brand colours (may be empty) |
| `{{profile.dedicationNames}}`, `{{profile.acknowledgementNames}}` | Names the owner allows in those pages (may be empty). Acknowledgement names come from the book setting `acknowledgements`, else the profile's `publishing.acknowledgements` |
| `{{profile.facts}}` | Built by the context packer from the profile: name and real-person flag, perspective, credentials, location, approved bio, links, names for thanks and the book's illustrative-line choice. The only personal facts a prompt may state |
| `{{book.idea}}`, `{{book.type}}`, `{{book.variant}}`, `{{book.genre}}` | Book record; `type` is a template id, `variant` is `narrative` or `practical` |
| `{{book.title}}`, `{{book.subtitle}}`, `{{book.audience}}`, `{{book.tone}}`, `{{book.toneNotes}}` | Book record and approved blueprint |
| `{{book.wordTarget}}`, `{{book.wordCount}}`, `{{book.chapterCount}}` | Target from the template or owner; count measured by the app |
| `{{book.hookStyle}}`, `{{book.takeaways}}`, `{{book.illustrativeStories}}`, `{{book.format}}` | Book settings (`format` is `ebook` or `print`) |
| `{{book.quotes}}` | Quotes the owner supplied, with attribution (may be empty) |
| `{{book.datedPrices}}`, `{{book.checkedMonth}}` | `yes` when the book type requires every price to carry the month it was checked, else `no`; the month and year to write, for example `October 2026` |
| `{{book.pricesCheck}}` | One line from the app's dated-prices check over the written chapters, starting with `passed`, `failed` or `not run` (for example `failed: 4 prices have no month checked`). Pages may say prices carry the month checked only when it starts with `passed` |
| `{{profile.factsUsedIn}}` | The sections where the author's background (a bio sentence or a fact from it) already appears in the body, for example `Introduction`, or `None` |
| `{{template}}` | The book's template rules from `config/book-templates/` (the file its book type picks), only the sections that book type has, plus `bookType` (structure, word and chapter ranges, genre rules from `config/book-types.json`), compact JSON |
| `{{houseStyle.bannedPhrases}}` | `config/house-style.json` bannedPhrases plus the profile's own, comma-separated |
| `{{houseStyle.rules}}` | Short text list of the house-style rule descriptions |
| `{{kdp.titleSubtitleMaxChars}}` | Rule `listing.titleSubtitle.maxChars`, `maxAllowed` |
| `{{kdp.descriptionMaxChars}}`, `{{kdp.descriptionFormatting}}` | Rules `listing.description.maxChars`, `listing.description.allowedFormatting` |
| `{{kdp.keywordsMax}}`, `{{kdp.keywordsAvoid}}`, `{{kdp.categoriesMax}}` | Rules `listing.keywords`, `listing.categories` |
| `{{kdp.spineTextMinPages}}` | Rule `paperback.spine.textMinPages` |
| `{{kdpSelect}}`, `{{goLiveNote}}` | Book's KDP Select choice; a sentence built from rule `publish.goLiveTiming` |
| `{{research}}` | Output of `research.title-research`, JSON |
| `{{research.sources}}` | Numbered list `[S1] title, url, excerpt` built only from `url_citation` annotations |
| `{{direction}}` | The topic direction the owner picked |
| `{{blueprint}}` | The approved blueprint JSON |
| `{{regenerate.target}}`, `{{regenerate.instruction}}` | Blueprint field path and the owner's instruction |
| `{{chapter.number}}`, `{{chapter.title}}`, `{{chapter.partTitle}}`, `{{chapter.subheadings}}`, `{{chapter.summary}}`, `{{chapter.wordTarget}}`, `{{chapter.isLast}}` | The blueprint entry for the chapter (for the introduction and conclusion, their own plan and word target) |
| `{{chapter.kind}}` | The kind of section a check works on: `chapter`, `introduction`, `conclusion`, `how_to_use`, `glossary`, `resources`, `review_request` and so on |
| `{{nextChapter.title}}`, `{{nextChapter.summary}}` | Next chapter (empty for the last) |
| `{{previousSummaries}}` | Summaries of chapters already written, from `checks.summarise-and-ledger` |
| `{{ledger}}` | Used-already ledger as a grouped "used already, do not repeat" list: terms already defined, warnings and disclaimers already given, stories, examples, metaphors, quotes, facts, names and overused phrases |
| `{{text}}`, `{{section.id}}`, `{{section.title}}`, `{{scope}}` | The text a check or edit works on, and where it sits |
| `{{patternHits}}`, `{{mode}}` | Code checker hits from `guardrailPatterns`; `mode` is `standard` or `children` |
| `{{keepLines}}` | Lines the owner marked "keep as written" (may be empty) |
| `{{sections}}`, `{{glossaryTerms}}` | Sections to write in this call; glossary terms from the blueprint |
| `{{selection.text}}`, `{{selection.before}}`, `{{selection.after}}` | Selected text and the text around it in the editor |
| `{{rewrite.mode}}`, `{{rewrite.instruction}}`, `{{rewrite.tone}}`, `{{rewrite.targetWords}}` | Rewrite options chosen in the editor |
| `{{pageCount}}` | Paperback page count from the last print export (may be empty) |
| `{{categoriesSeen}}` | Categories the owner noted on similar books (may be empty) |
| `{{cover.formats}}`, `{{cover.ownerIdeas}}`, `{{cover.shelfNotes}}`, `{{cover.target}}`, `{{cover.aspectRatio}}` | Cover studio settings |
| `{{cover.conceptCount}}` | How many cover concepts to write: the book setting `coverConcepts`, 1 to 4, default 3 (each concept is one paid image) |
| `{{currentWords}}` | Words in the section the extend pass works on (`writing.extend-section`) |
| `{{brief}}`, `{{concept}}` | Output of `cover.cover-brief` and the concept the owner picked |
| `{{count}}`, `{{lengthSeconds}}` | How many scripts or captions; target video length |
| `{{description}}`, `{{launchDate}}`, `{{bookLink}}` | Approved Amazon description, launch date and store link |
| `{{story}}`, `{{story.*}}` | Picture book settings: `topic`, `newWord`, `ageRange`, `characterCount`, `characterIdeas`, `theme`, `wordLimit`, `spreadCount`, `goodnightMessage`, `rhyme`, `artStyle`, `includeSounds`; `{{story}}` alone is the finished story JSON |
| `{{cta}}` | Optional closing line supplied by the owner (may be empty) |
| `{{note.text}}`, `{{note.intent}}` | The author's own note or rough words in the editor, and what she wants it to become |
| `{{weave.before}}`, `{{weave.after}}` | Text just before and after the note, so woven prose (`writing.weave-note`) or a new subsection (`writing.expand-note`) joins smoothly |
| `{{errors}}` | Schema errors passed to the JSON repair prompt |
| `{{styleRewrite.found}}`, `{{styleRewrite.openers}}`, `{{styleRewrite.format}}` | Banned phrases the guardrails found (phrase, the words as written, how often, where, or `None`), paragraph openers that read as scaffolding (such as "Here's the", "Here is the", "Let's", with counts and the limit, or `None`) and the answer format (`a JSON object` or `Markdown`), for the style rewrite prompt |

KDP numbers reach prompts only through `{{kdp.*}}` variables, so the rules file stays the single source.

## Source markers

Research sources are numbered `[S1]`, `[S2]`... When a chapter states a fact from the research, the writer puts the marker straight after the sentence, for example `[[S3]]`. The checker confirms the marker exists; export turns markers into notes or removes them. A factual claim with no marker goes to the claims report.

## Rules every prompt keeps

- British English, no em dashes, no en dashes as dashes, none of the banned phrases.
- Never invent ISBNs, statistics, studies, sources, quotes, testimonials, reviews, ratings or awards.
- Medical, clinical, legal and safety statements are allowed only in plain, cautious form, and the checker lists them in the claims report for the owner.
- When the profile is a real person and the book's illustrative-stories setting is on, personal stories are written as illustrative composites, never as verifiable events, and never with identifiable patients, clients, colleagues or employers.
- About the author is never written by a prompt: it is the profile bio word for word.
- Reader-facing prompts carry `{{profile.facts}}` and never state a personal fact, relationship, history or credential that is not in it, nor describe the author as lacking one. Acknowledgements thank only the names the owner gave; without names the app saves a placeholder the owner must fill.
- The illustrative-stories note sits once on the copyright page; the text adds at most one short label per composite story.
- First person is for the author's view, guidance and reasoning. Writing prompts never invent the author's past experience, habits, mistakes or conversations, and state the author's background at most once in the body (`{{profile.factsUsedIn}}`).
- No firm, product, platform, app or person is named as a scam, regulated, unregulated or on a warning list unless a research source with its marker states it.
- Listing and front-matter text promises nothing about the finished text that no check has confirmed: dated prices only when `{{book.pricesCheck}}` starts with `passed`.

## Humanizer guidance

The latest prompt versions apply humanizer 3.0.0 principles to wording: direct points, varied rhythm, author samples, specific supported details and fewer formulaic openings or endings. Existing contracts and house style take priority. Editorial/checker prompts preserve facts and exact evidence; only fiction or explicitly permitted illustrative composites allow invented scenes.

The guidance is embedded in versioned files. The app does not read a skill from the owner's home directory, and the revision adds no automatic AI call. Voice and line-edit tasks perform the requested editing; automatic style repair retains its existing triggers and targeted scope. AI-generated disclosure remains accurate.

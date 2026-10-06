# Profiles

One JSON file per author profile (D-018). A profile is either a real person writing under their own name or a pen name (a fictional persona). The prototype, the server and the prompts read these files; the app copies them into the database on first run and the owner edits them in Profiles.

| File | Profile | Real person | Writes |
|---|---|---|---|
| `gideon-akinlotan.json` | Gideon Akinlotan (Gakinz, Real Mr Gee) | yes | AI and digital side hustles, beginner tech how-to, business and personal growth, faith and life |
| `harni-muharami.json` | Harni Muharami | yes | Healthcare leadership, nursing practice, wellbeing for healthcare staff |
| `elena-marsh.json` | Elena Marsh (Harbour Lane Books) | no, pen name | Contemporary and historical romance, sweet or clean, series-ready |
| `tobi-rhymes.json` | Tobi Rhymes (Star Rhymes) | no, pen name | Picture books and bedtime stories, ages 3 to 7 |
| `jr-kade.json` | J. R. Kade (Night Ledger Books) | no, pen name | Thrillers, crime and cosy mysteries |

## Honesty rules

- Facts about real people come only from the owner or the owner's drafts in `docs/source-drafts/`. Anything the drafts disagree on, or anything beyond the facts given, carries `status.bio: "owner-to-confirm"` and a note saying what to confirm.
- Pen names are personas. Their bios describe the books and the persona, and never claim qualifications, awards, sales or real-world experience.
- About the Author prints `bio` word for word. The short bio is for the back cover and listings.
- No em dashes and no house-style banned phrases in any text here (`config/house-style.json`).

## Schema

| Field | Type | Notes |
|---|---|---|
| `id` | string | Kebab case, same as the file name |
| `name` | string | Name printed on the cover and title page |
| `initials` | string | Two letters for the avatar |
| `realPerson` | boolean | true turns on the illustrative line by default and the owner-to-confirm checks |
| `legalName` | string or null | Real people only |
| `location` | string or null | Real people only |
| `imprint` | string or null | Printed on the title page and spine when set |
| `bio` | string | Third person, 120 to 180 words, paragraphs separated by a blank line |
| `shortBio` | string | Under 60 words |
| `credentials` | string[] | Real people only, from the owner; empty for pen names |
| `links` | `{ label, value }[]` | Shop, email, social handles |
| `genres` | string[] | Display names |
| `bookTypes` | string[] | Ids from `config/book-types.json` |
| `voice.tone` | string[] | Three or four adjectives |
| `voice.pov` | string | Point of view and tense |
| `voice.rhythm` | string | Sentence and chapter rhythm |
| `voice.vocabulary` | string | Word choice rules |
| `voice.readingLevel` | string | Who can read it |
| `voice.dialogueStyle` | string | How people talk |
| `voice.locale` | `"en-GB"` | Always British English by default |
| `voice.bannedPhrases` | string[] | Extra to the house style list; matched like the house style list |
| `voice.sampleParagraph` | string | 120 to 180 words, original, in this voice; given to the writer prompt as the style anchor |
| `voice.*` (optional) | | `heatLevel`, `heatLevelOptions`, `series` (romance); `audience`, `newWordPerBook`, `contentRulesFrom` (children's); `planning.twistPlan`, `planning.clueLedger` (crime) |
| `publishing.copyrightTemplate` | string | Uses `{year}` and `{name}` |
| `publishing.copyrightName` | string | Fills `{name}`; the owner may change a pen name's copyright to their legal name |
| `publishing.disclaimer` | string | Printed on the copyright page |
| `publishing.illustrativeLine` | string or null | Real people only: "the stories are illustrative" line |
| `publishing.defaultBookType` | string | Id from `config/book-types.json` |
| `publishing.defaultWordTarget` | number | Words for a new book of the default type |
| `publishing.defaultTrim` | string | From `paperback.trimSizes.list` in `config/kdp-rules/` (unverified list) |
| `publishing.defaultInteriorTheme` | string | Id from `config/interior-themes.json` |
| `publishing.defaultCoverStyle` | string | Id from `config/cover-styles.json` |
| `models` | object | One key per stage in `config/models.defaults.json`; a model slug overrides that stage, null uses the default |
| `modelNotes` | string | Why any override exists |
| `status.bio` | `"owner-to-confirm"`, `"confirmed"` or `"pen-name"` | |
| `status.note` | string | What the owner still needs to confirm |
| `createdAt` | ISO 8601 | |

## Adding a profile

Copy the closest file, change every field, keep the bio within 120 to 180 words, and check the defaults point at ids that exist. The prototype imports each file in `prototype/src/data/config.ts`; add the import there too until the server reads the folder.

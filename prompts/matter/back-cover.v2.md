---
id: matter.back-cover
version: 2
stage: matter_metadata
tier: mid
inputs:
  - "{{book.title}}"
  - "{{book.subtitle}}"
  - "{{book.type}}"
  - "{{blueprint}}"
  - "{{previousSummaries}}"
  - "{{profile.penName}}"
  - "{{profile.bio}}"
  - "{{profile.shortBio}}"
  - "{{pageCount}}"
  - "{{kdp.spineTextMinPages}}"
  - "{{houseStyle.bannedPhrases}}"
output: >
  JSON {
    blurb: { headline: string (one line), body: string (100 to 180 words, plain text with paragraph breaks) },
    shortBio: { text: string (max 60 words, third person), source: "profile.shortBio" | "condensed-from-bio", needsOwnerApproval: boolean },
    spineText: { allowed: boolean, title: string | null, author: string | null, reason: string },
    notes: string[]
  }
derived_from:
  - "draft: Rewrite Request Book Blueprint App (Back Cover: synopsis, short author bio)"
  - "draft: Comprehensive Book Generator spec inside Book Architect Pro (back cover elements)"
  - "draft: New Book Prompting (Back Cover)"
  - "BOK-19"
guardrails:
  - short bio uses only facts in the profile bio; verbatim when profile.shortBio exists
  - no praise, quotes, reviews, rankings or awards; no invented credentials
  - spine text only at {{kdp.spineTextMinPages}} pages or more (KDP fact 3.10)
  - no spoilers for fiction
  - British English, no em dashes, no banned phrases
---

# System

You write the back cover text for "{{book.title}}: {{book.subtitle}}" by {{profile.penName}}.

Blurb:

- A one-line headline that names the reader's problem or the story's central question.
- 100 to 180 words of body text, third person: the problem or situation, what the book gives the reader (or, for fiction, who the protagonist is and what is at stake), and who it is for. Short paragraphs. Warm and specific.
- No praise, review quotes, ratings, rankings, awards or "bestseller". No promises of results. No spoilers.

Short author bio:

- If the profile has a short bio, use it word for word: {{profile.shortBio}}
- Otherwise condense the full bio below to 60 words or fewer, third person, using only facts it contains, and set needsOwnerApproval to true. Never add a credential, place, job or achievement.

Full profile bio:
{{profile.bio}}

Spine:

- The paperback has {{pageCount}} pages (may be empty if not yet known). Spine text is allowed only at {{kdp.spineTextMinPages}} pages or more. If allowed, give the title (short form if the title is long) and the author name. If not, say so in reason.

British English, no em dashes. Never use any word or phrase from the banned list below.

Return only the JSON object in the output contract.

Banned words and phrases. None of these may appear anywhere in your answer: not in a title, a heading, a list item or any JSON field, and not in another form (plural, past tense, or the -ing or -ly form). The app checks every answer against this list and sends back any answer that uses one. Choose a plain, specific word instead, and read your answer against the list once before you send it:
{{houseStyle.bannedPhrases}}

# User

Book type: {{book.type}}

Blueprint:
{{blueprint}}

What each chapter covers:
{{previousSummaries}}

# Changes

- v2 (5 October 2026): the banned list now sits in its own block at the end of the System part, says which forms it covers and asks for a read-back before sending, after a live titles run on a small model used three banned phrases. Everything else is as in v1.

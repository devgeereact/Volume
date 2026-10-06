---
id: matter.back-cover
version: 5
stage: matter_metadata
tier: mid
inputs:
  - "{{profile.facts}}"
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
  - "{{book.pricesCheck}}"
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
  - says prices carry the month checked only when the dated-prices check passed
  - no firm, product, platform, app or person named with a regulatory, legal or safety status
  - British English, no em dashes, no banned phrases
---

# System

You write the back cover text for "{{book.title}}: {{book.subtitle}}" by {{profile.penName}}.

Blurb:

- A one-line headline that names the reader's problem or the story's central question.
- 100 to 180 words of body text, third person: the problem or situation, what the book gives the reader (or, for fiction, who the protagonist is and what is at stake), and who it is for. Short paragraphs. Warm and specific.
- No praise, review quotes, ratings, rankings, awards or "bestseller". No promises of results. No spoilers.
- Never name a specific firm, product, platform, app or person as a scam, fraud, unsafe, regulated, unregulated, authorised, unauthorised or banned, or as appearing on a regulator's or warning list.
- Promises about the text: the app's dated-prices check over the written chapters says (may be empty): {{book.pricesCheck}}. You may say that prices carry the month they were checked only when that line starts with "passed". Otherwise say nothing about dated prices, and never promise any other property of the text that no check has confirmed.

Short author bio:

- If the profile has a short bio, use it word for word: {{profile.shortBio}}
- Otherwise condense the full bio below to 60 words or fewer, third person, using only facts it contains, and set needsOwnerApproval to true. Never add a credential, place, job or achievement.

Full profile bio:
{{profile.bio}}

Spine:

- The paperback has {{pageCount}} pages (may be empty if not yet known). Spine text is allowed only at {{kdp.spineTextMinPages}} pages or more. If allowed, give the title (short form if the title is long) and the author name. If not, say so in reason.

British English, no em dashes. Never use any word or phrase from the banned list below.

Return only the JSON object in the output contract.

## Facts about the author

These are the only personal facts you may state or imply about the author:
{{profile.facts}}

Never state a personal fact, relationship, family member, friend, colleague, client, early reader, place, job, past event, habit, qualification or credential that is not in these facts. Do not invent people to thank, quote or describe. Never describe the author as lacking something (credentials, experience, an insider view, a day job) unless these facts say so. When a sentence would need a personal fact you do not have, write it without one.

Banned words and phrases. None of these may appear anywhere in your answer: not in a title, a heading, a list item or any JSON field, and not in another form (plural, past tense, or the -ing or -ly form). The app checks every answer against this list and sends back any answer that uses one. Choose a plain, specific word instead, and read your answer against the list once before you send it:
{{houseStyle.bannedPhrases}}

## Humanizer editing discipline

Use these humanizer principles when choosing wording. Keep the task's output contract and the rules above.

Read the whole passage for unnecessary contrasts, staged openings, repeated sentence starts, dramatic fragments and endings that repeat a point. State the useful point directly. Keep a contrast when it answers an actual misunderstanding. Keep short sentences when they add information. Three items are fine when each carries a distinct point; avoid arranging every idea into threes.

Match the supplied author's rhythm and vocabulary without copying sentences or repeating a signature habit in every paragraph. When no sample is available, use the voice appropriate to the subject: practical and reference passages can be calm and direct. Vary sentence and paragraph length where the meaning asks for it. Preserve genuine uncertainty and distinctive details supported by the input.

Use plain verbs and concrete explanations. Remove inflated importance, unsupported expert endorsements, stock transitions, decorative bold labels and chatbot greetings or sign-offs. Preserve required headings, lists, schema keys and item counts. Keep functional formatting and exact quotations. House style still governs punctuation, spelling and banned phrases, including when a sample differs.

Before returning the answer, check the remaining contrasts, closers, dashes, forced triads and bold labels. Then compare against the source: keep supported facts, names, numbers, dates, quotations, citations and source markers. Do not add personal experiences, credentials or evidence to make prose feel human. Invented scenes belong only to fiction or explicitly permitted, clearly framed illustrative composites. Keep safety notices and genuine scope limits. Return only the required final output, without your editing notes or a claim that a person wrote it.

# User

Book type: {{book.type}}

Blueprint:
{{blueprint}}

What each chapter covers:
{{previousSummaries}}

# Changes

- v2 (5 October 2026): the banned list now sits in its own block at the end of the System part, says which forms it covers and asks for a read-back before sending, after a live titles run on a small model used three banned phrases. Everything else is as in v1.
- v3 (5 October 2026): adds the profile facts block ({{profile.facts}}: bio, credentials, links, names for thanks, illustrative-line choice) with a hard rule never to state personal facts, relationships, history or credentials that are not in the profile, after a live book thanked family and early readers who do not exist and said the author had no credentials.
- v4 (5 October 2026): adds {{book.pricesCheck}}, the app's dated-prices check over the written chapters: the blurb may say that prices carry the month they were checked only when it starts with "passed", after live run 3 ("Small Offer, Real Customers") promised "every price carries the month it was checked" while no price in the book had a month. Also never names a firm or person as a scam, regulated or on a warning list, after the book named a platform as appearing on the FCA warning list with no source.

- v5 (6 October 2026): applies humanizer 3.0.0 wording and source-preservation principles within the existing task contract. Earlier versions remain available for pinned runs.

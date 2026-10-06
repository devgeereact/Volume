---
id: marketing.launch-email
version: 3
stage: marketing
tier: mid
inputs:
  - "{{profile.facts}}"
  - "{{book.title}}"
  - "{{book.subtitle}}"
  - "{{book.type}}"
  - "{{blueprint}}"
  - "{{description}}"
  - "{{profile.penName}}"
  - "{{profile.voice}}"
  - "{{profile.voiceSample}}"
  - "{{launchDate}}"
  - "{{bookLink}}"
  - "{{kdpSelect}}"
  - "{{goLiveNote}}"
  - "{{cta}}"
  - "{{houseStyle.bannedPhrases}}"
output: >
  JSON { subjectLines: string[] (3, under 60 characters), previewText: string (under 90 characters),
         body: string (plain text, under 200 words, with a line '{{bookLink}}' where the link goes),
         advanceReaderNote: string (a separate short message offering a free early copy with no review condition),
         needs: string[] }
derived_from:
  - "BOK-24"
  - "BOK-25"
  - "docs/PLAN.md (marketing package: launch email)"
guardrails:
  - only for people who agreed to hear from the author
  - advance copies offered freely, never 'in exchange for a review' (KDP facts 10.6, 10.7)
  - no hype, countdown pressure, invented praise, results claims, ratings or reader numbers
  - launch date wording allows for KDP go-live timing (fact 10.15)
  - British English, no em dashes, no banned phrases
---

# System

You write a launch email from {{profile.penName}} to people who signed up to hear from them, announcing "{{book.title}}: {{book.subtitle}}". It should feel like a personal note from the author, not a sales blast.

The email:

- Three subject line options under 60 characters, honest and specific, no clickbait. Preview text under 90 characters.
- Body under 200 words, plain text: a warm opening line, why the author wrote the book (one or two sentences), who it is for and one thing a reader will take from it, then a plain link line `{{bookLink}}`, and a short sign-off in the author's voice.
- If the owner supplied a call to action, use it: {{cta}}.
- Timing: the book goes live on {{launchDate}}. {{goLiveNote}} If the link may not work on the day, say "this week" rather than a promise of an exact hour.
- KDP Select status: {{kdpSelect}}. Mention a price promotion only if the owner set one in the blueprint or launch settings.

Also write a separate short note the author can send to a few early readers, offering a free early copy. It may say that honest reviews help other readers, but it must never make the copy conditional on a review, ask for a positive review or offer anything else.

Rules: no hype, no countdown pressure, no claims of results, no invented praise, quotes, ratings or reader numbers. Voice notes: {{profile.voice}}. Voice sample (match rhythm): {{profile.voiceSample}}. British English, no em dashes. Never use any word or phrase from the banned list below.

Return only the JSON object in the output contract.

## Facts about the author

These are the only personal facts you may state or imply about the author:
{{profile.facts}}

Never state a personal fact, relationship, family member, friend, colleague, client, early reader, place, job, past event, habit, qualification or credential that is not in these facts. Do not invent people to thank, quote or describe. Never describe the author as lacking something (credentials, experience, an insider view, a day job) unless these facts say so. When a sentence would need a personal fact you do not have, write it without one.

Banned words and phrases. None of these may appear anywhere in your answer: not in a title, a heading, a list item or any JSON field, and not in another form (plural, past tense, or the -ing or -ly form). The app checks every answer against this list and sends back any answer that uses one. Choose a plain, specific word instead, and read your answer against the list once before you send it:
{{houseStyle.bannedPhrases}}

# User

Book type: {{book.type}}

Amazon description (for content, do not copy it):
{{description}}

Blueprint:
{{blueprint}}

# Changes

- v2 (5 October 2026): the banned list now sits in its own block at the end of the System part, says which forms it covers and asks for a read-back before sending, after a live titles run on a small model used three banned phrases. Everything else is as in v1.
- v3 (5 October 2026): adds the profile facts block ({{profile.facts}}: bio, credentials, links, names for thanks, illustrative-line choice) with a hard rule never to state personal facts, relationships, history or credentials that are not in the profile, after a live book thanked family and early readers who do not exist and said the author had no credentials. The email may say why the author wrote the book only in terms of these facts (the live run claimed "I kept meeting people with a day job").

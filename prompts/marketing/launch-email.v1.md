---
id: marketing.launch-email
version: 1
stage: marketing
tier: mid
inputs:
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

Rules: no hype, no countdown pressure, no claims of results, no invented praise, quotes, ratings or reader numbers. Voice notes: {{profile.voice}}. Voice sample (match rhythm): {{profile.voiceSample}}. British English, no em dashes. Never use: {{houseStyle.bannedPhrases}}.

Return only the JSON object in the output contract.

# User

Book type: {{book.type}}

Amazon description (for content, do not copy it):
{{description}}

Blueprint:
{{blueprint}}

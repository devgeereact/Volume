---
id: writing.front-matter
version: 4
stage: writing
tier: mid
inputs:
  - "{{profile.facts}}"
  - "{{sections}}"
  - "{{profile.penName}}"
  - "{{profile.perspective}}"
  - "{{profile.voice}}"
  - "{{profile.dedicationNames}}"
  - "{{profile.acknowledgementNames}}"
  - "{{profile.isRealPerson}}"
  - "{{book.title}}"
  - "{{book.subtitle}}"
  - "{{book.type}}"
  - "{{blueprint}}"
  - "{{template}}"
  - "{{book.datedPrices}}"
  - "{{book.checkedMonth}}"
  - "{{book.pricesCheck}}"
  - "{{houseStyle.bannedPhrases}}"
output: >
  JSON { dedication?: string, preface?: string (markdown), acknowledgements?: string (markdown),
         howToUse?: string (markdown, workbook only),
         namesUsed: string[] (every personal name used, each must be in the profile lists),
         notesForOwner: string[] (places the owner may want to add real names or details) }
  Only the keys for the sections requested in {{sections}}.
derived_from:
  - "draft: New Book Prompting (Dedication, Acknowledgments)"
  - "draft: Book Architect Pro (Dedication, Acknowledgements 200 to 500 words)"
  - "draft: Rewrite Request Book Blueprint App (dedications to patients, colleagues, community)"
  - "BOK-15"
guardrails:
  - writes only dedication, preface, acknowledgements and how-to-use; title page, copyright, contents, epigraph and foreword are never AI text
  - personal names only from profile.dedicationNames and profile.acknowledgementNames
  - no invented mentors, editors, publishers, organisations, praise or credentials
  - no first-person past, habits, mistakes or conversations unless the profile facts state them
  - no firm, product, platform, app or person named with a regulatory, legal or safety status
  - when dated prices are on, every currency amount followed by "(checked <month year>)"
  - says prices carry the month checked only when the dated-prices check passed
  - British English, no em dashes, no banned phrases
---

# System

You are {{profile.penName}} ({{profile.perspective}}), writing the short personal pages at the front of your book "{{book.title}}: {{book.subtitle}}".

You write only the sections asked for. The title page, copyright page and contents are built by the app from the profile; the epigraph and any foreword come only from the owner. Never write those.

Section rules:

- Dedication: 10 to 60 words, heartfelt and specific to the book's theme. Name people only if they are in this list: {{profile.dedicationNames}}. Otherwise dedicate it to the reader or to the people the book is for, never to family, friends or colleagues the facts do not mention.
- Preface: 300 to 800 words, first person, how and why the book came about and who it is for. Different from the introduction: personal origin, not a map of the book. If the profile is a real person ({{profile.isRealPerson}}), keep events general rather than specific and checkable.
- Acknowledgements: 80 to 300 words, first person, genuine and specific in feeling. Thank only the people in this list, as the owner wrote them: {{profile.acknowledgementNames}}. You may also thank the reader. Never thank anyone or any group that is not in the list: no family, partner, children, friends, colleagues, clients, early readers, mentors, editors, agents, publishers or organisations, and never describe what an unlisted person did. If the list is empty, write nothing for this section and say so in notesForOwner (the app asks the owner for names).
- How to use this book (workbooks and practical how-to books): 150 to 300 words on how the book is laid out, whether to read in order or dip in, how long the exercises or tasks take, and that there are no wrong answers.

Promises about the text: the app's dated-prices check over the written chapters says (may be empty): {{book.pricesCheck}}. How to Use, and every other page here, may say that prices carry the month they were checked only when that line starts with "passed". Otherwise say nothing about dated prices; a general line that prices change and the reader should check before paying is fine.

Named firms: no research sources are given for these pages, so never name a specific firm, product, platform, app or person as a scam, fraud, unsafe, regulated, unregulated, authorised, unauthorised or banned, or as appearing on a regulator's or warning list. Describe how the reader can check instead (for example, search the regulator's own register) without naming anyone.

Dated prices (may be empty): {{book.datedPrices}}. When it is yes, every price or cost written with a currency amount (£, $ or €, including example prices in worked examples) carries "(checked {{book.checkedMonth}})" straight after it, in that exact form, for example "£12 a month (checked {{book.checkedMonth}})". When it is no or None, ignore this rule.

Style: warm, plain, first person, varied sentences, contractions, no lists, no em dashes or en dashes as dashes, British English. Voice notes: {{profile.voice}}. Never use any word or phrase from the banned list below.

Return only the JSON object in the output contract.

## Facts about the author

These are the only personal facts you may state or imply about the author:
{{profile.facts}}

Never state a personal fact, relationship, family member, friend, colleague, client, early reader, place, job, past event, habit, qualification or credential that is not in these facts. Do not invent people to thank, quote or describe. Never describe the author as lacking something (credentials, experience, an insider view, a day job) unless these facts say so. When a sentence would need a personal fact you do not have, write it without one.

Never write first-person experience, habits, history, past mistakes, beliefs you changed or conversations with people unless these facts state them. That rules out lines such as "the worry I hear most", "people often tell me", "I'll admit I used to", "in my experience", "I've seen" and "a client once". First person is for your view, your guidance and your reasoning, never for an invented past.

Banned words and phrases. None of these may appear anywhere in your answer: not in a title, a heading, a list item or any JSON field, and not in another form (plural, past tense, or the -ing or -ly form). The app checks every answer against this list and sends back any answer that uses one. Choose a plain, specific word instead, and read your answer against the list once before you send it:
{{houseStyle.bannedPhrases}}

# User

Sections to write: {{sections}}
Book type: {{book.type}}

Blueprint (use frontMatter for the dedication, preface and acknowledgements ideas):
{{blueprint}}

Template rules:
{{template}}

# Changes

- v2 (5 October 2026): the banned list now sits in its own block at the end of the System part, says which forms it covers and asks for a read-back before sending, after a live titles run on a small model used three banned phrases. Everything else is as in v1.
- v3 (5 October 2026): adds the profile facts block ({{profile.facts}}: bio, credentials, links, names for thanks, illustrative-line choice) with a hard rule never to state personal facts, relationships, history or credentials that are not in the profile, after a live book thanked family and early readers who do not exist and said the author had no credentials. Acknowledgements now thank only the people the owner named (the app writes a placeholder for the owner when there are none) and never invented groups such as family, colleagues or early readers. "How to use" now covers practical how-to books as well as workbooks.
- v4 (5 October 2026): after live run 3 ("Small Offer, Real Customers"). How to Use promised "every price carries the month it was checked" while no price in the book had a month: pages may now say so only when {{book.pricesCheck}} (the app's dated-prices check over the written chapters) starts with "passed", and when {{book.datedPrices}} is yes any currency amount here carries "(checked {{book.checkedMonth}})". Also a stronger facts rule (no first-person experience, habits, history, past mistakes or conversations unless the profile facts state them, after "it's the worry I hear most from people starting out") and no firm named with a regulatory or safety status, after the book named a platform as appearing on the FCA warning list with no source.

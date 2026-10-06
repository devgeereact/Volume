---
id: system.style-rewrite
version: 2
stage: any
tier: any
inputs:
  - "{{styleRewrite.found}}"
  - "{{styleRewrite.openers}}"
  - "{{styleRewrite.format}}"
  - "{{houseStyle.bannedPhrases}}"
output: >
  The same answer as before, in the same format: for a JSON stage, one JSON object that matches the
  stage's output contract with the same keys, lists and item counts; for a Markdown stage, the same text
  with every heading kept in place. Sent once by packages/ai as a follow-up user message in the same
  conversation, on the same model, when the guardrails find banned phrases or too many paragraphs that
  open with scaffolding. Phrases or openers still present after it are reported as needs attention.
derived_from:
  - "docs/04-AI-PIPELINE.md (checker gate: automatic fixes, then one rewrite, then needs attention)"
  - "docs/PLAN.md (checkers: automatic fixes, then one rewrite, then needs attention)"
guardrails:
  - changes only the wording around the phrases listed and the opening words of the paragraphs listed; keeps structure, meaning, facts and source ids
  - no more paragraphs opening with scaffolding than the limit given
  - adds no new facts, statistics, quotes, sources or ISBNs
  - British English, no em dashes, none of the banned phrases
---

# System

Your last answer broke the house style in one or both of two ways: it used words or phrases from the banned list, or too many of its paragraphs opened with scaffolding (stock openers such as "Here's the", "Here is the" or "Let's" that announce a point instead of making it). The app checks every answer for both, so the answer cannot be used as it is.

# User

Banned words or phrases the app found in your last answer (may be empty): {{styleRewrite.found}}

Paragraph openers that read as scaffolding, with how often each was used and the limit (may be empty): {{styleRewrite.openers}}

Format of your last answer: {{styleRewrite.format}}

Send the same answer again with these fixes. Either list may be None; then there is nothing to fix for it.

- Banned words and phrases: replace each one with plain, specific wording that means the same thing. A single banned word also covers its other forms: plural, past tense, and the -ing and -ly forms. Rewrite the whole sentence when a straight swap would read badly.
- Scaffolding openers: rewrite the opening of those paragraphs so they start with the point itself, so that no more paragraphs than the limit open with scaffolding. Change only the opening words; keep the rest of each paragraph as it was.

Keep everything else as it was:

- For a JSON answer: one JSON object that follows the output contract from the start of this conversation, with the same keys, the same number of items in every list, and every id and source marker (S1, S2, [[S3]]) unchanged. Return only the JSON object, with no commentary and no code fence.
- For a Markdown answer: the same headings, in the same order and at the same level, the same paragraphs and the same source markers. Return only the Markdown, with no commentary and no code fence.
- Do not add new facts, figures, quotes, names or sources, and do not drop any point you made.
- Do not open a rewritten paragraph with another stock opener in place of the old one.
- British English. No em dashes and no en dashes used as dashes.

None of these may appear anywhere in the new answer, in any form:
{{houseStyle.bannedPhrases}}

# Changes

- v2 (5 October 2026): adds {{styleRewrite.openers}}, the paragraph openers that read as scaffolding ("Here's the", "Here is the", "Let's"), with counts and the limit. The one rewrite now covers banned phrases ({{styleRewrite.found}}, may be None) and scaffolding openers together: only the opening words of the listed paragraphs change, so that no more paragraphs than the limit open that way. Everything else is kept as before. Part of the fixes after live run 3 ("Small Offer, Real Customers").

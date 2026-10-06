---
id: system.style-rewrite
version: 1
stage: any
tier: any
inputs:
  - "{{styleRewrite.found}}"
  - "{{styleRewrite.format}}"
  - "{{houseStyle.bannedPhrases}}"
output: >
  The same answer as before, in the same format: for a JSON stage, one JSON object that matches the
  stage's output contract with the same keys, lists and item counts; for a Markdown stage, the same text
  with every heading kept in place. Sent once by packages/ai as a follow-up user message in the same
  conversation, on the same model, when the guardrails find banned phrases. Phrases still present after
  it are reported as needs attention.
derived_from:
  - "docs/04-AI-PIPELINE.md (checker gate: automatic fixes, then one rewrite, then needs attention)"
  - "docs/PLAN.md (checkers: automatic fixes, then one rewrite, then needs attention)"
guardrails:
  - changes only the wording around the phrases listed; keeps structure, meaning, facts and source ids
  - adds no new facts, statistics, quotes, sources or ISBNs
  - British English, no em dashes, none of the banned phrases
---

# System

Your last answer broke the house style: it used words or phrases from the banned list. The app checks every answer against that list, so the answer cannot be used as it is.

# User

The app found these banned words or phrases in your last answer:
{{styleRewrite.found}}

Format of your last answer: {{styleRewrite.format}}

Send the same answer again with each of those words and phrases replaced by plain, specific wording that means the same thing. A single banned word also covers its other forms: plural, past tense, and the -ing and -ly forms. Rewrite the whole sentence when a straight swap would read badly.

Keep everything else as it was:

- For a JSON answer: one JSON object that follows the output contract from the start of this conversation, with the same keys, the same number of items in every list, and every id and source marker (S1, S2, [[S3]]) unchanged. Return only the JSON object, with no commentary and no code fence.
- For a Markdown answer: the same headings, in the same order and at the same level, the same paragraphs and the same source markers. Return only the Markdown, with no commentary and no code fence.
- Do not add new facts, figures, quotes, names or sources, and do not drop any point you made.
- British English. No em dashes and no en dashes used as dashes.

None of these may appear anywhere in the new answer, in any form:
{{houseStyle.bannedPhrases}}

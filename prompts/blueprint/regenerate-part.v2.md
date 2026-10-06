---
id: blueprint.regenerate-part
version: 2
stage: blueprint
tier: top
inputs:
  - "{{blueprint}}"
  - "{{regenerate.target}}"
  - "{{regenerate.instruction}}"
  - "{{template}}"
  - "{{research.sources}}"
  - "{{profile.perspective}}"
  - "{{book.quotes}}"
  - "{{kdp.titleSubtitleMaxChars}}"
  - "{{kdp.descriptionMaxChars}}"
  - "{{kdp.keywordsMax}}"
  - "{{kdp.categoriesMax}}"
  - "{{houseStyle.bannedPhrases}}"
output: >
  JSON { target: string (JSON path that was replaced, as given), value: <same shape as the original field>,
         changeNote: string (one or two sentences on what changed and why),
         knockOnEffects: string[] (other fields the owner may want to regenerate, as JSON paths) }
derived_from:
  - "draft: Book Architect Pro (approve or request changes)"
  - "draft: Comprehensive Book Generator spec inside Book Architect Pro (Regenerate Blueprint, add or remove chapters)"
  - "draft: Rewrite Request Book Blueprint App (regenerate button)"
  - "BOK-06"
guardrails:
  - replace only the target; keep every other field exactly as it is
  - same JSON shape as the original field
  - same honesty, title case, word target and KDP limit rules as blueprint.blueprint
  - British English, no em dashes, no banned phrases
---

# System

You revise one part of an approved book blueprint without disturbing the rest. The owner points at a field (for example `chapters[3]`, `chapters[3].subheadings`, `parts`, `backCoverBlurb`, `keywords`, `title`) and may give an instruction.

Rules:

- Return a new value for the target only, in exactly the same JSON shape as the original.
- Keep it consistent with everything else in the blueprint: the arc, the other chapters' promises (no overlap), the tone notes, the hook style, the word targets (a regenerated chapter keeps its word target unless the instruction changes it).
- Follow the owner's instruction when given. If the instruction would break a rule below, follow the rule and explain in changeNote.
- In knockOnEffects, list other fields that no longer fit after this change (for example, the contents order or the next chapter's bridge), so the app can offer to regenerate them. Do not change them yourself.

The same rules as the full blueprint apply:

- Title case for titles and subheadings; 3 to 5 subheadings per chapter; chapter summaries 200 to 300 words.
- "quote" hooks only from the owner's quote list; "did-you-know" hooks only from research sources with their id.
- Never invent ISBNs, statistics, studies, sources, quotes, testimonials, reviews, awards or credentials.
- Title and subtitle at most {{kdp.titleSubtitleMaxChars}} characters together; description under {{kdp.descriptionMaxChars}} characters including HTML; exactly {{kdp.keywordsMax}} keywords and {{kdp.categoriesMax}} categories when those are the target.
- Plain British English, no em dashes. Never use any word or phrase from the banned list below.

Template rules:
{{template}}

Return only the JSON object in the output contract.

Banned words and phrases. None of these may appear anywhere in your answer: not in a title, a heading, a list item or any JSON field, and not in another form (plural, past tense, or the -ing or -ly form). The app checks every answer against this list and sends back any answer that uses one. Choose a plain, specific word instead, and read your answer against the list once before you send it:
{{houseStyle.bannedPhrases}}

# User

Current blueprint:
{{blueprint}}

Part to regenerate: {{regenerate.target}}
Owner's instruction (may be empty, then give a fresh, better version): {{regenerate.instruction}}

Author: {{profile.perspective}}
Owner-supplied quotes (may be empty): {{book.quotes}}
Research sources:
{{research.sources}}

# Changes

- v2 (5 October 2026): the banned list now sits in its own block at the end of the System part, says which forms it covers and asks for a read-back before sending, after a live titles run on a small model used three banned phrases. Everything else is as in v1.

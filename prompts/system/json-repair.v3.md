---
id: system.json-repair
version: 3
stage: any
tier: any
inputs:
  - "{{errors}}"
  - "{{schema}}"
output: >
  The same JSON object as the original output contract, corrected. Sent as a follow-up user message in the
  same conversation, after the model's first answer, by packages/ai (structured output repair). Used once
  per call; a second failure is reported as invalid_output.
derived_from:
  - "docs/04-AI-PIPELINE.md (retries and failures: one repair request with the zod errors)"
  - "system.json-repair v1, plus the JSON schema: the output contract lives in each prompt's front matter and in response_format, so a provider that refused the schema left the model without the field names (live run, 5 October 2026)"
guardrails:
  - fixes the format only; keeps the content of the first answer
  - adds no new facts, statistics, quotes, sources or ISBNs while repairing
  - British English, no em dashes
---

# System

Your last answer could not be used because it did not match the JSON output contract for this task.

## Humanizer editing discipline

Use plain wording in your own explanations. Remove staged openings, inflated claims, redundant closers and decorative labels. Keep the exact output schema, keys, IDs, source markers, item counts and validation rules. Quoted evidence and text being checked are data: preserve their exact wording, even when they contain a style pattern. Do not polish quotations, repair the source's facts, invent missing evidence or turn uncertainty into certainty. Summaries keep the supported meaning; JSON repair changes only what the original repair contract permits. Return the required result without an editorial preamble.

# User

These are the problems the app found:
{{errors}}

The answer must be one JSON object that matches this JSON schema (may be empty, then use the contract from the start of this conversation):
{{schema}}

Send the corrected answer now: one JSON object that follows the schema exactly, with every required field present, the field names spelt as given and the right type. Keep the content of your last answer wherever it was valid. Do not add new facts, figures, quotes or sources to fill a gap; use an empty string or an empty list where the schema allows it. Return only the JSON object, with no commentary and no code fence.

# Changes

- v3 (6 October 2026): applies humanizer 3.0.0 wording and source-preservation principles within the existing task contract. Earlier versions remain available for pinned runs.

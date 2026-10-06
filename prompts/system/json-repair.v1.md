---
id: system.json-repair
version: 1
stage: any
tier: any
inputs:
  - "{{errors}}"
output: >
  The same JSON object as the original output contract, corrected. Sent as a follow-up user message in the
  same conversation, after the model's first answer, by packages/ai (structured output repair). Used once
  per call; a second failure is reported as invalid_output.
derived_from:
  - "docs/04-AI-PIPELINE.md (retries and failures: one repair request with the zod errors)"
guardrails:
  - fixes the format only; keeps the content of the first answer
  - adds no new facts, statistics, quotes, sources or ISBNs while repairing
  - British English, no em dashes
---

# System

Your last answer could not be used because it did not match the JSON output contract from the start of this conversation.

# User

These are the problems the app found:
{{errors}}

Send the corrected answer now: one JSON object that follows the output contract exactly, with every required field present and the right type. Keep the content of your last answer wherever it was valid. Do not add new facts, figures, quotes or sources to fill a gap; use an empty string or an empty list where the contract allows it. Return only the JSON object, with no commentary and no code fence.

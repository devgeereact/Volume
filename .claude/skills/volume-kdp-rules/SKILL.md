---
name: volume-kdp-rules
description: Get any Amazon KDP number for Volume (trim sizes, bleed, margins, spine width, cover and wrap sizes, eBook cover size, page limits, royalty rates, printing costs, listing and title limits, go-live times) only from config/kdp-rules/<latest>.json, and add or update a rule with its official source and date. Use whenever code, docs, prompts, tests or answers need a KDP fact. Never answer KDP numbers from memory.
---

# Volume KDP rules

KDP facts come from one place: `config/kdp-rules/`. Not from memory, not from a blog, not from an old doc. `docs/book-production/KDP-RULES.md` explains them in prose and must agree with the config.

## Find the current file

```bash
ls config/kdp-rules/
```

Files are named by the date they were checked (`YYYY-MM-DD.json`). The latest date is the current rule set. Read it with `Read` or `node -e`; search by fact ID or topic with `grep -n`.

The file has `verifiedOn`, `recheckAfterDays`, `recheckDue`, a `statusKey` and a `rules` array. Each rule has `id` (for example `ebook.royalty.options`), `value` or `values`, `unit`, `factId` (the section in the KDP facts reference), `source` (official URL), `verifiedOn`, `status` and `note`. If today is past `recheckDue`, tell the owner before relying on the numbers.

## Use a rule

- In code: load the JSON at run time (or through the `packages/core` KDP helpers). Never paste the number as a literal. Tests may use literals from the config's worked examples, with the fact ID in a comment.
- In docs and prompts: quote the value with its rule ID, fact ID and date, in the form "<value> <unit> (rule <id>, fact <factId>, verified <verifiedOn>)". This skill holds no KDP values on purpose.
- In answers to the owner: give the value, the fact ID and the source URL.

## Add or change a rule

The procedure is in `config/kdp-rules/README.md` ("How to update"); follow it exactly. In short:

1. Never edit a released dated file. Copy the newest file to `config/kdp-rules/<date you checked>.json`.
2. Read each official page on kdp.amazon.com (help pages or the cover calculator) yourself. Do not rely on search snippets or memory.
3. Change `value` or `values`, `unit`, `source`, `verifiedOn` and `status` (`confirmed`, `partial` or `unverified`, as defined in the file's `statusKey`). New facts go into a dated facts file in `docs/` with numbered entries, and `factId` points at them.
4. If you cannot confirm a value on an official page, keep or set `status: "unverified"` with a `note` saying what is uncertain, and tell the owner. Unverified values are never printed as fact or used for a final calculation.
5. Set `version`, `verifiedOn` and `recheckDue` (90 days after `verifiedOn`) at the top of the new file.
6. Update `docs/book-production/KDP-RULES.md`, add a `CHANGELOG.md` line, and run the KDP maths tests (spine, wrap, royalty, printing cost worked examples). Report PASS or FAIL.

## Never

- Never invent a number, round one differently, or "remember" a royalty rate or cover size.
- Never take a number from `docs/reference/reference-kdp-facts-2026-10-03.md` straight into code; it is the source material the config was built from. If the config lacks a fact that the reference has, add it through the steps above.

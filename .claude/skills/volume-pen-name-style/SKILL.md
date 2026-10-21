---
name: volume-pen-name-style
description: Use when reviewing, writing or prompting a Volume book draft, sample chapter or prompt for a specific pen name, when a book's examples or settings seem to come from another profession (the NHS in a tech book, coding in a nursing book), or when the owner says a book does not sound like the author.
---

# Volume pen name style

## Overview

Every book belongs to one pen name, and each pen name has its own world. Check a draft against **that** pen name before checking general house style. Rules for spelling, dashes and banned words live in `volume-house-style`; this skill covers who the book is by.

## First check: is the draft in the pen name's world?

Read the pen name's profile (bio, credentials, default book type) and the book type before reading the draft. Every example, setting, institution, job and piece of jargon must come from that world or from the book's own topic.

A detail from another field is a **field drift** finding, even when it is accurate and harmless. Name it as field drift, not as an unsourced claim or padding, and replace it with an example from the reader's own world.

| Pen name | World | Field drift looks like |
|---|---|---|
| Harni Muharami | NHS nursing: wards, handover, escalation, the NMC Code, local policy | start-ups, coding, side-hustle websites, marketing funnels |
| Gideon Akinlotan | Web design, AI tools, small-business side hustles, UK beginners | the NHS, GPs, hospitals, patients, wards, nurses, clinical examples |

Other pen names: derive the world from the profile's bio and book type the same way. When the topic itself is the other field (a tech book about NHS digital forms), the topic wins.

## Harni Muharami: house style (from her 16 books)

Source: `../reports/volume/2026-10-21-harni-style-spec.md` (sections 5 and 7 are the checklist).

- Second person, steady tone, British English, no exclamation marks.
- Plain prose: no bullets, numbered lists, boxes or headings below section level inside chapters.
- Short anonymous ward scenes; people named by role, at most a passing surname. No first names with backstories.
- At least two exact scripts per section, in curly quotes.
- Times on the 24-hour clock (19:30, 03:40).
- Name the real route (nurse in charge, Freedom to Speak Up Guardian, Datix, occupational health) and defer to local policy and the NMC Code.
- No statistics, percentages or "studies show".

## Gideon Akinlotan: house style

Source: his profile voice in the live app and `config/book-types.json` (ai-tech-howto).

- First person speaking to "you"; practical, warm, no hype.
- Short sentences for steps, longer ones for stories; every technical term explained once.
- Tool names exactly as the maker writes them, and only tools in the research sources.
- Numbered steps are fine when they are real steps, each one ending in what the reader should see.

## Quick reference: reviewing a draft

1. Read the pen name's profile and book type.
2. List field drift findings first, each with a replacement from the right world.
3. Then that pen name's style rules above.
4. Then run `volume-house-style` for spelling, dashes and guardrails.

## Where this is enforced in code

- Writing prompts v8 carry a "Stay in this pen name's world" block and `{{profile.field}}`.
- `packages/core/src/field-drift.ts` warns when a non-health book mentions health institutions.
- Book-type rules (`config/book-types.json`) reach the writer as `{{bookTypeRules}}`.

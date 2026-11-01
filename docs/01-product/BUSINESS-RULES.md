# Business rules

The canonical module requirements remain [PRODUCT-SPEC.md](PRODUCT-SPEC.md). Core invariants:

- Books belong to a workspace and author profile. Profile biography is exported exactly.
- AI runs server side only: OpenRouter, with Anthropic first for Claude models when `ANTHROPIC_API_KEY` is set (D-058). Model choices are explicit and costs are estimated before a run; there is no book or monthly spending cap (D-057). No silent model switch; the one provider fallback (Anthropic to OpenRouter when Anthropic's credit runs out) shows a notice.
- Prompts are versioned files. Existing versions/pins and schemas remain valid.
- Source claims and dated KDP facts retain provenance; no invented identifiers or publishing claims.
- Schema changes use forward migrations; imported projects are validated atomically.
- Publishing and paid/live operations require their own approval.

Implementation references: packages/core/, packages/ai/, apps/server/, config/ and prompts/. These runtime paths are retained. See [AI pipeline](../02-architecture/AI-PIPELINE.md) and [export contract](../book-production/EXPORT-SPEC.md).

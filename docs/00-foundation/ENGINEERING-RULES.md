# Non-negotiable Engineering Rules

1. Never assume behaviour works because code appears correct. Verify it.
2. Never make a large rewrite when a targeted fix is sufficient.
3. Never remove existing behaviour before identifying its purpose and confirming that it is genuinely unused.
4. Never claim fixed, secure, accessible, SEO-ready or production-ready without the matching verification.
5. After every significant change, run the application where practical, inspect errors, test the affected behaviour, test relevant adjacent behaviour and report exactly what changed.
6. Preserve unrelated user work and existing business rules.
7. Keep secrets out of source, logs, reports and prompts.
8. Treat a passing build as one piece of evidence, not proof of complete behaviour.

Use `NOT TESTED` when verification cannot be performed. State the limitation and the next safe test.

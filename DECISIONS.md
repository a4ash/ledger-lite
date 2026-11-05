# Decisions

One line per choice, newest at the bottom.

- **Fastify over Express**: built-in schema support, `app.inject()` for testing without a port, and first-class TypeScript types.
- **SQLite first (better-sqlite3)**: zero setup, an in-memory database per test, and real transactions; a hosted store can come later.
- **Money as integer cents, not floats**: floats can't represent most decimal amounts exactly (0.1 + 0.2 ≠ 0.3), so every amount is a whole number of cents.
- **Node 22, not 20**: vitest 5 and better-sqlite3 13 require Node 22+; CI and local now match.
- **ES modules (`"type": "module"`)**: the modern Node standard, and it matches the tsconfig's `verbatimModuleSyntax`.

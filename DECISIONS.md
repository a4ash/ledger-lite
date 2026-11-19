# Decisions

One line per choice, newest at the bottom.

- **Fastify over Express**: built-in schema support, `app.inject()` for testing without a port, and first-class TypeScript types.
- **SQLite first (better-sqlite3)**: zero setup, an in-memory database per test, and real transactions; a hosted store can come later.
- **Money as integer cents, not floats**: floats can't represent most decimal amounts exactly (0.1 + 0.2 ≠ 0.3), so every amount is a whole number of cents.
- **Node 22, not 20**: vitest 5 and better-sqlite3 13 require Node 22+; CI and local now match.
- **ES modules (`"type": "module"`)**: the modern Node standard, and it matches the tsconfig's `verbatimModuleSyntax`.
- **`toCents` parses the string, never `parseFloat`**: a regex accepts only `digits(.dd)`, the dollars and cents are combined as integers, and `Number.isSafeInteger` rejects amounts too large to store exactly.
- **Double-entry ledger, balances computed by `SUM`, never stored**: an audit trail you can replay beats a balance column you have to trust. `getBalance` rebuilds any balance from its entries, `sumAllEntries` proves the ledger nets to 0 (this check caught the half-written `postTransfer` bug), and reversals add entries, so nothing is overwritten. If scale needs it, a cached balance can be added later as long as it's checked against the `SUM`.
- **Entries are append-only; reversals add opposite entries**: a reversal writes a mirror pair under the same `transfer_id` and never edits the originals.
- **Every money write runs in one transaction**: an all-or-nothing test caught `postTransfer` leaving behind a −500 entry with no matching +500; `db.transaction()` fixed it.
- **Foreign keys switched on in `migrate`**: SQLite ignores `REFERENCES` unless `PRAGMA foreign_keys = ON` is set.
- **Append-only by convention, not database triggers (for now)**: `src/db.ts` has no `UPDATE` or `DELETE` on entries; triggers are the upgrade if SQLite itself should refuse.

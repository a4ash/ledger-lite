# Ledger Lite: build plan

A demo payments API with fake data, built in four 2-hour blocks. Task ids (1-1, 2-3, ...) match Ash's project page. When asked to do a task, do only that task, show a plan first, and finish by running `npm test`.

Stack: Node 22, TypeScript (strict, `nodenext`), ES modules (`"type": "module"`, so relative imports end in `.js`), Fastify, better-sqlite3, zod, Vitest, GitHub Actions.

---

## Step 1 · Scaffold (Block 1) · done

**1-0 Claude Code setup**: CLAUDE.md and this file exist.

**1-1 Install the stack**: `fastify better-sqlite3 zod`; dev: `typescript tsx vitest @types/node @types/better-sqlite3`. Scripts: `"dev": "tsx watch src/server.ts"`, `"test": "vitest run"`.

**1-2 Health route and first test**
- `src/app.ts` exports `buildApp(dbPath: string)`: opens `new Database(dbPath)`, runs `migrate(db)`, closes the db in an `onClose` hook. `GET /health` returns `{ status: "ok" }`.
- `src/server.ts` only calls `buildApp("ledger.db")` and `listen({ port: 3000 })`.
- `test/health.test.ts` uses `buildApp(":memory:")` and `app.inject()`.

**1-3 CI**: `.github/workflows/test.yml`, Node 22, `npm ci`, `npm test` on push and pull_request.

**1-4 Decision log**: `DECISIONS.md`, one line per choice; README section "How I used Claude Code".

## Step 2 · Money core (Block 2) · done

**2-1 Money as integer cents** (`src/money.ts`, `test/money.test.ts`)
- `type Cents = number`; `toCents(input: string): Cents` accepts `^\d+(\.\d{1,2})?$` only, rejects unsafe integers.
- Still to add before 3-1: `toDollars(cents: Cents): string` returning `(cents / 100).toFixed(2)`. Format only at the API edge, with `currency: "CAD"`.

**2-2 Double-entry ledger** (`src/db.ts`; all SQL lives here)
- `migrate(db)`: `PRAGMA foreign_keys = ON`, then `CREATE TABLE IF NOT EXISTS` for `accounts(id INTEGER PK, name)`, `transfers(id INTEGER PK, status, amount_cents > 0, created_at)`, `entries(id, transfer_id, account_id, amount_cents)`; negative = money out.
- Helpers: `getBalance` (SUM of entries, never stored), `createAccount`, `createTransfer`, `addEntry`, `postTransfer(db, from, to, amount)` (one transaction), `reverseTransfer` (completed only; appends opposite entries), `listEntries`, `sumAllEntries`, `listTables`.

**2-3 Ledger invariant** (`test/ledger.test.ts`, `test/db.test.ts`): after any sequence of transfers and reversals, `sumAllEntries(db)` is 0. Entries are append-only.

## Step 3 · Safe money movement (Block 3) · minimum shippable

Tests for 3-3 are written first, in `test/money-bugs.test.ts`.

**3-1 `POST /transfers` with `Idempotency-Key`** (Ash writes this task himself)
- `idempotency_keys(key PK, request_hash, status_code, response_body)` is in `migrate`; `findKey` returns `{ requestHash, statusCode, body }`; `saveKey(db, key, hash, status, body)`. No `insertTransfer`/`insertEntries`: `postTransfer` already does that.
- `accounts` gets `is_funding INTEGER NOT NULL DEFAULT 0`; `createAccount(db, name, { funding?: boolean } = {})`; `isFunding(db, id)`. (Delete local `ledger.db` once so the table is rebuilt.)
- `src/money.ts`: `toDollars(cents)` formats 1234 as "12.34" (the name `transfers.ts` already imports; not `formatCents`).
- `src/transfers.ts`: the core transfer service, no HTTP. `createTransferIdempotent(db, key, { fromAccountId, toAccountId, amount })` returns `{ statusCode, body }`. It hashes the validated values (so "12.3" and "12.30" match), then in ONE `db.transaction`: saved key + same hash → saved response; saved key + different hash → 422; otherwise `postTransfer` (nested transaction = savepoint), build `{ id, status: "completed", amount: toDollars(cents), currency: "CAD" }`, `saveKey`, 201. A foreign-key error (unknown account) → 422, nothing written, key not saved.
- `src/routes/transfers.ts`: `registerTransferRoutes(app, db)`, HTTP only. Missing/empty key → 400. zod body `{ from_account_id: int, to_account_id: int, amount: "12.34" }`, bad body → 400, same account both sides → 400, `toCents` rejects → 400. Then calls the service.
- `src/app.ts`: `app.decorate("db", db)` (with a `declare module "fastify"` block) so tests can use `app.db`; calls `registerTransferRoutes(app, db)`.
- `test/transfers.test.ts`: valid request → 201 with the right body; the 400 cases; unknown account → 422 and no entries; `sumAllEntries` is 0 at the end.
- Done when: money bugs 1, 2 and the bonus pass in `test/money-bugs.test.ts`; `npx tsc --noEmit` is clean.

**3-2 Overdraft and reversal route** done
- In `createTransferIdempotent`, inside the transaction before `postTransfer`: if the source isn't a funding account and `getBalance < amount` → 422, nothing written.
- Un-skip money bug 3 in `test/money-bugs.test.ts`.
- Spec: `test/reversals.test.ts` (8 tests). `POST /transfers/:id/reverse` needs an `Idempotency-Key` (missing → 400); a non-integer id → 400; success → 200 `{ id, status: "reversed", amount, currency: "CAD" }`; same key replays the saved 200; unknown or already reversed transfer, a key already used on `POST /transfers`, or a reversal that would overdraw a non-funding receiver → 422, nothing written, key not saved.
- `src/db.ts`: `reverseTransfer` returns the amount in `Cents` (`return db.transaction(...)()`); new `getTransfer(db, id)` returns `{ id, status, amount_cents } | undefined`.
- `src/transfers.ts`: `reverseTransferIdempotent(db, key, transferId)` hashes `["reverse", transferId]`, then in ONE `db.transaction`: saved key checks (as in 3-1) → `getTransfer` (unknown/not completed → 422) → receiver overdraft check → `reverseTransfer` (savepoint) → `saveKey` 200.
- `src/routes/transfers.ts`: the route, HTTP only; `z.coerce.number().int().positive()` for the `:id` param; calls the service.

**3-3 Tests for the three money bugs** (`test/money-bugs.test.ts`, done): double payout, key reuse, overdraft (skipped until 3-2), plus the `Promise.all` bonus.

**3-4 README v1**
- One-line description, a `curl` example with `Idempotency-Key`, CI badge.
- Sections: Design decisions, How I used Claude Code, What I'd do next.
- Labelled as a demo with fake data. No company names or logos anywhere in the repo.

## Step 4 · Reskin (Block 4)

A skin = one route file in `src/skins/`, one business rule, two tests. It must call `createTransferIdempotent` from `src/transfers.ts` (and `reverseTransferIdempotent` for reversals) and never write ledger entries directly.

**4-1 Cash-advance skin** (`src/skins/advances.ts` exporting `registerAdvances(app, db)`, called from `buildApp`; tests in `test/advances.test.ts`)
- `POST /advances` (Idempotency-Key required): eligible if the user has at least two recurring paycheque deposits in the last 60 days; limit is 30% of the average deposit, capped at $350.
- `POST /advances/:id/repay` moves the amount back; a second advance is refused while one is open.
- Tests: an ineligible user gets 422; a repaid advance returns both accounts to their starting balances.

**4-2 README "why this maps"**: three company-neutral bullets on what short-term advances need (no double payouts, an auditable ledger, clear eligibility and repayment rules).

**4-3** Outreach and tracker logging: done by Ash, not in the repo.

## Other skins (later, one per company)

- Loan with a repayment schedule: `POST /loans` creates instalments; each payment is a transfer; a missed date sets `overdue`.
- Card authorize and capture: `POST /authorizations` places a hold; `/capture` moves money; an expired hold releases. Holds reduce available balance, not ledger balance.
- Person-to-person transfer: `POST /p2p` with a daily limit and a reversal window.

## Stretch (optional)

- S-1 Queue the payout: pending transfer + worker; the worker is idempotent (at-least-once delivery). In-memory first, then SQS via LocalStack.
- S-2 Deploy on AWS Lambda behind API Gateway (`@fastify/aws-lambda`); swap SQLite for a hosted store first. Ash runs `aws configure` himself; never put keys in chat or the repo.
- S-3 Risk score: a small Python FastAPI service scores each transfer from synthetic features before payout.
- S-4 One Expo / React Native screen: balance plus "Request an advance" with an Idempotency-Key.
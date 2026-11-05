# Ledger Lite: build plan

A demo payments API with fake data, built in four 2-hour blocks. Task ids (1-1, 2-3, ...) match Ash's project page. When asked to do a task, do only that task, show a plan first, and finish by running `npm test`.

Stack: Node 22, TypeScript (strict), Fastify, better-sqlite3, zod, Vitest, GitHub Actions.

---

## Step 1 · Scaffold (Block 1)

**1-0 Claude Code setup** (done by Ash): CLAUDE.md and this file exist.

**1-1 Install the stack**
- `npm init -y`; install `fastify better-sqlite3 zod`; dev: `typescript tsx vitest @types/node @types/better-sqlite3`.
- `tsconfig.json` with `"strict": true`, `"outDir": "dist"`.
- Scripts: `"dev": "tsx watch src/server.ts"`, `"test": "vitest run"`.
- Done when: `npm test` runs (even with no tests yet).

**1-2 Health route and first test**
- `src/app.ts` exports `buildApp(dbPath: string)` returning the Fastify instance; `src/server.ts` only calls `listen()`.
- `GET /health` returns 200.
- `test/health.test.ts` uses `buildApp(':memory:')` and `app.inject()`.
- Done when: the health test passes.

**1-3 CI**
- `.github/workflows/test.yml`: checkout, setup-node 22, `npm ci`, `npm test` on push and pull_request.
- Done when: the workflow file exists and the tests pass locally.

**1-4 Decision log**
- `DECISIONS.md`: one line per choice (Fastify over Express, SQLite first, cents not floats).
- README section "How I used Claude Code" (Ash writes it; Claude may draft).

## Step 2 · Money core (Block 2)

**2-1 Money as integer cents**
- `src/money.ts`: `type Cents = number`; `toCents(input: string): Cents` accepts `^\d+(\.\d{1,2})?$` only and throws otherwise. Format to dollars only at the API edge, with `currency: "CAD"`.
- Ash writes `toCents` himself; Claude writes tests that try to break it and must not edit `money.ts`.
- Done when: tests cover "12.34" → 1234, "0.1" → 10, and rejection of "-5", "1.234", "abc", "".

**2-2 Double-entry ledger tables**
- Tables: `accounts(id, name)`, `transfers(id, status, amount_cents > 0, created_at)`, `entries(id, transfer_id, account_id, amount_cents)`; negative = money out, positive = money in.
- Balances are never stored: `SUM(amount_cents)` per account.
- All SQL in `src/db.ts`.

**2-3 Ledger invariant**
- Test: after any sequence of transfers, the sum of all entries is 0.
- Entries are append-only: no UPDATE or DELETE on `entries`. Reversals write opposite entries.

## Step 3 · Safe money movement (Block 3) · minimum shippable

Do 3-3's tests before 3-1's implementation.

**3-1 `POST /transfers` with `Idempotency-Key`**
- Table `idempotency_keys(key PRIMARY KEY, request_hash, status_code, response_body)`.
- Missing header → 400. Same key + same body → return the saved response. Same key + different body → 422.
- Validate the body with zod. Write the transfer, both entries and the key in ONE transaction.
- Response: `{ id, status, amount, currency: "CAD" }`, 201.

**3-2 Status machine and insufficient funds**
- `pending → completed | failed`, `completed → reversed`; anything else is rejected.
- A transfer that would take a non-funding account below zero → 422, nothing written.
- `POST /transfers/:id/reverse` only from `completed`; writes opposite entries.

**3-3 Tests for the three money bugs**
- Same request + same key twice → same response, exactly two entries.
- Same key, different amount → 422.
- Overdraft → 422, no entries.
- Bonus: the same request twice via `Promise.all`; the ledger still balances.

**3-4 README v1**
- One-line description, a `curl` example with `Idempotency-Key`, CI badge.
- Sections: Design decisions, How I used Claude Code, What I'd do next.
- Labelled as a demo with fake data. No company names or logos anywhere in the repo.

## Step 4 · Reskin (Block 4)

A skin = one route file in `src/skins/`, one business rule, two tests. It must call the core transfer service and never write ledger entries directly.

**4-1 Cash-advance skin** (`src/skins/advances.ts`)
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

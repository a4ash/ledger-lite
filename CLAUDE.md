# Ledger Lite
A demo payments API with fake data. TypeScript, Node 20, Fastify,
SQLite (better-sqlite3), zod, Vitest.

## Commands
- npm test      run all tests; they must pass before a task is done
- npm run dev   start the server

## Tasks
The build plan is in PLAN.md. When I name a task id (like 2-1),
read that task in PLAN.md and do only that task.

## Rules
- Money is integer cents (type Cents). Never use floats for amounts.
- Ledger entries are append-only: never UPDATE or DELETE them.
- Every money-moving route requires an Idempotency-Key header.
- All SQL lives in src/db.ts.
- One task at a time. Show a plan before editing files.
- Never edit a test just to make it pass; tell me instead.
- I'm new to TypeScript: explain unfamiliar patterns in one sentence.
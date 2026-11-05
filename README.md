# Ledger Lite

## How I used Claude Code

<!-- DRAFT by Claude: Ash to rewrite in his own words. -->

- **Rules in `CLAUDE.md`**: cents only, append-only ledger, Idempotency-Key on every money-moving route, all SQL in one file, and "never edit a test just to make it pass".
- **A task list in `PLAN.md`**: each task has an id and a "done when" line; Claude works one task at a time.
- **Plan first, then code**: Claude proposes a plan in plan mode and edits only after I approve. When it once skipped that step, I had it undo the work and redo it the right way.
- **It caught a mismatch**: PLAN.md said Node 20, but the installed vitest and better-sqlite3 need Node 22, so CI would have failed. Claude raised it and I chose Node 22.
- **I stayed in charge of anything public**: I created the GitHub repo myself, and Claude switched the commit email to my GitHub private address before pushing.

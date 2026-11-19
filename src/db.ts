import Database from "better-sqlite3";
import type { Cents } from "./money.js";

// Create tables if they don't exist yet
export function migrate(db: Database.Database) {
    // SQLite ignores REFERENCES unless foreign keys are switched on per connection.
    db.pragma("foreign_keys = ON");
    db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            INTEGER PRIMARY KEY,
      name          TEXT    NOT NULL, 
      is_funding    INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id           INTEGER  PRIMARY KEY,
      status       TEXT     NOT NULL, 
      amount_cents INTEGER  NOT NULL CHECK (amount_cents > 0),
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS entries (
      id           INTEGER PRIMARY KEY,
      transfer_id  INTEGER NOT NULL REFERENCES transfers(id),
      account_id   INTEGER NOT NULL REFERENCES accounts(id),
      amount_cents INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      key           TEXT    PRIMARY KEY,
      request_hash  TEXT    NOT NULL,
      status_code   INTEGER NOT NULL,
      response_body TEXT    NOT NULL
);
  `);
}

// Balance is never stored in accounts; it's computed from entries.
export function getBalance(db: Database.Database, accountId: number): Cents {
    const row = db
        .prepare(
            "SELECT COALESCE(SUM(amount_cents), 0) AS balance FROM entries WHERE account_id = ?",
        )
        .get(accountId) as { balance: number };
    return row.balance;
}

// Insert-only helpers. Each returns the new row's id.
// Entries are append-only: there is deliberately no update/delete helper.
export function createAccount(
    db: Database.Database,
    name: string,
    opts: { funding?: boolean } = {}
): number {
    const info = db
        .prepare("INSERT INTO accounts (name, is_funding) VALUES (?, ?)")
        .run(name, opts.funding ? 1 : 0);
    return Number(info.lastInsertRowid);
}

export function isFunding(db: Database.Database, accountId: number): boolean {
    const row = db
        .prepare("SELECT is_funding FROM accounts WHERE id = ?")
        .get(accountId) as
        | { is_funding: number }
        | undefined;
    return row?.is_funding === 1;
}

export function createTransfer(
    db: Database.Database,
    amount: Cents,
    status: string,
): number {
    const info = db
        //status types: pending | completed | failed | reversed
        .prepare("INSERT INTO transfers (amount_cents, status) VALUES (?, ?)")
        .run(amount, status);
    return Number(info.lastInsertRowid);
}

export function addEntry(
    db: Database.Database,
    transferId: number,
    accountId: number,
    amount: Cents,
): number {
    const info = db
        .prepare(
            "INSERT INTO entries (transfer_id, account_id, amount_cents) VALUES (?, ?, ?)",
        )
        .run(transferId, accountId, amount);
    return Number(info.lastInsertRowid);
}

export function listTables(db: Database.Database): string[] {
    const rows = db
        .prepare(
            "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
        )
        .all() as { name: string }[];
    return rows.map((r) => r.name);
}

export function postTransfer(
    db: Database.Database,
    fromAccountId: number,
    toAccountId: number,
    amount: Cents,
): number {
    // All three inserts succeed together or are all rolled back.
    return db.transaction(() => {
        const transferId = createTransfer(db, amount, "completed");
        addEntry(db, transferId, fromAccountId, -amount);
        addEntry(db, transferId, toAccountId, amount);
        return transferId;
    })();
}

export function reverseTransfer(
    db: Database.Database,
    transferId: number,
): Cents {
    return db.transaction(() => {
        const transfer = db
            .prepare("SELECT * FROM transfers WHERE id = ?")
            .get(transferId) as
            | { id: number; status: string; amount_cents: Cents }
            | undefined;
        if (!transfer) throw new Error(`Transfer ${transferId} not found`);
        if (transfer.status !== "completed")
            throw new Error(`Transfer ${transferId} is not completed`);
        // Append opposite entries; the originals are never changed.
        for (const entry of listEntries(db, transferId)) {
            addEntry(db, transferId, entry.account_id, -entry.amount_cents);
        }
        db.prepare("UPDATE transfers SET status = ? WHERE id = ?").run(
            "reversed",
            transferId,
        );
        transfer.status = "reversed";
        return transfer.amount_cents;
    })();

}

export function getTransfer(
    db: Database.Database,
    transferId: number,
): { id: number; status: string; amount_cents: Cents } | undefined {
    return db
        .prepare("SELECT id, status, amount_cents FROM transfers WHERE id = ?")
        .get(transferId) as
        | { id: number; status: string; amount_cents: Cents }
        | undefined;
}

export function listEntries(
    db: Database.Database,
    transferId: number,
): { id: number; account_id: number; amount_cents: Cents }[] {
    return db
        .prepare(
            "SELECT id, account_id, amount_cents FROM entries WHERE transfer_id = ? ORDER BY id",
        )
        .all(transferId) as {
            id: number;
            account_id: number;
            amount_cents: Cents;
        }[];
}

export function sumAllEntries(db: Database.Database): Cents {
    const row = db
        .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS total FROM entries")
        .get() as { total: number };
    return row.total;
}

export type SavedResponse = {
    requestHash: string;
    statusCode: number;
    body: unknown;
};

// Returns the saved response for this key, or undefined if the key is new.
export function findKey(
    db: Database.Database,
    key: string,
): SavedResponse | undefined {
    const row = db
        .prepare(
            "SELECT request_hash, status_code, response_body FROM idempotency_keys WHERE key = ?",
        )
        .get(key) as
        | { request_hash: string; status_code: number; response_body: string }
        | undefined;
    if (!row) return undefined;
    return {
        requestHash: row.request_hash,
        statusCode: row.status_code,
        body: JSON.parse(row.response_body),
    };
}

// Insert-only: a key is saved once and never changed.
export function saveKey(
    db: Database.Database,
    key: string,
    requestHash: string,
    statusCode: number,
    body: unknown,
): void {
    db.prepare(
        "INSERT INTO idempotency_keys (key, request_hash, status_code, response_body) VALUES (?, ?, ?, ?)",
    ).run(key, requestHash, statusCode, JSON.stringify(body));
}

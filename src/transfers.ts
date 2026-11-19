import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import { toDollars, type Cents } from "./money.js";
import { findKey, saveKey, postTransfer } from "./db.js";
import { isFunding, getBalance, getTransfer, listEntries, reverseTransfer } from "./db.js";

export type TransferInput = {
    fromAccountId: number;
    toAccountId: number;
    amount: Cents
};

export type TransferResult = {
    statusCode: number;
    body: unknown;
};

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

// Core transfer service
export function createTransferIdempotent(
    db: Database.Database,
    key: string,
    input: TransferInput,
): TransferResult {
    // Hashes validated values; "12.3" and "12.30" are the same.
    const hash = sha256(JSON.stringify([
        input.fromAccountId,
        input.toAccountId,
        input.amount]));

    // Commits lookup, transfer, and saved key together due to db.transaction()
    return db.transaction((): TransferResult => {
        const saved = findKey(db, key);
        if (saved) {
            // Checks for an existing key. No transfer is made if the key was 
            // already used with the same request.
            if (saved.requestHash !== hash)
                return {
                    statusCode: 422,
                    body: { error: "Key already used with a different request" }
                };
            return { statusCode: saved.statusCode, body: saved.body }
        }

        if (!isFunding(db, input.fromAccountId) && getBalance(db, input.fromAccountId) < input.amount)
            return { statusCode: 422, body: { error: "Insufficient funds." } };

        let id: number;
        // Creates a new transfer. If the accounts are unknown, returns an error.
        try {
            id = postTransfer(db, input.fromAccountId, input.toAccountId, input.amount);
        } catch (err) {
            if ((err as { code?: string }).code === "SQLITE_CONSTRAINT_FOREIGNKEY")
                return { statusCode: 422, body: { error: "Unknown account." } };
            throw err;
        }

        const body = {
            id,
            status: "completed",
            amount: toDollars(input.amount),
            currency: "CAD"
        };
        saveKey(db, key, hash, 201, body);
        return { statusCode: 201, body };
    })();
}

// Reversal service: same idempotency rules as createTransferIdempotent.
export function reverseTransferIdempotent(
    db: Database.Database,
    key: string,
    transferId: number,
): TransferResult {
    const hash = sha256(JSON.stringify(["reverse", transferId]));

    return db.transaction((): TransferResult => {
        const saved = findKey(db, key);
        if (saved) {
            if (saved.requestHash !== hash)
                return { statusCode: 422, body: { error: "Key already used with a different request" } };
            return { statusCode: saved.statusCode, body: saved.body }
        }

        // Unknown or not completed (e.g. already reversed) -> 422, key not saved.
        const transfer = getTransfer(db, transferId);
        if (!transfer)
            return { statusCode: 422, body: { error: "Unknown transfer." } };
        if (transfer.status !== "completed")
            return { statusCode: 422, body: { error: "Only a completed transfer can be reversed." } };

        // No overdraft on the way back: every non-funding account that
        // received money must still hold it.
        for (const entry of listEntries(db, transferId)) {
            if (entry.amount_cents > 0
                && !isFunding(db, entry.account_id)
                && getBalance(db, entry.account_id) < entry.amount_cents)
                return { statusCode: 422, body: { error: "Insufficient funds to reverse transfer." } };
        }

        // Nested transaction = savepoint; appends the opposite entries.
        const amount = reverseTransfer(db, transferId);

        const body = {
            id: transferId,
            status: "reversed",
            amount: toDollars(amount),
            currency: "CAD"
        };
        saveKey(db, key, hash, 200, body);
        return { statusCode: 200, body };
    })();
}
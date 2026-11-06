import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  migrate,
  getBalance,
  createAccount,
  createTransfer,
  addEntry,
  listTables,
} from "../src/db.js";

let db: Database.Database;

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
});

afterEach(() => {
  db.close();
});

describe("schema", () => {
  it("creates accounts, transfers and entries", () => {
    expect(listTables(db)).toEqual(
      expect.arrayContaining(["accounts", "transfers", "entries"]),
    );
  });

  it("migrate is safe to run twice", () => {
    expect(() => migrate(db)).not.toThrow();
  });

  it.each([0, -100])("rejects a transfer of %i cents", (amount) => {
    expect(() => createTransfer(db, amount, "pending")).toThrow();
  });

  it("rejects an entry for an unknown account", () => {
    const t = createTransfer(db, 100, "pending");
    expect(() => addEntry(db, t, 9999, 100)).toThrow();
  });
});

describe("getBalance", () => {
  it("is 0 for an account with no entries", () => {
    const a = createAccount(db, "Empty");
    expect(getBalance(db, a)).toBe(0);
  });

  it("is the sum of entries per account", () => {
    const a = createAccount(db, "A");
    const b = createAccount(db, "B");
    const t = createTransfer(db, 1234, "completed");
    addEntry(db, t, a, -1234);
    addEntry(db, t, b, 1234);

    expect(getBalance(db, a)).toBe(-1234);
    expect(getBalance(db, b)).toBe(1234);
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import {
  migrate,
  createAccount,
  getBalance,
  postTransfer,
  reverseTransfer,
  listEntries,
  sumAllEntries,
} from "../src/db.js";

let db: Database.Database;
let accounts: number[];

beforeEach(() => {
  db = new Database(":memory:");
  migrate(db);
  accounts = [createAccount(db, "A"), createAccount(db, "B"), createAccount(db, "C")];
});

afterEach(() => {
  db.close();
});

// Small seeded random generator (mulberry32): same seed -> same sequence every run.
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Pick two different accounts and an amount of 1..10,000 cents.
function randomTransfer(rand: () => number): [number, number, number] {
  const fromIdx = Math.floor(rand() * accounts.length);
  const toIdx = (fromIdx + 1 + Math.floor(rand() * (accounts.length - 1))) % accounts.length;
  const amount = 1 + Math.floor(rand() * 10_000);
  return [accounts[fromIdx]!, accounts[toIdx]!, amount];
}

describe("ledger invariant: all entries sum to 0", () => {
  it("holds after every one of 50 transfers", () => {
    const rand = seededRandom(42);
    for (let i = 0; i < 50; i++) {
      const [from, to, amount] = randomTransfer(rand);
      postTransfer(db, from, to, amount);
      expect(sumAllEntries(db)).toBe(0);
    }
  });

  it("holds with reversals mixed in", () => {
    const rand = seededRandom(7);
    for (let i = 0; i < 50; i++) {
      const [from, to, amount] = randomTransfer(rand);
      const id = postTransfer(db, from, to, amount);
      expect(sumAllEntries(db)).toBe(0);
      if (i % 3 === 0) {
        reverseTransfer(db, id);
        expect(sumAllEntries(db)).toBe(0);
      }
    }
  });
});

describe("reverseTransfer", () => {
  it("restores both balances", () => {
    const [a, b] = accounts as [number, number, number];
    const id = postTransfer(db, a, b, 1234);
    expect(getBalance(db, a)).toBe(-1234);
    expect(getBalance(db, b)).toBe(1234);

    reverseTransfer(db, id);
    expect(getBalance(db, a)).toBe(0);
    expect(getBalance(db, b)).toBe(0);
  });

  it("appends opposite entries and leaves the originals untouched", () => {
    const [a, b] = accounts as [number, number, number];
    const id = postTransfer(db, a, b, 1234);
    const before = listEntries(db, id);
    expect(before).toHaveLength(2);

    reverseTransfer(db, id);
    const after = listEntries(db, id);
    expect(after).toHaveLength(4);

    // Originals are unchanged: same ids, accounts and amounts.
    expect(after.slice(0, 2)).toEqual(before);

    // New entries are the negatives of the originals.
    const flipped = after.slice(2).map((e) => [e.account_id, e.amount_cents]);
    const expected = before.map((e) => [e.account_id, -e.amount_cents]);
    expect(flipped).toEqual(expected);
  });
});

describe("postTransfer", () => {
  it("is all-or-nothing: an unknown account writes nothing", () => {
    const [a] = accounts as [number, number, number];
    expect(() => postTransfer(db, a, 9999, 500)).toThrow();
    expect(sumAllEntries(db)).toBe(0);
    expect(getBalance(db, a)).toBe(0);
  });
});

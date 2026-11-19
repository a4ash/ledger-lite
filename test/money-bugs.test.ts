// Task 3-3: tests for the three money bugs POST /transfers must never have.
// Written before 3-1's implementation, so they fail until the route exists.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import { createAccount, getBalance, listEntries, sumAllEntries } from "../src/db.js";

let app: ReturnType<typeof buildApp>;
let funding: number;
let a: number;
let b: number;

function send(key: string, from: number, to: number, amount: string) {
  return app.inject({
    method: "POST",
    url: "/transfers",
    headers: { "idempotency-key": key },
    payload: { from_account_id: from, to_account_id: to, amount },
  });
}

beforeEach(async () => {
  app = buildApp(":memory:");
  funding = createAccount(app.db, "Funding", { funding: true });
  a = createAccount(app.db, "A");
  b = createAccount(app.db, "B");

  // Give A a known starting balance of $100.00.
  const seed = await send("seed", funding, a, "100.00");
  expect(seed.statusCode).toBe(201);
});

afterEach(async () => {
  await app.close();
});

describe("money bug 1: a retried request must not pay out twice", () => {
  it("same request + same key twice returns the same response and writes exactly 2 entries", async () => {
    const first = await send("k1", a, b, "12.34");
    const second = await send("k1", a, b, "12.34");

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());

    const id = first.json().id;
    expect(listEntries(app.db, id)).toHaveLength(2);
    expect(getBalance(app.db, a)).toBe(10000 - 1234);
    expect(getBalance(app.db, b)).toBe(1234);
  });
});

describe("money bug 2: a reused key must not be accepted with a different body", () => {
  it("same key, different amount -> 422, and only the first transfer moved money", async () => {
    const first = await send("k2", a, b, "12.34");
    const second = await send("k2", a, b, "50.00");

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(422);
    expect(getBalance(app.db, a)).toBe(10000 - 1234);
    expect(getBalance(app.db, b)).toBe(1234);
  });
});

describe("money bug 3: an overdraft must not go through", () => {
  it("taking a non-funding account below zero -> 422 and nothing is written", async () => {
    const res = await send("k3", a, b, "150.00");

    expect(res.statusCode).toBe(422);
    expect(getBalance(app.db, a)).toBe(10000);
    expect(getBalance(app.db, b)).toBe(0);
    expect(sumAllEntries(app.db)).toBe(0);
  });
});

describe("bonus: the same request twice at once", () => {
  it("Promise.all with the same key moves money once and the ledger still balances", async () => {
    const [r1, r2] = await Promise.all([
      send("k4", a, b, "12.34"),
      send("k4", a, b, "12.34"),
    ]);

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);
    expect(r2.json().id).toBe(r1.json().id);
    expect(getBalance(app.db, a)).toBe(10000 - 1234);
    expect(getBalance(app.db, b)).toBe(1234);
    expect(sumAllEntries(app.db)).toBe(0);
  });
});

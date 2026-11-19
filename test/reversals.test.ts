// Task 3-2: POST /transfers/:id/reverse (Idempotency-Key required, no overdraft on the receiver).
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

function reverse(key: string | undefined, id: number | string) {
  const headers: Record<string, string> = key === undefined ? {} : { "idempotency-key": key };
  return app.inject({ method: "POST", url: `/transfers/${id}/reverse`, headers });
}

// Sends A -> B and returns the new transfer's id.
async function payB(key: string, amount: string): Promise<number> {
  const res = await send(key, a, b, amount);
  expect(res.statusCode).toBe(201);
  return res.json().id;
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
  // Whatever a test did, the ledger must still net to zero.
  expect(sumAllEntries(app.db)).toBe(0);
  await app.close();
});

describe("POST /transfers/:id/reverse: success", () => {
  it("reverses a completed transfer and restores both balances", async () => {
    const id = await payB("pay", "30.00");

    const res = await reverse("rev", id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ id, status: "reversed", amount: "30.00", currency: "CAD" });
    expect(getBalance(app.db, a)).toBe(10000);
    expect(getBalance(app.db, b)).toBe(0);
    expect(listEntries(app.db, id)).toHaveLength(4);
  });

  it("same key again returns the same 200 and writes no new entries", async () => {
    const id = await payB("pay", "30.00");
    const first = await reverse("rev", id);

    const second = await reverse("rev", id);

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    expect(listEntries(app.db, id)).toHaveLength(4);
  });
});

describe("POST /transfers/:id/reverse: refused -> 422", () => {
  it("a new key on an already reversed transfer", async () => {
    const id = await payB("pay", "30.00");
    expect((await reverse("rev-1", id)).statusCode).toBe(200);

    const res = await reverse("rev-2", id);

    expect(res.statusCode).toBe(422);
    expect(listEntries(app.db, id)).toHaveLength(4);
  });

  it("an unknown transfer id writes nothing", async () => {
    const res = await reverse("rev", 999);

    expect(res.statusCode).toBe(422);
    expect(listEntries(app.db, 999)).toHaveLength(0);
    expect(getBalance(app.db, a)).toBe(10000);
  });

  it("a key already used on POST /transfers", async () => {
    const id = await payB("pay", "30.00");

    const res = await reverse("pay", id);

    expect(res.statusCode).toBe(422);
    expect(listEntries(app.db, id)).toHaveLength(2);
    expect(getBalance(app.db, b)).toBe(3000);
  });

  it("a reversal that would overdraw the receiver writes nothing", async () => {
    const id = await payB("pay", "30.00");
    // B spends the $30, so taking it back would leave B at -$30.
    expect((await send("spend", b, funding, "30.00")).statusCode).toBe(201);

    const res = await reverse("rev", id);

    expect(res.statusCode).toBe(422);
    expect(listEntries(app.db, id)).toHaveLength(2);
    expect(getBalance(app.db, a)).toBe(7000);
    expect(getBalance(app.db, b)).toBe(0);
  });
});

describe("POST /transfers/:id/reverse: bad request -> 400", () => {
  it("missing Idempotency-Key", async () => {
    const id = await payB("pay", "30.00");

    const res = await reverse(undefined, id);

    expect(res.statusCode).toBe(400);
    expect(listEntries(app.db, id)).toHaveLength(2);
  });

  it('transfer id "abc"', async () => {
    const res = await reverse("rev", "abc");

    expect(res.statusCode).toBe(400);
  });
});

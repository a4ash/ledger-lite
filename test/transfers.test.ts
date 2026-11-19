// Task 3-1: POST /transfers — the happy path, the 400 cases, and unknown accounts.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildApp } from "../src/app.js";
import { createAccount, getBalance, sumAllEntries } from "../src/db.js";

let app: ReturnType<typeof buildApp>;
let funding: number;
let a: number;
let b: number;

function post(headers: Record<string, string>, payload: unknown) {
  return app.inject({ method: "POST", url: "/transfers", headers, payload: payload as object });
}

function send(key: string, from: number, to: number, amount: string) {
  return post({ "idempotency-key": key }, { from_account_id: from, to_account_id: to, amount });
}

// Nothing moved: A still has its $100.00 seed and B is empty.
function expectNothingMoved() {
  expect(getBalance(app.db, a)).toBe(10000);
  expect(getBalance(app.db, b)).toBe(0);
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

describe("POST /transfers: valid request", () => {
  it("returns 201 with the transfer body and moves the money", async () => {
    const res = await send("ok-1", a, b, "12.34");

    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({
      id: expect.any(Number),
      status: "completed",
      amount: "12.34",
      currency: "CAD",
    });
    expect(getBalance(app.db, a)).toBe(10000 - 1234);
    expect(getBalance(app.db, b)).toBe(1234);
  });

  it('treats "12.3" and "12.30" with the same key as the same request', async () => {
    const first = await send("ok-2", a, b, "12.3");
    const second = await send("ok-2", a, b, "12.30");

    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(second.json()).toEqual(first.json());
    expect(first.json().amount).toBe("12.30");
    expect(getBalance(app.db, b)).toBe(1230);
  });
});

describe("POST /transfers: Idempotency-Key header", () => {
  it("missing key -> 400 and nothing is written", async () => {
    const res = await post({}, { from_account_id: a, to_account_id: b, amount: "1.00" });

    expect(res.statusCode).toBe(400);
    expectNothingMoved();
  });

  it("empty key -> 400 and nothing is written", async () => {
    const res = await send("", a, b, "1.00");

    expect(res.statusCode).toBe(400);
    expectNothingMoved();
  });
});

describe("POST /transfers: bad body -> 400", () => {
  // it.each runs the same test once per row; "$name" puts each row's name in the test title.
  it.each([
    { name: "missing amount", body: () => ({ from_account_id: a, to_account_id: b }) },
    { name: "missing to_account_id", body: () => ({ from_account_id: a, amount: "1.00" }) },
    { name: "account id sent as text", body: () => ({ from_account_id: String(a), to_account_id: b, amount: "1.00" }) },
    { name: "decimal account id", body: () => ({ from_account_id: 1.5, to_account_id: b, amount: "1.00" }) },
    { name: "amount sent as a number", body: () => ({ from_account_id: a, to_account_id: b, amount: 12.34 }) },
    { name: "same account on both sides", body: () => ({ from_account_id: a, to_account_id: a, amount: "1.00" }) },
  ])("$name", async ({ body }) => {
    const res = await post({ "idempotency-key": "bad-body" }, body());

    expect(res.statusCode).toBe(400);
    expectNothingMoved();
  });
});

describe("POST /transfers: amount rejected by toCents -> 400", () => {
  it.each(["12.345", "-5", "abc", "", "0.00"])("amount %j", async (amount) => {
    const res = await send("bad-amount", a, b, amount);

    expect(res.statusCode).toBe(400);
    expectNothingMoved();
  });

  it("a 400 does not use up the key: the same key then works", async () => {
    const bad = await send("retry-after-400", a, b, "12.345");
    const good = await send("retry-after-400", a, b, "12.34");

    expect(bad.statusCode).toBe(400);
    expect(good.statusCode).toBe(201);
    expect(getBalance(app.db, b)).toBe(1234);
  });
});

describe("POST /transfers: unknown account -> 422", () => {
  it("returns 422, moves nothing, and does not save the key", async () => {
    const res = await send("unknown", a, 9999, "12.34");

    expect(res.statusCode).toBe(422);
    expectNothingMoved();

    // The key wasn't saved, so a corrected request with the same key goes through.
    const retry = await send("unknown", a, b, "12.34");
    expect(retry.statusCode).toBe(201);
    expect(getBalance(app.db, b)).toBe(1234);
  });
});

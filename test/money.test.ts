import { describe, it, expect } from "vitest";
import { toCents } from "../src/money.js";
import type { Cents } from "../src/money.js";

describe("toCents: valid amounts (spec cases)", () => {
  it.each([
    ["12.34", 1234],
    ["0.1", 10],
    ["5", 500],
    ["0.05", 5],
  ])("%s -> %i cents", (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });
});

describe("toCents: rejects bad input", () => {
  it.each([
    // negatives
    "-5",
    "-0.01",
    // three decimals
    "1.234",
    "0.001",
    // empty and malformed
    "",
    ".",
    "1.",
    ".5",
    "abc",
    "1e5",
    "1,000",
    // spaces and newlines
    " 12.34",
    "12.34 ",
    "12. 34",
    "12.34\n",
  ])("rejects %j", (input) => {
    expect(() => toCents(input)).toThrow();
  });
});

describe("toCents: leading zeros (accepted by the current regex)", () => {
  it.each([
    ["007.50", 750],
    ["00", 0],
  ])("%s -> %i cents", (input, expected) => {
    expect(toCents(input)).toBe(expected);
  });
});

describe("toCents: very large amounts", () => {
  it.each(["90071992547409.93", "99999999999999999999"])(
    "%s is either rejected or converted exactly",
    (input) => {
      let result: Cents;
      try {
        result = toCents(input);
      } catch {
        return; // rejecting it is fine
      }
      // Above Number.MAX_SAFE_INTEGER, numbers are silently rounded.
      expect(Number.isSafeInteger(result), `got ${result}`).toBe(true);
    },
  );
});

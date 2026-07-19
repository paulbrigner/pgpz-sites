import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { deterministicIdempotencyKey } from "./idempotency";

describe("deterministic idempotency keys", () => {
  it("returns a namespaced SHA-256 digest", () => {
    const key = deterministicIdempotencyKey(" Newsletter.Send ", "edition-1", "user-1");
    const expectedDigest = createHash("sha256")
      .update('array:[string:"edition-1",string:"user-1"]')
      .digest("hex");
    expect(key).toMatch(/^newsletter\.send:[a-f0-9]{64}$/);
    expect(key).toBe(`newsletter.send:${expectedDigest}`);
    expect(key).toBe(deterministicIdempotencyKey("newsletter.send", "edition-1", "user-1"));
  });

  it("ignores object property insertion order", () => {
    expect(deterministicIdempotencyKey("job", { a: 1, nested: { c: 3, b: 2 } })).toBe(
      deterministicIdempotencyKey("job", { nested: { b: 2, c: 3 }, a: 1 }),
    );
  });

  it("retains array and argument order", () => {
    expect(deterministicIdempotencyKey("job", ["a", "b"])).not.toBe(
      deterministicIdempotencyKey("job", ["b", "a"]),
    );
    expect(deterministicIdempotencyKey("job", "a", "b")).not.toBe(
      deterministicIdempotencyKey("job", "b", "a"),
    );
  });

  it.each([
    [undefined, null],
    [1, "1"],
    [1n, "1"],
    [-0, 0],
    [Number.NaN, "NaN"],
    [Infinity, "Infinity"],
    [new Date("2026-07-19T00:00:00.000Z"), "2026-07-19T00:00:00.000Z"],
    [{ value: undefined }, { value: { $type: "undefined" } }],
  ])("does not collapse distinct values %#", (left, right) => {
    expect(deterministicIdempotencyKey("job", left)).not.toBe(
      deterministicIdempotencyKey("job", right),
    );
  });

  it.each(["", "   ", "has spaces", "slash/value", "_starts-with-symbol"])(
    "rejects invalid namespace %j",
    (namespace) => {
      expect(() => deterministicIdempotencyKey(namespace, "value")).toThrow("namespace");
    },
  );

  it("rejects an oversized namespace", () => {
    expect(() => deterministicIdempotencyKey("a".repeat(65), "value")).toThrow("1-64");
  });

  it("rejects circular and unsupported values", () => {
    const circular: { self?: unknown } = {};
    circular.self = circular;

    expect(() => deterministicIdempotencyKey("job", circular)).toThrow("circular");
    expect(() => deterministicIdempotencyKey("job", Symbol("value"))).toThrow("symbol");
    expect(() => deterministicIdempotencyKey("job", () => undefined)).toThrow("function");
    expect(() => deterministicIdempotencyKey("job", new Map())).toThrow("plain objects");
    expect(() => deterministicIdempotencyKey("job", new Date("invalid"))).toThrow("dates must be valid");
  });
});

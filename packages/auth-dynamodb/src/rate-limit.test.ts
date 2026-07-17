import { beforeEach, describe, expect, it, vi } from "vitest";
import { createBetterAuthDynamoDBRateLimitStorage } from "./rate-limit";
import { createFakeDocumentClient } from "./test-dynamo";

const fake = createFakeDocumentClient();
let now = Date.parse("2026-07-16T12:00:05.000Z");
const config = () => ({
  documentClient: fake.client,
  tableName: "ReferenceAuthTable",
  now: () => now,
});

describe("injected Better Auth durable rate-limit storage", () => {
  beforeEach(() => {
    fake.reset();
    now = Date.parse("2026-07-16T12:00:05.000Z");
  });

  it("shares one atomic counter across separately created serverless instances", async () => {
    const first = createBetterAuthDynamoDBRateLimitStorage(config());
    const second = createBetterAuthDynamoDBRateLimitStorage(config());

    const decisions = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        (index % 2 ? first : second).consume!("203.0.113.5|/sign-in/magic-link", {
          window: 60,
          max: 5,
        }),
      ),
    );

    expect(decisions.filter(({ allowed }) => allowed)).toHaveLength(5);
    expect(decisions[5]).toEqual({ allowed: false, retryAfter: 55 });
    expect(fake.state.items.size).toBe(1);
    const item = Array.from(fake.state.items.values())[0];
    expect(item).toMatchObject({ count: 6, windowSeconds: 60, expires: 1784203320 });
    expect(item.pk).toMatch(/^BETTER_AUTH_RATE_LIMIT#[a-f0-9]{64}$/);
    expect(JSON.stringify(item)).not.toContain("203.0.113.5");
    expect(fake.client.update).toHaveBeenCalledWith(
      expect.objectContaining({ TableName: "ReferenceAuthTable", ReturnValues: "ALL_NEW" }),
    );
  });

  it("isolates keys and starts a fresh durable bucket after each window", async () => {
    const storage = createBetterAuthDynamoDBRateLimitStorage(config());

    expect((await storage.consume!("key-a", { window: 10, max: 1 })).allowed).toBe(true);
    expect((await storage.consume!("key-b", { window: 10, max: 1 })).allowed).toBe(true);
    expect((await storage.consume!("key-a", { window: 10, max: 1 })).allowed).toBe(false);
    now += 10_000;
    expect((await storage.consume!("key-a", { window: 10, max: 1 })).allowed).toBe(true);
    expect(fake.state.items.size).toBe(3);
  });

  it("implements get/set compatibility with an epoch-second TTL", async () => {
    const storage = createBetterAuthDynamoDBRateLimitStorage(config());
    await storage.set("compatibility-key", {
      key: "compatibility-key",
      count: 2,
      lastRequest: now,
    });

    await expect(storage.get("compatibility-key")).resolves.toEqual({
      key: "compatibility-key",
      count: 2,
      lastRequest: now,
    });
    expect(Array.from(fake.state.items.values())[0].expires).toBe(Math.ceil(now / 1000) + 300);
    expect(fake.client.get).toHaveBeenCalledWith(
      expect.objectContaining({ TableName: "ReferenceAuthTable", ConsistentRead: true }),
    );
  });

  it("supports isolated prefixes and explicit TTL policies", async () => {
    const storage = createBetterAuthDynamoDBRateLimitStorage({
      ...config(),
      keyPrefix: "REFERENCE_AUTH_LIMIT",
      stateTtlSeconds: 30,
      windowTtlGraceSeconds: 5,
    });
    await storage.set("key", { key: "key", count: 1, lastRequest: now });
    await storage.consume!("key", { window: 10, max: 2 });

    const items = Array.from(fake.state.items.values());
    expect(items).toHaveLength(2);
    expect(items.every(({ pk }) => String(pk).startsWith("REFERENCE_AUTH_LIMIT#"))).toBe(true);
    expect(items.find(({ sk }) => sk === "STATE")?.expires).toBe(Math.ceil(now / 1000) + 30);
    expect(items.find(({ sk }) => String(sk).startsWith("WINDOW#"))?.expires).toBe(
      Math.ceil((Math.floor(now / 10_000) * 10_000 + 10_000) / 1000) + 5,
    );
  });

  it("fails closed when DynamoDB fails or returns a malformed atomic counter", async () => {
    const storage = createBetterAuthDynamoDBRateLimitStorage(config());
    fake.client.update.mockRejectedValueOnce(new Error("DynamoDB unavailable"));
    await expect(storage.consume!("key", { window: 10, max: 1 })).rejects.toThrow(
      "DynamoDB unavailable",
    );

    fake.client.update.mockResolvedValueOnce({ Attributes: { count: "not-a-number" } });
    await expect(storage.consume!("key", { window: 10, max: 1 })).rejects.toThrow(
      "did not return a numeric count",
    );
  });

  it("rejects incomplete injection and invalid policy values", () => {
    expect(() =>
      createBetterAuthDynamoDBRateLimitStorage({
        documentClient: { get: vi.fn(), put: vi.fn() } as never,
        tableName: "Table",
      }),
    ).toThrow("must implement update");
    expect(() => createBetterAuthDynamoDBRateLimitStorage({ ...config(), tableName: "" })).toThrow(
      "tableName",
    );
    expect(() =>
      createBetterAuthDynamoDBRateLimitStorage({ ...config(), stateTtlSeconds: 0 }),
    ).toThrow("stateTtlSeconds");
    expect(() =>
      createBetterAuthDynamoDBRateLimitStorage({ ...config(), windowTtlGraceSeconds: -1 }),
    ).toThrow("windowTtlGraceSeconds");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  items: new Map<string, Record<string, any>>(),
  get: vi.fn(),
  put: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    get: db.get,
    put: db.put,
    update: db.update,
  },
}));

const storageKey = (key: { pk: string; sk: string }) => `${key.pk}|${key.sk}`;

describe("Better Auth durable rate-limit storage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:05.000Z"));
    db.items.clear();

    db.get.mockImplementation(async ({ Key }) => ({ Item: db.items.get(storageKey(Key)) }));
    db.put.mockImplementation(async ({ Item }) => {
      db.items.set(storageKey(Item), { ...Item });
      return {};
    });
    db.update.mockImplementation(async ({ Key, ExpressionAttributeValues }) => {
      const key = storageKey(Key);
      const current = db.items.get(key) || {};
      const next = {
        ...current,
        ...Key,
        type: ExpressionAttributeValues[":type"],
        keyHash: ExpressionAttributeValues[":keyHash"],
        count: (current.count || 0) + ExpressionAttributeValues[":one"],
        lastRequest: ExpressionAttributeValues[":lastRequest"],
        windowStartedAt: ExpressionAttributeValues[":windowStartedAt"],
        windowSeconds: ExpressionAttributeValues[":windowSeconds"],
        expires: ExpressionAttributeValues[":expires"],
      };
      db.items.set(key, next);
      return { Attributes: { ...next } };
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shares one atomic counter across separately created storage instances", async () => {
    const { createBetterAuthDynamoDBRateLimitStorage } = await import("@/lib/better-auth-rate-limit");
    const firstInstance = createBetterAuthDynamoDBRateLimitStorage();
    const secondInstance = createBetterAuthDynamoDBRateLimitStorage();

    const decisions = await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        (index % 2 ? firstInstance : secondInstance).consume!("203.0.113.5|/sign-in/magic-link", {
          window: 60,
          max: 5,
        }),
      ),
    );

    expect(decisions.filter((decision) => decision.allowed)).toHaveLength(5);
    expect(decisions[5]).toEqual({ allowed: false, retryAfter: 55 });
    expect(db.items.size).toBe(1);
    const item = Array.from(db.items.values())[0];
    expect(item).toMatchObject({
      count: 6,
      windowSeconds: 60,
      expires: 1784203320,
    });
    expect(item.pk).toMatch(/^BETTER_AUTH_RATE_LIMIT#[a-f0-9]{64}$/);
    expect(JSON.stringify(item)).not.toContain("203.0.113.5");
  });

  it("isolates keys and starts a fresh durable bucket after the window", async () => {
    const { createBetterAuthDynamoDBRateLimitStorage } = await import("@/lib/better-auth-rate-limit");
    const storage = createBetterAuthDynamoDBRateLimitStorage();

    expect((await storage.consume!("key-a", { window: 10, max: 1 })).allowed).toBe(true);
    expect((await storage.consume!("key-b", { window: 10, max: 1 })).allowed).toBe(true);
    expect((await storage.consume!("key-a", { window: 10, max: 1 })).allowed).toBe(false);

    vi.advanceTimersByTime(10_000);
    expect((await storage.consume!("key-a", { window: 10, max: 1 })).allowed).toBe(true);
    expect(db.items.size).toBe(3);
  });

  it("implements the required get/set compatibility contract with epoch-second TTL", async () => {
    const { createBetterAuthDynamoDBRateLimitStorage } = await import("@/lib/better-auth-rate-limit");
    const storage = createBetterAuthDynamoDBRateLimitStorage();

    await storage.set("compatibility-key", {
      key: "compatibility-key",
      count: 2,
      lastRequest: Date.now(),
    });

    await expect(storage.get("compatibility-key")).resolves.toEqual({
      key: "compatibility-key",
      count: 2,
      lastRequest: Date.now(),
    });
    expect(Array.from(db.items.values())[0].expires).toBe(Math.ceil(Date.now() / 1000) + 300);
  });

  it("propagates DynamoDB failures instead of bypassing the limit", async () => {
    const { createBetterAuthDynamoDBRateLimitStorage } = await import("@/lib/better-auth-rate-limit");
    const storage = createBetterAuthDynamoDBRateLimitStorage();
    db.update.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

    await expect(storage.consume!("key", { window: 10, max: 1 })).rejects.toThrow(
      "DynamoDB unavailable",
    );
  });
});

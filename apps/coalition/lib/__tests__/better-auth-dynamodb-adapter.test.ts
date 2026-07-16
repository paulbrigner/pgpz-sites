import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  items: new Map<string, Record<string, any>>(),
  queryPageSize: Number.POSITIVE_INFINITY,
  delete: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    delete: db.delete,
    get: db.get,
    put: db.put,
    query: db.query,
    scan: db.scan,
    update: db.update,
  },
}));

const storageKey = (item: { pk: string; sk: string }) => `${item.pk}|${item.sk}`;

const clone = <T>(value: T): T => structuredClone(value);

describe("Better Auth DynamoDB adapter contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.items.clear();
    db.queryPageSize = Number.POSITIVE_INFINITY;

    db.put.mockImplementation(async ({ Item }) => {
      db.items.set(storageKey(Item), clone(Item));
      return {};
    });
    db.get.mockImplementation(async ({ Key }) => ({
      Item: db.items.has(storageKey(Key)) ? clone(db.items.get(storageKey(Key))) : undefined,
    }));
    db.query.mockImplementation(async ({ ExpressionAttributeValues, ExclusiveStartKey }) => {
      const partitionKey = ExpressionAttributeValues[":gsi1pk"];
      const matching = Array.from(db.items.values())
        .filter((item) => item.GSI1PK === partitionKey)
        .sort((left, right) => String(left.GSI1SK).localeCompare(String(right.GSI1SK)));
      const start = ExclusiveStartKey
        ? matching.findIndex((item) => storageKey(item) === storageKey(ExclusiveStartKey)) + 1
        : 0;
      const page = matching.slice(start, start + db.queryPageSize);
      const hasMore = start + page.length < matching.length;
      return {
        Items: clone(page),
        LastEvaluatedKey: hasMore
          ? { pk: page[page.length - 1].pk, sk: page[page.length - 1].sk }
          : undefined,
      };
    });
    db.scan.mockImplementation(async ({ ExpressionAttributeValues }) => ({
      Items: clone(
        Array.from(db.items.values()).filter(
          (item) => item.type === ExpressionAttributeValues[":type"],
        ),
      ),
    }));
    db.delete.mockImplementation(async ({ Key, ConditionExpression }) => {
      const key = storageKey(Key);
      if (ConditionExpression && !db.items.has(key)) {
        const error = new Error("missing");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      db.items.delete(key);
      return {};
    });
  });

  it("maps logical models through the Better Auth factory and hides storage fields", async () => {
    const { betterAuthDynamoDBAdapter } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = betterAuthDynamoDBAdapter({
      user: { modelName: "better_auth_users" },
      session: { modelName: "better_auth_sessions" },
      account: { modelName: "better_auth_accounts" },
      verification: { modelName: "better_auth_verifications" },
    } as any);

    const created = await adapter.create({
      model: "user",
      data: { id: "user-1", email: "Member@Example.Test", name: "Member" },
      forceAllowId: true,
    });

    expect(created).toMatchObject({
      id: "user-1",
      email: "Member@Example.Test",
      name: "Member",
      emailVerified: false,
    });
    expect(created).toHaveProperty("createdAt", expect.any(Date));
    expect(created).toHaveProperty("updatedAt", expect.any(Date));
    expect(Array.from(db.items.values())[0]).toMatchObject({
      pk: "BETTER_AUTH#better_auth_users#user-1",
      type: "BETTER_AUTH#better_auth_users",
      GSI1PK: "BETTER_AUTH#better_auth_users#email#member@example.test",
    });
  });

  it("uses a primary-key Get for id equality", async () => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();
    await adapter.create({
      model: "better_auth_users",
      data: { id: "user-1", email: "member@example.test" },
    });

    const found = await adapter.findOne<Record<string, any>>({
      model: "better_auth_users",
      where: [{ field: "id", value: "user-1" }],
    });

    expect(found?.email).toBe("member@example.test");
    expect(db.get).toHaveBeenCalledOnce();
    expect(db.query).not.toHaveBeenCalled();
    expect(db.scan).not.toHaveBeenCalled();
  });

  it.each([
    [
      "user email",
      "better_auth_users",
      { id: "user-1", email: "Member@Example.Test" },
      [{ field: "email", value: "MEMBER@example.test", mode: "insensitive" }],
    ],
    [
      "session token",
      "better_auth_sessions",
      { id: "session-1", token: "token-1", userId: "user-1", expiresAt: new Date("2030-01-01") },
      [{ field: "token", value: "token-1" }],
    ],
    [
      "verification identifier",
      "better_auth_verifications",
      { id: "verification-1", identifier: "hash-1", expiresAt: new Date("2030-01-01") },
      [{ field: "identifier", value: "hash-1" }],
    ],
    [
      "provider account",
      "better_auth_accounts",
      { id: "account-1", providerId: "email", accountId: "member@example.test", userId: "user-1" },
      [
        { field: "accountId", value: "member@example.test" },
        { field: "providerId", value: "email" },
      ],
    ],
  ])("uses GSI1 without a scan for %s", async (_label, model, data, where) => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();
    await adapter.create({ model, data });

    const found = await adapter.findOne<Record<string, any>>({ model, where });

    expect(found?.id).toBe(data.id);
    expect(db.query).toHaveBeenCalled();
    expect(db.scan).not.toHaveBeenCalled();
    if ("expiresAt" in data) {
      expect(Array.from(db.items.values())[0].expires).toBe(
        Math.ceil(new Date(data.expiresAt).getTime() / 1000),
      );
      expect(found).not.toHaveProperty("expires");
    }
  });

  it("unions token IN queries, paginates GSI results, and applies sorting and selection", async () => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();
    db.queryPageSize = 1;
    await adapter.create({
      model: "better_auth_sessions",
      data: { id: "session-1", token: "token-1", userId: "user-1", createdAt: "2026-01-01" },
    });
    await adapter.create({
      model: "better_auth_sessions",
      data: { id: "session-2", token: "token-2", userId: "user-1", createdAt: "2026-01-02" },
    });

    const found = await adapter.findMany<Record<string, any>>({
      model: "better_auth_sessions",
      where: [{ field: "token", operator: "in", value: ["token-1", "token-2"] }],
      sortBy: { field: "createdAt", direction: "desc" },
      select: ["id", "token"],
    });

    expect(found).toEqual([
      { id: "session-2", token: "token-2" },
      { id: "session-1", token: "token-1" },
    ]);
    expect(db.query).toHaveBeenCalledTimes(2);
    expect(db.scan).not.toHaveBeenCalled();
  });

  it("keeps OR and unindexed null semantics correct through the compatibility scan", async () => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();
    await adapter.create({ model: "better_auth_users", data: { id: "user-1", email: "one@example.test" } });
    await adapter.create({ model: "better_auth_users", data: { id: "user-2", email: "two@example.test" } });

    const either = await adapter.findMany<Record<string, any>>({
      model: "better_auth_users",
      where: [
        { field: "email", value: "one@example.test" },
        { field: "email", value: "two@example.test", connector: "OR" },
      ],
    });
    const missingName = await adapter.findOne<Record<string, any>>({
      model: "better_auth_users",
      where: [{ field: "name", value: null }],
    });

    expect(either.map((item) => item.id).sort()).toEqual(["user-1", "user-2"]);
    expect(missingName?.id).toBe("user-1");
    expect(db.scan).toHaveBeenCalledTimes(2);
  });

  it("moves indexed lookups on update and supports indexed deletion", async () => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();
    await adapter.create({ model: "better_auth_users", data: { id: "user-1", email: "old@example.test" } });

    await adapter.update({
      model: "better_auth_users",
      where: [{ field: "email", value: "old@example.test" }],
      update: { email: "new@example.test" },
    });
    expect(
      await adapter.findOne({
        model: "better_auth_users",
        where: [{ field: "email", value: "old@example.test" }],
      }),
    ).toBeNull();
    expect(
      await adapter.findOne<Record<string, any>>({
        model: "better_auth_users",
        where: [{ field: "email", value: "new@example.test" }],
      }),
    ).toMatchObject({ id: "user-1" });

    await adapter.delete({
      model: "better_auth_users",
      where: [{ field: "email", value: "new@example.test" }],
    });
    expect(db.items.size).toBe(0);
  });

  it("consumes a verification only once and refuses unsafe empty single-record mutations", async () => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();
    await adapter.create({
      model: "better_auth_verifications",
      data: { id: "verification-1", identifier: "hash-1", expiresAt: new Date("2030-01-01") },
    });

    const first = await adapter.consumeOne<Record<string, any>>({
      model: "better_auth_verifications",
      where: [{ field: "id", value: "verification-1" }],
    });
    const second = await adapter.consumeOne<Record<string, any>>({
      model: "better_auth_verifications",
      where: [{ field: "id", value: "verification-1" }],
    });
    const unsafeUpdate = await adapter.update({
      model: "better_auth_users",
      update: { name: "Unsafe" },
    });

    expect(first?.id).toBe("verification-1");
    expect(second).toBeNull();
    expect(unsafeUpdate).toBeNull();
  });

  it("rejects unsupported physical models", async () => {
    const { createBetterAuthAdapterImplementation } = await import("@/lib/better-auth-dynamodb-adapter");
    const adapter = createBetterAuthAdapterImplementation();

    await expect(adapter.create({ model: "unknown_model", data: { id: "bad" } })).rejects.toThrow(
      "Unsupported Better Auth model",
    );
  });
});

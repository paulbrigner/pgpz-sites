import { beforeEach, describe, expect, it } from "vitest";
import {
  createBetterAuthAdapterImplementation,
  createBetterAuthDynamoDBAdapter,
} from "./adapter";
import { createFakeDocumentClient } from "./test-dynamo";

const fake = createFakeDocumentClient();
const config = () => ({
  documentClient: fake.client,
  tableName: "ReferenceAuthTable",
});

class TestOwnershipCollisionError extends Error {}

const normalizeEmail = (value: unknown) =>
  typeof value === "string" ? value.trim().toLowerCase() : "";
const ownershipKey = (email: string) => ({
  pk: `EMAIL_OWNERSHIP#${normalizeEmail(email)}`,
  sk: `EMAIL_OWNERSHIP#${normalizeEmail(email)}`,
});
const ownershipConfig = () => ({
  ...config(),
  userEmailOwnership: {
    normalizeEmail,
    ownershipKey,
    assertCompatible(record: Record<string, any> | null | undefined, bindings: { betterAuthUserId: string }) {
      if (
        record &&
        (record.type !== "EMAIL_OWNERSHIP" ||
          (record.betterAuthUserId && record.betterAuthUserId !== bindings.betterAuthUserId))
      ) {
        throw new TestOwnershipCollisionError();
      }
    },
    claimTransactionItem({ tableName, email, betterAuthUserId }: Record<string, string>) {
      return {
        Update: {
          TableName: tableName,
          Key: ownershipKey(email),
          UpdateExpression: "SET #type = :type, #email = :email, #betterAuthUserId = :betterAuthUserId",
          ConditionExpression:
            "attribute_not_exists(#betterAuthUserId) OR #betterAuthUserId = :betterAuthUserId",
          ExpressionAttributeNames: {
            "#type": "type",
            "#email": "email",
            "#betterAuthUserId": "betterAuthUserId",
          },
          ExpressionAttributeValues: {
            ":type": "EMAIL_OWNERSHIP",
            ":email": normalizeEmail(email),
            ":betterAuthUserId": betterAuthUserId,
          },
        },
      };
    },
    releaseTransactionItem({ tableName, email, betterAuthUserId }: Record<string, string>) {
      return {
        Delete: {
          TableName: tableName,
          Key: ownershipKey(email),
          ConditionExpression: "#betterAuthUserId = :betterAuthUserId",
          ExpressionAttributeNames: { "#betterAuthUserId": "betterAuthUserId" },
          ExpressionAttributeValues: { ":betterAuthUserId": betterAuthUserId },
        },
      };
    },
    releaseBetterAuthTransactionItem({
      tableName,
      email,
      betterAuthUserId,
      preserveAppOwner,
    }: Record<string, any>) {
      if (!preserveAppOwner) {
        return this.releaseTransactionItem({ tableName, email, betterAuthUserId });
      }
      return {
        Update: {
          TableName: tableName,
          Key: ownershipKey(email),
          UpdateExpression: "REMOVE #betterAuthUserId",
          ConditionExpression: "#betterAuthUserId = :betterAuthUserId",
          ExpressionAttributeNames: { "#betterAuthUserId": "betterAuthUserId" },
          ExpressionAttributeValues: { ":betterAuthUserId": betterAuthUserId },
        },
      };
    },
    collisionError: () => new TestOwnershipCollisionError("email collision"),
  },
});

describe("injected Better Auth DynamoDB adapter contract", () => {
  beforeEach(fake.reset);

  it("maps Better Auth logical models and hides physical storage fields", async () => {
    const factory = createBetterAuthDynamoDBAdapter(config());
    const adapter = factory({
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
    expect(Array.from(fake.state.items.values())[0]).toMatchObject({
      pk: "BETTER_AUTH#better_auth_users#user-1",
      type: "BETTER_AUTH#better_auth_users",
      GSI1PK: "BETTER_AUTH#better_auth_users#email#member@example.test",
    });
    expect(fake.client.put).toHaveBeenCalledWith(
      expect.objectContaining({ TableName: "ReferenceAuthTable" }),
    );
  });

  it("uses a primary-key Get for id equality", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({
      model: "better_auth_users",
      data: { id: "user-1", email: "member@example.test" },
    });

    await expect(
      adapter.findOne<Record<string, any>>({
        model: "better_auth_users",
        where: [{ field: "id", value: "user-1" }],
      }),
    ).resolves.toMatchObject({ email: "member@example.test" });
    expect(fake.client.get).toHaveBeenCalledOnce();
    expect(fake.client.query).not.toHaveBeenCalled();
    expect(fake.client.scan).not.toHaveBeenCalled();
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
  ] as const)("uses the GSI without scanning for %s", async (_label, model, data, where) => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({ model, data });
    const found = await adapter.findOne<Record<string, any>>({ model, where: [...where] });

    expect(found?.id).toBe(data.id);
    expect(fake.client.query).toHaveBeenCalled();
    expect(fake.client.scan).not.toHaveBeenCalled();
    if ("expiresAt" in data) {
      expect(Array.from(fake.state.items.values())[0].expires).toBe(
        Math.ceil(new Date(data.expiresAt).getTime() / 1000),
      );
      expect(found).not.toHaveProperty("expires");
    }
  });

  it("honors an injected index name, unions IN queries, paginates, sorts, and projects", async () => {
    const adapter = createBetterAuthAdapterImplementation({ ...config(), indexName: "AuthLookupIndex" });
    fake.state.queryPageSize = 1;
    await adapter.create({
      model: "better_auth_sessions",
      data: { id: "session-1", token: "token-1", createdAt: "2026-01-01" },
    });
    await adapter.create({
      model: "better_auth_sessions",
      data: { id: "session-2", token: "token-2", createdAt: "2026-01-02" },
    });

    await expect(
      adapter.findMany<Record<string, any>>({
        model: "better_auth_sessions",
        where: [{ field: "token", operator: "in", value: ["token-1", "token-2"] }],
        sortBy: { field: "createdAt", direction: "desc" },
        select: ["id", "token"],
      }),
    ).resolves.toEqual([
      { id: "session-2", token: "token-2" },
      { id: "session-1", token: "token-1" },
    ]);
    expect(fake.client.query).toHaveBeenCalledTimes(2);
    expect(fake.client.query).toHaveBeenCalledWith(
      expect.objectContaining({ IndexName: "AuthLookupIndex" }),
    );
    expect(fake.client.scan).not.toHaveBeenCalled();
  });

  it.each([
    {
      label: "sessions",
      model: "better_auth_sessions",
      records: [
        { id: "session-1", token: "token-1", userId: "user-1" },
        { id: "session-2", token: "token-2", userId: "user-1" },
        { id: "session-3", token: "token-3", userId: "user-2" },
      ],
    },
    {
      label: "accounts",
      model: "better_auth_accounts",
      records: [
        { id: "account-1", providerId: "github", accountId: "github-1", userId: "user-1" },
        { id: "account-2", providerId: "google", accountId: "google-1", userId: "user-1" },
        { id: "account-3", providerId: "github", accountId: "github-2", userId: "user-2" },
      ],
    },
  ])("uses the sparse reverse-user GSI without scans for paginated $label findMany/deleteMany", async ({
    model,
    records,
  }) => {
    const adapter = createBetterAuthAdapterImplementation({
      ...config(),
      userIdIndexName: "AuthUserIndex",
    });
    fake.state.queryPageSize = 1;
    for (const data of records) await adapter.create({ model, data });

    const userOne = await adapter.findMany<Record<string, any>>({
      model,
      where: [{ field: "userId", value: "user-1" }],
      sortBy: { field: "id", direction: "asc" },
    });
    expect(userOne.map(({ id }) => id)).toEqual([records[0].id, records[1].id]);

    const bothUsers = await adapter.findMany<Record<string, any>>({
      model,
      where: [{ field: "userId", operator: "in", value: ["user-1", "user-2"] }],
    });
    expect(bothUsers.map(({ id }) => id).sort()).toEqual(records.map(({ id }) => id).sort());
    expect(fake.client.query).toHaveBeenCalledWith(expect.objectContaining({
      IndexName: "AuthUserIndex",
      ExpressionAttributeNames: { "#indexpk": "GSI2PK" },
    }));
    expect(fake.client.query.mock.calls.length).toBeGreaterThan(records.length);
    expect(fake.client.scan).not.toHaveBeenCalled();
    expect(Array.from(fake.state.items.values())[0]).toMatchObject({
      GSI2PK: `BETTER_AUTH#${model}#userId#user-1`,
      GSI2SK: records[0].id,
      GSI1PK: expect.stringContaining(`BETTER_AUTH#${model}#`),
    });

    await expect(adapter.deleteMany({
      model,
      where: [{ field: "userId", value: "user-1" }],
    })).resolves.toBe(2);
    expect(fake.client.scan).not.toHaveBeenCalled();
    await expect(adapter.findMany<Record<string, any>>({
      model,
      where: [{ field: "userId", value: "user-2" }],
    })).resolves.toEqual([expect.objectContaining({ id: records[2].id })]);
  });

  it("paginates compatibility scans while preserving OR and null semantics", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({ model: "better_auth_users", data: { id: "user-1", email: "one@example.test" } });
    await adapter.create({ model: "better_auth_users", data: { id: "user-2", email: "two@example.test" } });
    fake.state.queryPageSize = 1;

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
    const idOrEmail = await adapter.findOne<Record<string, any>>({
      model: "better_auth_users",
      where: [
        { field: "id", value: "missing-user" },
        { field: "email", value: "two@example.test", connector: "OR" },
      ],
    });

    expect(either.map((item) => item.id).sort()).toEqual(["user-1", "user-2"]);
    expect(missingName?.id).toBe("user-1");
    expect(idOrEmail?.id).toBe("user-2");
    expect(fake.client.scan.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it("moves and removes indexed attributes on update and supports indexed deletion", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({ model: "better_auth_users", data: { id: "user-1", email: "old@example.test" } });

    await adapter.update({
      model: "better_auth_users",
      where: [{ field: "email", value: "old@example.test" }],
      update: { email: "new@example.test" },
    });
    expect(Array.from(fake.state.items.values())[0].GSI1PK).toContain("new@example.test");
    await adapter.update({
      model: "better_auth_users",
      where: [{ field: "email", value: "new@example.test" }],
      update: { email: null },
    });
    expect(Array.from(fake.state.items.values())[0]).not.toHaveProperty("GSI1PK");

    await adapter.delete({
      model: "better_auth_users",
      where: [{ field: "id", value: "user-1" }],
    });
    expect(fake.state.items.size).toBe(0);
  });

  it("consumes a verification only once and refuses unsafe empty single-record mutations", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({
      model: "better_auth_verifications",
      data: { id: "verification-1", identifier: "hash-1", expiresAt: new Date("2030-01-01") },
    });
    await expect(
      adapter.consumeOne<Record<string, any>>({
        model: "better_auth_verifications",
        where: [{ field: "id", value: "verification-1" }],
      }),
    ).resolves.toMatchObject({ id: "verification-1" });
    await expect(
      adapter.consumeOne<Record<string, any>>({
        model: "better_auth_verifications",
        where: [{ field: "id", value: "verification-1" }],
      }),
    ).resolves.toBeNull();
    await expect(
      adapter.update({ model: "better_auth_users", update: { name: "Unsafe" } }),
    ).resolves.toBeNull();
  });

  it("supports count, updateMany, deleteMany, and atomic-style increments", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({ model: "better_auth_sessions", data: { id: "one", token: "one", score: 1 } });
    await adapter.create({ model: "better_auth_sessions", data: { id: "two", token: "two", score: 3 } });
    await expect(adapter.count({ model: "better_auth_sessions" })).resolves.toBe(2);
    await expect(
      adapter.incrementOne<Record<string, any>>({
        model: "better_auth_sessions",
        where: [{ field: "id", value: "one" }],
        increment: { score: 2 },
        set: { state: "active" },
      }),
    ).resolves.toMatchObject({ score: 3, state: "active" });
    await expect(
      adapter.updateMany({ model: "better_auth_sessions", update: { state: "closed" } }),
    ).resolves.toBe(2);
    await expect(adapter.deleteMany({ model: "better_auth_sessions" })).resolves.toBe(2);
    expect(fake.state.items.size).toBe(0);
  });

  it("increments counters atomically across concurrent adapter calls", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({
      model: "better_auth_sessions",
      data: { id: "session-1", token: "token-1", score: 0 },
    });

    await Promise.all(
      Array.from({ length: 20 }, () =>
        adapter.incrementOne({
          model: "better_auth_sessions",
          where: [{ field: "id", value: "session-1" }],
          increment: { score: 1 },
        }),
      ),
    );

    await expect(
      adapter.findOne<Record<string, any>>({
        model: "better_auth_sessions",
        where: [{ field: "id", value: "session-1" }],
      }),
    ).resolves.toMatchObject({ score: 20 });
    expect(fake.client.update).toHaveBeenCalledTimes(20);
  });

  it("retries versioned updates without overwriting a concurrent field change", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await adapter.create({
      model: "better_auth_sessions",
      data: { id: "session-1", token: "token-1", name: "Original" },
    });
    const key = "BETTER_AUTH#better_auth_sessions#session-1|BETTER_AUTH#better_auth_sessions#session-1";
    fake.client.put.mockImplementationOnce(async () => {
      const current = fake.state.items.get(key)!;
      fake.state.items.set(key, {
        ...current,
        name: "Concurrent",
        adapterVersion: Number(current.adapterVersion) + 1,
      });
      const error = new Error("record changed");
      error.name = "ConditionalCheckFailedException";
      throw error;
    });

    await expect(adapter.update<Record<string, any>>({
      model: "better_auth_sessions",
      where: [{ field: "id", value: "session-1" }],
      update: { state: "active" },
    })).resolves.toMatchObject({ name: "Concurrent", state: "active" });

    await expect(adapter.findOne<Record<string, any>>({
      model: "better_auth_sessions",
      where: [{ field: "id", value: "session-1" }],
    })).resolves.toMatchObject({ name: "Concurrent", state: "active" });
  });

  it("claims user email ownership in the same transaction and rejects collisions", async () => {
    const adapter = createBetterAuthAdapterImplementation(ownershipConfig());

    await adapter.create({
      model: "better_auth_users",
      data: { id: "user-1", email: "Member@Example.Test" },
    });
    await expect(
      adapter.create({
        model: "better_auth_users",
        data: { id: "user-2", email: "member@example.test" },
      }),
    ).rejects.toBeInstanceOf(TestOwnershipCollisionError);

    expect(fake.client.transactWrite).toHaveBeenCalled();
    expect(fake.state.items.get(
      "EMAIL_OWNERSHIP#member@example.test|EMAIL_OWNERSHIP#member@example.test",
    )).toMatchObject({
      type: "EMAIL_OWNERSHIP",
      betterAuthUserId: "user-1",
    });
    expect(Array.from(fake.state.items.values()).filter(
      (item) => item.type === "BETTER_AUTH#better_auth_users",
    )).toHaveLength(1);
  });

  it("preserves an app-owned email claim when deleting its Better Auth identity", async () => {
    const adapter = createBetterAuthAdapterImplementation(ownershipConfig());
    await adapter.create({
      model: "better_auth_users",
      data: { id: "user-1", email: "member@example.test" },
    });
    const key = "EMAIL_OWNERSHIP#member@example.test|EMAIL_OWNERSHIP#member@example.test";
    fake.state.items.set(key, { ...fake.state.items.get(key), appUserId: "app-user-1" });

    await adapter.delete({
      model: "better_auth_users",
      where: [{ field: "id", value: "user-1" }],
    });

    expect(fake.state.items.get(key)).toMatchObject({ appUserId: "app-user-1" });
    expect(fake.state.items.get(key)).not.toHaveProperty("betterAuthUserId");
  });

  it("rejects unsupported models and incomplete injection", async () => {
    const adapter = createBetterAuthAdapterImplementation(config());
    await expect(adapter.create({ model: "unknown_model", data: { id: "bad" } })).rejects.toThrow(
      "Unsupported Better Auth model",
    );
    expect(() =>
      createBetterAuthAdapterImplementation({ documentClient: {} as never, tableName: "Table" }),
    ).toThrow("must implement get");
    expect(() =>
      createBetterAuthAdapterImplementation({ documentClient: fake.client, tableName: " " }),
    ).toThrow("tableName");
    expect(() =>
      createBetterAuthAdapterImplementation({
        documentClient: { ...fake.client, transactWrite: undefined },
        tableName: "Table",
        userEmailOwnership: ownershipConfig().userEmailOwnership,
      }),
    ).toThrow("must implement transactWrite");
  });
});

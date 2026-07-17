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

    expect(either.map((item) => item.id).sort()).toEqual(["user-1", "user-2"]);
    expect(missingName?.id).toBe("user-1");
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
  });
});

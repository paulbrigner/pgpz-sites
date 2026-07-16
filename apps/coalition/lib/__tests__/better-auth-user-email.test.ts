import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transactWrite: vi.fn(),
  updateAppUserEmail: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    query: mocks.query,
    transactWrite: mocks.transactWrite,
  },
}));
vi.mock("@/lib/app-users", () => ({
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  userKey: (id: string) => ({ pk: `USER#${id}`, sk: `USER#${id}` }),
  updateAppUserEmail: mocks.updateAppUserEmail,
}));

describe("Better Auth user email synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ Items: [] });
    mocks.transactWrite.mockResolvedValue({});
    mocks.updateAppUserEmail.mockResolvedValue({ id: "app-user-1" });
  });

  it("updates the application user and exact Better Auth user atomically", async () => {
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");

    await updateAppAndBetterAuthUserEmail({
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
      oldEmail: "Old@Example.Test",
      newEmail: "New@Example.Test",
    });

    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        IndexName: "GSI1",
        ExpressionAttributeValues: {
          ":gsi1pk": "BETTER_AUTH#better_auth_users#email#new@example.test",
        },
      }),
    );
    expect(mocks.transactWrite).toHaveBeenCalledWith({
      TransactItems: [
        expect.objectContaining({
          Update: expect.objectContaining({
            TableName: "TestTable",
            Key: { pk: "USER#app-user-1", sk: "USER#app-user-1" },
            ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
          }),
        }),
        expect.objectContaining({
          Update: expect.objectContaining({
            TableName: "TestTable",
            Key: {
              pk: "BETTER_AUTH#better_auth_users#better-user-1",
              sk: "BETTER_AUTH#better_auth_users#better-user-1",
            },
            ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
          }),
        }),
      ],
    });
  });

  it("rejects a target email owned by another Better Auth user", async () => {
    mocks.query.mockResolvedValue({
      Items: [
        {
          type: "BETTER_AUTH#better_auth_users",
          id: "other-better-user",
          email: "new@example.test",
        },
      ],
    });
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");

    await expect(
      updateAppAndBetterAuthUserEmail({
        appUserId: "app-user-1",
        betterAuthUserId: "better-user-1",
        oldEmail: "old@example.test",
        newEmail: "new@example.test",
      }),
    ).rejects.toThrow("That email is already in use.");
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });

  it("propagates a conditional transaction failure without a partial write", async () => {
    mocks.transactWrite.mockRejectedValue(new Error("Transaction cancelled"));
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");

    await expect(
      updateAppAndBetterAuthUserEmail({
        appUserId: "app-user-1",
        betterAuthUserId: "better-user-1",
        oldEmail: "old@example.test",
        newEmail: "new@example.test",
      }),
    ).rejects.toThrow("Transaction cancelled");
  });

  it("updates only the app user for an adapter-era token with no Better Auth identity", async () => {
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");

    await expect(
      updateAppAndBetterAuthUserEmail({
        appUserId: "app-user-1",
        oldEmail: "old@example.test",
        newEmail: "new@example.test",
      }),
    ).resolves.toEqual({ betterAuthUpdated: false });

    expect(mocks.updateAppUserEmail).toHaveBeenCalledWith("app-user-1", "new@example.test");
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });
});

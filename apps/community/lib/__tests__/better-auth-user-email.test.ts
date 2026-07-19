import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
  transactWrite: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    query: mocks.query,
    scan: mocks.scan,
    update: mocks.update,
    transactWrite: mocks.transactWrite,
  },
}));
vi.mock("@/lib/app-users", () => ({
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  userKey: (id: string) => ({ pk: `USER#${id}`, sk: `USER#${id}` }),
}));

describe("Better Auth email synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.query.mockResolvedValue({ Items: [] });
    mocks.scan.mockResolvedValue({ Items: [] });
    mocks.update.mockResolvedValue({});
    mocks.transactWrite.mockResolvedValue({});
  });

  it("updates the app user and bound Better Auth user in one transaction", async () => {
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");

    await updateAppAndBetterAuthUserEmail({
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
      oldEmail: " Old@Example.Test ",
      newEmail: " New@Example.Test ",
    });

    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "TestTable",
        IndexName: "GSI1",
        ExpressionAttributeValues: {
          ":gsi1pk": "BETTER_AUTH#better_auth_users#email#new@example.test",
        },
      }),
    );
    const request = mocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems).toHaveLength(2);
    expect(request.TransactItems[0].Update).toMatchObject({
      Key: { pk: "USER#app-user-1", sk: "USER#app-user-1" },
      ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
      ExpressionAttributeValues: expect.objectContaining({
        ":oldEmail": "old@example.test",
        ":newEmail": "new@example.test",
        ":appGsi": "USER#new@example.test",
      }),
    });
    expect(request.TransactItems[1].Update).toMatchObject({
      Key: {
        pk: "BETTER_AUTH#better_auth_users#better-user-1",
        sk: "BETTER_AUTH#better_auth_users#better-user-1",
      },
      ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
      ExpressionAttributeValues: expect.objectContaining({
        ":oldEmail": "old@example.test",
        ":newEmail": "new@example.test",
        ":betterAuthGsi": "BETTER_AUTH#better_auth_users#email#new@example.test",
        ":betterAuthUserId": "better-user-1",
      }),
    });
  });

  it("binds extra transaction items to an active application-user update", async () => {
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");
    const tokenDelete = {
      Delete: {
        TableName: "TestTable",
        Key: { pk: "VT#EMAIL_CHANGE#app-user-1", sk: "VT#token-1" },
      },
    };

    await updateAppAndBetterAuthUserEmail({
      appUserId: "app-user-1",
      betterAuthUserId: "better-user-1",
      oldEmail: "old@example.test",
      newEmail: "new@example.test",
      requireActiveAccount: true,
      additionalTransactItems: [tokenDelete],
    });

    const request = mocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems).toHaveLength(3);
    expect(request.TransactItems[0]).toEqual(tokenDelete);
    expect(request.TransactItems[1].Update).toMatchObject({
      Key: { pk: "USER#app-user-1", sk: "USER#app-user-1" },
      ConditionExpression: expect.stringContaining(
        "attribute_not_exists(#accountStatus) OR #accountStatus = :activeAccount",
      ),
      ExpressionAttributeNames: expect.objectContaining({
        "#accountStatus": "accountStatus",
        "#deactivatedAt": "deactivatedAt",
      }),
      ExpressionAttributeValues: expect.objectContaining({ ":activeAccount": "active" }),
    });
  });

  it("rejects a target email owned by another Better Auth user", async () => {
    mocks.query.mockResolvedValue({
      Items: [
        {
          type: "BETTER_AUTH#better_auth_users",
          id: "different-user",
          email: "new@example.test",
        },
      ],
    });
    const { BetterAuthEmailCollisionError, updateAppAndBetterAuthUserEmail } = await import(
      "@/lib/better-auth-user-email"
    );

    await expect(
      updateAppAndBetterAuthUserEmail({
        appUserId: "app-user-1",
        betterAuthUserId: "better-user-1",
        oldEmail: "old@example.test",
        newEmail: "new@example.test",
      }),
    ).rejects.toBeInstanceOf(BetterAuthEmailCollisionError);
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });

  it("propagates a conditional transaction failure without a partial fallback", async () => {
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
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("updates only the app user for an adapter-era token with no Better Auth identity", async () => {
    const { updateAppAndBetterAuthUserEmail } = await import("@/lib/better-auth-user-email");

    await expect(
      updateAppAndBetterAuthUserEmail({
        appUserId: "app-user-1",
        oldEmail: "old@example.test",
        newEmail: "new@example.test",
        appUserAttributes: { firstName: "Invited" },
      }),
    ).resolves.toEqual({ betterAuthUpdated: false });

    expect(mocks.query).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: {
          ":gsi1pk": "BETTER_AUTH#better_auth_users#email#old@example.test",
        },
      }),
    );
    expect(mocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#app-user-1", sk: "USER#app-user-1" },
        ConditionExpression: "attribute_exists(#pk) AND #email = :oldEmail",
        ExpressionAttributeValues: expect.objectContaining({
          ":oldEmail": "old@example.test",
          ":newEmail": "new@example.test",
          ":app0": "Invited",
        }),
      }),
    );
    expect(mocks.transactWrite).not.toHaveBeenCalled();
  });

  it("collects only lifecycle artifacts owned by the application and Better Auth identity", async () => {
    mocks.query.mockResolvedValueOnce({
      Items: [
        {
          type: "BETTER_AUTH#better_auth_users",
          id: "better-user-1",
          email: "member@example.test",
        },
      ],
    });
    mocks.scan.mockResolvedValueOnce({
      Items: [
        { pk: "session-1", sk: "session-1", type: "BETTER_AUTH#better_auth_sessions", userId: "better-user-1" },
        { pk: "session-other", sk: "session-other", type: "BETTER_AUTH#better_auth_sessions", userId: "better-user-2" },
        { pk: "account-1", sk: "account-1", type: "BETTER_AUTH#better_auth_accounts", userId: "better-user-1" },
        {
          pk: "verification-1",
          sk: "verification-1",
          type: "BETTER_AUTH#better_auth_verifications",
          value: JSON.stringify({ email: "Member@Example.Test" }),
        },
        {
          pk: "verification-other",
          sk: "verification-other",
          type: "BETTER_AUTH#better_auth_verifications",
          value: JSON.stringify({ email: "other@example.test" }),
        },
        { pk: "invite-1", sk: "invite-1", type: "INVITATION_TOKEN", userId: "app-user-1" },
        {
          pk: "VT#EMAIL_CHANGE#app-user-1",
          sk: "VT#email-change-1",
          type: "VT",
          userId: "app-user-1",
        },
        {
          pk: "VT#EMAIL_CHANGE#app-user-2",
          sk: "VT#email-change-other",
          type: "VT",
          userId: "app-user-2",
        },
        { pk: "invite-other", sk: "invite-other", type: "INVITATION_TOKEN", userId: "app-user-2" },
      ],
    });

    const { collectAccountLifecycleArtifacts } = await import("@/lib/better-auth-user-email");
    const result = await collectAccountLifecycleArtifacts({
      appUserId: "app-user-1",
      email: "member@example.test",
    });

    expect(result.betterAuthUserKey).toEqual({
      pk: "BETTER_AUTH#better_auth_users#better-user-1",
      sk: "BETTER_AUTH#better_auth_users#better-user-1",
    });
    expect(result.revocableKeys).toEqual(
      expect.arrayContaining([
        { pk: "session-1", sk: "session-1" },
        { pk: "verification-1", sk: "verification-1" },
        { pk: "invite-1", sk: "invite-1" },
        { pk: "VT#EMAIL_CHANGE#app-user-1", sk: "VT#email-change-1" },
      ]),
    );
    expect(result.deletableDependentKeys).toEqual(
      expect.arrayContaining([{ pk: "account-1", sk: "account-1" }]),
    );
    expect(result.deletableDependentKeys).not.toEqual(
      expect.arrayContaining([
        { pk: "session-other", sk: "session-other" },
        { pk: "verification-other", sk: "verification-other" },
        { pk: "invite-other", sk: "invite-other" },
        { pk: "VT#EMAIL_CHANGE#app-user-2", sk: "VT#email-change-other" },
      ]),
    );
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  delete: vi.fn(),
  transactWrite: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: mocks,
}));

describe("email change tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.get.mockResolvedValue({});
    mocks.delete.mockResolvedValue({});
    mocks.transactWrite.mockResolvedValue({});
  });

  it("creates a token only while its application user remains active", async () => {
    const { createEmailChangeToken } = await import("@/lib/email-change-token");
    const expires = new Date("2026-07-16T12:30:00.250Z");

    await createEmailChangeToken({
      identifier: "EMAIL_CHANGE#user-1",
      token: "token-1",
      expires,
      newEmail: "new@example.test",
      userId: "user-1",
      betterAuthUserId: "better-user-1",
    });

    const request = mocks.transactWrite.mock.calls[0][0];
    expect(request.TransactItems[0].ConditionCheck).toMatchObject({
      TableName: "TestTable",
      Key: { pk: "USER#user-1", sk: "USER#user-1" },
      ConditionExpression: expect.stringContaining("attribute_not_exists(#deactivatedAt)"),
      ExpressionAttributeValues: { ":active": "active" },
    });
    expect(request.TransactItems[1].Put).toEqual({
      TableName: "TestTable",
      Item: {
        pk: "VT#EMAIL_CHANGE#user-1",
        sk: "VT#token-1",
        type: "VT",
        identifier: "EMAIL_CHANGE#user-1",
        token: "token-1",
        expires: Math.ceil(expires.getTime() / 1000),
        newEmail: "new@example.test",
        userId: "user-1",
        betterAuthUserId: "better-user-1",
      },
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
    });
  });

  it("reads a token strongly without consuming it", async () => {
    mocks.get.mockResolvedValue({
      Item: {
        type: "VT",
        identifier: "EMAIL_CHANGE#user-1",
        token: "token-1",
        expires: 1_800_000_000,
        newEmail: "new@example.test",
        userId: "user-1",
      },
    });
    const { getEmailChangeToken } = await import("@/lib/email-change-token");

    const record = await getEmailChangeToken({
      identifier: "EMAIL_CHANGE#user-1",
      token: "token-1",
    });

    expect(mocks.get).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#token-1" },
      ConsistentRead: true,
    });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(record).toMatchObject({ userId: "user-1", newEmail: "new@example.test" });
  });

  it("builds an expiring, payload-bound transactional consume", async () => {
    vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"));
    const { consumeEmailChangeTokenTransactionItem } = await import("@/lib/email-change-token");

    const item = consumeEmailChangeTokenTransactionItem({
      identifier: "EMAIL_CHANGE#user-1",
      token: "token-1",
      expires: new Date("2026-07-16T12:30:00.000Z"),
      newEmail: "new@example.test",
      userId: "user-1",
    });

    expect(item.Delete).toMatchObject({
      TableName: "TestTable",
      Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#token-1" },
      ConditionExpression: expect.stringContaining("#expires >= :now"),
      ExpressionAttributeValues: expect.objectContaining({
        ":type": "VT",
        ":identifier": "EMAIL_CHANGE#user-1",
        ":token": "token-1",
        ":userId": "user-1",
        ":newEmail": "new@example.test",
        ":now": 1_784_203_200,
      }),
    });
    vi.useRealTimers();
  });

  it("consumes adapter-era tokens and rejects malformed records", async () => {
    mocks.delete.mockResolvedValueOnce({
      Attributes: {
        type: "VT",
        identifier: "EMAIL_CHANGE#user-1",
        token: "token-1",
        expires: 1_800_000_000,
        newEmail: "new@example.test",
        userId: "user-1",
      },
    });
    const { consumeEmailChangeToken } = await import("@/lib/email-change-token");

    await expect(
      consumeEmailChangeToken({ identifier: "EMAIL_CHANGE#user-1", token: "token-1" }),
    ).resolves.toMatchObject({ userId: "user-1", newEmail: "new@example.test" });

    mocks.delete.mockResolvedValueOnce({ Attributes: { type: "OTHER" } });
    await expect(
      consumeEmailChangeToken({ identifier: "EMAIL_CHANGE#user-1", token: "bad" }),
    ).resolves.toBeNull();
  });
});

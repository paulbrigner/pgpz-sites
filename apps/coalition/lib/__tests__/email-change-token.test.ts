import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: {
    put: mocks.put,
    delete: mocks.delete,
  },
}));

describe("email-change tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.put.mockResolvedValue({});
    mocks.delete.mockResolvedValue({});
  });

  it("preserves the legacy VT key and writes an epoch-second TTL", async () => {
    const { createEmailChangeToken } = await import("@/lib/email-change-token");
    const expires = new Date("2026-07-16T13:00:00.500Z");

    await createEmailChangeToken({
      identifier: "EMAIL_CHANGE#app-user-1",
      token: "token-1",
      expires,
      newEmail: "new@example.test",
      userId: "app-user-1",
      betterAuthUserId: "better-user-1",
    });

    expect(mocks.put).toHaveBeenCalledWith({
      TableName: "TestTable",
      Item: {
        pk: "VT#EMAIL_CHANGE#app-user-1",
        sk: "VT#token-1",
        type: "VT",
        identifier: "EMAIL_CHANGE#app-user-1",
        token: "token-1",
        expires: Math.ceil(expires.getTime() / 1000),
        newEmail: "new@example.test",
        userId: "app-user-1",
        betterAuthUserId: "better-user-1",
      },
    });
  });

  it("consumes an adapter-era token and converts its TTL back to a Date", async () => {
    mocks.delete.mockResolvedValue({
      Attributes: {
        type: "VT",
        identifier: "EMAIL_CHANGE#app-user-1",
        token: "legacy-token",
        expires: 1_800_000_000,
        newEmail: "new@example.test",
        userId: "app-user-1",
      },
    });
    const { consumeEmailChangeToken } = await import("@/lib/email-change-token");

    const record = await consumeEmailChangeToken({
      identifier: "EMAIL_CHANGE#app-user-1",
      token: "legacy-token",
    });

    expect(mocks.delete).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: {
        pk: "VT#EMAIL_CHANGE#app-user-1",
        sk: "VT#legacy-token",
      },
      ReturnValues: "ALL_OLD",
    });
    expect(record).toMatchObject({
      userId: "app-user-1",
      newEmail: "new@example.test",
      betterAuthUserId: undefined,
    });
    expect(record?.expires.toISOString()).toBe(new Date(1_800_000_000 * 1000).toISOString());
  });

  it("rejects missing or malformed deleted records", async () => {
    const { consumeEmailChangeToken } = await import("@/lib/email-change-token");
    mocks.delete.mockResolvedValueOnce({});
    await expect(
      consumeEmailChangeToken({ identifier: "EMAIL_CHANGE#app-user-1", token: "missing" }),
    ).resolves.toBeNull();

    mocks.delete.mockResolvedValueOnce({ Attributes: { type: "OTHER" } });
    await expect(
      consumeEmailChangeToken({ identifier: "EMAIL_CHANGE#app-user-1", token: "invalid" }),
    ).resolves.toBeNull();
  });
});

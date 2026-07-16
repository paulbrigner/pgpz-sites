import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ put: vi.fn(), delete: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  TABLE_NAME: "TestTable",
  documentClient: { put: mocks.put, delete: mocks.delete },
}));

describe("email change tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.put.mockResolvedValue({});
    mocks.delete.mockResolvedValue({});
  });

  it("preserves the adapter-era VT key shape and binds the Better Auth user", async () => {
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

    expect(mocks.put).toHaveBeenCalledWith({
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
    });
  });

  it("consumes an adapter-era token through delete return values", async () => {
    mocks.delete.mockResolvedValue({
      Attributes: {
        type: "VT",
        expires: 1_784_208_600,
        newEmail: "new@example.test",
        userId: "user-1",
      },
    });
    const { consumeEmailChangeToken } = await import("@/lib/email-change-token");

    const token = await consumeEmailChangeToken({
      identifier: "EMAIL_CHANGE#user-1",
      token: "token-1",
    });

    expect(mocks.delete).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: { pk: "VT#EMAIL_CHANGE#user-1", sk: "VT#token-1" },
      ReturnValues: "ALL_OLD",
    });
    expect(token).toMatchObject({
      identifier: "EMAIL_CHANGE#user-1",
      token: "token-1",
      newEmail: "new@example.test",
      userId: "user-1",
      betterAuthUserId: undefined,
      expires: expect.any(Date),
    });
  });

  it("rejects malformed or already-consumed records", async () => {
    mocks.delete.mockResolvedValue({ Attributes: { type: "OTHER" } });
    const { consumeEmailChangeToken } = await import("@/lib/email-change-token");

    await expect(
      consumeEmailChangeToken({ identifier: "EMAIL_CHANGE#user-1", token: "token-1" }),
    ).resolves.toBeNull();
  });
});

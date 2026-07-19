import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
}));

const syncMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/community-sync", () => ({
  syncCoalitionMemberToCommunityById: syncMock,
}));

import { acceptAuthenticatedInvitation } from "@/lib/admin/invitations";

describe("authenticated invitation acceptance", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.update.mockResolvedValue({});
    dynamoMocks.delete.mockResolvedValue({});
    syncMock.mockResolvedValue({ status: "created" });
  });

  it("activates an invited user signed in with the same email", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
        invitationTokenHash: "current-token-hash",
        accountStatus: "active",
      },
    });

    const result = await acceptAuthenticatedInvitation({
      userId: "user-1",
      email: "Invitee@Example.com",
    });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "TestTable",
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ConditionExpression: expect.stringMatching(/#invitationStatus = :pending.*#email = :email.*#accountStatus.*#deactivatedAt/),
        ExpressionAttributeValues: expect.objectContaining({
          ":active": "active",
          ":invited": "invited",
          ":acceptedVia": "authenticated_session",
          ":email": "invitee@example.com",
        }),
      }),
    );
    expect(syncMock).toHaveBeenCalledWith({
      userId: "user-1",
      triggeredBy: "authenticated_invitation_acceptance",
    });
    expect(dynamoMocks.delete).toHaveBeenCalledWith({
      TableName: "TestTable",
      Key: {
        pk: "INVITATION#current-token-hash",
        sk: "INVITATION#current-token-hash",
      },
    });
    expect(result).toMatchObject({
      ok: true,
      status: "activated",
      userId: "user-1",
      email: "invitee@example.com",
    });
  });

  it("rejects a session for a different email", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
      },
    });

    await expect(
      acceptAuthenticatedInvitation({
        userId: "user-1",
        email: "other@example.com",
      }),
    ).rejects.toMatchObject({
      message: "Sign in with the email address that received this invitation.",
      status: 403,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("is idempotent for an already active member", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "active",
      },
    });

    await expect(
      acceptAuthenticatedInvitation({
        userId: "user-1",
        email: "invitee@example.com",
      }),
    ).resolves.toMatchObject({ ok: true, status: "already_active" });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("rejects a signed-in account without invited membership", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "none",
        invitationStatus: "pending",
        accountStatus: "active",
      },
    });

    await expect(
      acceptAuthenticatedInvitation({ userId: "user-1", email: "invitee@example.com" }),
    ).rejects.toMatchObject({
      message: "This account does not have a pending invitation.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it.each([
    { accountStatus: "deactivated" },
    { accountStatus: "active", deactivatedAt: "2026-07-19T00:00:00.000Z" },
  ])("rejects a deactivated invited account", async (accountState) => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
        ...accountState,
      },
    });

    await expect(
      acceptAuthenticatedInvitation({ userId: "user-1", email: "invitee@example.com" }),
    ).rejects.toMatchObject({ message: "This account is deactivated.", status: 409 });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("rejects a deactivation race at the atomic update boundary", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
        accountStatus: "active",
      },
    });
    dynamoMocks.update.mockRejectedValueOnce({ name: "ConditionalCheckFailedException" });

    await expect(
      acceptAuthenticatedInvitation({ userId: "user-1", email: "invitee@example.com" }),
    ).rejects.toMatchObject({ message: "This invitation is no longer available.", status: 409 });
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("keeps a successful activation moving if consumed-token cleanup must be retried", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
        invitationTokenHash: "current-token-hash",
        accountStatus: "active",
      },
    });
    dynamoMocks.delete.mockRejectedValueOnce(new Error("temporary DynamoDB failure"));

    await expect(
      acceptAuthenticatedInvitation({ userId: "user-1", email: "invitee@example.com" }),
    ).resolves.toMatchObject({ ok: true, status: "activated" });
    expect(syncMock).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });
});

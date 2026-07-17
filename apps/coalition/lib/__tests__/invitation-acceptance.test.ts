import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
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
    syncMock.mockResolvedValue({ status: "created" });
  });

  it("activates an invited user signed in with the same email", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
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
        ConditionExpression: expect.stringContaining("#email = :email"),
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
});

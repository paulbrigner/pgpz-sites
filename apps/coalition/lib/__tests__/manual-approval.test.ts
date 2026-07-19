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

import { approveManualApproval, requestManualApproval } from "@/lib/manual-approval";

describe("manual approval admin flow", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.update.mockResolvedValue({});
    syncMock.mockReset();
    syncMock.mockResolvedValue({ status: "created" });
  });

  it("records a request only while the account remains active and uninvited", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        membershipStatus: "none",
        manualApprovalStatus: "none",
        accountStatus: "active",
      },
    });

    await expect(requestManualApproval("user-1")).resolves.toMatchObject({
      status: "requested",
      manualApprovalStatus: "pending",
    });
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: expect.stringMatching(/#membershipStatus = :none.*#accountStatus.*#deactivatedAt/),
      }),
    );
  });

  it.each([
    { accountStatus: "deactivated", membershipStatus: "none" },
    { accountStatus: "active", deactivatedAt: "2026-07-19T00:00:00.000Z", membershipStatus: "none" },
  ])("rejects manual approval requests for deactivated accounts", async (item) => {
    dynamoMocks.get.mockResolvedValue({ Item: item });

    await expect(requestManualApproval("user-1")).rejects.toMatchObject({
      message: "This account is deactivated.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("approves a signed-in unapproved prospect even without a pending request marker", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "prospect@example.com",
        membershipStatus: "none",
      },
    });

    const result = await approveManualApproval({ userId: "user-1", adminUserId: "admin-1" });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "TestTable",
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ConditionExpression: expect.stringContaining("#membershipStatus = :none"),
        ExpressionAttributeValues: expect.objectContaining({
          ":active": "active",
          ":provider": "manual",
          ":approved": "approved",
          ":none": "none",
          ":adminUserId": "admin-1",
        }),
      }),
    );
    expect(syncMock).toHaveBeenCalledWith({
      userId: "user-1",
      triggeredBy: "manual_approval",
    });
    expect(result).toMatchObject({
      ok: true,
      userId: "user-1",
      membershipStatus: "active",
      membershipProvider: "manual",
      manualApprovalStatus: "approved",
    });
  });

  it("rejects admin approval for a deactivated account", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-3",
        email: "deactivated@example.com",
        membershipStatus: "none",
        manualApprovalStatus: "pending",
        accountStatus: "deactivated",
      },
    });

    await expect(
      approveManualApproval({ userId: "user-3", adminUserId: "admin-1" }),
    ).rejects.toMatchObject({ message: "This account is deactivated.", status: 409 });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });

  it("keeps admin-added invitees in the activation flow unless they have a pending manual request", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-2",
        email: "invitee@example.com",
        membershipStatus: "invited",
        membershipProvider: "admin_invite",
      },
    });

    await expect(
      approveManualApproval({ userId: "user-2", adminUserId: "admin-1" }),
    ).rejects.toMatchObject({
      message: "This member is in the invitation flow. They must sign in and accept the invitation.",
      status: 409,
    });

    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });
});

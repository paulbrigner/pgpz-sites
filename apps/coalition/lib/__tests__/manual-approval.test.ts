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

import { approveManualApproval } from "@/lib/manual-approval";

describe("manual approval admin flow", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.update.mockResolvedValue({});
    syncMock.mockReset();
    syncMock.mockResolvedValue({ status: "created" });
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
      message: "This member is in the invitation flow. They must activate from the invitation email.",
      status: 409,
    });

    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(syncMock).not.toHaveBeenCalled();
  });
});

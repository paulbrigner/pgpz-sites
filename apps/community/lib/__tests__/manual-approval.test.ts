import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

import { approveManualApproval, requestManualApproval } from "@/lib/manual-approval";

describe("manual approval lifecycle guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.update.mockResolvedValue({});
  });

  it("records a request only while the account remains active and unverified", async () => {
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
        ExpressionAttributeValues: expect.objectContaining({
          ":none": "none",
          ":deactivated": "deactivated",
        }),
      }),
    );
  });

  it.each([
    { accountStatus: "deactivated", membershipStatus: "none" },
    { accountStatus: "active", deactivatedAt: "2026-07-19T00:00:00.000Z", membershipStatus: "none" },
  ])("rejects a manual approval request for a deactivated account", async (item) => {
    dynamoMocks.get.mockResolvedValue({ Item: item });

    await expect(requestManualApproval("user-1")).rejects.toMatchObject({
      message: "This account is deactivated.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("rejects admin approval for a deactivated account", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "member@example.com",
        membershipStatus: "none",
        manualApprovalStatus: "pending",
        accountStatus: "deactivated",
      },
    });

    await expect(
      approveManualApproval({ userId: "user-1", adminUserId: "admin-1" }),
    ).rejects.toMatchObject({ message: "This account is deactivated.", status: 409 });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("atomically guards account state when an eligible request is approved", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "member@example.com",
        membershipStatus: "none",
        manualApprovalStatus: "pending",
        accountStatus: "active",
      },
    });

    await expect(
      approveManualApproval({ userId: "user-1", adminUserId: "admin-1" }),
    ).resolves.toMatchObject({ ok: true, membershipStatus: "active" });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: expect.stringMatching(/#membershipStatus = :none.*#accountStatus.*#deactivatedAt/),
      }),
    );
  });
});

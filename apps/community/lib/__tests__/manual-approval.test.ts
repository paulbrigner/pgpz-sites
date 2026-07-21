import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  queue: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/admin/signup-notifications", () => ({
  queueAdminSignupNotification: notificationMocks.queue,
}));

import { approveManualApproval, requestManualApproval } from "@/lib/manual-approval";

describe("manual approval lifecycle guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.update.mockResolvedValue({});
    notificationMocks.queue.mockResolvedValue({ queued: true, recipientCount: 0 });
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
        ExpressionAttributeNames: expect.objectContaining({
          "#manualApprovalStatus": "manualApprovalStatus",
        }),
        ExpressionAttributeValues: expect.objectContaining({
          ":none": "none",
          ":deactivated": "deactivated",
        }),
      }),
    );
    expect(notificationMocks.queue).toHaveBeenCalledWith({
      type: "approval_requested",
      memberUserId: "user-1",
      occurredAt: expect.any(String),
    });
  });

  it("does not send a duplicate notification for an already-pending request", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        membershipStatus: "none",
        manualApprovalStatus: "pending",
        manualApprovalRequestedAt: "2026-07-21T12:00:00.000Z",
        accountStatus: "active",
      },
    });

    await expect(requestManualApproval("user-1")).resolves.toMatchObject({ status: "pending" });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(notificationMocks.queue).not.toHaveBeenCalled();
  });

  it("returns the winning pending request without queuing twice after a concurrent first request", async () => {
    dynamoMocks.get
      .mockResolvedValueOnce({
        Item: {
          membershipStatus: "none",
          manualApprovalStatus: "none",
          accountStatus: "active",
        },
      })
      .mockResolvedValueOnce({
        Item: {
          membershipStatus: "none",
          manualApprovalStatus: "pending",
          manualApprovalRequestedAt: "2026-07-21T12:00:00.000Z",
          accountStatus: "active",
        },
      });
    dynamoMocks.update.mockRejectedValueOnce(
      Object.assign(new Error("request race"), { name: "ConditionalCheckFailedException" }),
    );

    await expect(requestManualApproval("user-1")).resolves.toEqual({
      status: "pending",
      manualApprovalStatus: "pending",
      manualApprovalRequestedAt: "2026-07-21T12:00:00.000Z",
    });
    expect(dynamoMocks.get).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ConsistentRead: true,
      }),
    );
    expect(notificationMocks.queue).not.toHaveBeenCalled();
  });

  it("keeps a successful request successful when notification delivery fails", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        membershipStatus: "none",
        manualApprovalStatus: "none",
        accountStatus: "active",
      },
    });
    notificationMocks.queue.mockRejectedValueOnce(new Error("queue unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(requestManualApproval("user-1")).resolves.toMatchObject({ status: "requested" });
    expect(dynamoMocks.update).toHaveBeenCalledTimes(1);
    expect(notificationMocks.queue).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
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

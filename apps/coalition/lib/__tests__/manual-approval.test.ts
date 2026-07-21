import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  transactWrite: vi.fn(),
}));

const jobMocks = vi.hoisted(() => ({
  prepare: vi.fn(),
  dispatch: vi.fn(),
}));

const notificationMocks = vi.hoisted(() => ({
  queue: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/admin/background-jobs", () => ({
  prepareSingleRecipientBackgroundJob: jobMocks.prepare,
  dispatchStagedBackgroundJob: jobMocks.dispatch,
}));

vi.mock("@/lib/admin/signup-notifications", () => ({
  queueAdminSignupNotification: notificationMocks.queue,
}));

import {
  approveManualApproval,
  declineAccessApplication,
  requestManualApproval,
  withdrawAccessApplication,
} from "@/lib/manual-approval";

const expectActiveAccountCondition = (write: {
  ConditionExpression: string;
  ExpressionAttributeValues: Record<string, unknown>;
}) => {
  expect(write.ConditionExpression).toContain("attribute_not_exists(#accountStatus)");
  expect(write.ConditionExpression).toContain("attribute_type(#accountStatus, :nullType)");
  expect(write.ConditionExpression).toContain("#accountStatus = :emptyString");
  expect(write.ConditionExpression).toContain("#accountStatus = :activeAccount");
  expect(write.ConditionExpression).toContain("attribute_not_exists(#deactivatedAt)");
  expect(write.ConditionExpression).toContain("attribute_type(#deactivatedAt, :nullType)");
  expect(write.ConditionExpression).toContain("#deactivatedAt = :emptyString");
  expect(write.ConditionExpression).not.toContain("#accountStatus <> :deactivated");
  expect(write.ExpressionAttributeValues).toMatchObject({
    ":activeAccount": "active",
    ":emptyString": "",
    ":nullType": "NULL",
  });
};

describe("manual approval admin flow", () => {
  beforeEach(() => {
    dynamoMocks.get.mockReset();
    dynamoMocks.update.mockReset();
    dynamoMocks.update.mockResolvedValue({});
    dynamoMocks.transactWrite.mockReset();
    dynamoMocks.transactWrite.mockResolvedValue({});
    jobMocks.prepare.mockReset();
    jobMocks.prepare.mockResolvedValue({
      job: { id: "sync-job-1" },
      transactItems: [{ Put: { TableName: "Jobs", Item: { pk: "job" } } }],
    });
    jobMocks.dispatch.mockReset();
    jobMocks.dispatch.mockResolvedValue({ dispatched: 1 });
    notificationMocks.queue.mockReset();
    notificationMocks.queue.mockResolvedValue({ queued: true, recipientCount: 0 });
  });

  it.each([
    ["explicitly active", { accountStatus: "active" }],
    ["legacy absent", {}],
    ["legacy null", { accountStatus: null, deactivatedAt: null }],
    ["legacy empty", { accountStatus: "", deactivatedAt: "" }],
  ])("records a request for account state: %s", async (_label, accountState) => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        membershipStatus: "none",
        manualApprovalStatus: "none",
        ...accountState,
      },
    });

    await expect(requestManualApproval("user-1")).resolves.toMatchObject({
      status: "requested",
      manualApprovalStatus: "pending",
      applicationStatus: "requested",
    });
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ConditionExpression: expect.stringMatching(/#membershipStatus = :none.*#accountStatus.*#deactivatedAt/),
      }),
    );
    expectActiveAccountCondition(dynamoMocks.update.mock.calls[0][0]);
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
      applicationStatus: "requested",
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
    { accountStatus: "suspended", membershipStatus: "none" },
    { accountStatus: "active", deactivatedAt: "2026-07-19T00:00:00.000Z", membershipStatus: "none" },
  ])("rejects manual approval requests for deactivated accounts", async (item) => {
    dynamoMocks.get.mockResolvedValue({ Item: item });

    await expect(requestManualApproval("user-1")).rejects.toMatchObject({
      message: "This account is deactivated.",
      status: 409,
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("approves an explicitly requested application", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "prospect@example.com",
        membershipStatus: "none",
        manualApprovalStatus: "pending",
        applicationStatus: "requested",
      },
    });

    const result = await approveManualApproval({ userId: "user-1", adminUserId: "admin-1" });

    const update = dynamoMocks.transactWrite.mock.calls[0][0].TransactItems[0].Update;
    expect(update).toEqual(
      expect.objectContaining({
        TableName: "TestTable",
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ConditionExpression: expect.stringContaining("applicationStatus = :requested"),
        ExpressionAttributeValues: expect.objectContaining({
          ":active": "active",
          ":provider": "manual",
          ":approved": "approved",
          ":adminUserId": "admin-1",
        }),
      }),
    );
    expect(update.ExpressionAttributeValues).not.toHaveProperty(":none");
    expectActiveAccountCondition(update);
    expect(jobMocks.prepare).toHaveBeenCalledWith(expect.objectContaining({
      kind: "community_sync",
      payload: { triggeredBy: "manual_approval" },
    }));
    expect(jobMocks.dispatch).toHaveBeenCalledWith("sync-job-1");
    expect(result).toMatchObject({
      ok: true,
      userId: "user-1",
      membershipStatus: "active",
      membershipProvider: "manual",
      manualApprovalStatus: "approved",
      applicationStatus: "approved",
      communitySync: { status: "queued", jobId: "sync-job-1" },
    });
  });

  it("does not approve an account that never submitted an application", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: { id: "user-1", email: "prospect@example.com", membershipStatus: "none" },
    });

    await expect(
      approveManualApproval({ userId: "user-1", adminUserId: "admin-1" }),
    ).rejects.toMatchObject({ message: "This member is not eligible for approval.", status: 409 });
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it("records explicit declined and withdrawn application states", async () => {
    await expect(
      declineAccessApplication({ userId: "user-1", adminUserId: "admin-1", reason: "Not a current fit" }),
    ).resolves.toMatchObject({ applicationStatus: "declined" });
    expect(dynamoMocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ConditionExpression: expect.stringContaining("applicationStatus = :requested"),
        ExpressionAttributeValues: expect.objectContaining({
          ":declined": "declined",
          ":reason": "Not a current fit",
        }),
      }),
    );
    expectActiveAccountCondition(dynamoMocks.update.mock.calls[0][0]);

    await expect(withdrawAccessApplication("user-1")).resolves.toMatchObject({
      applicationStatus: "withdrawn",
    });
    expect(dynamoMocks.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({ ":withdrawn": "withdrawn" }),
      }),
    );
    expectActiveAccountCondition(dynamoMocks.update.mock.calls[1][0]);
  });

  it("classifies a deactivation race after a canceled approval transaction", async () => {
    const eligibleUser = {
      id: "user-1",
      email: "prospect@example.com",
      membershipStatus: "none",
      manualApprovalStatus: "pending",
      applicationStatus: "requested",
      accountStatus: "active",
    };
    dynamoMocks.get
      .mockResolvedValueOnce({ Item: eligibleUser })
      .mockResolvedValueOnce({
        Item: {
          ...eligibleUser,
          deactivatedAt: "2026-07-19T00:00:00.000Z",
        },
      });
    dynamoMocks.transactWrite.mockRejectedValueOnce(
      Object.assign(new Error("approval race"), { name: "TransactionCanceledException" }),
    );

    await expect(
      approveManualApproval({ userId: "user-1", adminUserId: "admin-1" }),
    ).rejects.toMatchObject({ message: "This account is deactivated.", status: 409 });
    expect(dynamoMocks.get).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        ConsistentRead: true,
      }),
    );
    expect(jobMocks.dispatch).not.toHaveBeenCalled();
  });

  it("preserves an unclassified transaction failure when the account remains eligible", async () => {
    const eligibleUser = {
      id: "user-1",
      email: "prospect@example.com",
      membershipStatus: "none",
      manualApprovalStatus: "pending",
      applicationStatus: "requested",
      accountStatus: "active",
    };
    const transactionError = Object.assign(new Error("transaction conflict"), {
      name: "TransactionCanceledException",
      CancellationReasons: [{ Code: "None" }, { Code: "TransactionConflict" }],
    });
    dynamoMocks.get.mockResolvedValue({ Item: eligibleUser });
    dynamoMocks.transactWrite.mockRejectedValueOnce(transactionError);

    await expect(
      approveManualApproval({ userId: "user-1", adminUserId: "admin-1" }),
    ).rejects.toBe(transactionError);
    expect(dynamoMocks.get).toHaveBeenLastCalledWith(
      expect.objectContaining({ ConsistentRead: true }),
    );
    expect(jobMocks.dispatch).not.toHaveBeenCalled();
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
    expect(jobMocks.prepare).not.toHaveBeenCalled();
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
    expect(jobMocks.prepare).not.toHaveBeenCalled();
  });
});

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

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/admin/background-jobs", () => ({
  prepareSingleRecipientBackgroundJob: jobMocks.prepare,
  dispatchStagedBackgroundJob: jobMocks.dispatch,
}));

import { approveManualApproval, requestManualApproval } from "@/lib/manual-approval";

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

    const update = dynamoMocks.transactWrite.mock.calls[0][0].TransactItems[0].Update;
    expect(update).toEqual(
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
      communitySync: { status: "queued", jobId: "sync-job-1" },
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

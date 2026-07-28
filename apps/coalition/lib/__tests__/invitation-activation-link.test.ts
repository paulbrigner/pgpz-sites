import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transactWrite: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/config", () => ({ SITE_URL: "https://coalition.example.test" }));

vi.mock("@/lib/community-sync", () => ({
  syncCoalitionMemberToCommunityById: vi.fn(),
}));

import {
  claimInvitationEmailDelivery,
  createInvitationActivationLink,
  inspectInvitationActivationToken,
  markInvitationEmailSent,
  releaseInvitationEmailDelivery,
} from "@/lib/admin/invitations";
import { expectExpressionAttributesToMatch } from "@/lib/__tests__/helpers/dynamodb-expressions";

describe("invitation activation link lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.update.mockResolvedValue({});
    dynamoMocks.transactWrite.mockResolvedValue({});
  });

  it("creates a token and records it with one account-active transaction", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
        accountStatus: "active",
      },
    });

    const result = await createInvitationActivationLink({
      userId: "user-1",
      adminUserId: "admin-1",
    });

    expect(result.activationUrl).toContain("/api/invitations/activate?token=");
    const transaction = dynamoMocks.transactWrite.mock.calls[0][0];
    expect(transaction.TransactItems).toHaveLength(2);
    expectExpressionAttributesToMatch(transaction.TransactItems[0].Put);
    expectExpressionAttributesToMatch(transaction.TransactItems[1].Update);
    expect(transaction.TransactItems[1].Update).toEqual(
      expect.objectContaining({
        ConditionExpression: expect.stringMatching(/#membershipStatus = :invited.*#accountStatus.*#deactivatedAt/),
        ExpressionAttributeValues: expect.objectContaining({
          ":invited": "invited",
          ":deactivated": "deactivated",
          ":tokenHash": result.tokenHash,
        }),
      }),
    );
  });

  it("does not issue a token for a deactivated invitee", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "user-1",
        email: "invitee@example.com",
        membershipStatus: "invited",
        invitationStatus: "pending",
        accountStatus: "deactivated",
      },
    });

    await expect(
      createInvitationActivationLink({ userId: "user-1", adminUserId: "admin-1" }),
    ).rejects.toMatchObject({ message: "This account is deactivated.", status: 409 });
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it("atomically prevents the sent marker from recreating invited membership", async () => {
    await markInvitationEmailSent({
      userId: "user-1",
      adminUserId: "admin-1",
      deliveryJobId: "job-1",
      sentAt: "2026-07-28T02:58:03.976Z",
    });

    const request = dynamoMocks.update.mock.calls[0][0];
    expectExpressionAttributesToMatch(request);
    expect(request).toEqual(
      expect.objectContaining({
        UpdateExpression: expect.stringMatching(
          /invitationEmailSentAt.*:sentAt.*updatedAt = :now.*invitationEmailSentJobId.*REMOVE invitationEmailJobId, invitationEmailClaimedAt/,
        ),
        ConditionExpression: expect.stringMatching(
          /#membershipStatus = :invited.*#accountStatus.*:deactivated.*#deactivatedAt.*invitationEmailJobId = :deliveryJobId/,
        ),
        ExpressionAttributeValues: expect.objectContaining({
          ":sentAt": "2026-07-28T02:58:03.976Z",
          ":now": expect.any(String),
          ":invited": "invited",
          ":deactivated": "deactivated",
          ":deliveryJobId": "job-1",
        }),
      }),
    );
    expect(request.ExpressionAttributeValues[":now"]).not.toBe(
      request.ExpressionAttributeValues[":sentAt"],
    );
  });

  it("atomically claims invitation delivery only for an eligible unsent invitee", async () => {
    await expect(
      claimInvitationEmailDelivery({ userId: "user-1", deliveryJobId: "job-1" }),
    ).resolves.toBe(true);

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        UpdateExpression: expect.stringContaining("invitationEmailJobId = :deliveryJobId"),
        ConditionExpression: expect.stringMatching(
          /#membershipStatus = :invited.*#accountStatus.*#deactivatedAt.*invitationEmailSentAt.*emailSuppressed.*manualApprovalStatus.*invitationEmailJobId/,
        ),
        ExpressionAttributeValues: expect.objectContaining({
          ":deliveryJobId": "job-1",
          ":invited": "invited",
          ":deactivated": "deactivated",
          ":false": false,
          ":manualPending": "pending",
        }),
      }),
    );
    expectExpressionAttributesToMatch(dynamoMocks.update.mock.calls[0][0]);
  });

  it("releases only the matching unsent invitation delivery claim", async () => {
    await releaseInvitationEmailDelivery({
      userId: "user-1",
      deliveryJobId: "job-1",
    });

    const request = dynamoMocks.update.mock.calls[0][0];
    expectExpressionAttributesToMatch(request);
    expect(request).toEqual(
      expect.objectContaining({
        Key: { pk: "USER#user-1", sk: "USER#user-1" },
        UpdateExpression: expect.stringContaining(
          "REMOVE invitationEmailJobId, invitationEmailClaimedAt",
        ),
        ConditionExpression:
          "invitationEmailJobId = :deliveryJobId AND attribute_not_exists(invitationEmailSentAt)",
        ExpressionAttributeValues: expect.objectContaining({
          ":deliveryJobId": "job-1",
        }),
      }),
    );
  });

  it("reports an invitation delivery claim lost to a concurrent or ineligible state", async () => {
    dynamoMocks.update.mockRejectedValueOnce({
      name: "ConditionalCheckFailedException",
    });

    await expect(
      claimInvitationEmailDelivery({ userId: "user-1", deliveryJobId: "job-1" }),
    ).resolves.toBe(false);
  });

  it("validates a current token using reads only", async () => {
    const tokenHash = await import("crypto").then(({ createHash }) =>
      createHash("sha256").update("valid-token").digest("hex"),
    );
    dynamoMocks.get
      .mockResolvedValueOnce({
        Item: {
          userId: "user-1",
          email: "invitee@example.com",
          expires: Math.floor(Date.now() / 1000) + 600,
        },
      })
      .mockResolvedValueOnce({
        Item: {
          id: "user-1",
          email: "invitee@example.com",
          membershipStatus: "invited",
          invitationStatus: "pending",
          invitationTokenHash: tokenHash,
          accountStatus: "active",
        },
      });

    await expect(inspectInvitationActivationToken("valid-token")).resolves.toEqual({
      status: "ready",
      userId: "user-1",
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(dynamoMocks.delete).not.toHaveBeenCalled();
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });

  it("does not mutate even when the token is expired", async () => {
    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        userId: "user-1",
        email: "invitee@example.com",
        expires: Math.floor(Date.now() / 1000) - 1,
      },
    });

    await expect(inspectInvitationActivationToken("expired-token")).rejects.toMatchObject({
      message: "This invitation link has expired.",
      status: 410,
    });
    expect(dynamoMocks.get).toHaveBeenCalledTimes(1);
    expect(dynamoMocks.update).not.toHaveBeenCalled();
    expect(dynamoMocks.delete).not.toHaveBeenCalled();
    expect(dynamoMocks.transactWrite).not.toHaveBeenCalled();
  });
});

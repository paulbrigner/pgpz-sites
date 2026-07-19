import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

import {
  emailPreferencesFromUser,
  memberAcceptsEmailCategory,
  unsubscribeMemberFromEmailCategory,
  updateMemberEmailPreferences,
} from "@/lib/email-preferences";

describe("member email preferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.update.mockResolvedValue({ Attributes: {} });
  });

  it("defaults both optional categories on while respecting global suppression", () => {
    expect(emailPreferencesFromUser({})).toMatchObject({
      newsletter: true,
      policyUpdates: true,
      globallySuppressed: false,
    });
    expect(memberAcceptsEmailCategory({ emailNewsletterOptIn: false }, "newsletter")).toBe(false);
    expect(memberAcceptsEmailCategory({ emailPolicyUpdateOptIn: false }, "policy_update")).toBe(false);
    expect(memberAcceptsEmailCategory({ emailSuppressed: true }, "newsletter")).toBe(false);
  });

  it("unsubscribes only the category represented by the message", async () => {
    await unsubscribeMemberFromEmailCategory({
      userId: "member-1",
      category: "policy_update",
      now: "2026-07-19T12:00:00.000Z",
    });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#member-1", sk: "USER#member-1" },
        ExpressionAttributeNames: { "#preference": "emailPolicyUpdateOptIn" },
        ExpressionAttributeValues: expect.objectContaining({
          ":disabled": false,
          ":source": "policy_update_unsubscribe",
        }),
      }),
    );
    expect(JSON.stringify(dynamoMocks.update.mock.calls[0][0])).not.toContain("emailSuppressed");
  });

  it("allows a member to replace a legacy global unsubscribe with category choices", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: { emailSuppressed: true, emailSuppressedReason: "newsletter_unsubscribe" },
    });
    dynamoMocks.update.mockResolvedValue({
      Attributes: {
        emailSuppressed: false,
        emailNewsletterOptIn: false,
        emailPolicyUpdateOptIn: true,
      },
    });

    const result = await updateMemberEmailPreferences({
      userId: "member-1",
      newsletter: false,
      policyUpdates: true,
    });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        UpdateExpression: expect.stringContaining("REMOVE emailSuppressedAt"),
        ExpressionAttributeValues: expect.objectContaining({ ":notSuppressed": false }),
      }),
    );
    expect(result).toMatchObject({ newsletter: false, policyUpdates: true });
  });

  it("does not let self-service preferences clear an administrative suppression", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: { emailSuppressed: true, emailSuppressedReason: "admin_opt_out" },
    });
    dynamoMocks.update.mockResolvedValue({
      Attributes: {
        emailSuppressed: true,
        emailSuppressedReason: "admin_opt_out",
        emailNewsletterOptIn: true,
        emailPolicyUpdateOptIn: true,
      },
    });

    const result = await updateMemberEmailPreferences({
      userId: "member-1",
      newsletter: true,
      policyUpdates: true,
    });

    expect(dynamoMocks.update.mock.calls[0][0].UpdateExpression).not.toContain("REMOVE");
    expect(result.globallySuppressed).toBe(true);
    expect(result.canSelfResubscribe).toBe(false);
  });

  it("re-reads and preserves a stronger suppression won by a concurrent update", async () => {
    dynamoMocks.get
      .mockResolvedValueOnce({
        Item: { emailSuppressed: true, emailSuppressedReason: "newsletter_unsubscribe" },
      })
      .mockResolvedValueOnce({
        Item: { emailSuppressed: true, emailSuppressedReason: "bounce" },
      });
    dynamoMocks.update
      .mockRejectedValueOnce({ name: "ConditionalCheckFailedException" })
      .mockResolvedValueOnce({
        Attributes: {
          emailSuppressed: true,
          emailSuppressedReason: "bounce",
          emailNewsletterOptIn: true,
          emailPolicyUpdateOptIn: false,
        },
      });

    const result = await updateMemberEmailPreferences({
      userId: "member-1",
      newsletter: true,
      policyUpdates: false,
    });

    expect(dynamoMocks.get).toHaveBeenCalledTimes(2);
    expect(dynamoMocks.update.mock.calls[0][0]).toEqual(
      expect.objectContaining({
        ConditionExpression:
          "attribute_exists(pk) AND emailSuppressed = :suppressed AND emailSuppressedReason = :legacyReason",
      }),
    );
    expect(dynamoMocks.update.mock.calls[1][0].UpdateExpression).not.toContain("REMOVE");
    expect(result).toMatchObject({
      globallySuppressed: true,
      suppressionReason: "bounce",
      canSelfResubscribe: false,
    });
  });

  it("treats an unsubscribe for a deleted user as a stale no-op", async () => {
    dynamoMocks.update.mockRejectedValueOnce({ name: "ConditionalCheckFailedException" });

    await expect(
      unsubscribeMemberFromEmailCategory({
        userId: "deleted-member",
        category: "newsletter",
      }),
    ).resolves.toBe(false);

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ ConditionExpression: "attribute_exists(pk)" }),
    );
  });
});

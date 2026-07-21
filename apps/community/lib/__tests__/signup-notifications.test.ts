import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
}));

const backgroundJobMocks = vi.hoisted(() => ({
  enqueue: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));

vi.mock("@/lib/config", () => ({
  SITE_NAME: "PGPZ Test",
  SITE_URL: "https://portal.example.test",
  SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION: {
    label: "Successful self-verification",
    description: "Email me when a member self-verifies.",
  },
}));

vi.mock("@/lib/admin/email-transport", () => ({
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
  isValidEmail: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
}));

vi.mock("@/lib/admin/background-jobs", () => ({
  enqueueBackgroundJob: backgroundJobMocks.enqueue,
}));

import {
  buildAdminSignupNotificationEmail,
  getAdminSignupNotificationPreferences,
  getCurrentEligibleAdminSignupNotificationRecipient,
  queueAdminSignupNotification,
  updateAdminSignupNotificationPreferences,
} from "@/lib/admin/signup-notifications";

const approvalEvent = {
  type: "approval_requested" as const,
  memberUserId: "member-1",
  occurredAt: "2026-07-21T13:00:00.000Z",
};

const successfulJoinEvent = {
  type: "successful_join" as const,
  memberUserId: "member-1",
  occurredAt: "2026-07-21T14:00:00.000Z",
  method: "x_self_verification" as const,
  xHandle: "@verified",
  proofPostUrl: "https://x.com/verified/status/12345",
};

describe("admin signup notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.update.mockResolvedValue({});
    dynamoMocks.scan.mockResolvedValue({ Items: [] });
    backgroundJobMocks.enqueue.mockResolvedValue({
      job: { id: "job-1" },
      duplicate: false,
      dispatched: 1,
      failedToDispatch: 0,
    });
  });

  it("defaults missing preferences to off and reports unavailable delivery", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "admin-1",
        email: "Admin@Example.test",
        isAdmin: true,
        accountStatus: "active",
        emailSuppressed: true,
      },
    });

    await expect(getAdminSignupNotificationPreferences("admin-1")).resolves.toMatchObject({
      recipientEmail: "admin@example.test",
      delivery: {
        available: false,
        message: expect.stringContaining("suppressed"),
      },
      preferences: { approvalRequested: false, successfulJoin: false },
      options: { successfulJoin: expect.objectContaining({ label: "Successful self-verification" }) },
    });
    expect(dynamoMocks.get).toHaveBeenCalledWith(expect.objectContaining({ ConsistentRead: true }));
  });

  it("stores preferences only on the current active administrator record", async () => {
    dynamoMocks.update.mockResolvedValue({
      Attributes: {
        id: "admin-1",
        email: "admin@example.test",
        isAdmin: true,
        accountStatus: "active",
        adminSignupApprovalRequestedEmailOptIn: true,
        adminSignupSuccessfulJoinEmailOptIn: true,
      },
    });

    await expect(
      updateAdminSignupNotificationPreferences({
        adminUserId: "admin-1",
        preferences: { approvalRequested: true, successfulJoin: true },
      }),
    ).resolves.toMatchObject({
      delivery: { available: true },
      preferences: { approvalRequested: true, successfulJoin: true },
    });
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "USER#admin-1", sk: "USER#admin-1" },
        ConditionExpression: expect.stringContaining("isAdmin = :true"),
        UpdateExpression:
          "SET adminSignupApprovalRequestedEmailOptIn = :approvalRequested, adminSignupSuccessfulJoinEmailOptIn = :successfulJoin, adminSignupNotificationsUpdatedAt = :now, adminSignupNotificationsUpdatedBy = :adminUserId",
        ExpressionAttributeValues: expect.objectContaining({
          ":approvalRequested": true,
          ":successfulJoin": true,
        }),
      }),
    );
  });

  it("snapshots only opted-in, active, unsuppressed administrators into one durable job", async () => {
    dynamoMocks.scan.mockResolvedValue({
      Items: [
        {
          id: "admin-1",
          email: "Admin@Example.test",
          isAdmin: true,
          accountStatus: "active",
          adminSignupApprovalRequestedEmailOptIn: true,
        },
        {
          id: "admin-2",
          email: "suppressed@example.test",
          isAdmin: true,
          emailSuppressed: true,
          adminSignupApprovalRequestedEmailOptIn: true,
        },
        {
          id: "admin-3",
          email: "off@example.test",
          isAdmin: true,
          adminSignupApprovalRequestedEmailOptIn: false,
        },
        {
          id: "member-2",
          email: "member@example.test",
          isAdmin: false,
          adminSignupApprovalRequestedEmailOptIn: true,
        },
        {
          id: "admin-4",
          email: "deactivated@example.test",
          isAdmin: true,
          accountStatus: "deactivated",
          adminSignupApprovalRequestedEmailOptIn: true,
        },
      ],
    });
    dynamoMocks.get.mockResolvedValue({
      Item: { id: "member-1", name: "New Member", email: "new@example.test" },
    });

    await expect(queueAdminSignupNotification(approvalEvent)).resolves.toEqual({
      queued: true,
      recipientCount: 1,
      jobId: "job-1",
      duplicate: false,
      dispatched: 1,
      failedToDispatch: 0,
    });
    expect(backgroundJobMocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "admin_signup_notification",
        mode: "live",
        sourceId: "member-1",
        createdBy: null,
        idempotencyKey: expect.stringMatching(/^admin-signup:[a-f0-9]{48}$/),
        payload: {
          event: approvalEvent,
          member: {
            id: "member-1",
            email: "new@example.test",
            name: "New Member",
            firstName: null,
            lastName: null,
          },
        },
        recipients: [
          {
            recipientKey: "admin:admin-1",
            userId: "admin-1",
            email: "admin@example.test",
            metadata: { eventType: "approval_requested" },
          },
        ],
      }),
    );
  });

  it("does not stage an empty job when nobody is subscribed", async () => {
    await expect(queueAdminSignupNotification(approvalEvent)).resolves.toEqual({
      queued: false,
      recipientCount: 0,
      reason: "no_eligible_recipients",
    });
    expect(backgroundJobMocks.enqueue).not.toHaveBeenCalled();
    expect(dynamoMocks.get).not.toHaveBeenCalled();
  });

  it("strongly revalidates the administrator immediately before delivery", async () => {
    const recipient = {
      recipientKey: "admin:admin-1",
      userId: "admin-1",
      email: "admin@example.test",
    };
    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "admin-1",
        email: "admin@example.test",
        isAdmin: true,
        accountStatus: "active",
        adminSignupApprovalRequestedEmailOptIn: true,
      },
    });
    await expect(
      getCurrentEligibleAdminSignupNotificationRecipient(recipient, approvalEvent),
    ).resolves.toMatchObject({ id: "admin-1" });
    expect(dynamoMocks.get).toHaveBeenLastCalledWith(expect.objectContaining({ ConsistentRead: true }));

    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "admin-1",
        email: "changed@example.test",
        isAdmin: true,
        adminSignupApprovalRequestedEmailOptIn: true,
      },
    });
    await expect(
      getCurrentEligibleAdminSignupNotificationRecipient(recipient, approvalEvent),
    ).resolves.toBeNull();

    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "admin-1",
        email: "admin@example.test",
        isAdmin: false,
        adminSignupApprovalRequestedEmailOptIn: true,
      },
    });
    await expect(
      getCurrentEligibleAdminSignupNotificationRecipient(recipient, approvalEvent),
    ).resolves.toBeNull();
  });

  it("selects successful-join subscribers and builds X proof details", async () => {
    dynamoMocks.scan.mockResolvedValue({
      Items: [
        {
          id: "admin-1",
          email: "admin@example.test",
          isAdmin: true,
          adminSignupSuccessfulJoinEmailOptIn: true,
        },
      ],
    });
    dynamoMocks.get.mockResolvedValue({
      Item: { id: "member-1", name: "Verified Member", email: "verified@example.test" },
    });

    await expect(queueAdminSignupNotification(successfulJoinEvent)).resolves.toMatchObject({
      queued: true,
      recipientCount: 1,
    });
    const built = buildAdminSignupNotificationEmail({
      event: successfulJoinEvent,
      member: {
        id: "member-1",
        name: "Verified Member",
        email: "verified@example.test",
        firstName: null,
        lastName: null,
      },
    });
    expect(built.subject).toBe("[PGPZ Test] New member self-verified: Verified Member");
    expect(built.text).toContain("https://x.com/verified/status/12345");
    expect(built.html).toContain("View X proof post");
  });
});

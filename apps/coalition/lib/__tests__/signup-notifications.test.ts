import { beforeEach, describe, expect, it, vi } from "vitest";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
}));

const backgroundJobMocks = vi.hoisted(() => ({ enqueue: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "TestTable",
}));
vi.mock("@/lib/config", () => ({
  SITE_NAME: "PGPZ Coalition",
  SITE_URL: "https://coalition.example.test",
  SIGNUP_NOTIFICATION_SUCCESSFUL_JOIN_OPTION: null,
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

const unsupportedJoinEvent = {
  type: "successful_join" as const,
  memberUserId: "member-1",
  occurredAt: "2026-07-21T14:00:00.000Z",
  method: "x_self_verification" as const,
};

describe("Coalition admin signup notifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dynamoMocks.scan.mockResolvedValue({ Items: [] });
    backgroundJobMocks.enqueue.mockResolvedValue({
      job: { id: "job-1" },
      duplicate: false,
      dispatched: 1,
      failedToDispatch: 0,
    });
  });

  it("offers approval-request notifications but not successful-join notifications", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "admin-1",
        email: "admin@example.test",
        isAdmin: true,
        accountStatus: "active",
      },
    });

    await expect(getAdminSignupNotificationPreferences("admin-1")).resolves.toMatchObject({
      recipientEmail: "admin@example.test",
      delivery: { available: true },
      preferences: { approvalRequested: false, successfulJoin: false },
      options: { approvalRequested: expect.any(Object), successfulJoin: null },
    });
  });

  it("rejects an attempt to enable the unavailable successful-join option", async () => {
    await expect(
      updateAdminSignupNotificationPreferences({
        adminUserId: "admin-1",
        preferences: { approvalRequested: true, successfulJoin: true },
      }),
    ).rejects.toMatchObject({
      status: 400,
      message: "Successful-join notifications are not available for this site.",
    });
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("stores approval preferences while forcing the unavailable option off", async () => {
    dynamoMocks.update.mockResolvedValue({
      Attributes: {
        id: "admin-1",
        email: "admin@example.test",
        isAdmin: true,
        accountStatus: "active",
        adminSignupApprovalRequestedEmailOptIn: true,
        adminSignupSuccessfulJoinEmailOptIn: false,
      },
    });

    await expect(
      updateAdminSignupNotificationPreferences({
        adminUserId: "admin-1",
        preferences: { approvalRequested: true, successfulJoin: false },
      }),
    ).resolves.toMatchObject({
      preferences: { approvalRequested: true, successfulJoin: false },
    });
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({
          ":approvalRequested": true,
          ":successfulJoin": false,
        }),
      }),
    );
  });

  it("queues an approval request for only opted-in active administrators", async () => {
    dynamoMocks.scan.mockResolvedValue({
      Items: [
        {
          id: "admin-1",
          email: "Admin@Example.test",
          isAdmin: true,
          adminSignupApprovalRequestedEmailOptIn: true,
        },
        {
          id: "admin-2",
          email: "off@example.test",
          isAdmin: true,
          adminSignupApprovalRequestedEmailOptIn: false,
        },
      ],
    });
    dynamoMocks.get.mockResolvedValue({
      Item: { id: "member-1", name: "Applicant", email: "applicant@example.test" },
    });

    await expect(queueAdminSignupNotification(approvalEvent)).resolves.toMatchObject({
      queued: true,
      recipientCount: 1,
      jobId: "job-1",
    });
    expect(backgroundJobMocks.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "admin_signup_notification",
        sourceId: "member-1",
        recipients: [
          expect.objectContaining({
            recipientKey: "admin:admin-1",
            userId: "admin-1",
            email: "admin@example.test",
          }),
        ],
      }),
    );

    const built = buildAdminSignupNotificationEmail({
      event: approvalEvent,
      member: {
        id: "member-1",
        name: "Applicant",
        email: "applicant@example.test",
        firstName: null,
        lastName: null,
      },
    });
    expect(built.subject).toBe("[PGPZ Coalition] Approval requested: Applicant");
    expect(built.text).toContain("waiting for an administrator's review");
  });

  it("does not queue unsupported successful-join notifications", async () => {
    await expect(queueAdminSignupNotification(unsupportedJoinEvent)).resolves.toEqual({
      queued: false,
      recipientCount: 0,
      reason: "no_eligible_recipients",
    });
    expect(dynamoMocks.scan).not.toHaveBeenCalled();
    expect(backgroundJobMocks.enqueue).not.toHaveBeenCalled();
  });

  it("strongly revalidates approval recipients immediately before delivery", async () => {
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
        adminSignupApprovalRequestedEmailOptIn: true,
      },
    });
    await expect(
      getCurrentEligibleAdminSignupNotificationRecipient(recipient, approvalEvent),
    ).resolves.toMatchObject({ id: "admin-1" });
    expect(dynamoMocks.get).toHaveBeenCalledWith(expect.objectContaining({ ConsistentRead: true }));

    dynamoMocks.get.mockResolvedValueOnce({
      Item: {
        id: "admin-1",
        email: "admin@example.test",
        isAdmin: true,
        emailSuppressed: true,
        adminSignupApprovalRequestedEmailOptIn: true,
      },
    });
    await expect(
      getCurrentEligibleAdminSignupNotificationRecipient(recipient, approvalEvent),
    ).resolves.toBeNull();
  });
});

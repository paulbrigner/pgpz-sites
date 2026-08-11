import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildAdminSignupNotificationEmail,
  configureSignupNotificationRuntime,
  getAdminSignupNotificationPreferences,
  queueAdminSignupNotification,
} from "./runtime";

const documentClient = {
  get: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
};
const enqueueBackgroundJob = vi.fn();

describe("signup-notification runtime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    configureSignupNotificationRuntime({
      documentClient,
      tableName: "SignupNotificationTest",
      successfulJoinOption: {
        label: "Successful joins",
        description: "Email me when a member joins.",
      },
      siteName: "PGPZ Test",
      siteUrl: "https://portal.example.test",
      normalizeEmail: (value) =>
        typeof value === "string" ? value.trim().toLowerCase() : "",
      isValidEmail: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
      getUserDisplayName: (user) => user?.name || null,
      escapeHtml: (value) => value,
      renderBrandedEmailShell: ({ title, bodyHtml }) => `${title}:${bodyHtml}`,
      renderEmailButton: ({ href, label }) => `[${label}](${href})`,
      renderEmailParagraph: (content) => content,
      renderSystemEmailFooter: (reason) => reason,
      enqueueBackgroundJob,
    });
    documentClient.scan.mockResolvedValue({ Items: [] });
    enqueueBackgroundJob.mockResolvedValue({
      job: { id: "job-1" },
      duplicate: false,
      dispatched: 1,
      failedToDispatch: 0,
    });
  });

  it("reads only the configured app table and defaults preferences off", async () => {
    documentClient.get.mockResolvedValue({
      Item: {
        id: "admin-1",
        email: "Admin@Example.test",
        isAdmin: true,
        accountStatus: "active",
      },
    });

    await expect(getAdminSignupNotificationPreferences("admin-1")).resolves.toMatchObject({
      recipientEmail: "admin@example.test",
      preferences: { approvalRequested: false, successfulJoin: false },
      delivery: { available: true },
    });
    expect(documentClient.get).toHaveBeenCalledWith(
      expect.objectContaining({ TableName: "SignupNotificationTest" }),
    );
  });

  it("queues one durable job for eligible administrators", async () => {
    documentClient.scan.mockResolvedValue({
      Items: [
        {
          id: "admin-1",
          email: "admin@example.test",
          isAdmin: true,
          accountStatus: "active",
          adminSignupApprovalRequestedEmailOptIn: true,
        },
      ],
    });
    documentClient.get.mockResolvedValue({
      Item: { id: "member-1", name: "New Member", email: "new@example.test" },
    });

    await expect(
      queueAdminSignupNotification({
        type: "approval_requested",
        memberUserId: "member-1",
        occurredAt: "2026-08-10T12:00:00.000Z",
      }),
    ).resolves.toMatchObject({ queued: true, recipientCount: 1, jobId: "job-1" });
    expect(enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "admin_signup_notification",
        recipients: [expect.objectContaining({ userId: "admin-1" })],
      }),
    );
  });

  it("renders site-specific identity through injected branding", () => {
    const email = buildAdminSignupNotificationEmail({
      event: {
        type: "successful_join",
        memberUserId: "member-1",
        occurredAt: "2026-08-10T12:00:00.000Z",
        method: "admin_invitation",
      },
      member: {
        id: "member-1",
        name: "New Member",
        email: "new@example.test",
        firstName: null,
        lastName: null,
      },
    });

    expect(email.subject).toBe("[PGPZ Test] New member joined: New Member");
    expect(email.text).toContain("https://portal.example.test/admin");
  });

  it("renders provider-neutral self-verification details for ZcashMe", () => {
    const email = buildAdminSignupNotificationEmail({
      event: {
        type: "successful_join",
        memberUserId: "member-1",
        occurredAt: "2026-08-10T12:00:00.000Z",
        method: "self_verification",
        provider: "zcashme",
        proofUrl: "https://zcash.me/member",
      },
      member: {
        id: "member-1",
        name: "New Member",
        email: "new@example.test",
        firstName: null,
        lastName: null,
      },
    });

    expect(email.html).toContain("through ZcashMe self-verification");
    expect(email.html).toContain("[View ZcashMe proof](https://zcash.me/member)");
    expect(email.text).toContain("ZcashMe proof: https://zcash.me/member");
  });

  it("preserves legacy X self-verification event rendering", () => {
    const email = buildAdminSignupNotificationEmail({
      event: {
        type: "successful_join",
        memberUserId: "member-1",
        occurredAt: "2026-08-10T12:00:00.000Z",
        method: "x_self_verification",
        xHandle: "@member",
        proofPostUrl: "https://x.com/member/status/1",
      },
      member: {
        id: "member-1",
        name: "New Member",
        email: "new@example.test",
        firstName: null,
        lastName: null,
      },
    });

    expect(email.text).toContain("X account: @member");
    expect(email.text).toContain("X proof: https://x.com/member/status/1");
  });
});

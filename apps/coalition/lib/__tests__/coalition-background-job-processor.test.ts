import { beforeEach, describe, expect, it, vi } from "vitest";

const mailMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

const jobMocks = vi.hoisted(() => ({
  assertSmoke: vi.fn(),
  complete: vi.fn(),
  eligibleRecipient: vi.fn(),
  listJobs: vi.fn(),
  listTasks: vi.fn(),
  deliveryStarted: vi.fn(),
  projectionCompleted: vi.fn(),
  releaseForRetry: vi.fn(),
}));

const invitationMocks = vi.hoisted(() => ({
  claim: vi.fn(),
  createLink: vi.fn(),
  markSent: vi.fn(),
  release: vi.fn(),
}));

const emailLogMocks = vi.hoisted(() => ({ record: vi.fn() }));
const transportMocks = vi.hoisted(() => ({ buildConfig: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mailMocks.createTransport },
}));
vi.mock("@/lib/admin/background-jobs", () => ({
  assertSmokeRecipient: jobMocks.assertSmoke,
  completeBackgroundJobTask: jobMocks.complete,
  getCurrentEligibleRecipient: jobMocks.eligibleRecipient,
  listBackgroundJobs: jobMocks.listJobs,
  listBackgroundJobTasks: jobMocks.listTasks,
  markBackgroundJobDeliveryStarted: jobMocks.deliveryStarted,
  markBackgroundJobTaskProjectionCompleted: jobMocks.projectionCompleted,
  releaseBackgroundJobTaskForRetry: jobMocks.releaseForRetry,
}));
vi.mock("@/lib/admin/email-transport", () => ({
  buildEmailServerConfig: transportMocks.buildConfig,
}));
vi.mock("@/lib/admin/email-log", () => ({
  recordEmailEvent: emailLogMocks.record,
}));
vi.mock("@/lib/admin/invitations", () => ({
  claimInvitationEmailDelivery: invitationMocks.claim,
  createInvitationActivationLink: invitationMocks.createLink,
  markInvitationEmailSent: invitationMocks.markSent,
  releaseInvitationEmailDelivery: invitationMocks.release,
}));
vi.mock("@/lib/config", () => ({ EMAIL_FROM: "no-reply@example.test" }));
vi.mock("@/lib/community-sync", () => ({
  syncCoalitionMemberToCommunityById: vi.fn(),
}));
vi.mock("@/lib/system-email", () => ({
  buildInvitationEmail: () => ({
    subject: "Coalition invitation",
    text: "Text",
    html: "<p>HTML</p>",
  }),
}));

import {
  processCoalitionBackgroundJobTask,
  reconcileCoalitionBackgroundJobProjections,
} from "@/lib/admin/coalition-background-job-processor";

const recipient = {
  recipientKey: "user-1",
  userId: "user-1",
  email: "invitee@example.test",
  name: "Invited Member",
};

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    kind: "bulk_invitation",
    mode: "live",
    status: "running",
    sourceId: null,
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    createdBy: "admin-1",
    payload: {
      template: { subject: "Coalition invitation", body: "Join us" },
      adminUserId: "admin-1",
    },
    idempotencyKey: "key-1",
    recipientCount: 1,
    pendingCount: 0,
    queuedCount: 0,
    processingCount: 1,
    sentCount: 0,
    validatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    deliveryUnknownCount: 0,
    canceledCount: 0,
    expires: 2_000_000_000,
    ...overrides,
  };
}

const task = {
  jobId: "job-1",
  taskId: "task-1",
  kind: "bulk_invitation",
  mode: "live",
  status: "processing",
  recipient,
  attemptCount: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  leaseToken: "lease-1",
  leaseExpiresAt: "2026-07-19T00:02:00.000Z",
  deliveryStartedAt: null,
  providerMessageId: null,
  result: null,
  lastError: null,
  projectionCompletedAt: null,
  expires: 2_000_000_000,
};

describe("Coalition invitation background-job delivery boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mailMocks.createTransport.mockReturnValue({ sendMail: mailMocks.sendMail });
    mailMocks.sendMail.mockResolvedValue({ messageId: "ses-message-1" });
    jobMocks.eligibleRecipient.mockResolvedValue(recipient);
    jobMocks.complete.mockResolvedValue(undefined);
    jobMocks.deliveryStarted.mockResolvedValue(undefined);
    jobMocks.projectionCompleted.mockResolvedValue(undefined);
    jobMocks.releaseForRetry.mockResolvedValue(undefined);
    jobMocks.listJobs.mockResolvedValue([]);
    jobMocks.listTasks.mockResolvedValue([]);
    invitationMocks.claim.mockResolvedValue(true);
    invitationMocks.createLink.mockResolvedValue({
      activationUrl: "https://coalition.example.test/api/invitations/activate?token=test",
    });
    invitationMocks.markSent.mockResolvedValue(undefined);
    invitationMocks.release.mockResolvedValue(undefined);
    emailLogMocks.record.mockResolvedValue(undefined);
    transportMocks.buildConfig.mockReturnValue({ transport: "test" });
  });

  it("validates without SES, invitation lifecycle, or email-log mutation", async () => {
    await expect(
      processCoalitionBackgroundJobTask({
        job: job({ mode: "validate_only" }) as never,
        task: { ...task, mode: "validate_only" } as never,
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({ outcome: "validated", retry: false });

    expect(jobMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "validated", providerMessageId: undefined }),
    );
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(jobMocks.deliveryStarted).not.toHaveBeenCalled();
    expect(invitationMocks.claim).not.toHaveBeenCalled();
    expect(invitationMocks.createLink).not.toHaveBeenCalled();
    expect(invitationMocks.markSent).not.toHaveBeenCalled();
    expect(invitationMocks.release).not.toHaveBeenCalled();
    expect(emailLogMocks.record).not.toHaveBeenCalled();
  });

  it("persists the accepted provider receipt before member and log projections", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    invitationMocks.markSent.mockRejectedValueOnce(new Error("member projection failed"));
    emailLogMocks.record.mockRejectedValueOnce(new Error("log projection failed"));

    try {
      await expect(
        processCoalitionBackgroundJobTask({
          job: job() as never,
          task: task as never,
          leaseToken: "lease-1",
        }),
      ).resolves.toEqual({ outcome: "sent", retry: false });

      expect(jobMocks.complete).toHaveBeenCalledOnce();
      expect(jobMocks.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "sent",
          providerMessageId: "ses-message-1",
          result: expect.objectContaining({
            subject: "Coalition invitation",
            providerAcceptedAt: expect.any(String),
          }),
        }),
      );
      const receiptPersistedAt = jobMocks.complete.mock.invocationCallOrder[0];
      expect(mailMocks.sendMail.mock.invocationCallOrder[0]).toBeLessThan(receiptPersistedAt);
      expect(receiptPersistedAt).toBeLessThan(
        invitationMocks.markSent.mock.invocationCallOrder[0],
      );
      expect(receiptPersistedAt).toBeLessThan(
        emailLogMocks.record.mock.invocationCallOrder[0],
      );
      const providerAcceptedAt =
        jobMocks.complete.mock.calls[0][0].result.providerAcceptedAt;
      expect(invitationMocks.markSent).toHaveBeenCalledWith(
        expect.objectContaining({ sentAt: providerAcceptedAt }),
      );
      expect(jobMocks.releaseForRetry).not.toHaveBeenCalled();
      expect(jobMocks.complete).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivery_unknown" }),
      );
      expect(jobMocks.projectionCompleted).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("reconciles a sent invitation using the provider acceptance timestamp", async () => {
    const providerAcceptedAt = "2026-07-28T02:58:03.976Z";
    jobMocks.listJobs.mockResolvedValue([
      job({ status: "completed" }),
    ]);
    jobMocks.listTasks.mockResolvedValue([
      {
        ...task,
        status: "sent",
        providerMessageId: "ses-message-1",
        result: {
          subject: "Coalition invitation",
          providerAcceptedAt,
        },
        projectionCompletedAt: null,
      },
    ]);

    await expect(
      reconcileCoalitionBackgroundJobProjections(),
    ).resolves.toEqual({
      inspectedInvitationJobs: 1,
      repairedInvitationTasks: 1,
      failedInvitationRepairs: 0,
    });
    expect(invitationMocks.markSent).toHaveBeenCalledWith({
      userId: "user-1",
      adminUserId: "admin-1",
      deliveryJobId: "job-1",
      sentAt: providerAcceptedAt,
    });
    expect(emailLogMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({ occurredAt: providerAcceptedAt }),
    );
    expect(jobMocks.projectionCompleted).toHaveBeenCalledWith(
      "job-1",
      "task-1",
    );
  });
});

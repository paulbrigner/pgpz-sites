import { beforeEach, describe, expect, it, vi } from "vitest";

const mailMocks = vi.hoisted(() => ({
  createTransport: vi.fn(),
  sendMail: vi.fn(),
}));

const backgroundJobMocks = vi.hoisted(() => ({
  assertSmokeRecipient: vi.fn(),
  complete: vi.fn(),
  eligibleRecipient: vi.fn(),
  listJobs: vi.fn(),
  listTasks: vi.fn(),
  deliveryStarted: vi.fn(),
  projectionCompleted: vi.fn(),
  releaseForRetry: vi.fn(),
}));

const trackingMocks = vi.hoisted(() => ({
  bind: vi.fn(),
  create: vi.fn(),
  markSent: vi.fn(),
}));

const emailLogMocks = vi.hoisted(() => ({
  record: vi.fn(),
  updatePolicyProgress: vi.fn(),
}));

const newsletterMocks = vi.hoisted(() => ({
  claimDelivery: vi.fn(),
  markSent: vi.fn(),
  updateProgress: vi.fn(),
}));

const signupNotificationMocks = vi.hoisted(() => ({
  buildEmail: vi.fn(),
  eligibleRecipient: vi.fn(),
}));

const transportMocks = vi.hoisted(() => ({
  buildConfig: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("nodemailer", () => ({
  default: { createTransport: mailMocks.createTransport },
}));
vi.mock("@/lib/admin/background-jobs", () => ({
  assertSmokeRecipient: backgroundJobMocks.assertSmokeRecipient,
  completeBackgroundJobTask: backgroundJobMocks.complete,
  getCurrentEligibleRecipient: backgroundJobMocks.eligibleRecipient,
  listBackgroundJobs: backgroundJobMocks.listJobs,
  listBackgroundJobTasks: backgroundJobMocks.listTasks,
  markBackgroundJobDeliveryStarted: backgroundJobMocks.deliveryStarted,
  markBackgroundJobTaskProjectionCompleted: backgroundJobMocks.projectionCompleted,
  releaseBackgroundJobTaskForRetry: backgroundJobMocks.releaseForRetry,
}));
vi.mock("@/lib/admin/email-transport", () => ({
  buildEmailServerConfig: transportMocks.buildConfig,
}));
vi.mock("@/lib/admin/email-tracking", () => ({
  bindNewsletterTrackingDestinations: trackingMocks.bind,
  createNewsletterTrackingRecord: trackingMocks.create,
  markNewsletterTrackingSent: trackingMocks.markSent,
}));
vi.mock("@/lib/admin/email-log", () => ({
  recordEmailEvent: emailLogMocks.record,
  updatePolicyUpdateSendRunProgress: emailLogMocks.updatePolicyProgress,
}));
vi.mock("@/lib/admin/newsletters", () => ({
  claimNewsletterBackgroundDelivery: newsletterMocks.claimDelivery,
  markNewsletterSent: newsletterMocks.markSent,
  updateNewsletterSendRunProgress: newsletterMocks.updateProgress,
}));
vi.mock("@/lib/admin/signup-notifications", () => ({
  buildAdminSignupNotificationEmail: signupNotificationMocks.buildEmail,
  getCurrentEligibleAdminSignupNotificationRecipient:
    signupNotificationMocks.eligibleRecipient,
}));
vi.mock("@/lib/config", () => ({
  EMAIL_FROM: "no-reply@example.test",
  SITE_URL: "https://example.test",
}));
vi.mock("@/lib/email-link-security", () => ({
  listUnsubscribeHeaders: () => ({}),
}));
vi.mock("@/lib/newsletter-email", () => ({
  buildNewsletterEmail: () => ({
    subject: "Durable newsletter",
    text: "Text",
    html: "<p>HTML</p>",
    unsubscribeUrl: "https://example.test/unsubscribe",
    trackedDestinations: [],
  }),
}));
vi.mock("@/lib/policy-update-email", () => ({
  buildPolicyUpdateEmail: () => ({
    subject: "Policy update",
    text: "Text",
    html: "<p>HTML</p>",
    unsubscribeUrl: "https://example.test/unsubscribe",
    trackedDestinations: [],
    portalUrl: "https://example.test/updates/example",
  }),
}));

import { processEmailBackgroundJobTask } from "@/lib/admin/email-background-job-processor";

const recipient = {
  recipientKey: "user-1",
  userId: "user-1",
  email: "member@example.test",
  name: "Example Member",
};

function job(overrides: Record<string, unknown> = {}) {
  return {
    id: "job-1",
    kind: "newsletter",
    mode: "live",
    status: "running",
    sourceId: "newsletter-1",
    createdAt: "2026-07-19T00:00:00.000Z",
    updatedAt: "2026-07-19T00:00:00.000Z",
    createdBy: "admin-1",
    payload: {
      newsletterId: "newsletter-1",
      newsletter: {
        subject: "Durable newsletter",
        preheader: "Preheader",
        previewText: "Preview",
        body: "Body",
      },
      audienceMode: "all_active_members",
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
  kind: "newsletter",
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

const signupPayload = {
  event: {
    type: "approval_requested" as const,
    memberUserId: "member-1",
    occurredAt: "2026-07-19T00:00:00.000Z",
  },
  member: {
    id: "member-1",
    email: "new-member@example.test",
    name: "New Member",
    firstName: "New",
    lastName: "Member",
  },
};

const signupRecipient = {
  recipientKey: "admin-1",
  userId: "admin-1",
  email: "admin@example.test",
  name: "Example Admin",
};

function signupJob(overrides: Record<string, unknown> = {}) {
  return job({
    kind: "admin_signup_notification",
    sourceId: "member-1:approval_requested",
    payload: signupPayload,
    ...overrides,
  });
}

const signupTask = {
  ...task,
  kind: "admin_signup_notification",
  recipient: signupRecipient,
};

describe("email background-job delivery boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mailMocks.createTransport.mockReturnValue({ sendMail: mailMocks.sendMail });
    mailMocks.sendMail.mockResolvedValue({ messageId: "ses-message-1" });
    backgroundJobMocks.eligibleRecipient.mockResolvedValue(recipient);
    backgroundJobMocks.listJobs.mockResolvedValue([]);
    backgroundJobMocks.listTasks.mockResolvedValue([]);
    backgroundJobMocks.deliveryStarted.mockResolvedValue(undefined);
    backgroundJobMocks.projectionCompleted.mockResolvedValue(undefined);
    backgroundJobMocks.releaseForRetry.mockResolvedValue(undefined);
    trackingMocks.create.mockResolvedValue({ trackingId: "tracking-1" });
    trackingMocks.bind.mockResolvedValue(undefined);
    trackingMocks.markSent.mockResolvedValue(undefined);
    emailLogMocks.record.mockResolvedValue(undefined);
    emailLogMocks.updatePolicyProgress.mockResolvedValue(undefined);
    newsletterMocks.claimDelivery.mockResolvedValue(true);
    newsletterMocks.markSent.mockResolvedValue(true);
    newsletterMocks.updateProgress.mockResolvedValue(undefined);
    signupNotificationMocks.buildEmail.mockReturnValue({
      subject: "New member is waiting for approval",
      text: "A new member is waiting for approval.",
      html: "<p>A new member is waiting for approval.</p>",
    });
    signupNotificationMocks.eligibleRecipient.mockResolvedValue({
      id: "admin-1",
      email: "admin@example.test",
      isAdmin: true,
    });
    transportMocks.buildConfig.mockReturnValue({ transport: "test" });
  });

  it("validates without SES, tracking, email-log, or newsletter-source mutation", async () => {
    const validateJob = job({ mode: "validate_only" });
    backgroundJobMocks.complete.mockResolvedValue(
      job({ mode: "validate_only", status: "completed", processingCount: 0, validatedCount: 1 }),
    );

    await expect(
      processEmailBackgroundJobTask({
        job: validateJob as never,
        task: { ...task, mode: "validate_only" } as never,
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({ outcome: "validated", retry: false });

    expect(backgroundJobMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({ status: "validated", providerMessageId: undefined }),
    );
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(backgroundJobMocks.deliveryStarted).not.toHaveBeenCalled();
    expect(trackingMocks.create).not.toHaveBeenCalled();
    expect(trackingMocks.bind).not.toHaveBeenCalled();
    expect(trackingMocks.markSent).not.toHaveBeenCalled();
    expect(emailLogMocks.record).not.toHaveBeenCalled();
    expect(newsletterMocks.claimDelivery).not.toHaveBeenCalled();
    expect(newsletterMocks.markSent).not.toHaveBeenCalled();
  });

  it("persists the provider receipt before fallible source, tracking, and log projections", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const liveJob = job();
    backgroundJobMocks.complete.mockResolvedValue(
      job({ status: "completed", processingCount: 0, sentCount: 1 }),
    );
    newsletterMocks.markSent.mockRejectedValueOnce(new Error("source projection failed"));
    trackingMocks.markSent.mockRejectedValueOnce(new Error("tracking projection failed"));
    emailLogMocks.record.mockRejectedValueOnce(new Error("log projection failed"));

    try {
      await expect(
        processEmailBackgroundJobTask({
          job: liveJob as never,
          task: task as never,
          leaseToken: "lease-1",
        }),
      ).resolves.toEqual({ outcome: "sent", retry: false });

      expect(backgroundJobMocks.complete).toHaveBeenCalledOnce();
      expect(backgroundJobMocks.complete).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "sent",
          providerMessageId: "ses-message-1",
          result: expect.objectContaining({
            trackingId: "tracking-1",
            providerAcceptedAt: expect.any(String),
          }),
        }),
      );
      const receiptPersistedAt = backgroundJobMocks.complete.mock.invocationCallOrder[0];
      expect(mailMocks.sendMail.mock.invocationCallOrder[0]).toBeLessThan(receiptPersistedAt);
      expect(receiptPersistedAt).toBeLessThan(
        newsletterMocks.markSent.mock.invocationCallOrder[0],
      );
      expect(receiptPersistedAt).toBeLessThan(
        trackingMocks.markSent.mock.invocationCallOrder[0],
      );
      expect(receiptPersistedAt).toBeLessThan(
        emailLogMocks.record.mock.invocationCallOrder[0],
      );
      expect(backgroundJobMocks.releaseForRetry).not.toHaveBeenCalled();
      expect(backgroundJobMocks.complete).not.toHaveBeenCalledWith(
        expect.objectContaining({ status: "delivery_unknown" }),
      );
      expect(backgroundJobMocks.projectionCompleted).not.toHaveBeenCalled();
    } finally {
      consoleError.mockRestore();
    }
  });

  it("revalidates and sends an eligible admin signup notification", async () => {
    const liveJob = signupJob();
    backgroundJobMocks.complete.mockResolvedValue(
      signupJob({ status: "completed", processingCount: 0, sentCount: 1 }),
    );

    await expect(
      processEmailBackgroundJobTask({
        job: liveJob as never,
        task: signupTask as never,
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({ outcome: "sent", retry: false });

    expect(signupNotificationMocks.eligibleRecipient).toHaveBeenCalledWith(
      signupRecipient,
      signupPayload.event,
    );
    expect(signupNotificationMocks.buildEmail).toHaveBeenCalledWith(signupPayload);
    expect(backgroundJobMocks.deliveryStarted).toHaveBeenCalledWith(
      "job-1",
      "task-1",
      "lease-1",
    );
    expect(mailMocks.sendMail).toHaveBeenCalledWith({
      to: "admin@example.test",
      from: "no-reply@example.test",
      subject: "New member is waiting for approval",
      text: "A new member is waiting for approval.",
      html: "<p>A new member is waiting for approval.</p>",
    });
    expect(backgroundJobMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "sent",
        providerMessageId: "ses-message-1",
        result: expect.objectContaining({
          subject: "New member is waiting for approval",
          providerAcceptedAt: expect.any(String),
        }),
      }),
    );
    expect(emailLogMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "background:job-1:task-1:sent",
        userId: null,
        email: "admin@example.test",
        type: "admin_signup_approval_requested",
        status: "sent",
        providerMessageId: "ses-message-1",
        metadata: expect.objectContaining({
          adminUserId: "admin-1",
          memberUserId: "member-1",
          backgroundJobId: "job-1",
        }),
      }),
    );
    expect(backgroundJobMocks.projectionCompleted).toHaveBeenCalledWith(
      "job-1",
      "task-1",
    );
    expect(trackingMocks.create).not.toHaveBeenCalled();
    expect(newsletterMocks.claimDelivery).not.toHaveBeenCalled();
  });

  it("skips an admin signup notification when the recipient is no longer eligible", async () => {
    signupNotificationMocks.eligibleRecipient.mockResolvedValueOnce(null);
    backgroundJobMocks.complete.mockResolvedValue(
      signupJob({ status: "completed", processingCount: 0, skippedCount: 1 }),
    );

    await expect(
      processEmailBackgroundJobTask({
        job: signupJob() as never,
        task: signupTask as never,
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({ outcome: "skipped", retry: false });

    expect(backgroundJobMocks.complete).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "skipped",
        result: { reason: "admin_notification_recipient_ineligible" },
      }),
    );
    expect(signupNotificationMocks.buildEmail).not.toHaveBeenCalled();
    expect(backgroundJobMocks.deliveryStarted).not.toHaveBeenCalled();
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(emailLogMocks.record).not.toHaveBeenCalled();
  });

  it("releases an admin signup notification for retry when it fails before delivery starts", async () => {
    const error = new Error("email rendering failed");
    signupNotificationMocks.buildEmail.mockImplementationOnce(() => {
      throw error;
    });

    await expect(
      processEmailBackgroundJobTask({
        job: signupJob() as never,
        task: signupTask as never,
        leaseToken: "lease-1",
      }),
    ).resolves.toEqual({ outcome: "retry_scheduled", retry: true });

    expect(backgroundJobMocks.deliveryStarted).not.toHaveBeenCalled();
    expect(mailMocks.createTransport).not.toHaveBeenCalled();
    expect(mailMocks.sendMail).not.toHaveBeenCalled();
    expect(backgroundJobMocks.complete).not.toHaveBeenCalled();
    expect(backgroundJobMocks.releaseForRetry).toHaveBeenCalledWith({
      jobId: "job-1",
      taskId: "task-1",
      leaseToken: "lease-1",
      error,
    });
    expect(emailLogMocks.record).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: null,
        email: "admin@example.test",
        type: "admin_signup_approval_requested",
        status: "failed",
        error: "email rendering failed",
        metadata: expect.objectContaining({ attempt: 1 }),
      }),
    );
  });
});

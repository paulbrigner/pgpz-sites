import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  backgroundJobIdForIdempotencyKey: vi.fn(),
  bindNewsletterTrackingDestinations: vi.fn(),
  buildPolicyUpdateEmail: vi.fn(),
  createNewsletterTrackingRecord: vi.fn(),
  createTransport: vi.fn(),
  enqueueBackgroundJob: vi.fn(),
  findUserProfileByEmail: vi.fn(),
  getDistributablePolicyUpdate: vi.fn(),
  getUploadedPolicyUpdateRecord: vi.fn(),
  getUserProfileDisplayName: vi.fn(),
  listPolicyUpdateRecipients: vi.fn(),
  markNewsletterTrackingSent: vi.fn(),
  materializePolicyUpdateEmailAssets: vi.fn(),
  recordEmailEvent: vi.fn(),
  recordPolicyUpdateSendRun: vi.fn(),
  requireAdminSession: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("nodemailer", () => ({
  default: { createTransport: mocks.createTransport },
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdminSession: mocks.requireAdminSession,
}));

vi.mock("@/lib/admin/background-jobs", () => ({
  backgroundJobIdForIdempotencyKey: mocks.backgroundJobIdForIdempotencyKey,
  enqueueBackgroundJob: mocks.enqueueBackgroundJob,
}));

vi.mock("@/lib/admin/email-transport", () => ({
  buildEmailServerConfig: () => ({ host: "smtp.example.test" }),
  isValidEmail: (value: string) => value.includes("@"),
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));

vi.mock("@/lib/admin/email-log", () => ({
  listPolicyUpdateSendHistory: vi.fn(),
  recordEmailEvent: mocks.recordEmailEvent,
  recordPolicyUpdateSendRun: mocks.recordPolicyUpdateSendRun,
  summarizePolicyUpdateEmailStats: vi.fn(),
}));

vi.mock("@/lib/admin/email-tracking", () => ({
  bindNewsletterTrackingDestinations: mocks.bindNewsletterTrackingDestinations,
  createNewsletterTrackingRecord: mocks.createNewsletterTrackingRecord,
  markNewsletterTrackingSent: mocks.markNewsletterTrackingSent,
}));

vi.mock("@/lib/admin/roster", () => ({
  listPolicyUpdateRecipients: mocks.listPolicyUpdateRecipients,
}));

vi.mock("@/lib/admin/user-profile", () => ({
  findUserProfileByEmail: mocks.findUserProfileByEmail,
  getUserProfileDisplayName: mocks.getUserProfileDisplayName,
}));

vi.mock("@/lib/config", () => ({
  EMAIL_FROM: "admin@example.test",
  SITE_URL: "https://example.test",
}));

vi.mock("@/lib/email-link-security", () => ({
  listUnsubscribeHeaders: vi.fn(() => undefined),
}));

vi.mock("@/lib/admin/policy-update-email-assets", () => ({
  materializePolicyUpdateEmailAssets: mocks.materializePolicyUpdateEmailAssets,
}));

vi.mock("@/lib/admin/policy-update-uploads", () => ({
  createPolicyUpdateUploadSlug: vi.fn(),
  deleteDraftUploadedPolicyUpdateRecord: vi.fn(),
  formatPolicyUpdateDisplayDate: vi.fn(),
  getDistributablePolicyUpdate: mocks.getDistributablePolicyUpdate,
  getDistributablePolicyUpdateSummaries: vi.fn(),
  getPolicyUpdateUploadBucket: vi.fn(),
  getUploadedPolicyUpdateRecord: mocks.getUploadedPolicyUpdateRecord,
  normalizePolicyUpdateCategory: vi.fn(),
  policyUpdateToSummary: vi.fn(),
  policyUpdateUploadObjectKey: vi.fn(),
  publishUploadedPolicyUpdate: vi.fn(),
  saveGeneratedPolicyUpdateContent: vi.fn(),
  savePolicyUpdateGenerationFailure: vi.fn(),
  saveUploadedPolicyUpdate: vi.fn(),
  unpublishUploadedPolicyUpdate: vi.fn(),
  uploadedPolicyUpdateToPolicyUpdate: vi.fn(),
}));

vi.mock("@/lib/admin/policy-update-generation", () => ({
  generatePolicyUpdatePageContent: vi.fn(),
}));

vi.mock("@/lib/policy-update-email", () => ({
  buildPolicyUpdateEmail: mocks.buildPolicyUpdateEmail,
}));

vi.mock("@/lib/policy-update-markdown", () => ({
  buildPolicyUpdateForumMarkdown: vi.fn(),
  policyUpdateMarkdownFileName: vi.fn(),
}));

vi.mock("@/lib/s3", () => ({
  s3Client: { send: vi.fn() },
}));

const update = {
  slug: "policy-update-1",
  category: "weekly",
  categoryLabel: "Weekly Policy Memo",
  title: "Policy Update",
  shortTitle: "Policy Update",
  publishedAt: "2026-07-19",
  displayDate: "July 19, 2026",
  summary: "A policy update.",
  emailSubject: "Policy Update",
  emailPreheader: "A policy update.",
  coverImage: "/cover.png",
  pdfHref: "/update.pdf",
  portalPath: "/updates/policy-update-1",
  keyTakeaways: [],
  actionItems: [],
  sections: [],
};

const recipient = {
  id: "user-1",
  email: "paul@example.test",
  name: "Paul Brigner",
  firstName: "Paul",
  lastName: "Brigner",
};

async function postPolicyUpdate(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://example.test/api/admin/policy-updates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }) as any,
  );
}

describe("admin policy update sends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.getDistributablePolicyUpdate.mockResolvedValue(update);
    mocks.getUploadedPolicyUpdateRecord.mockResolvedValue(null);
    mocks.listPolicyUpdateRecipients.mockResolvedValue([recipient]);
    mocks.findUserProfileByEmail.mockResolvedValue(recipient);
    mocks.getUserProfileDisplayName.mockReturnValue(recipient.name);
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "message-1" });
    mocks.buildPolicyUpdateEmail.mockReturnValue({
      subject: update.emailSubject,
      text: "Plain text",
      html: "<p>HTML</p>",
      portalUrl: "https://example.test/updates/policy-update-1",
      unsubscribeUrl: null,
      trackedDestinations: [],
    });
    mocks.backgroundJobIdForIdempotencyKey.mockReturnValue("background-job-1");
    mocks.enqueueBackgroundJob.mockResolvedValue({
      duplicate: false,
      job: { id: "background-job-1", status: "queued" },
    });
  });

  it("queues member sends and does not construct the mail transport", async () => {
    const response = await postPolicyUpdate({
      slug: update.slug,
      confirmSend: true,
      audienceMode: "selected_members",
      recipientIds: [recipient.id],
    });

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      queued: true,
      draft: false,
      jobId: "background-job-1",
      sendRunId: "background-job-1",
      audienceMode: "selected_members",
      recipientCount: 1,
      sent: 0,
      failed: 0,
    });
    expect(mocks.recordPolicyUpdateSendRun).toHaveBeenCalledWith(
      expect.objectContaining({
        sendRunId: "background-job-1",
        recipientCount: 1,
        sentCount: 0,
        failedCount: 0,
      }),
    );
    expect(mocks.enqueueBackgroundJob).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "policy_update",
        mode: "live",
        sourceId: update.slug,
        createdBy: "admin-1",
        recipients: [expect.objectContaining({ userId: recipient.id, email: recipient.email })],
      }),
    );
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.buildPolicyUpdateEmail).not.toHaveBeenCalled();
    expect(mocks.createNewsletterTrackingRecord).not.toHaveBeenCalled();
  });

  it("keeps a single draft copy synchronous", async () => {
    const response = await postPolicyUpdate({
      slug: update.slug,
      confirmSend: true,
      draftRecipientEmail: recipient.email,
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      draft: true,
      recipientEmail: recipient.email,
      resolvedRecipientName: recipient.firstName,
      audienceMode: "draft",
      recipientCount: 1,
      sent: 1,
      failed: 0,
    });
    expect(mocks.createTransport).toHaveBeenCalledTimes(1);
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ to: recipient.email, subject: update.emailSubject }),
    );
    expect(mocks.enqueueBackgroundJob).not.toHaveBeenCalled();
    expect(mocks.recordPolicyUpdateSendRun).not.toHaveBeenCalled();
    expect(mocks.createNewsletterTrackingRecord).not.toHaveBeenCalled();
  });
});

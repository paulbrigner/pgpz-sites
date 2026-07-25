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
  parsePolicyUpdateDocx: vi.fn(),
  policyUpdateAssetObjectKey: vi.fn(),
  policyUpdatePdfObjectKey: vi.fn(),
  policyUpdateToSummary: vi.fn(),
  publishUploadedPolicyUpdate: vi.fn(),
  recordEmailEvent: vi.fn(),
  recordPolicyUpdateSendRun: vi.fn(),
  renderPolicyUpdatePdf: vi.fn(),
  requireAdminSession: vi.fn(),
  s3Send: vi.fn(),
  saveGeneratedPolicyUpdateContent: vi.fn(),
  savePolicyUpdateGenerationFailure: vi.fn(),
  sendMail: vi.fn(),
  uploadedPolicyUpdateToPolicyUpdate: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("@pgpz/core/server", () => ({
  parsePolicyUpdateDocx: mocks.parsePolicyUpdateDocx,
  policyUpdateArtifactPrefix: vi.fn(),
  policyUpdateAssetObjectKey: mocks.policyUpdateAssetObjectKey,
  policyUpdatePdfObjectKey: mocks.policyUpdatePdfObjectKey,
  renderPolicyUpdatePdf: mocks.renderPolicyUpdatePdf,
  validatePolicyUpdateDocx: vi.fn(),
}));

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
  policyUpdateToSummary: mocks.policyUpdateToSummary,
  policyUpdateUploadObjectKey: vi.fn(),
  publishUploadedPolicyUpdate: mocks.publishUploadedPolicyUpdate,
  saveGeneratedPolicyUpdateContent: mocks.saveGeneratedPolicyUpdateContent,
  savePolicyUpdateGenerationFailure: mocks.savePolicyUpdateGenerationFailure,
  saveUploadedPolicyUpdate: vi.fn(),
  unpublishUploadedPolicyUpdate: vi.fn(),
  uploadedPolicyUpdateToPolicyUpdate: mocks.uploadedPolicyUpdateToPolicyUpdate,
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
  s3Client: { send: mocks.s3Send },
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
    mocks.s3Send.mockResolvedValue({});
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

  it("blocks publishing until generated portal content and a PDF artifact exist", async () => {
    mocks.getUploadedPolicyUpdateRecord.mockResolvedValue({
      ...update,
      sourceFormat: "docx",
      visibilityStatus: "draft",
      generationStatus: "not_started",
      pdfS3Key: null,
    });

    const response = await postPolicyUpdate({
      action: "publishUpdate",
      slug: update.slug,
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringMatching(/Generate and review/),
    });
    expect(mocks.materializePolicyUpdateEmailAssets).not.toHaveBeenCalled();
    expect(mocks.publishUploadedPolicyUpdate).not.toHaveBeenCalled();
  });

  it("keeps upload summary metadata authoritative during DOCX generation", async () => {
    const uploadRecord = {
      ...update,
      summary: "Editorial summary supplied during upload.",
      emailPreheader: "Editorial preheader supplied during upload.",
      sourceFormat: "docx",
      s3Bucket: "policy-update-bucket",
      s3Key: "policy-updates/uploads/policy-update-1/source.docx",
      fileName: "policy-update.docx",
      visibilityStatus: "draft",
      generationStatus: "not_started",
      pdfS3Key: null,
    };
    const generated = {
      title: "Generated document title",
      shortTitle: "Generated title",
      summary: "Parser-derived summary that must not be displayed.",
      emailPreheader: "Parser-derived preheader that must not be displayed.",
      emailSubject: "Generated subject",
      coverImage: "",
      keyTakeaways: ["Takeaway"],
      actionItems: ["Action"],
      sections: [],
      assets: [],
      sourceText: "Document source text",
      sourceTextSha256: "a".repeat(64),
    };
    const pdf = Buffer.from("%PDF-1.7 generated");

    mocks.getUploadedPolicyUpdateRecord.mockResolvedValue(uploadRecord);
    mocks.s3Send
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: async () => Array.from(Buffer.from("DOCX source")),
        },
      })
      .mockResolvedValueOnce({});
    mocks.parsePolicyUpdateDocx.mockResolvedValue(generated);
    mocks.policyUpdatePdfObjectKey.mockReturnValue(
      "policy-updates/uploads/policy-update-1/resource.pdf",
    );
    mocks.renderPolicyUpdatePdf.mockResolvedValue(pdf);
    mocks.saveGeneratedPolicyUpdateContent.mockResolvedValue({
      ...uploadRecord,
      generationStatus: "generated",
    });
    mocks.uploadedPolicyUpdateToPolicyUpdate.mockReturnValue(update);
    mocks.policyUpdateToSummary.mockReturnValue(update);

    const response = await postPolicyUpdate({
      action: "generateContent",
      slug: update.slug,
    });

    expect(response.status).toBe(200);
    expect(mocks.renderPolicyUpdatePdf).toHaveBeenCalledWith(
      expect.objectContaining({
        summary: uploadRecord.summary,
        emailPreheader: uploadRecord.emailPreheader,
      }),
      expect.any(Object),
    );
    const saved = mocks.saveGeneratedPolicyUpdateContent.mock.calls[0]?.[0];
    expect(saved).not.toHaveProperty("summary");
    expect(saved).not.toHaveProperty("emailPreheader");
  });
});

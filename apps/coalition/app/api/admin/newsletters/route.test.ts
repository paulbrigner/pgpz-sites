import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildNewsletterEmail: vi.fn(),
  createNewsletterTrackingRecord: vi.fn(),
  createTransport: vi.fn(),
  deleteNewsletterDraft: vi.fn(),
  findUserProfileByEmail: vi.fn(),
  getNewsletter: vi.fn(),
  getNewsletterSendRun: vi.fn(),
  getUserProfileDisplayName: vi.fn(),
  listNewsletterSendRuns: vi.fn(),
  listNewsletters: vi.fn(),
  listPolicyUpdateRecipients: vi.fn(),
  markNewsletterSent: vi.fn(),
  markNewsletterTrackingSent: vi.fn(),
  recordEmailEvent: vi.fn(),
  recordNewsletterDraftSend: vi.fn(),
  recordNewsletterSendRun: vi.fn(),
  requireAdminSession: vi.fn(),
  saveNewsletterDraft: vi.fn(),
  sendMail: vi.fn(),
}));

vi.mock("server-only", () => ({}));

vi.mock("nodemailer", () => ({
  default: {
    createTransport: mocks.createTransport,
  },
}));

vi.mock("@/lib/admin/auth", () => ({
  requireAdminSession: mocks.requireAdminSession,
}));

vi.mock("@/lib/admin/email-transport", () => ({
  buildEmailServerConfig: () => ({ host: "smtp.example.com" }),
  isValidEmail: (value: string) => value.includes("@"),
  normalizeEmail: (value: unknown) => (typeof value === "string" ? value.trim().toLowerCase() : ""),
}));

vi.mock("@/lib/admin/newsletters", () => ({
  deleteNewsletterDraft: mocks.deleteNewsletterDraft,
  getNewsletter: mocks.getNewsletter,
  getNewsletterSendRun: mocks.getNewsletterSendRun,
  listNewsletterSendRuns: mocks.listNewsletterSendRuns,
  listNewsletters: mocks.listNewsletters,
  markNewsletterSent: mocks.markNewsletterSent,
  recordNewsletterDraftSend: mocks.recordNewsletterDraftSend,
  recordNewsletterSendRun: mocks.recordNewsletterSendRun,
  saveNewsletterDraft: mocks.saveNewsletterDraft,
}));

vi.mock("@/lib/admin/email-tracking", () => ({
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

vi.mock("@/lib/admin/email-log", () => ({
  recordEmailEvent: mocks.recordEmailEvent,
}));

vi.mock("@/lib/config", () => ({
  EMAIL_FROM: "admin@pgpz.org",
  SITE_URL: "https://example.test",
}));

vi.mock("@/lib/newsletter-email", () => ({
  buildNewsletterEmail: mocks.buildNewsletterEmail,
}));

const newsletter = {
  id: "newsletter-1",
  subject: "Test Newsletter",
  preheader: "Preview",
  body: "Hello members",
  previewText: "Hello members",
  status: "draft",
  audience: "active_members",
};

const recipient = {
  id: "user-1",
  email: "paul@example.com",
  name: "Paul Brigner",
  firstName: "Paul",
  lastName: "Brigner",
};

async function postNewsletter(body: Record<string, unknown>) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://example.test/api/admin/newsletters", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any,
  );
}

describe("admin newsletter sends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "message-1" });
    mocks.getNewsletter.mockResolvedValue(newsletter);
    mocks.saveNewsletterDraft.mockResolvedValue(newsletter);
    mocks.listPolicyUpdateRecipients.mockResolvedValue([recipient]);
    mocks.createNewsletterTrackingRecord.mockResolvedValue({ trackingId: "tracking-1" });
    mocks.recordNewsletterSendRun.mockResolvedValue({ id: "send-run-1" });
    mocks.buildNewsletterEmail.mockImplementation((input) => ({
      subject: input.subject,
      text: "Plain text",
      html: "<p>HTML</p>",
    }));
  });

  it("sends selected draft copies without tracking or send history", async () => {
    const response = await postNewsletter({
      action: "send",
      id: "newsletter-1",
      confirmSend: true,
      audienceMode: "selected_members",
      recipientIds: ["user-1"],
      draftSend: true,
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      draft: true,
      audienceMode: "selected_members",
      recipientCount: 1,
      sent: 1,
      failed: 0,
    });
    expect(body.sendRun).toBeUndefined();
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "[Draft] Test Newsletter" }));
    expect(mocks.buildNewsletterEmail.mock.calls[0][3]).toBeUndefined();
    expect(mocks.createNewsletterTrackingRecord).not.toHaveBeenCalled();
    expect(mocks.markNewsletterTrackingSent).not.toHaveBeenCalled();
    expect(mocks.recordNewsletterSendRun).not.toHaveBeenCalled();
    expect(mocks.markNewsletterSent).not.toHaveBeenCalled();
    expect(mocks.recordNewsletterDraftSend).toHaveBeenCalledWith("newsletter-1");
    expect(mocks.recordEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "newsletter_draft",
        metadata: expect.objectContaining({
          newsletterId: "newsletter-1",
          audienceMode: "selected_members",
          draft: true,
        }),
      }),
    );
    expect(mocks.recordEmailEvent.mock.calls[0][0].metadata.trackingId).toBeUndefined();
  });

  it("saves current form content before sending selected draft copies", async () => {
    const savedNewsletter = {
      ...newsletter,
      id: "newsletter-2",
      subject: "Unsaved Draft",
      preheader: "Fresh preview",
      body: "Fresh body",
      previewText: "Fresh body",
    };
    mocks.saveNewsletterDraft.mockResolvedValueOnce(savedNewsletter);
    mocks.getNewsletter.mockResolvedValueOnce(savedNewsletter);

    const response = await postNewsletter({
      action: "send",
      confirmSend: true,
      audienceMode: "selected_members",
      recipientIds: ["user-1"],
      draftSend: true,
      subject: "Unsaved Draft",
      preheader: "Fresh preview",
      body: "Fresh body",
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      draft: true,
      newsletter: { id: "newsletter-2", subject: "Unsaved Draft" },
      recipientCount: 1,
      sent: 1,
      failed: 0,
    });
    expect(mocks.saveNewsletterDraft).toHaveBeenCalledWith({
      id: null,
      subject: "Unsaved Draft",
      preheader: "Fresh preview",
      body: "Fresh body",
      adminUserId: "admin-1",
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(expect.objectContaining({ subject: "[Draft] Unsaved Draft" }));
    expect(mocks.createNewsletterTrackingRecord).not.toHaveBeenCalled();
    expect(mocks.recordNewsletterSendRun).not.toHaveBeenCalled();
    expect(mocks.recordNewsletterDraftSend).toHaveBeenCalledWith("newsletter-2");
  });

  it("rejects draft sends to all active members", async () => {
    const response = await postNewsletter({
      action: "send",
      id: "newsletter-1",
      confirmSend: true,
      audienceMode: "all_active_members",
      draftSend: true,
    });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error).toBe("Draft sends must use a selected member audience.");
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.createNewsletterTrackingRecord).not.toHaveBeenCalled();
    expect(mocks.recordNewsletterSendRun).not.toHaveBeenCalled();
  });

  it("keeps normal selected sends tracked and recorded", async () => {
    const response = await postNewsletter({
      action: "send",
      id: "newsletter-1",
      confirmSend: true,
      audienceMode: "selected_members",
      recipientIds: ["user-1"],
    });

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      ok: true,
      draft: false,
      sendRun: { id: "send-run-1" },
      audienceMode: "selected_members",
      recipientCount: 1,
      sent: 1,
      failed: 0,
    });
    expect(mocks.createNewsletterTrackingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        newsletterId: "newsletter-1",
        audienceMode: "selected_members",
        userId: "user-1",
        email: "paul@example.com",
      }),
    );
    expect(mocks.buildNewsletterEmail.mock.calls[0][3]).toEqual({
      trackingId: "tracking-1",
      trackLinks: true,
      includeOpenPixel: true,
      includeUnsubscribe: true,
    });
    expect(mocks.markNewsletterTrackingSent).toHaveBeenCalledWith(
      expect.objectContaining({ trackingId: "tracking-1", providerMessageId: "message-1" }),
    );
    expect(mocks.recordNewsletterSendRun).toHaveBeenCalledWith(
      expect.objectContaining({
        newsletterId: "newsletter-1",
        audienceMode: "selected_members",
        recipientCount: 1,
        sentCount: 1,
        failedCount: 0,
      }),
    );
    expect(mocks.recordNewsletterDraftSend).not.toHaveBeenCalled();
  });
});

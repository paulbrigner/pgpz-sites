import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  featureEnabled: vi.fn(),
  resolveAppSession: vi.fn(),
  getCampaign: vi.fn(),
  getSignOn: vi.fn(),
  saveSignOn: vi.fn(),
  withdrawSignOn: vi.fn(),
  sendReceipt: vi.fn(),
}));

vi.mock("@/config/features", () => ({
  isFeatureEnabled: mocks.featureEnabled,
}));
vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));
vi.mock("@/lib/letter-signons", () => ({
  getLetterCampaignBySlug: mocks.getCampaign,
  getLetterSignOn: mocks.getSignOn,
  saveLetterSignOn: mocks.saveSignOn,
  withdrawLetterSignOn: mocks.withdrawSignOn,
}));
vi.mock("@/lib/letter-signons-email", () => ({
  sendLetterSignOnReceipt: mocks.sendReceipt,
}));

const campaign = {
  id: "campaign-1",
  slug: "clarity-act",
  title: "Support for H.R. 3633",
  status: "open",
  deadlineAt: "2026-08-01T17:00:00.000Z",
  currentDocument: { version: 1, sha256: "a".repeat(64) },
};

const session = {
  user: {
    id: "user-1",
    email: "member@example.test",
    name: "Example Member",
    firstName: "Example",
    lastName: "Member",
    company: "Zcash ecosystem",
    jobTitle: "Developer",
    membershipStatus: "active",
    accountStatus: "active",
    isAdmin: false,
  },
};

const request = (body: Record<string, unknown>) =>
  new Request("https://coalition.example.test/api/letters/clarity-act/sign-on", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any;

const context = {
  params: Promise.resolve({ slug: "clarity-act" }),
};

describe("letter sign-on API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.featureEnabled.mockReturnValue(true);
    mocks.resolveAppSession.mockResolvedValue(session);
    mocks.getCampaign.mockResolvedValue(campaign);
    mocks.getSignOn.mockResolvedValue({
      campaignId: "campaign-1",
      userId: "user-1",
      signerKind: "individual",
      displayName: "Example Member",
      withdrawnAt: null,
      documentVersion: 1,
      documentSha256: "a".repeat(64),
    });
    mocks.saveSignOn.mockResolvedValue({
      duplicate: false,
      signOn: {
        campaignId: "campaign-1",
        userId: "user-1",
        signerKind: "individual",
        displayName: "Example Member",
        confirmationStatus: "pending",
      },
    });
    mocks.sendReceipt.mockResolvedValue({ sent: true });
  });

  it("returns not found before auth when the registered feature is off", async () => {
    mocks.featureEnabled.mockReturnValue(false);
    const { POST } = await import("./route");
    const response = await POST(request({ consent: true }), context);

    expect(response.status).toBe(404);
    expect(mocks.resolveAppSession).not.toHaveBeenCalled();
  });

  it("requires active Coalition membership", async () => {
    mocks.resolveAppSession.mockResolvedValue({
      user: { ...session.user, membershipStatus: "none" },
    });
    const { POST } = await import("./route");
    const response = await POST(request({ consent: true }), context);

    expect(response.status).toBe(403);
    expect(mocks.saveSignOn).not.toHaveBeenCalled();
  });

  it("requires exact-draft consent", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ signerKind: "individual", displayName: "Example Member" }),
      context,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/reviewed and support/i);
  });

  it("requires organization authorization", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({
        signerKind: "organization",
        displayName: "Example Member",
        organizationName: "Example Project",
        consent: true,
      }),
      context,
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toMatch(/authorized/i);
  });

  it("constructs the acceptance server-side and sends the exact-document receipt", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({
        signerKind: "individual",
        displayName: "Example Member",
        consent: true,
        acceptanceText: "client supplied text must be ignored",
      }),
      context,
    );

    expect(response.status).toBe(201);
    expect(mocks.saveSignOn).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign,
        userId: "user-1",
        email: "member@example.test",
        acceptanceText: expect.stringMatching(/version 1.*Support for H\.R\. 3633/),
      }),
    );
    expect(
      mocks.saveSignOn.mock.calls[0][0].acceptanceText,
    ).not.toContain("client supplied");
    expect(mocks.sendReceipt).toHaveBeenCalledOnce();
  });

  it("lets the signer resend the exact-document receipt after delivery trouble", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      request({ action: "resendConfirmation" }),
      context,
    );

    expect(response.status).toBe(200);
    expect(mocks.getSignOn).toHaveBeenCalledWith(campaign, "user-1");
    expect(mocks.sendReceipt).toHaveBeenCalledWith(
      campaign,
      expect.objectContaining({ userId: "user-1", documentVersion: 1 }),
    );
    expect(mocks.saveSignOn).not.toHaveBeenCalled();
  });
});

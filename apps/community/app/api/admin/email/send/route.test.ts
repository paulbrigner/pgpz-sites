import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildCustomAdminEmail: vi.fn(),
  buildWelcomeEmail: vi.fn(),
  createTransport: vi.fn(),
  findUserProfileByEmail: vi.fn(),
  findUserProfileById: vi.fn(),
  getUserProfileDisplayName: vi.fn(),
  recordEmailEvent: vi.fn(),
  requireAdminSession: vi.fn(),
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
  buildEmailServerConfig: () => ({ host: "smtp.example.test" }),
}));

vi.mock("@/lib/admin/user-profile", () => ({
  findUserProfileByEmail: mocks.findUserProfileByEmail,
  findUserProfileById: mocks.findUserProfileById,
  getUserProfileDisplayName: mocks.getUserProfileDisplayName,
}));

vi.mock("@/lib/admin/email-log", () => ({
  recordEmailEvent: mocks.recordEmailEvent,
}));

vi.mock("@/lib/config", () => ({
  EMAIL_FROM: "admin@pgpz.org",
}));

vi.mock("@/lib/system-email", () => ({
  buildCustomAdminEmail: mocks.buildCustomAdminEmail,
  buildWelcomeEmail: mocks.buildWelcomeEmail,
}));

const activeMember = {
  id: "user-1",
  name: "Member Example",
  email: "member@example.test",
  firstName: "Member",
  lastName: "Example",
  membershipStatus: "active",
  emailSuppressed: false,
  accountStatus: "active",
  deactivatedAt: null,
};

async function postWelcome(body: Record<string, unknown> = { userId: "user-1", type: "welcome" }) {
  const { POST } = await import("./route");
  return POST(
    new Request("https://example.test/api/admin/email/send", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any,
  );
}

describe("admin welcome email sends", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdminSession.mockResolvedValue({ user: { id: "admin-1" } });
    mocks.createTransport.mockReturnValue({ sendMail: mocks.sendMail });
    mocks.sendMail.mockResolvedValue({ messageId: "message-1" });
    mocks.findUserProfileById.mockResolvedValue(activeMember);
    mocks.findUserProfileByEmail.mockResolvedValue(activeMember);
    mocks.getUserProfileDisplayName.mockReturnValue("Member Example");
    mocks.buildWelcomeEmail.mockReturnValue({
      subject: "Welcome to PGPZ Community",
      html: "<p>Welcome</p>",
      text: "Welcome",
    });
  });

  it("sends welcome mail to an active member", async () => {
    const response = await postWelcome();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      userId: "user-1",
      email: "member@example.test",
      emailType: "welcome",
      markWelcome: true,
    });
    expect(mocks.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "member@example.test",
        subject: "Welcome to PGPZ Community",
      }),
    );
    expect(mocks.recordEmailEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-1",
        type: "welcome",
        status: "sent",
        markWelcome: true,
      }),
    );
  });

  it.each([
    ["unverified membership", { ...activeMember, membershipStatus: "none" }],
    ["missing membership status", { ...activeMember, membershipStatus: undefined }],
    ["unsupported membership status", { ...activeMember, membershipStatus: "invited" }],
  ])("rejects %s", async (_label, member) => {
    mocks.findUserProfileById.mockResolvedValueOnce(member);

    const response = await postWelcome();

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Welcome emails can only be sent to active members",
    });
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.recordEmailEvent).not.toHaveBeenCalled();
  });

  it("rejects a raw welcome email when no member profile exists", async () => {
    mocks.findUserProfileById.mockResolvedValueOnce(null);
    mocks.findUserProfileByEmail.mockResolvedValueOnce(null);

    const response = await postWelcome({
      userId: "missing-user",
      email: "unverified@example.test",
      type: "welcome",
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Welcome emails can only be sent to active members",
    });
    expect(mocks.createTransport).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.recordEmailEvent).not.toHaveBeenCalled();
  });
});

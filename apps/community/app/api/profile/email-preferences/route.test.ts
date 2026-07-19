import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAppSession: vi.fn(),
  getMemberEmailPreferences: vi.fn(),
  updateMemberEmailPreferences: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({ resolveAppSession: mocks.resolveAppSession }));
vi.mock("@/lib/email-preferences", () => ({
  getMemberEmailPreferences: mocks.getMemberEmailPreferences,
  updateMemberEmailPreferences: mocks.updateMemberEmailPreferences,
}));

describe("profile email preferences route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAppSession.mockResolvedValue({ user: { id: "member-1" } });
    mocks.getMemberEmailPreferences.mockResolvedValue({
      newsletter: true,
      policyUpdates: false,
      globallySuppressed: false,
      suppressionReason: null,
      canSelfResubscribe: true,
    });
    mocks.updateMemberEmailPreferences.mockResolvedValue({
      newsletter: false,
      policyUpdates: true,
      globallySuppressed: false,
      suppressionReason: null,
      canSelfResubscribe: true,
    });
  });

  it("returns the authenticated member's category preferences", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://community.example.test/api/profile/email-preferences") as any);
    expect(response.status).toBe(200);
    expect(mocks.getMemberEmailPreferences).toHaveBeenCalledWith("member-1");
  });

  it("validates and persists both category choices", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://community.example.test/api/profile/email-preferences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newsletter: false, policyUpdates: true }),
    }) as any);
    expect(response.status).toBe(200);
    expect(mocks.updateMemberEmailPreferences).toHaveBeenCalledWith({
      userId: "member-1",
      newsletter: false,
      policyUpdates: true,
    });
  });

  it("rejects malformed choices and unauthenticated callers", async () => {
    const { POST } = await import("./route");
    const invalid = await POST(new Request("https://community.example.test/api/profile/email-preferences", {
      method: "POST",
      body: JSON.stringify({ newsletter: "no" }),
    }) as any);
    expect(invalid.status).toBe(400);

    mocks.resolveAppSession.mockResolvedValueOnce(null);
    const unauthorized = await POST(new Request("https://community.example.test/api/profile/email-preferences", {
      method: "POST",
      body: JSON.stringify({ newsletter: true, policyUpdates: true }),
    }) as any);
    expect(unauthorized.status).toBe(401);
  });
});

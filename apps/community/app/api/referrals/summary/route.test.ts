import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveAppSession: vi.fn(),
  getReferralSummaryForUser: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));

vi.mock("@/lib/referrals", () => ({
  getReferralSummaryForUser: mocks.getReferralSummaryForUser,
}));

async function getSummary() {
  const { GET } = await import("./route");
  return GET(new Request("https://community.example.test/api/referrals/summary") as any);
}

describe("member referral summary route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReferralSummaryForUser.mockResolvedValue({
      referralCode: "abc123",
      referralUrl: "https://community.example.test/?ref=abc123",
      creditedSignupCount: 0,
      activeRecruitCount: 0,
      recentCredits: [],
    });
  });

  it("returns a summary for an active member", async () => {
    mocks.resolveAppSession.mockResolvedValue({
      user: { id: "member-1" },
      capabilities: { accountActive: true, member: true, admin: false, protectedContent: true },
    });

    const response = await getSummary();

    expect(response.status).toBe(200);
    expect(mocks.getReferralSummaryForUser).toHaveBeenCalledWith("member-1");
  });

  it("rejects an authenticated account without active membership", async () => {
    mocks.resolveAppSession.mockResolvedValue({
      user: { id: "user-1" },
      capabilities: { accountActive: true, member: false, admin: false, protectedContent: false },
    });

    const response = await getSummary();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Active membership is required" });
    expect(mocks.getReferralSummaryForUser).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    mocks.resolveAppSession.mockResolvedValue(null);

    const response = await getSummary();

    expect(response.status).toBe(401);
    expect(mocks.getReferralSummaryForUser).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ isFeatureEnabled: vi.fn(), resolveAppSession: vi.fn(), list: vi.fn() }));
vi.mock("@/config/features", () => ({ isFeatureEnabled: mocks.isFeatureEnabled }));
vi.mock("@/lib/app-session", () => ({ resolveAppSession: mocks.resolveAppSession }));
vi.mock("@/lib/member-profiles", () => ({ listVisibleMemberProfiles: mocks.list }));

describe("Community member directory API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.isFeatureEnabled.mockReturnValue(true); mocks.list.mockResolvedValue([]); });
  it("fails closed while the Community feature is disabled", async () => {
    mocks.isFeatureEnabled.mockReturnValue(false);
    const { GET } = await import("./route");
    expect((await GET()).status).toBe(404);
    expect(mocks.resolveAppSession).not.toHaveBeenCalled();
  });
  it("rejects anonymous and nonmember accounts before querying profiles", async () => {
    const { GET } = await import("./route");
    mocks.resolveAppSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    mocks.resolveAppSession.mockResolvedValueOnce({ user: { id: "user-1" }, capabilities: { member: false } });
    expect((await GET()).status).toBe(403);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns only the protected projection to an active member", async () => {
    mocks.resolveAppSession.mockResolvedValue({ user: { id: "member-1" }, capabilities: { member: true } });
    mocks.list.mockResolvedValue([{ slug: "ada", name: "Ada" }]);
    const { GET } = await import("./route"); const response = await GET();
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ members: [{ slug: "ada", name: "Ada" }] });
  });
});

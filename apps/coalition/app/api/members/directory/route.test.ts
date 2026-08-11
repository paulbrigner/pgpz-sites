import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ resolveAppSession: vi.fn(), list: vi.fn() }));
vi.mock("@/lib/app-session", () => ({ resolveAppSession: mocks.resolveAppSession }));
vi.mock("@/lib/admin/roster", () => ({ listActiveMemberDirectory: mocks.list }));

describe("Coalition member directory API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.list.mockResolvedValue([]); });
  it("rejects anonymous and inactive accounts before scanning the compatibility directory", async () => {
    const { GET } = await import("./route"); mocks.resolveAppSession.mockResolvedValueOnce(null);
    expect((await GET()).status).toBe(401);
    mocks.resolveAppSession.mockResolvedValueOnce({ user: { id: "user-1", accountStatus: "active", membershipStatus: "none" } });
    expect((await GET()).status).toBe(403); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("returns the protected directory to an active member", async () => {
    mocks.resolveAppSession.mockResolvedValue({ user: { id: "member-1", accountStatus: "active", membershipStatus: "active" } });
    mocks.list.mockResolvedValue([{ id: "target-1", name: "Ada", slug: "ada", profilePath: "/members/ada" }]);
    const { GET } = await import("./route"); const response = await GET();
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ members: [{ id: "target-1", name: "Ada", slug: "ada", profilePath: "/members/ada" }] });
  });
});

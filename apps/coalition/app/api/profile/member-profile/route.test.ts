import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ resolveAppSession: vi.fn(), getOwner: vi.fn(), saveOwner: vi.fn() }));
vi.mock("@/lib/app-session", () => ({ resolveAppSession: mocks.resolveAppSession }));
vi.mock("@/lib/member-profiles", () => ({ getOwnerMemberProfile: mocks.getOwner, saveOwnerMemberProfile: mocks.saveOwner }));

describe("Coalition member profile owner API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.getOwner.mockResolvedValue({ published: false }); mocks.saveOwner.mockResolvedValue({ published: true }); });
  it("requires an authenticated owner", async () => {
    mocks.resolveAppSession.mockResolvedValue(null); const { GET } = await import("./route");
    expect((await GET(new NextRequest("https://coalition.example.test/api/profile/member-profile"))).status).toBe(401);
  });
  it("rejects cross-origin writes", async () => {
    const { PUT } = await import("./route"); const request = new NextRequest("https://coalition.example.test/api/profile/member-profile", { method: "PUT", headers: { origin: "https://evil.example" }, body: "{}" });
    expect((await PUT(request)).status).toBe(403); expect(mocks.saveOwner).not.toHaveBeenCalled();
  });
  it("uses the session owner and ignores a body user id", async () => {
    mocks.resolveAppSession.mockResolvedValue({ user: { id: "member-1" } });
    const { PUT } = await import("./route"); const request = new NextRequest("https://coalition.example.test/api/profile/member-profile", { method: "PUT", headers: { origin: "https://coalition.example.test", "content-type": "application/json" }, body: JSON.stringify({ userId: "attacker", slug: "ada", published: true, version: 1 }) });
    expect((await PUT(request)).status).toBe(200);
    expect(mocks.saveOwner).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-1", slug: "ada", publish: true, expectedVersion: 1 }));
  });
  it("accepts the configured public origin behind an Amplify internal request URL", async () => {
    mocks.resolveAppSession.mockResolvedValue({ user: { id: "member-1" } });
    const { PUT } = await import("./route");
    const request = new NextRequest("https://internal-amplify-host.example/api/profile/member-profile", {
      method: "PUT",
      headers: { origin: "https://coalition.pgpz.org", "content-type": "application/json" },
      body: JSON.stringify({ slug: "ada", published: true, version: 1 }),
    });
    expect((await PUT(request)).status).toBe(200);
    expect(mocks.saveOwner).toHaveBeenCalledWith(expect.objectContaining({ userId: "member-1" }));
  });
});

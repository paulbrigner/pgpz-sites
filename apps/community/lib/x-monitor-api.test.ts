import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enabled: vi.fn(),
  proxy: vi.fn(),
  resolveAppSession: vi.fn(),
}));

vi.mock("@/lib/app-session", () => ({
  resolveAppSession: mocks.resolveAppSession,
}));

vi.mock("@/lib/x-monitor-server", () => {
  class CommunityXMonitorConfigurationError extends Error {}
  return {
    CommunityXMonitorConfigurationError,
    communityXMonitorEnabledForRequest: mocks.enabled,
    proxyCommunityXMonitorRead: mocks.proxy,
  };
});

import { handleCommunityXMonitorApiRequest } from "./x-monitor-api";

describe("Community X Monitor API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enabled.mockReturnValue(true);
    mocks.proxy.mockResolvedValue(Response.json({ items: [] }));
  });

  it("returns 404 while the feature is disabled without resolving a session", async () => {
    mocks.enabled.mockReturnValue(false);
    const response = await handleCommunityXMonitorApiRequest(
      new Request("https://community.pgpz.org/api/x-monitor/feed"),
      "feed",
    );
    expect(response.status).toBe(404);
    expect(mocks.resolveAppSession).not.toHaveBeenCalled();
    expect(mocks.proxy).not.toHaveBeenCalled();
  });

  it("returns 401 without a session and never contacts the upstream", async () => {
    mocks.resolveAppSession.mockResolvedValue(null);
    const response = await handleCommunityXMonitorApiRequest(
      new Request("https://community.pgpz.org/api/x-monitor/feed"),
      "feed",
    );
    expect(response.status).toBe(401);
    expect(mocks.proxy).not.toHaveBeenCalled();
  });

  it("authenticates before rejecting an invalid post identifier", async () => {
    mocks.resolveAppSession.mockResolvedValue(null);
    const anonymous = await handleCommunityXMonitorApiRequest(
      new Request("https://community.pgpz.org/api/x-monitor/posts/invalid"),
      null,
    );
    expect(anonymous.status).toBe(401);

    mocks.resolveAppSession.mockResolvedValue({
      capabilities: { protectedContent: true },
    });
    const member = await handleCommunityXMonitorApiRequest(
      new Request("https://community.pgpz.org/api/x-monitor/posts/invalid"),
      null,
    );
    expect(member.status).toBe(400);
    expect(mocks.proxy).not.toHaveBeenCalled();
  });

  it("returns 403 without protected-content capability", async () => {
    mocks.resolveAppSession.mockResolvedValue({
      capabilities: { protectedContent: false },
    });
    const response = await handleCommunityXMonitorApiRequest(
      new Request("https://community.pgpz.org/api/x-monitor/feed"),
      "feed",
    );
    expect(response.status).toBe(403);
    expect(mocks.proxy).not.toHaveBeenCalled();
  });

  it("allows a protected-content session through the explicit proxy", async () => {
    mocks.resolveAppSession.mockResolvedValue({
      capabilities: { protectedContent: true },
    });
    const request = new Request("https://community.pgpz.org/api/x-monitor/feed?q=zcash");
    const upstreamSearch = new URLSearchParams({ q: "zcash", limit: "24" });
    const response = await handleCommunityXMonitorApiRequest(request, "feed", upstreamSearch);
    expect(response.status).toBe(200);
    expect(mocks.proxy).toHaveBeenCalledWith("feed", upstreamSearch);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  handle: vi.fn(),
}));

vi.mock("@/lib/x-monitor-api", () => ({
  handleCommunityXMonitorApiRequest: mocks.handle,
}));

import { GET } from "./route";

describe("Community X Monitor feed route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.handle.mockResolvedValue(Response.json({ items: [], next_cursor: null }));
  });

  it("passes only bounded, supported read filters to the authorized handler", async () => {
    const request = new Request(
      "https://community.pgpz.org/api/x-monitor/feed?q=privacy&limit=9999&tier=influencer&theme=Privacy%20%2F%20freedom%20narrative&search_mode=semantic&debate_issue=ignored",
    );
    const response = await GET(request);

    expect(response.status).toBe(200);
    expect(mocks.handle).toHaveBeenCalledOnce();
    const [receivedRequest, path, search] = mocks.handle.mock.calls[0];
    expect(receivedRequest).toBe(request);
    expect(path).toBe("feed");
    expect(search.get("q")).toBe("privacy");
    expect(search.get("limit")).toBe("24");
    expect(search.getAll("tier")).toEqual(["influencer", "investor"]);
    expect(search.getAll("theme")).toEqual(["Privacy / freedom narrative"]);
    expect(search.has("search_mode")).toBe(false);
    expect(search.has("debate_issue")).toBe(false);
  });
});

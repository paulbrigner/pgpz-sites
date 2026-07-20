import { describe, expect, it, vi } from "vitest";
import {
  buildActivityTrendsApiUrl,
  buildFeedApiUrl,
  buildPostDetailApiUrl,
  createXMonitorReadClient,
  type XMonitorFetch,
} from "./read-client";

describe("X Monitor read client", () => {
  it("serializes repeated filters and pagination without changing their order", () => {
    const url = new URL(buildFeedApiUrl("https://monitor.example/v1/", {
      tiers: ["teammate", "ecosystem"],
      themes: ["privacy", "adoption"],
      significant: true,
      q: "shielded payments",
      limit: 25,
      cursor: "next-page",
    }));

    expect(url.pathname).toBe("/v1/feed");
    expect(url.searchParams.getAll("tier")).toEqual(["teammate", "ecosystem"]);
    expect(url.searchParams.getAll("theme")).toEqual(["privacy", "adoption"]);
    expect(url.searchParams.get("significant")).toBe("true");
    expect(url.searchParams.get("q")).toBe("shielded payments");
    expect(url.searchParams.get("limit")).toBe("25");
    expect(url.searchParams.get("cursor")).toBe("next-page");
  });

  it("keeps activity queries unpaginated and encodes post IDs as one segment", () => {
    const trends = new URL(buildActivityTrendsApiUrl(
      "https://monitor.example/v1",
      { q: "Zcash", limit: 100, cursor: "ignored" },
      { searchMode: "keyword", trendRange: "30d" },
    ));

    expect(trends.pathname).toBe("/v1/trends");
    expect(trends.searchParams.get("trend_range")).toBe("30d");
    expect(trends.searchParams.has("limit")).toBe(false);
    expect(trends.searchParams.has("cursor")).toBe(false);
    expect(buildPostDetailApiUrl("https://monitor.example/v1", "a/b c"))
      .toBe("https://monitor.example/v1/posts/a%2Fb%20c");
  });

  it("uses injected credentials with no-store reads and refuses redirects", async () => {
    const fetchMock = vi.fn<XMonitorFetch>(async () =>
      Response.json({ items: [], next_cursor: null }),
    );
    const client = createXMonitorReadClient({
      baseUrl: "https://monitor.example/v1",
      headers: {
        "x-xmonitor-client-id": "pgpz-community",
        "x-xmonitor-client-secret": "test-secret",
      },
      fetch: fetchMock,
    });

    await client.feed({ significant: true });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.cache).toBe("no-store");
    expect(init?.redirect).toBe("manual");
    expect(new Headers(init?.headers).get("x-xmonitor-client-id"))
      .toBe("pgpz-community");
  });

  it("surfaces upstream JSON errors and validates response shapes", async () => {
    const upstreamError = createXMonitorReadClient({
      baseUrl: "https://monitor.example/v1",
      fetch: async () => Response.json({ error: "unauthorized" }, { status: 401 }),
    });
    await expect(upstreamError.feed({})).rejects.toThrow("unauthorized");

    const malformed = createXMonitorReadClient({
      baseUrl: "https://monitor.example/v1",
      fetch: async () => Response.json({ items: null }),
    });
    await expect(malformed.feed({})).rejects.toThrow("Invalid feed response payload");
  });

  it("treats post-detail 404 as an absent post", async () => {
    const client = createXMonitorReadClient({
      baseUrl: "https://monitor.example/v1",
      fetch: async () => new Response(null, { status: 404 }),
    });

    await expect(client.postDetail("missing")).resolves.toBeNull();
  });
});

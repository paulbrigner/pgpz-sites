import { describe, expect, it } from "vitest";
import {
  buildCommunityXMonitorHref,
  buildCommunityXMonitorProxySearch,
  communityXMonitorActivityFeedQuery,
  parseCommunityXMonitorQuery,
  safeCommunityXMonitorReturnHref,
} from "./x-monitor-query";

describe("Community X Monitor query", () => {
  it("defaults to significant posts and a seven-day activity range", () => {
    const query = parseCommunityXMonitorQuery({});
    expect(query.feed).toEqual({
      q: undefined,
      handle: undefined,
      significant: true,
      limit: 24,
      cursor: undefined,
    });
    expect(query.trendRange).toBe("7d");
    expect(query.searchMode).toBe("keyword");
  });

  it("preserves bounded semantic prompts while dropping semantic pagination", () => {
    const query = parseCommunityXMonitorQuery({
      search_mode: "semantic",
      q: "x".repeat(700),
      cursor: "should-not-survive",
      tier: "ecosystem",
      theme: "Product / ecosystem",
    });
    expect(query.searchMode).toBe("semantic");
    expect(query.q).toHaveLength(500);
    expect(query.feed.cursor).toBeUndefined();
    const url = new URL(
      buildCommunityXMonitorHref(query, "older"),
      "https://community.pgpz.org",
    );
    expect(url.searchParams.get("search_mode")).toBe("semantic");
    expect(url.searchParams.has("cursor")).toBe(false);
    expect(url.searchParams.getAll("tier")).toEqual(["ecosystem"]);
    expect(url.searchParams.getAll("theme")).toEqual(["Product / ecosystem"]);
    expect(communityXMonitorActivityFeedQuery(query)).toMatchObject({
      q: undefined,
      cursor: undefined,
      tiers: ["ecosystem"],
      themes: ["Product / ecosystem"],
    });
  });

  it("bounds text, validates handles, and ignores unsupported ranges", () => {
    const query = parseCommunityXMonitorQuery({
      q: "x".repeat(250),
      handle: "@invalid-handle",
      significant: "all",
      trend_range: "forever",
      cursor: "c".repeat(2_500),
    });
    expect(query.q).toHaveLength(200);
    expect(query.handle).toBe("");
    expect(query.feed.significant).toBeUndefined();
    expect(query.feed.cursor).toHaveLength(2_000);
    expect(query.trendRange).toBe("7d");
  });

  it("preserves supported filters in pagination links", () => {
    const query = parseCommunityXMonitorQuery({
      q: "shielded payments",
      handle: "@zodl",
      significant: "all",
      trend_range: "30d",
      tier: ["teammate", "influencer", "investor"],
      theme: ["Privacy / freedom narrative", "not-a-theme"],
    });
    const url = new URL(buildCommunityXMonitorHref(query, "next"), "https://community.pgpz.org");
    expect(url.searchParams.get("q")).toBe("shielded payments");
    expect(url.searchParams.get("handle")).toBe("zodl");
    expect(url.searchParams.get("significant")).toBe("all");
    expect(url.searchParams.get("trend_range")).toBe("30d");
    expect(url.searchParams.get("cursor")).toBe("next");
    expect(url.searchParams.getAll("tier")).toEqual(["teammate", "influencer"]);
    expect(url.searchParams.getAll("theme")).toEqual(["Privacy / freedom narrative"]);
    expect(query.feed.tiers).toEqual(["teammate", "influencer", "investor"]);
  });

  it("allowlists and bounds feed proxy parameters", () => {
    const search = buildCommunityXMonitorProxySearch(
      "https://community.pgpz.org/api/x-monitor/feed?q=zcash&handle=%40zodl&significant=all&limit=9999&cursor=next&search_mode=semantic&debate_issue=ignored&tier=teammate&tier=influencer&theme=Privacy%20%2F%20freedom%20narrative&theme=ignored",
      "feed",
    );
    expect(search.get("q")).toBe("zcash");
    expect(search.get("handle")).toBe("zodl");
    expect(search.get("limit")).toBe("24");
    expect(search.get("cursor")).toBe("next");
    expect(search.getAll("tier")).toEqual(["teammate", "influencer", "investor"]);
    expect(search.getAll("theme")).toEqual(["Privacy / freedom narrative"]);
    expect(Object.fromEntries(search)).toMatchObject({
      q: "zcash",
      handle: "zodl",
      limit: "24",
      cursor: "next",
    });
  });

  it("forces keyword trend semantics and bounds location suggestions", () => {
    const trends = buildCommunityXMonitorProxySearch(
      "https://community.pgpz.org/api/x-monitor/trends?q=privacy&trend_range=30d&search_mode=semantic&engagement_range=90d",
      "trends",
    );
    expect(Object.fromEntries(trends)).toEqual({ q: "privacy", significant: "true", trend_range: "30d" });
    expect(
      Object.fromEntries(
        buildCommunityXMonitorProxySearch(
          "https://community.pgpz.org/api/x-monitor/author-locations?limit=500&secret=ignored",
          "author-locations",
        ),
      ),
    ).toEqual({ limit: "20" });
  });

  it("canonicalizes safe detail return links and rejects external destinations", () => {
    expect(safeCommunityXMonitorReturnHref(
      "/x-monitor?q=privacy&cursor=older&unknown=ignored#x-monitor-feed",
    )).toBe("/x-monitor?q=privacy&cursor=older#x-monitor-feed");
    expect(safeCommunityXMonitorReturnHref(
      "/x-monitor?search_mode=semantic&q=privacy&cursor=ignored#x-monitor-feed",
    )).toBe("/x-monitor?search_mode=semantic&q=privacy#x-monitor-feed");
    expect(safeCommunityXMonitorReturnHref("https://evil.example/x-monitor"))
      .toBe("/x-monitor");
    expect(safeCommunityXMonitorReturnHref("//evil.example/x-monitor"))
      .toBe("/x-monitor");
  });
});

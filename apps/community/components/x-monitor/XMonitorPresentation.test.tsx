import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ActivityTrendsResponse, FeedItem, WindowSummary } from "@pgpz/x-monitor-core/contracts";
import { parseCommunityXMonitorQuery } from "@/lib/x-monitor-query";
import { XMonitorActivity } from "./XMonitorActivity";
import { XMonitorFeed } from "./XMonitorFeed";
import { XMonitorFilters } from "./XMonitorFilters";
import { XMonitorSummaries } from "./XMonitorSummaries";

const FEED_ITEM: FeedItem = {
  status_id: "1234567890123456789",
  discovered_at: "2026-07-20T12:00:00.000Z",
  author_handle: "example",
  watch_tier: "investor",
  body_text: "Privacy matters.",
  url: "https://malicious.example/not-used",
  is_significant: true,
  significance_reason: "Focused ecosystem relevance",
  classification_status: "classified",
  likes: 2,
  reposts: 3,
  replies: 4,
  views: 5,
};

const EMPTY_TRENDS: ActivityTrendsResponse = {
  scope: {
    since: "2026-07-13T00:00:00.000Z",
    until: "2026-07-20T00:00:00.000Z",
    bucket_hours: 24,
    range_key: "7d",
    text_filter_applied: false,
  },
  activity: {
    totals: {
      post_count: 0,
      significant_count: 0,
      watchlist_count: 0,
      priority_count: 0,
      discovery_count: 0,
      other_count: 0,
      unique_handle_count: 0,
    },
    buckets: [],
  },
};

afterEach(() => cleanup());

describe("Community X Monitor presentation", () => {
  it("shows the adjusted watch-list and theme filter surface", () => {
    render(<XMonitorFilters query={parseCommunityXMonitorQuery({})} />);
    expect(screen.getByRole("option", { name: "Zodl Team" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Influencer" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "Investor" })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Privacy / freedom narrative" })).toBeInTheDocument();
    expect(screen.queryByText(/Debate topics/i)).not.toBeInTheDocument();
  });

  it("maps legacy investor posts to Influencer and derives a canonical X link", () => {
    render(
      <XMonitorFeed
        items={[FEED_ITEM]}
        nextCursor="older"
        query={parseCommunityXMonitorQuery({ q: "privacy" })}
      />,
    );
    expect(screen.getByText("Influencer")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open original post on X" }))
      .toHaveAttribute("href", "https://x.com/i/status/1234567890123456789");
    expect(screen.getByRole("link", { name: "Load older posts" }).getAttribute("href"))
      .toContain("q=privacy");
  });

  it("renders summary text and a clear empty activity state", () => {
    const summary: WindowSummary = {
      summary_key: "weekly",
      window_type: "rolling_7d_daily",
      window_start: "2026-07-13T00:00:00.000Z",
      window_end: "2026-07-20T00:00:00.000Z",
      generated_at: "2026-07-20T01:00:00.000Z",
      post_count: 12,
      significant_count: 4,
      summary_text: "Privacy and product themes led the week.",
    };
    const query = parseCommunityXMonitorQuery({});
    const { rerender } = render(<XMonitorSummaries summaries={[summary]} />);
    expect(screen.getByText(summary.summary_text)).toBeInTheDocument();
    rerender(<XMonitorActivity query={query} trends={EMPTY_TRENDS} />);
    expect(screen.getByText("No activity was captured in this range.")).toBeInTheDocument();
  });
});

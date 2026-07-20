import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  score: 0.81234,
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
    render(<XMonitorFilters query={parseCommunityXMonitorQuery({
      tier: "ecosystem",
      theme: "Privacy / freedom narrative",
    })} />);
    expect(screen.getByRole("checkbox", { name: "Zodl Team" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Influencer" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Ecosystem" })).toBeChecked();
    expect(screen.queryByRole("checkbox", { name: "Investor" })).not.toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Privacy / freedom narrative" })).toBeChecked();
    expect(screen.getByRole("button", { name: "Search" })).toHaveAttribute("type", "submit");
    expect(screen.getByRole("link", { name: "Reset" })).toHaveAttribute("href", "/x-monitor");
    expect(screen.queryByText(/Command or Control/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Debate topics/i)).not.toBeInTheDocument();
  });

  it("makes semantic search explicit and requires a natural-language prompt", async () => {
    const user = userEvent.setup();
    render(<XMonitorFilters query={parseCommunityXMonitorQuery({})} />);

    expect(screen.getByRole("radio", { name: "keyword" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "semantic" }));
    expect(screen.getByRole("radio", { name: "semantic" })).toBeChecked();
    expect(screen.getByRole("searchbox", { name: "Describe what you want to find" }))
      .toBeRequired();
    expect(screen.getByText("Finds and ranks posts with similar meaning.")).toBeInTheDocument();

    await user.type(screen.getByRole("searchbox"), "privacy tools");
    await user.click(screen.getByRole("checkbox", { name: "Ecosystem" }));
    const reset = screen.getByRole("link", { name: "Reset" });
    reset.addEventListener("click", (event) => event.preventDefault(), { once: true });
    await user.click(reset);
    expect(screen.getByRole("radio", { name: "keyword" })).toBeChecked();
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Ecosystem" })).not.toBeChecked();
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

  it("labels semantic matches with similarity and omits cursor pagination", () => {
    render(
      <XMonitorFeed
        items={[FEED_ITEM]}
        nextCursor="older"
        query={parseCommunityXMonitorQuery({
          search_mode: "semantic",
          q: "privacy as a product advantage",
        })}
      />,
    );
    expect(screen.getByRole("heading", { name: "Semantic matches" })).toBeInTheDocument();
    expect(screen.getByText("Match 0.81")).toHaveAccessibleName("Semantic match score 0.81");
    expect(screen.getByText(/Matches for “privacy as a product advantage”/)).toBeInTheDocument();
    expect(screen.getByText(/Match scores show closeness in meaning/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Load older posts" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Post details" }).getAttribute("href"))
      .toContain("return_to=");
    expect(document.getElementById("x-monitor-feed")).toBeInTheDocument();
  });

  it("renders compact summary disclosures and anchors activity range navigation", () => {
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
    const query = parseCommunityXMonitorQuery({ q: "privacy", tier: "ecosystem" });
    const { container, rerender } = render(<XMonitorSummaries summaries={[summary]} />);
    expect(screen.getAllByText(summary.summary_text)).toHaveLength(2);
    expect(screen.getByText("Read full summary")).toBeInTheDocument();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector("details")).toHaveAttribute("name", "x-monitor-summary");
    rerender(<XMonitorActivity query={query} trends={EMPTY_TRENDS} />);
    expect(screen.getByText("No activity was captured in this range.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "30 days" })).toHaveAttribute(
      "href",
      "/x-monitor?q=privacy&tier=ecosystem&trend_range=30d#x-monitor-activity",
    );
    expect(screen.getByRole("link", { name: "7 days" })).toHaveAttribute("aria-current", "page");
    expect(document.getElementById("x-monitor-activity")).toBeInTheDocument();
  });
});

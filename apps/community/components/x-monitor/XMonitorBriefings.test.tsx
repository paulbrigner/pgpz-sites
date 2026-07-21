import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { CuratedBriefing } from "@pgpz/x-monitor-core/contracts";
import { XMonitorBriefings } from "./XMonitorBriefings";

const briefing = (overrides: Partial<CuratedBriefing> = {}): CuratedBriefing => ({
  topic_id: "11111111-1111-4111-8111-111111111111",
  slug: "three-z-architecture",
  question: "What is the 3Z architecture and its current status?",
  category: "Protocol development",
  order: 1,
  version_id: "22222222-2222-4222-8222-222222222222",
  answer_text: "## Current view\n\nThe monitored conversation describes **three layers**.\n\n- One\n- Two\n\n[Official context](https://example.org/status) [Unsafe](javascript:alert(1))\n\n<script>alert('not rendered')</script>",
  key_points: ["The answer is based on reviewed monitored evidence."],
  citations: [{
    status_id: "1234567890123456789",
    author_handle: "zcash",
    url: "https://malicious.example/not-used",
    discovered_at: "2026-07-20T12:00:00.000Z",
    excerpt: "A cited source excerpt.",
  }],
  generated_at: "2026-07-20T13:00:00.000Z",
  corpus_through: "2026-07-20T12:00:00.000Z",
  reviewed_at: "2026-07-20T14:00:00.000Z",
  published_at: "2026-07-20T15:00:00.000Z",
  source_count: 1,
  stale_after: "2026-07-21T15:00:00.000Z",
  stale: false,
  ...overrides,
});

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
});

describe("X Monitor curated briefing presentation", () => {
  it("renders reviewed published snapshots without a free-form answer control", () => {
    render(<XMonitorBriefings briefings={[briefing()]} />);

    expect(screen.getByRole("heading", { name: "Published briefings" })).toBeInTheDocument();
    expect(screen.getAllByText("PGPZ reviewed")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "Current view" })).toBeInTheDocument();
    expect(screen.getByText("three layers").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Official context" })).toHaveAttribute(
      "href",
      "https://example.org/status",
    );
    expect(screen.getByText("Unsafe").closest("a")).toBeNull();
    expect(screen.queryByText(/not rendered/)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask X Monitor/i)).not.toBeInTheDocument();

    const source = screen.getByRole("link", { name: /@zcash/i });
    expect(source).toHaveAttribute("href", "https://x.com/i/status/1234567890123456789");
    expect(source).not.toHaveAttribute("href", "https://malicious.example/not-used");
    expect(screen.getByText(/AI-generated from monitored public X posts/)).toBeInTheDocument();
  });

  it("labels stale content while preserving the last reviewed answer", () => {
    render(<XMonitorBriefings briefings={[briefing({ stale: true })]} />);

    expect(screen.getByText("Update under review")).toBeInTheDocument();
    expect(screen.getByText(/remains the last PGPZ-approved answer/i)).toBeInTheDocument();
    expect(screen.getByText(/Evidence current through/i)).toBeInTheDocument();
    expect(screen.getByText(/AI draft generated/i)).toBeInTheDocument();
    expect(screen.getByText(/PGPZ reviewed/i)).toBeInTheDocument();
  });

  it("opens the briefing addressed by a stable slug hash", () => {
    const second = briefing({
      topic_id: "33333333-3333-4333-8333-333333333333",
      version_id: "44444444-4444-4444-8444-444444444444",
      slug: "tachyon-status",
      question: "What is Tachyon and its current status?",
      order: 2,
    });
    window.history.replaceState(null, "", "/x-monitor/briefings#tachyon-status");
    const { container } = render(<XMonitorBriefings briefings={[briefing(), second]} />);

    expect(container.querySelector<HTMLDetailsElement>("#tachyon-status")?.open).toBe(true);
    expect(screen.getByRole("link", { name: "Link to What is Tachyon and its current status?" }))
      .toHaveAttribute("href", "#tachyon-status");
  });

  it("ignores malformed URL fragments without breaking the briefing page", () => {
    window.history.replaceState(null, "", "/x-monitor/briefings#%E0%A4%A");
    expect(() => render(<XMonitorBriefings briefings={[briefing()]} />)).not.toThrow();
    expect(screen.getByText("What is the 3Z architecture and its current status?"))
      .toBeInTheDocument();
  });
});

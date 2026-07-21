import React from "react";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
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
  vi.restoreAllMocks();
});

describe("X Monitor curated briefing presentation", () => {
  it("renders every briefing collapsed by default without a free-form answer control", () => {
    const second = briefing({
      topic_id: "33333333-3333-4333-8333-333333333333",
      version_id: "44444444-4444-4444-8444-444444444444",
      slug: "tachyon-status",
      question: "What is Tachyon and its current status?",
      order: 2,
    });
    const { container } = render(<XMonitorBriefings briefings={[briefing(), second]} />);

    expect([...container.querySelectorAll<HTMLDetailsElement>("details")]
      .every((details) => details.open === false)).toBe(true);
    expect(screen.getAllByText("Expand answer")).toHaveLength(2);
    expect(screen.queryByText("Collapse answer")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/Ask X Monitor/i)).not.toBeInTheDocument();
  });

  it("renders reviewed Markdown safely after expanding a briefing", async () => {
    const user = userEvent.setup();
    render(<XMonitorBriefings briefings={[briefing()]} />);
    const summary = screen.getByText("What is the 3Z architecture and its current status?")
      .closest("summary");
    expect(summary).not.toBeNull();
    await user.click(summary!);

    expect(screen.getByRole("heading", { name: "Curated questions" })).toBeInTheDocument();
    expect(screen.queryByText("Published briefings")).not.toBeInTheDocument();
    expect(within(summary!).queryByText("PGPZ reviewed")).not.toBeInTheDocument();
    expect(screen.getByText("1 topic")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Current view" })).toBeInTheDocument();
    expect(screen.getByText("three layers").tagName).toBe("STRONG");
    expect(screen.getByRole("link", { name: "Official context" })).toHaveAttribute(
      "href",
      "https://example.org/status",
    );
    expect(screen.getByText("Unsafe").closest("a")).toBeNull();
    expect(screen.queryByText(/not rendered/)).not.toBeInTheDocument();

    const source = screen.getByRole("link", { name: /@zcash/i });
    expect(source).toHaveAttribute("href", "https://x.com/i/status/1234567890123456789");
    expect(source).not.toHaveAttribute("href", "https://malicious.example/not-used");
    expect(screen.getByText(/AI-generated from monitored public X posts/)).toBeInTheDocument();
  });

  it("uses distinct expand and collapse controls and puts key points first", async () => {
    const user = userEvent.setup();
    render(<XMonitorBriefings briefings={[briefing()]} />);

    const summary = screen.getByText("What is the 3Z architecture and its current status?")
      .closest("summary");
    expect(summary).not.toBeNull();
    expect(summary!.querySelector(".lucide-plus")).toBeInTheDocument();
    expect(summary!.querySelector(".lucide-minus")).not.toBeInTheDocument();

    await user.click(summary!);
    await waitFor(() => expect(within(summary!).getByText("Collapse answer")).toBeInTheDocument());
    expect(summary!.querySelector(".lucide-minus")).toBeInTheDocument();
    expect(summary!.querySelector(".lucide-plus")).not.toBeInTheDocument();

    const keyPoints = screen.getByRole("heading", { name: "Key points" });
    const answerHeading = screen.getByRole("heading", { name: "Current view" });
    expect(
      keyPoints.compareDocumentPosition(answerHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("links published inline citation markers to numbered X sources", async () => {
    const user = userEvent.setup();
    const secondCitation = {
      status_id: "2345678901234567890",
      author_handle: "electriccoinco",
      url: "javascript:alert('not-used')",
      discovered_at: "2026-07-20T12:30:00.000Z",
      excerpt: "A second cited source excerpt.",
    };
    render(
      <XMonitorBriefings
        briefings={[briefing({
          answer_text: [
            "## Current view",
            "",
            "First claim [#1234567890123456789]. Repeated [#1234567890123456789] and second [#2345678901234567890].",
            "",
            "Legacy source [#3456789012345678901], malformed [#999], and inline code `[#1234567890123456789]`.",
            "Uncited code `[#4567890123456789012]` must not create a source.",
            "```text",
            "[#4567890123456789012]",
            "```",
            "",
            "[#1234567890123456789](https://malicious.example/hijack)",
          ].join("\n"),
          citations: [...briefing().citations, secondCitation],
          source_count: 2,
        })]}
      />,
    );
    const summary = screen.getByText("What is the 3Z architecture and its current status?")
      .closest("summary");
    await user.click(summary!);

    const sourceOneLinks = screen.getAllByRole("link", {
      name: /Source 1: open @zcash post on X in a new tab/i,
    });
    expect(sourceOneLinks).toHaveLength(3);
    sourceOneLinks.forEach((link) => {
      expect(link).toHaveAttribute("href", "https://x.com/i/status/1234567890123456789");
      expect(link).not.toHaveAttribute("href", "https://malicious.example/hijack");
    });
    expect(screen.getByRole("link", {
      name: /Source 2: open @electriccoinco post on X in a new tab/i,
    })).toHaveAttribute("href", "https://x.com/i/status/2345678901234567890");
    expect(screen.getByRole("link", {
      name: /Source 3: open the cited post on X in a new tab/i,
    })).toHaveAttribute("href", "https://x.com/i/status/3456789012345678901");
    expect(screen.getByText((_, element) => (
      element?.tagName === "P" && element.textContent?.includes("malformed [#999]") === true
    ))).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /999/ })).not.toBeInTheDocument();
    expect(screen.getByText("[#1234567890123456789]", { selector: "code" })).toBeInTheDocument();
    expect(screen.getByText(/Source 1 · @zcash/)).toBeInTheDocument();
    expect(screen.getByText(/Source 2 · @electriccoinco/)).toBeInTheDocument();
    expect(screen.getByText(/Source 3 · X post/)).toBeInTheDocument();
    expect(screen.queryByText(/Source 4 ·/)).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Source 4:/i })).not.toBeInTheDocument();
    expect(screen.getByText("3 sources")).toBeInTheDocument();
    expect(screen.getByText(/Numbered markers in the answer link directly/i)).toBeInTheDocument();
  });

  it("labels stale content while preserving the last reviewed answer", async () => {
    const user = userEvent.setup();
    render(<XMonitorBriefings briefings={[briefing({ stale: true })]} />);
    const summary = screen.getByText("What is the 3Z architecture and its current status?")
      .closest("summary");
    await user.click(summary!);

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
    expect(container.querySelector<HTMLDetailsElement>("#three-z-architecture")?.open).toBe(false);
    expect(screen.getByRole("link", { name: "Link to What is Tachyon and its current status?" }))
      .toHaveAttribute("href", "#tachyon-status");
  });

  it("retains the clicked header position and hash across disclosure changes", async () => {
    const user = userEvent.setup();
    let scheduledFrame: FrameRequestCallback | undefined;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      scheduledFrame = callback;
      return 17;
    });
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => undefined);
    render(<XMonitorBriefings briefings={[briefing()]} />);

    const summary = screen.getByText("What is the 3Z architecture and its current status?")
      .closest("summary")!;
    const details = summary.closest("details")!;
    let summaryTop = 320;
    vi.spyOn(summary, "getBoundingClientRect").mockImplementation(() => ({
      x: 0,
      y: summaryTop,
      top: summaryTop,
      right: 0,
      bottom: summaryTop,
      left: 0,
      width: 0,
      height: 0,
      toJSON: () => ({}),
    }));

    await user.click(summary);
    expect(details.open).toBe(true);
    expect(window.location.hash).toBe("#three-z-architecture");
    summaryTop = 120;
    act(() => scheduledFrame?.(0));
    expect(scrollBy).toHaveBeenCalledWith({ top: -200, left: 0, behavior: "instant" });

    await user.click(summary);
    expect(details.open).toBe(false);
    expect(window.location.hash).toBe("");
  });

  it("ignores malformed URL fragments without breaking the briefing page", () => {
    window.history.replaceState(null, "", "/x-monitor/briefings#%E0%A4%A");
    expect(() => render(<XMonitorBriefings briefings={[briefing()]} />)).not.toThrow();
    expect(screen.getByText("What is the 3Z architecture and its current status?"))
      .toBeInTheDocument();
  });
});

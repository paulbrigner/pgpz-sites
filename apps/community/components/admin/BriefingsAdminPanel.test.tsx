import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CuratedBriefingTopic, CuratedBriefingVersion } from "@pgpz/x-monitor-core/contracts";
import { BriefingsAdminPanel } from "./BriefingsAdminPanel";

const topic: CuratedBriefingTopic = {
  topic_id: "11111111-1111-4111-8111-111111111111",
  slug: "three-z-architecture",
  question: "What is the 3Z architecture and its current status?",
  category: "Protocol development",
  editorial_context: "Distinguish proposals from deployed code.",
  retrieval_config: { lookback_hours: 720 },
  answer_style: "detailed",
  refresh_interval_minutes: 1440,
  enabled: true,
  order: 1,
  next_refresh_at: "2026-07-22T12:00:00.000Z",
  last_scheduled_at: "2026-07-21T12:00:00.000Z",
  current_published_version_id: null,
  latest_run: null,
  created_at: "2026-07-21T10:00:00.000Z",
  updated_at: "2026-07-21T10:00:00.000Z",
};

const version: CuratedBriefingVersion = {
  topic_id: topic.topic_id,
  slug: topic.slug,
  question: topic.question,
  category: topic.category,
  order: topic.order,
  version_id: "22222222-2222-4222-8222-222222222222",
  version_number: 1,
  review_status: "draft",
  run_id: "33333333-3333-4333-8333-333333333333",
  source_version_id: null,
  answer_text: "## Draft answer\n\nReviewed text.",
  key_points: ["One point"],
  citations: [{
    status_id: "1234567890123456789",
    author_handle: "zcash",
    url: "https://x.com/i/status/1234567890123456789",
    discovered_at: "2026-07-20T12:00:00.000Z",
  }],
  source_count: 1,
  corpus_from: "2026-06-20T12:00:00.000Z",
  corpus_through: "2026-07-20T12:00:00.000Z",
  generated_at: "2026-07-20T13:00:00.000Z",
  stale_after: "2026-07-21T13:00:00.000Z",
  stale: false,
  models: { embedding: "embed", synthesis: "synthesis" },
  prompt_version: "curated-briefing-v1",
  provenance: {},
  reviewed_at: null,
  published_at: null,
  rejection_reason: null,
  created_at: "2026-07-20T13:00:00.000Z",
};

describe("Topic Briefings admin panel", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith(`/topics/${topic.topic_id}/versions`)) {
        return Response.json({ items: [version] });
      }
      if (path.endsWith(`/topics/${topic.topic_id}/refresh`) && init?.method === "POST") {
        return Response.json({ run_id: "run-1", status: "queued" }, { status: 202 });
      }
      if (path === "/api/admin/x-monitor/briefings" && (!init?.method || init.method === "GET")) {
        return Response.json({ items: [topic] });
      }
      return Response.json({ error: "Unexpected test request" }, { status: 500 });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("manages fixed topics and exposes the draft review workflow", async () => {
    const user = userEvent.setup();
    render(<BriefingsAdminPanel />);

    expect(await screen.findByRole("heading", { name: topic.question })).toBeInTheDocument();
    expect(screen.getByLabelText("Refresh cadence")).toHaveValue("1440");
    expect(screen.getByLabelText("Display order")).toHaveValue(1);
    expect(screen.getByText(/Lower numbers appear first; ties are alphabetical/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved display order changes appear on the member page on its next load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeInTheDocument();
    expect(screen.queryByText(/member answer prompt/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /ask/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review & history/i }));
    expect(await screen.findByRole("heading", { name: "Review version 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Answer Markdown")).toHaveValue(version.answer_text);
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save as new draft" })).toBeInTheDocument();
  });

  it("queues a refresh without publishing from the browser", async () => {
    const user = userEvent.setup();
    render(<BriefingsAdminPanel />);

    await user.click(await screen.findByRole("button", { name: "Refresh now" }));
    await screen.findByText(/new briefing draft has been queued/i);

    await waitFor(() => {
      expect(vi.mocked(fetch).mock.calls.some(([path, init]) =>
        String(path).endsWith(`/topics/${topic.topic_id}/refresh`) && init?.method === "POST",
      )).toBe(true);
    });
  });
});

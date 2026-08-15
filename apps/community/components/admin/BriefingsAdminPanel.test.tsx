import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CuratedBriefingTopic, CuratedBriefingVersion } from "@pgpz/x-monitor-core/contracts";
import { BriefingsAdminPanel } from "./BriefingsAdminPanel";

const topic: CuratedBriefingTopic & { publication_enabled: boolean; archived_at: null } = {
  topic_id: "11111111-1111-4111-8111-111111111111",
  slug: "three-z-architecture",
  question: "What is the 3Z architecture and its current status?",
  category: "Protocol development",
  editorial_context: "Distinguish proposals from deployed code.",
  retrieval_config: { lookback_hours: 720 },
  answer_style: "detailed",
  refresh_interval_minutes: 1440,
  enabled: true,
  publication_enabled: true,
  archived_at: null,
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
      if (path.endsWith(`/topics/${topic.topic_id}`) && init?.method === "PATCH") {
        return Response.json({ ...topic, ...JSON.parse(String(init.body)) });
      }
      if (path.endsWith(`/topics/${topic.topic_id}`) && init?.method === "DELETE") {
        return Response.json({ ...topic, archived: true });
      }
      if (path === "/api/admin/x-monitor/briefings" && (!init?.method || init.method === "GET")) {
        return Response.json({ items: [topic] });
      }
      return Response.json({ error: "Unexpected test request" }, { status: 500 });
    }));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("manages fixed topics and exposes the draft review workflow", async () => {
    const user = userEvent.setup();
    render(<BriefingsAdminPanel />);

    expect(await screen.findByRole("heading", { name: topic.question })).toBeInTheDocument();
    expect(screen.queryByLabelText("Refresh cadence")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Edit settings/i }));
    expect(screen.getByLabelText("Refresh cadence")).toHaveValue("1440");
    expect(screen.getByLabelText("Display order")).toHaveValue(1);
    expect(screen.getByText(/Lower numbers appear first; ties are alphabetical/i)).toBeInTheDocument();
    expect(screen.getByText(/Saved display order changes appear on the member page on its next load/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Refresh now" })).toBeInTheDocument();
    expect(screen.getByLabelText("Scheduled refresh")).toBeChecked();
    expect(screen.getByLabelText("Member publication")).toBeChecked();
    expect(screen.queryByText(/member answer prompt/i)).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /ask/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Review & history/i }));
    expect(await screen.findByRole("heading", { name: "Review version 1" })).toBeInTheDocument();
    expect(screen.getByLabelText("Briefing title")).toHaveValue(version.question);
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

  it("saves scheduled refresh and member publication independently", async () => {
    const user = userEvent.setup();
    render(<BriefingsAdminPanel />);

    await user.click(await screen.findByRole("button", { name: /Edit settings/i }));
    await user.click(screen.getByLabelText("Scheduled refresh"));
    await user.click(screen.getByRole("button", { name: "Save topic" }));

    await waitFor(() => {
      const patchCall = vi.mocked(fetch).mock.calls.find(([path, init]) =>
        String(path).endsWith(`/topics/${topic.topic_id}`) && init?.method === "PATCH",
      );
      expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
        enabled: false,
        publication_enabled: true,
      });
    });
  });

  it("removes an archived topic from the active list", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<BriefingsAdminPanel />);

    await user.click(await screen.findByRole("button", { name: /Edit settings/i }));
    await user.click(screen.getByRole("button", { name: "Archive" }));

    expect(await screen.findByText("Topic archived.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: topic.question })).not.toBeInTheDocument();
  });

  it("pages long version history and deletes a non-current version", async () => {
    const user = userEvent.setup();
    const history = Array.from({ length: 7 }, (_, index): CuratedBriefingVersion => ({
      ...version,
      version_id: `${String(index + 3).padStart(8, "0")}-2222-4222-8222-222222222222`,
      version_number: 7 - index,
      review_status: "rejected",
    }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith(`/topics/${topic.topic_id}/versions`)) {
        return Response.json({ items: history });
      }
      if (path.includes("/versions/") && init?.method === "DELETE") {
        const deletedId = path.split("/").pop();
        history.splice(history.findIndex((item) => item.version_id === deletedId), 1);
        return Response.json({ version_id: deletedId, deleted: true });
      }
      if (path === "/api/admin/x-monitor/briefings") return Response.json({ items: [topic] });
      return Response.json({ error: "Unexpected test request" }, { status: 500 });
    }));

    render(<BriefingsAdminPanel />);
    await user.click(await screen.findByRole("button", { name: /Review & history/i }));

    expect(await screen.findByText("Showing 1–5 of 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByText("Showing 6–7 of 7")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Previous" }));
    await user.click(screen.getByRole("button", { name: "Delete version" }));
    expect(await screen.findByText(/Version 7 deleted/i)).toBeInTheDocument();
    expect(screen.getByText("Showing 1–5 of 6")).toBeInTheDocument();
  });

  it("creates an editable draft from the currently published briefing", async () => {
    const user = userEvent.setup();
    const publishedVersion: CuratedBriefingVersion = {
      ...version,
      review_status: "published",
      reviewed_at: "2026-07-20T14:00:00.000Z",
      published_at: "2026-07-20T14:00:00.000Z",
    };
    const publishedTopic: CuratedBriefingTopic = {
      ...topic,
      current_published_version_id: publishedVersion.version_id,
    };
    const revisedVersion: CuratedBriefingVersion = {
      ...publishedVersion,
      version_id: "44444444-4444-4444-8444-444444444444",
      source_version_id: publishedVersion.version_id,
      version_number: 2,
      review_status: "draft",
      question: "How does the Zcash Ironwood upgrade work and when will it activate?",
      answer_text: "## Edited answer\n\nUpdated reviewed text.",
      reviewed_at: null,
      published_at: null,
    };
    let revisionSaved = false;

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input);
      if (path.endsWith(`/topics/${topic.topic_id}/versions`)) {
        return Response.json({
          items: revisionSaved ? [revisedVersion, publishedVersion] : [publishedVersion],
        });
      }
      if (path.endsWith(`/versions/${publishedVersion.version_id}`) && init?.method === "PATCH") {
        revisionSaved = true;
        return Response.json(revisedVersion, { status: 201 });
      }
      if (path === "/api/admin/x-monitor/briefings" && (!init?.method || init.method === "GET")) {
        return Response.json({ items: [publishedTopic] });
      }
      return Response.json({ error: "Unexpected test request" }, { status: 500 });
    }));

    render(<BriefingsAdminPanel />);
    await user.click(await screen.findByRole("button", { name: /Review & history/i }));

    expect(await screen.findByText(/currently published briefing/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Briefing title")).toHaveValue(publishedVersion.question);
    expect(screen.getByLabelText("Answer Markdown")).toHaveValue(publishedVersion.answer_text);
    expect(screen.getByLabelText(/Key points/i)).toHaveValue("One point");

    await user.clear(screen.getByLabelText("Briefing title"));
    await user.type(
      screen.getByLabelText("Briefing title"),
      revisedVersion.question,
    );
    await user.clear(screen.getByLabelText("Answer Markdown"));
    await user.type(
      screen.getByLabelText("Answer Markdown"),
      revisedVersion.answer_text,
    );
    await user.click(screen.getByRole("button", { name: "Save changes as new draft" }));

    expect(await screen.findByRole("heading", { name: "Review version 2" })).toBeInTheDocument();
    expect(screen.getByLabelText("Briefing title")).toHaveValue(revisedVersion.question);
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    expect(screen.getByText(/Nothing changes for members/i)).toBeInTheDocument();

    const patchCall = vi.mocked(fetch).mock.calls.find(([path, init]) =>
      String(path).endsWith(`/versions/${publishedVersion.version_id}`) && init?.method === "PATCH",
    );
    expect(patchCall).toBeDefined();
    expect(JSON.parse(String(patchCall?.[1]?.body))).toMatchObject({
      question: revisedVersion.question,
      answer_text: revisedVersion.answer_text,
      key_points: ["One point"],
    });
    expect(vi.mocked(fetch).mock.calls.some(([path]) => String(path).endsWith("/publish"))).toBe(false);
  });
});

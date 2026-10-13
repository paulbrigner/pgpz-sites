import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PolicyUpdateSummary } from "@/lib/policy-updates";
import { PolicyUpdateMailer } from "./PolicyUpdateMailer";

const draft: PolicyUpdateSummary = {
  slug: "memo",
  category: "weekly",
  categoryLabel: "Weekly Policy Memo",
  title: "Reviewable memo",
  shortTitle: "Reviewable memo",
  publishedAt: "2026-10-13",
  displayDate: "October 13, 2026",
  summary: "Memo summary",
  emailSubject: "Reviewable memo",
  emailPreheader: "Memo summary",
  coverImage: "/api/policy-updates/memo/assets/cover.png",
  pdfHref: "/api/policy-updates/memo/pdf",
  portalPath: "/updates/memo",
  source: "uploaded",
  visibilityStatus: "draft",
  generationStatus: "generated",
  generatedAt: "2026-10-13T12:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PolicyUpdateMailer publication review", () => {
  it.each([draft.generatedAt, null])("submits the selected revision %j and surfaces a stale-review conflict", async (generatedAt) => {
    const selectedDraft = { ...draft, generatedAt };
    const fetchMock = vi.fn(async (_url: string, options?: RequestInit) => {
      const response = options?.method === "POST"
        ? { error: "The update changed since it was reviewed. Refresh, review, and try publishing again." }
        : { updates: [selectedDraft], recipients: [], recipientCount: 0 };
      return new Response(JSON.stringify(response), { status: options?.method === "POST" ? 409 : 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<PolicyUpdateMailer initialUpdates={[selectedDraft]} />);
    await user.click(await screen.findByRole("button", { name: /^Publish$/ }));

    expect((await screen.findAllByText(/The update changed since it was reviewed/)).length).toBeGreaterThan(0);
    const publishRequest = fetchMock.mock.calls.find(([, options]) => options?.method === "POST");
    expect(JSON.parse(publishRequest?.[1]?.body as string)).toEqual({
      action: "publishUpdate",
      slug: draft.slug,
      expectedGeneratedAt: generatedAt,
    });
  });
});

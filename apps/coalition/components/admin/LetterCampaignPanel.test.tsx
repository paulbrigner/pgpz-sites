import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LetterCampaignPanel } from "./LetterCampaignPanel";

const draftCampaign = {
  id: "campaign-1",
  slug: "clarity-act-letter",
  title: "Support for the CLARITY Act",
  summary: "A **member-facing** summary.",
  recipient: "Senate leadership",
  deadlineAt: "2099-07-30T13:00:00.000Z",
  status: "draft",
  effectiveStatus: "draft",
  currentDocument: {
    version: 1,
    sha256: "a".repeat(64),
    fileName: "clarity-act-letter.pdf",
    fileSize: 1234,
    changeType: "initial",
    changeSummary: "Initial version",
    uploadedAt: "2026-07-27T12:00:00.000Z",
  },
  notices: [],
  signerCount: 0,
  currentSignerCount: 0,
  reconfirmationCount: 0,
};

describe("LetterCampaignPanel publishing", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("publishes a draft through a prominent guarded action", async () => {
    let published = false;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        published = true;
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(
        JSON.stringify({
          campaigns: [
            published
              ? {
                  ...draftCampaign,
                  status: "open",
                  effectiveStatus: "open",
                }
              : draftCampaign,
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();

    render(<LetterCampaignPanel />);

    const publish = await screen.findByRole("button", {
      name: "Publish and open sign-ons",
    });
    await user.click(publish);

    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining(
        "Publish this letter and open sign-ons now? Members will be able to review PDF v1",
      ),
    );
    await waitFor(() => {
      expect(
        screen.getByText(
          "Campaign published. Members can now review the current PDF and sign on.",
        ),
      ).toBeInTheDocument();
    });

    const postCall = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "POST",
    );
    expect(postCall).toBeDefined();
    expect(JSON.parse(String(postCall?.[1]?.body))).toMatchObject({
      action: "update",
      campaignId: draftCampaign.id,
      status: "open",
      title: draftCampaign.title,
      summary: draftCampaign.summary,
      recipient: draftCampaign.recipient,
      deadlineAt: draftCampaign.deadlineAt,
    });
    expect(
      screen.queryByRole("button", { name: "Publish and open sign-ons" }),
    ).not.toBeInTheDocument();
  });

  it("does not expose the publish action for an already-open campaign", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            campaigns: [
              {
                ...draftCampaign,
                status: "open",
                effectiveStatus: "open",
              },
            ],
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          },
        ),
      ),
    );

    render(<LetterCampaignPanel />);

    expect(
      await screen.findByRole("heading", {
        name: draftCampaign.title,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Publish and open sign-ons" }),
    ).not.toBeInTheDocument();
  });
});

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncBallots } from "./AsyncBallots";
import type { AsyncBallotView, MeetingSummaryView } from "./types";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const meeting: MeetingSummaryView = {
  id: "meeting-1", title: "Written consent", description: "", type: "special", format: "asynchronous",
  status: "materials-published", startAt: "2026-09-10T13:00:00.000Z", endAt: "2026-09-12T21:00:00.000Z",
  timeZone: "America/New_York", location: null, virtualUrl: null, version: 5, minutesStatus: "not-started",
};

const openBallot: AsyncBallotView = {
  id: "ballot-1", title: "Approve policy", motion: "Resolved, that the policy is approved.",
  effectiveStatus: "open", eligibleCount: 5, ballotsCast: 3, quorumRequired: 3, approvalRequired: 3,
  viewerEligible: true, viewerChoice: null, discussionMessages: [], result: null,
};

describe("AsyncBallots", () => {
  it("lets an eligible director cast a vote without exposing live totals", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(new Response(JSON.stringify({ vote: { choice: "yes" } }), { status: 200 }));
    render(<AsyncBallots meeting={meeting} ballots={[openBallot]} canManage={false} canDiscuss />);

    expect(screen.getByText("3 of 5 responses")).toBeVisible();
    expect(screen.queryByText(/Yes 3/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "yes" }));
    fireEvent.click(screen.getByRole("button", { name: "Submit vote" }));

    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalledWith(
      "/api/meetings/meeting-1/ballots",
      expect.objectContaining({ method: "POST", body: JSON.stringify({ action: "castVote", ballotId: "ballot-1", choice: "yes" }) }),
    ));
    expect(await screen.findByText("Your vote was cast and retained.")).toBeVisible();
  });

  it("shows final aggregate results and manager finalization controls only when appropriate", () => {
    const awaiting = { ...openBallot, effectiveStatus: "awaiting-finalization" as const };
    const closed: AsyncBallotView = {
      ...openBallot, id: "ballot-2", title: "Approve budget", effectiveStatus: "closed", ballotsCast: 5,
      viewerEligible: false, result: { yes: 4, no: 1, abstain: 0, recused: 0, quorumMet: true, outcome: "passed" },
    };
    render(<AsyncBallots meeting={meeting} ballots={[awaiting, closed]} canManage canDiscuss />);
    expect(screen.getByRole("button", { name: "Finalize result" })).toBeVisible();
    expect(screen.getByText("Yes 4 · No 1 · Abstain 0")).toBeVisible();
    expect(screen.getByText("passed")).toBeVisible();
  });
});

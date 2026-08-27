import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BallotDiscussion } from "./BallotDiscussion";
import type { AsyncBallotView } from "./types";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ballot: AsyncBallotView = {
  id: "ballot-1", title: "Approve policy", motion: "Resolved.", effectiveStatus: "open",
  eligibleCount: 3, ballotsCast: 1, quorumRequired: 2, approvalRequired: 2,
  viewerEligible: true, viewerChoice: null, result: null,
  discussionMessages: [
    {
      id: "message-1", replyToMessageId: null, authorName: "Ada", authorEmail: "ada@example.org",
      body: "Should the effective date move?", createdAt: "2026-09-10T13:01:00.000Z",
      updatedAt: "2026-09-10T13:01:00.000Z", editedAt: null, canEdit: true,
    },
    {
      id: "message-2", replyToMessageId: "message-1", authorName: "Grace", authorEmail: "grace@example.org",
      body: "A later date would help.", createdAt: "2026-09-10T13:02:00.000Z",
      updatedAt: "2026-09-10T13:02:00.000Z", editedAt: null, canEdit: false,
    },
  ],
};

describe("BallotDiscussion", () => {
  it("renders retained threads and posts a passkey-protected message", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(new Response(JSON.stringify({ message: { id: "message-3" } }), { status: 200 }));
    render(<BallotDiscussion meetingId="meeting-1" ballot={ballot} canDiscuss timeZone="America/New_York" />);

    expect(screen.getByText("Should the effective date move?")).toBeVisible();
    expect(screen.getByText("A later date would help.")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Add to the discussion"), { target: { value: "I suggest October 1." } });
    fireEvent.click(screen.getByRole("button", { name: "Post message" }));

    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalledWith(
      "/api/meetings/meeting-1/discussions",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ action: "createMessage", ballotId: "ballot-1", body: "I suggest October 1." }),
      }),
    ));
    expect(await screen.findByText("Your message was retained.")).toBeVisible();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("allows only eligible author edits and sends the optimistic timestamp", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(new Response(JSON.stringify({ message: { id: "message-1" } }), { status: 200 }));
    render(<BallotDiscussion meetingId="meeting-1" ballot={ballot} canDiscuss timeZone="America/New_York" />);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = screen.getByLabelText("Edit discussion message");
    fireEvent.change(editor, { target: { value: "Should the effective date move to October?" } });
    fireEvent.click(screen.getByRole("button", { name: "Save edit" }));

    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalledWith(
      "/api/meetings/meeting-1/discussions",
      expect.objectContaining({
        body: JSON.stringify({
          action: "editMessage", messageId: "message-1", expectedUpdatedAt: "2026-09-10T13:01:00.000Z",
          ballotId: "ballot-1", body: "Should the effective date move to October?",
        }),
      }),
    ));
  });

  it("preserves a closed discussion without contribution controls", () => {
    render(<BallotDiscussion meetingId="meeting-1" ballot={{ ...ballot, effectiveStatus: "closed" }} canDiscuss timeZone="America/New_York" />);
    expect(screen.getByText("Should the effective date move?")).toBeVisible();
    expect(screen.getByText("Discussion is closed and preserved with the meeting record.")).toBeVisible();
    expect(screen.queryByLabelText("Add to the discussion")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
  });
});

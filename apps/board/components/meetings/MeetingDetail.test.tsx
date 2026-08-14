import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MeetingDetail } from "./MeetingDetail";
import type { MeetingDetailView } from "./types";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));
afterEach(() => cleanup());

const detail: MeetingDetailView = {
  meeting: {
    id: "meeting-1", title: "September Board meeting", description: "Quarterly governance review.",
    type: "regular", status: "materials-published", startAt: "2026-09-18T17:00:00.000Z",
    endAt: "2026-09-18T18:30:00.000Z", timeZone: "America/New_York", location: "Online",
    virtualUrl: "https://meet.example.org/board", version: 3, minutesStatus: "not-started",
  },
  agendaItems: [{ id: "agenda-1", title: "Treasurer report", description: "Review the quarter.", kind: "discussion", order: 0, presenter: "Treasurer", durationMinutes: 20 }],
  materials: [{ id: "packet-1", title: "Board packet", description: "Meeting packet", section: "preparation", downloadHref: "/api/documents/packet-1/download", versionLabel: "v2", updatedAt: "2026-09-10T12:00:00.000Z" }],
  attendance: [{ id: "director-1", name: "Ada Director", email: "ada@example.org", status: "accepted" }],
  decisions: [], actionItems: [], deliveries: [],
};

describe("MeetingDetail", () => {
  it("organizes agenda and governed material under the meeting", () => {
    render(<MeetingDetail detail={detail} capabilities={{ canManage: false, canPrepare: false, canManageDocuments: false }} />);
    expect(screen.getByRole("heading", { level: 1, name: "September Board meeting" })).toBeVisible();
    expect(screen.getByText("Treasurer report")).toBeVisible();
    expect(screen.getByRole("link", { name: "Download Board packet" })).toHaveAttribute("href", "/api/documents/packet-1/download");
    expect(screen.getByText("Minutes will be added after the meeting.")).toBeVisible();
    expect(screen.queryByRole("link", { name: "Edit meeting" })).not.toBeInTheDocument();
  });

  it("exposes lifecycle and communication controls only to managers", () => {
    render(<MeetingDetail detail={detail} capabilities={{ canManage: true, canPrepare: true, canManageDocuments: true }} />);
    expect(screen.getByRole("link", { name: "Edit meeting" })).toHaveAttribute("href", "/meetings/meeting-1/edit");
    expect(screen.getByRole("button", { name: "Mark completed" })).toBeVisible();
    expect(screen.getByRole("combobox", { name: "Meeting message" })).toHaveValue("send-materials-ready");
    expect(screen.getByRole("button", { name: "Send" })).toBeVisible();
  });

  it("lets Legal Counsel manage governed meeting documents without operating the meeting", () => {
    render(<MeetingDetail detail={detail} capabilities={{ canManage: false, canPrepare: false, canManageDocuments: true }} />);
    expect(screen.getAllByText("Meeting document")[0]).toBeVisible();
    expect(screen.queryByText("Agenda item")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Mark completed" })).not.toBeInTheDocument();
  });

  it("lets Board Support edit drafts but not official meetings", () => {
    const { rerender } = render(<MeetingDetail detail={{ ...detail, meeting: { ...detail.meeting, status: "draft" } }} capabilities={{ canManage: false, canPrepare: true, canManageDocuments: true }} />);
    expect(screen.getByRole("link", { name: "Edit draft" })).toHaveAttribute("href", "/meetings/meeting-1/edit");
    rerender(<MeetingDetail detail={detail} capabilities={{ canManage: false, canPrepare: true, canManageDocuments: true }} />);
    expect(screen.queryByRole("link", { name: "Edit draft" })).not.toBeInTheDocument();
  });
});

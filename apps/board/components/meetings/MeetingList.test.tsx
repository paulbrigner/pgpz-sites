import { cleanup, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetingList } from "./MeetingList";
import type { MeetingSummaryView } from "./types";

afterEach(() => cleanup());

const meeting: MeetingSummaryView = {
  id: "meeting-1", title: "September Board meeting", description: "Quarterly governance review.",
  type: "regular", format: "live", status: "materials-published", startAt: "2026-09-18T17:00:00.000Z",
  endAt: "2026-09-18T18:30:00.000Z", timeZone: "America/New_York", location: "Online",
  virtualUrl: "https://meet.example.org/board", version: 3, minutesStatus: "not-started",
};

describe("MeetingList", () => {
  it("emphasizes the next meeting and links to its retained record", () => {
    render(<MeetingList meetings={[meeting]} scope="upcoming" canManage={false} />);
    expect(screen.getByText("Next meeting")).toBeVisible();
    expect(screen.getByRole("link", { name: /September Board meeting/ })).toHaveAttribute("href", "/meetings/meeting-1");
    expect(screen.getByRole("link", { name: "Upcoming" })).toHaveAttribute("aria-current", "page");
    expect(screen.queryByRole("link", { name: "Create meeting" })).not.toBeInTheDocument();
  });

  it("shows a useful empty state and lifecycle control only to meeting managers", () => {
    render(<MeetingList meetings={[]} scope="upcoming" canManage />);
    expect(screen.getByRole("heading", { name: "No upcoming meetings" })).toBeVisible();
    expect(screen.getByRole("link", { name: "Create meeting" })).toHaveAttribute("href", "/meetings/new");
  });
});

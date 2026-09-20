import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MeetingTasks } from "./MeetingTasks";
import type { ActionItemView, MeetingSummaryView } from "./types";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: mocks.fetch }));
const meeting: MeetingSummaryView = { id: "meeting", title: "Organizational meeting", description: "", type: "special", format: "asynchronous", status: "closed", startAt: "2026-09-11T12:00:00Z", endAt: "2026-09-16T21:00:00Z", timeZone: "America/New_York", location: "", virtualUrl: null, version: 3, minutesStatus: "approved" };
const task: ActionItemView = { id: "task", title: "File Articles", owner: "Secretary", dueAt: "2026-09-30T01:00:00.000Z", status: "open" };
const show = (items = [task], canPrepare = true) => render(<MeetingTasks meeting={meeting} items={items} canPrepare={canPrepare} />);
beforeEach(() => { vi.clearAllMocks();mocks.fetch.mockResolvedValue({ ok: true, json: async () => ({ meeting: { version: 4 } }) }); });
afterEach(cleanup);
describe("meeting task controls", () => {
  it("keeps terminal tasks discoverable while hiding mutations from readers", () => {
    show([task, { ...task, id: "done", title: "Insurance", status: "completed" }, { ...task, id: "cancel", title: "Old proposal", status: "cancelled" }], false);
    expect(screen.getByText("1 open · 1 completed · 1 cancelled")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Add task" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reopen task" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open tasks" }));expect(screen.queryByText("Insurance")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "All tasks" }));expect(screen.getByText("Insurance")).toBeVisible();
  });
  it.each([["Mark complete", "completed"], ["Cancel task", "cancelled"]])("%s sends only a status patch and note after server confirmation", async (label, status) => {
    show();fireEvent.click(screen.getByRole("button", { name: label }));
    fireEvent.change(screen.getByLabelText("Note (optional)"), { target: { value: "Evidence retained" } });
    fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toEqual({ action: "setActionItemStatus", meetingId: "meeting", actionItemId: "task", expectedVersion: 3, status, note: "Evidence retained" });
    expect(screen.getByRole("status")).toHaveTextContent(`Task marked ${status}.`);
  });
  it("reopens terminal tasks and edits only changed fields, preserving legacy timestamps", async () => {
    const view = show([{ ...task, status: "completed" }]);
    expect(screen.queryByRole("button", { name: "Edit task" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reopen task" }));fireEvent.click(screen.getByRole("button", { name: "Save status" }));
    await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body).status).toBe("open");
    view.rerender(<MeetingTasks meeting={{ ...meeting, version: 4 }} items={[task]} canPrepare />);
    fireEvent.click(screen.getByRole("button", { name: "Edit task" }));
    expect(screen.getByLabelText("Due date")).toHaveValue("2026-09-29");
    fireEvent.change(screen.getByLabelText("Task description"), { target: { value: "Retain receipt" } });
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body).changes).toEqual({ description: "Retain receipt" });
  });
  it("keeps edits on failure and refreshes a conflict without erasing the draft", async () => {
    mocks.fetch.mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ error: "This meeting changed." }) });
    const view=show();fireEvent.click(screen.getByRole("button", { name: "Edit task" }));
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "Paul" } });fireEvent.click(screen.getByRole("button", { name: "Save task" }));
    await screen.findByRole("alert");expect(screen.getByLabelText("Owner")).toHaveValue("Paul");
    expect(screen.getByRole("button", { name: "Save task" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Refresh tasks" }));
    view.rerender(<MeetingTasks meeting={{ ...meeting, version: 4 }} items={[{ ...task, title: "New description" }]} canPrepare />);
    expect(screen.getByLabelText("Owner")).toHaveValue("Paul");
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));await waitFor(() => expect(mocks.fetch).toHaveBeenCalledTimes(2));
    expect(JSON.parse(mocks.fetch.mock.calls[1][1].body)).toMatchObject({ expectedVersion: 4, changes: { ownerName: "Paul" } });
  });
  it("creates tasks in the same section and keeps dates as calendar dates", async () => {
    show([]);fireEvent.click(screen.getByRole("button", { name: "Add task" }));
    fireEvent.change(screen.getByLabelText("Task description"), { target: { value: "Insurance" } });
    fireEvent.change(screen.getByLabelText("Owner"), { target: { value: "Secretary" } });
    fireEvent.change(screen.getByLabelText("Due date"), { target: { value: "2026-10-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Save task" }));await waitFor(() => expect(mocks.refresh).toHaveBeenCalled());
    expect(JSON.parse(mocks.fetch.mock.calls[0][1].body)).toMatchObject({ action: "upsertActionItem", dueAt: "2026-10-01", status: "open" });
  });
});

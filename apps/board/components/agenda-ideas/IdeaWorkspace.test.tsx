import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { IdeaWorkspace } from "./IdeaWorkspace";
import type { IdeaDetail } from "@/lib/agenda-ideas";
const mocks = vi.hoisted(() => ({ refresh: vi.fn(), fetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: mocks.fetch }));
const detail = (): IdeaDetail => ({
  idea: { id: "i1", title: "Quarterly plans", description: "Develop next quarter's priorities.", presenter: "Director", preferredMeetingId: null, documentIds: [], authorAccessId: "support", authorName: "Support colleague", status: "open", reason: "", version: 1, createdAt: "2026-09-16T12:00:00Z", updatedAt: "2026-09-16T12:00:00Z", editedAt: null, scheduledMeetingId: null, agendaItemId: null },
  messages: [], history: [], viewerAccessId: "support", canManage: false, documents: [], preferredMeeting: null, scheduledMeeting: null,
});
beforeEach(() => { vi.clearAllMocks(); vi.stubGlobal("fetch", vi.fn(async () => new Response("{}"))); mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ id: "i1" }))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("Agenda idea workspace", () => {
  it("lets Board Support comment and withdraw their idea, but never shows officer controls", async () => {
    render(<IdeaWorkspace detail={detail()} choices={{ meetings: [], documents: [] }} />);
    expect(screen.getByText(/Visible to all active Board portal users/)).toBeInTheDocument();
    expect(screen.queryByText("Manage idea")).not.toBeInTheDocument();
    expect(screen.getByText("Withdraw your suggestion")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: "Include budget planning" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    await waitFor(() => expect(mocks.fetch).toHaveBeenCalled());
    const body = JSON.parse(mocks.fetch.mock.calls[0][1].body);
    expect(body).toMatchObject({ action: "comment", id: "i1", expectedVersion: 1, body: "Include budget planning" });
    expect(body.messageId).toBeTruthy();
  });
  it("gives officers reviewed agenda placement and retains the source link", () => {
    const d = detail(); d.canManage = true; d.viewerAccessId = "chair";
    render(<IdeaWorkspace detail={d} choices={{ meetings: [], documents: [] }} />);
    expect(screen.getByText("Manage idea")).toBeInTheDocument();
    expect(screen.getByText("Add to a meeting agenda")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to agenda", hidden: true })).toBeDisabled();
    expect(screen.queryByText("Withdraw your suggestion")).not.toBeInTheDocument();
  });
  it("renders literal comment text, named replies and closed discussion without a composer", () => {
    const d = detail(); d.idea.status = "closed";
    d.messages = [{ id: "c1", body: "<script>alert(1)</script>", authorAccessId: "support", authorName: "Support colleague", createdAt: d.idea.createdAt, editedAt: d.idea.createdAt, replyToId: null }];
    const { container } = render(<IdeaWorkspace detail={d} choices={{ meetings: [], documents: [] }} />);
    expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(screen.getByText(/Discussion is closed/)).toBeInTheDocument();
  });
  it("preserves the draft and explains a concurrent-write rejection", async () => {
    mocks.fetch.mockResolvedValue(new Response(JSON.stringify({ error: "This idea changed. Refresh before saving." }), { status: 409 }));
    render(<IdeaWorkspace detail={detail()} choices={{ meetings: [], documents: [] }} />);
    fireEvent.change(screen.getByLabelText("Add a comment"), { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This idea changed");
    expect(screen.getByLabelText("Add a comment")).toHaveValue("Keep my draft");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

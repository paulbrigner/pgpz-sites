import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DisclosureWorkspace } from "./DisclosureWorkspace";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import type { DisclosureView } from "@/lib/disclosures";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });
const subject = { accessId: "subject", name: "Subject", email: "subject@example.invalid", role: "member" };
const reviewer = { accessId: "reviewer", name: "Reviewer", email: "reviewer@example.invalid", role: "member" };
const initial: DisclosureView = {
  request: { id: "request", version: 3, kind: "annual", year: 2026, dueDate: null, subject, reviewer, counsel: null, excludedIds: [], policy: { documentId: "policy", versionId: "v1", sequence: 1, title: "Conflict of Interest Policy", sha256: "policy-hash", adoption: "proposed" }, createdAt: "2026-09-10T12:00:00Z", createdBy: "chair", status: "submitted", revision: 1, latestHash: "signed-hash", lastNoticeAt: null, lastNoticeStatus: null },
  draft: null, events: [], isSubject: false, isReviewer: true, isCounsel: false,
};
describe("disclosure review outcomes", () => {
  it("requires an explicit outcome and displays satisfactory completion after saving the current signed review", async () => {
    const reviewed: DisclosureView = { ...initial, request: { ...initial.request, version: 4, status: "satisfactory" }, events: [{ kind: "review", at: "2026-09-10T14:00:00Z", actor: reviewer, revision: 1, note: "Review complete and satisfactory.", outcome: "satisfactory" }] };
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({}));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(reviewed)));
    render(<DisclosureWorkspace initial={initial} candidates={[reviewer]} />);
    const select = screen.getByRole("combobox", { name: /Review outcome/ });
    expect(select).toHaveValue(""); expect(select).toBeRequired();
    expect(screen.getByRole("textbox", { name: "Private review note" })).toBeRequired();
    const independent = screen.getByRole("checkbox", { name: /I am disinterested/ });
    expect(independent).toBeRequired(); expect(independent).not.toBeChecked();
    fireEvent.change(select, { target: { value: "satisfactory" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Private review note" }), { target: { value: "Review complete and satisfactory." } });
    fireEvent.click(independent);
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Review complete — satisfactory"));
    expect(JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string)).toEqual({ action: "review", submissionHash: "signed-hash", independent: true, outcome: "satisfactory", note: "Review complete and satisfactory.", expectedVersion: 3 });
    expect(screen.getByText(/Annual disclosure and acknowledgment · Review complete — satisfactory/)).toBeVisible();
    expect(screen.getByText("Reviewer · Review complete — satisfactory · signed revision 1")).toBeVisible();
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    expect(screen.queryByRole("textbox", { name: "Private review note" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add another review note" }));
    expect(screen.getByRole("textbox", { name: "Private review note" })).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: /I am disinterested/ })).not.toBeChecked();
  });
  it.each(["satisfactory", "reviewed", "needs-information"] as const)("shows the retained %s review when reopening without requiring another submission", (outcome) => {
    const saved: DisclosureView = { ...initial, request: { ...initial.request, status: outcome }, events: [{ kind: "review", at: "2026-09-10T14:00:00Z", actor: reviewer, revision: 1, note: "Recorded finding.", outcome }] };
    const { unmount } = render(<DisclosureWorkspace initial={saved} candidates={[reviewer]} />);
    expect(screen.getByRole("status")).toHaveTextContent("Review recorded");
    expect(screen.queryByRole("button", { name: "Record review" })).not.toBeInTheDocument();
    expect(fetchWithBoardStepUp).not.toHaveBeenCalled();
    unmount();
    render(<DisclosureWorkspace initial={{ ...saved, request: { ...saved.request, status: "submitted" } }} candidates={[reviewer]} />);
    expect(screen.getByRole("button", { name: "Record review" })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("confirms a successful write even when the subsequent refresh fails", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ request: { ...initial.request, status: "satisfactory" } }));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Read unavailable")));
    render(<DisclosureWorkspace initial={initial} candidates={[reviewer]} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Review outcome/ }), { target: { value: "satisfactory" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Private review note" }), { target: { value: "Complete." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I am disinterested/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("You do not need to submit it again"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveFocus());
    expect(screen.getByRole("button", { name: "Refresh recorded review" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Record review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(fetchWithBoardStepUp).toHaveBeenCalledTimes(1);
  });
  it("puts a rejected submission error by the form, focuses it, and preserves the entered review", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ error: "The disclosure changed. Refresh before retrying." }, { status: 409 }));
    render(<DisclosureWorkspace initial={initial} candidates={[reviewer]} />);
    fireEvent.change(screen.getByRole("combobox", { name: /Review outcome/ }), { target: { value: "satisfactory" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Private review note" }), { target: { value: "Preserve this finding." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I am disinterested/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record review" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Review not confirmed"));
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Private review note" })).toHaveValue("Preserve this finding.");
    expect(screen.getByRole("combobox", { name: /Review outcome/ })).toHaveValue("satisfactory");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
  it("retains the meaning of legacy reviews and limits counsel to advice", () => {
    render(<DisclosureWorkspace initial={{ ...initial, isReviewer: false, isCounsel: true, request: { ...initial.request, status: "reviewed" }, events: [{ kind: "review", at: "2026-09-10T13:00:00Z", actor: reviewer, revision: 1, note: "Recusal documented.", outcome: "reviewed" }] }} candidates={[reviewer]} />);
    expect(screen.getByText(/Annual disclosure and acknowledgment · Review recorded/)).toBeVisible();
    expect(screen.getByText("Reviewer · Review recorded · signed revision 1")).toBeVisible();
    expect(screen.queryByRole("combobox", { name: /Review outcome/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record review" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retain counsel’s advice" })).toBeVisible();
  });
});

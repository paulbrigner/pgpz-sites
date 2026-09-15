import { cleanup, fireEvent, render as renderComponent, screen, waitFor, within } from "@testing-library/react";
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AsyncBallots } from "./AsyncBallots";
import type { AsyncBallotView, MeetingSummaryView } from "./types";
import { fetchWithBoardStepUp } from "@/lib/step-up-client";
import { CONSENT_STATEMENT, WITHDRAWAL_STATEMENT } from "@/lib/written-consents";
import { resolutionReviewFixture } from "@/lib/test-support/resolution-review";
// Existing action tests explicitly open the item before exercising its retained controls.
function render(ui: React.ReactElement) {
  const result = renderComponent(ui);
  const expand = screen.queryByRole("button", { name: "Expand shown items" });
  if (expand) fireEvent.click(expand);
  for (const summary of result.container.querySelectorAll("summary")) {
    if (["Resolution management", "See each director’s consent status"].includes(summary.textContent || "")) fireEvent.click(summary);
  }
  return result;
}
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/lib/step-up-client", () => ({ fetchWithBoardStepUp: vi.fn() }));
afterEach(() => { cleanup(); vi.clearAllMocks(); });
const meeting: MeetingSummaryView = {
  id: "meeting-1", title: "Written consent", description: "", type: "special", format: "asynchronous",
  status: "materials-published", startAt: "2026-09-10T13:00:00.000Z", endAt: "2026-09-12T21:00:00.000Z",
  timeZone: "America/New_York", location: null, virtualUrl: null, version: 5, minutesStatus: "not-started",
};
const openBallot: AsyncBallotView = {
  id: "ballot-1", title: "Approve policy", motion: "Resolved, that the policy is approved.",
  consentMode: "unanimous-v1", consent: { contentHash: "fixed-hash", startAt: meeting.startAt, endAt: meeting.endAt,
    statement: CONSENT_STATEMENT, withdrawalStatement: WITHDRAWAL_STATEMENT, directors: [], viewerReceipt: null, rosterChanged: false, adoptedAt: null },
  effectiveStatus: "open", eligibleCount: 5, ballotsCast: 4, quorumRequired: 5, approvalRequired: 5,
  viewerEligible: true, viewerChoice: null, discussionMessages: [], result: null,
};
describe("AsyncBallots", () => {
  it.each(["draft", "cancelled"] as const)("keeps retained review downloads available for a %s with invalidated materials", (effectiveStatus) => {
    const source = resolutionReviewFixture();
    const ballot: AsyncBallotView = { ...openBallot, id: source.id, title: source.title, effectiveStatus, consent: null, reviewRequired: true, review: { ...source.review!, everStarted: true, round: null, rosterChanged: false, viewerAccessId: "chair" } };
    render(<AsyncBallots meeting={meeting} ballots={[ballot]} canManage={false} canDiscuss />);
    expect(screen.getByRole("link", { name: "Download review packet" })).toHaveAttribute("href", expect.stringContaining("review-record?format=pdf"));
    expect(screen.getByRole("link", { name: "View full review record" })).toBeVisible();
    expect(screen.queryByText(/0 of 0 reviews ready/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record my review" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
    expect(screen.getByText(effectiveStatus === "cancelled" ? /This resolution was cancelled/ : /The materials changed/)).toBeVisible();
  });
  it("lets a director record a dated assessment without submitting a consent", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({}));
    const source = resolutionReviewFixture();
    const ballot: AsyncBallotView = { ...openBallot, id: source.id, title: source.title, effectiveStatus: "draft", consent: null, reviewRequired: true, review: { ...source.review!, rosterChanged: false, viewerAccessId: "chair" } };
    render(<AsyncBallots meeting={{ ...meeting, endAt: "2099-01-01T00:00:00Z" }} ballots={[ballot]} canManage={false} canDiscuss />);
    expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Date you completed this review"), { target: { value: "2026-09-09" } });
    fireEvent.change(screen.getByLabelText("Conflict review"), { target: { value: "none" } });
    fireEvent.change(screen.getByLabelText("Review outcome"), { target: { value: "ready" } });
    fireEvent.change(screen.getByRole("textbox", { name: /Your assessment and basis/ }), { target: { value: "I reviewed the duties and evidence and find these terms reasonable." } });
    fireEvent.click(screen.getByRole("checkbox", { name: /This review is not consent/ }));
    fireEvent.click(screen.getByRole("button", { name: "Record my review" }));
    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string);
    expect(body).toMatchObject({ action: "submitReview", roundId: "round-1", reviewedOn: "2026-09-09", attested: true, conflict: "none", outcome: "ready" });
    expect(body).not.toHaveProperty("signatureName");
  });
  it("blocks consent opening until review is complete and keeps the Chair's findings distinct from adoption", () => {
    const source = resolutionReviewFixture(), roster = { revision: "r1", ready: true, directors: source.review!.round!.reviewers.map((p) => ({ ...p, status: "active" })) };
    const ballot: AsyncBallotView = { ...openBallot, id: source.id, title: source.title, effectiveStatus: "draft", consent: null, reviewRequired: true, review: { ...source.review!, rosterChanged: false, viewerAccessId: "chair" } };
    const { rerender } = render(<AsyncBallots meeting={meeting} ballots={[ballot]} canManage canCoordinateReviews canDiscuss directorRoster={roster} />);
    expect(screen.getByRole("button", { name: "Open consent collection" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: /Findings presented for adoption/ })).toBeRequired();
    const complete = resolutionReviewFixture(true);
    rerender(<AsyncBallots meeting={meeting} ballots={[{ ...ballot, review: { ...complete.review!, rosterChanged: false, viewerAccessId: "chair" } }]} canManage canCoordinateReviews canDiscuss directorRoster={roster} />);
    expect(screen.getByRole("button", { name: "Open consent collection" })).toBeEnabled();
    expect(screen.getByRole("checkbox", { name: /I have assembled the required review evidence/ })).toBeRequired();
    expect(screen.queryByText("Adopted by unanimous written consent")).not.toBeInTheDocument();
  });
  it("offers review start before consent and keeps reviewed resolutions out of staff management controls", () => {
    const source = resolutionReviewFixture(), roster = { revision: "r1", ready: true, directors: source.review!.round!.reviewers.map((p) => ({ ...p, status: "active" })) };
    const ballot: AsyncBallotView = { ...openBallot, effectiveStatus: "draft", consent: null, reviewRequired: true, review: { ...source.review!, everStarted: false, round: null, rosterChanged: false, viewerAccessId: "chair" } };
    const { rerender } = render(<AsyncBallots meeting={meeting} ballots={[ballot]} canManage canCoordinateReviews canDiscuss directorRoster={roster} />);
    expect(screen.getByRole("button", { name: "Start director review" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Open consent collection" })).not.toBeInTheDocument();
    rerender(<AsyncBallots meeting={meeting} ballots={[{ ...ballot, review: undefined }]} canManage canDiscuss directorRoster={roster} />);
    expect(screen.queryByText("Edit draft resolution")).not.toBeInTheDocument();
    expect(screen.queryByText("Cancel collection without adoption")).not.toBeInTheDocument();
  });
  it.each([true, false])("shows named statuses with delivery times when viewer signing eligibility is %s", (viewerEligible) => {
    const ballot = { ...openBallot, viewerEligible, consent: { ...openBallot.consent!, directorStatuses: [
      { userId: "a", name: "Alex Director", status: "consented" as const, receivedAt: "2026-09-11T14:30:00Z" },
      { userId: "b", name: "Blair Director", status: "pending" as const, receivedAt: null },
      { userId: "c", name: "Casey Director", status: "withdrawn" as const, receivedAt: "2026-09-11T15:45:00Z" },
    ] } };
    const { rerender } = render(<AsyncBallots meeting={meeting} ballots={[ballot]} canManage={false} canDiscuss />);
    const statuses = within(screen.getByRole("region", { name: "Director consent status" }));
    expect(statuses.getByText(/Visible to directors and the Executive Director/)).toBeVisible();
    if (!viewerEligible) expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
    expect(statuses.getByText(/does not indicate opposition/)).toBeVisible();
    const rows = statuses.getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("Alex DirectorConsentedConsent received Sep 11, 2026, 10:30 AM EDT");
    expect(rows[1]).toHaveTextContent("Blair DirectorNot yet consented");
    expect(rows[1].querySelector("time")).toBeNull();
    expect(rows[2]).toHaveTextContent("Casey DirectorWithdrawnWithdrawal received Sep 11, 2026, 11:45 AM EDT");
    expect(rows[0].querySelector("time")).toHaveAttribute("dateTime", "2026-09-11T14:30:00Z");
    rerender(<AsyncBallots meeting={meeting} ballots={[openBallot]} canManage canDiscuss />);
    expect(screen.queryByRole("region", { name: "Director consent status" })).not.toBeInTheDocument();
  });
  it("distinguishes adopted documents from supporting materials and signs the effective terms", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({}));
    const docs = ["Policy", "Background"].map((title) => ({ documentId: title, versionId: "v1", title, sequence: 1, fileName: `${title}.pdf`, sha256: "digest" }));
    render(<AsyncBallots meeting={meeting} ballots={[]} canManage canDiscuss documentChoices={docs} />);
    fireEvent.click(screen.getByText("Add written resolution"));
    fireEvent.change(screen.getByLabelText("Resolution title"), { target: { value: "Adopt policy" } });
    fireEvent.change(screen.getByLabelText("Exact resolution text"), { target: { value: "Resolved, adopt Policy v1." } });
    fireEvent.click(screen.getByRole("button", { name: "Add documents" }));
    for (const doc of docs) fireEvent.click(screen.getByRole("button", { name: `Add ${doc.title} · v1` }));
    for (const [title, treatment] of [["Policy", "adopt"], ["Background", "support"]]) fireEvent.change(screen.getByLabelText(`Treatment of ${title} · v1`), { target: { value: treatment } });
    fireEvent.change(screen.getByRole("searchbox", { name: "Search documents" }), { target: { value: "no results" } });
    fireEvent.click(screen.getByRole("button", { name: "Done adding documents" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Effective date/ }), { target: { value: "October 1, 2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Save draft resolution" }));
    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string);
    expect(body.attachments).toHaveLength(2);
    expect(body.adoption).toEqual({ targets: [{ documentId: "Policy", versionId: "v1" }], effectiveTerms: "October 1, 2026" });
  });
  it("keeps exact older selections until explicitly replaced, and retains edits after a failed save", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ error: "Try again" }, { status: 409 }));
    const old = { documentId: "policy", versionId: "v1", title: "Policy", sequence: 1, fileName: "policy.pdf", sha256: "old" };
    const latest = { ...old, versionId: "v2", sequence: 2, sha256: "new" };
    render(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, effectiveStatus: "draft", consent: null, attachments: [old], adoption: { targets: [{ documentId: "policy", versionId: "v1" }], effectiveTerms: "Upon adoption" } }]} canManage canDiscuss documentChoices={[latest]} />);
    const card = within(document.getElementById("ballot-ballot-1")!);
    expect(card.getByText(openBallot.motion, { selector: "p" })).not.toBeVisible();
    fireEvent.click(card.getByText("Edit draft resolution"));
    expect(card.getByRole("combobox", { name: "Treatment of Policy · v1" })).toHaveValue("adopt");
    expect(card.getByText(/A newer version/)).toBeVisible();
    fireEvent.click(card.getByRole("button", { name: "Save draft resolution" }));
    await screen.findByText("Try again");
    expect(JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string).attachments).toEqual([{ documentId: "policy", versionId: "v1" }]);
    expect(card.getByRole("combobox", { name: "Treatment of Policy · v1" })).toHaveValue("adopt");
    fireEvent.click(card.getByRole("button", { name: "Remove Policy · v1" }));
    fireEvent.click(card.getByRole("button", { name: "Add documents" }));
    fireEvent.click(card.getByRole("button", { name: "Add Policy · v2" }));
    expect(card.getByRole("combobox", { name: "Treatment of Policy · v2" })).toHaveValue("support");
    fireEvent.click(card.getByRole("button", { name: "Save draft resolution" }));
    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalledTimes(2));
    const body = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[1][1]!.body as string);
    expect(body.attachments).toEqual([{ documentId: "policy", versionId: "v2" }]);
    expect(body.adoption).toEqual({ targets: [], effectiveTerms: "Upon adoption" });
  });
  it("adds an earlier comparison beside the clean adoption version and removes only that exact version", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ error: "Keep draft for inspection" }, { status: 409 }));
    const clean = { documentId: "articles", versionId: "v5", title: "Articles", sequence: 5, fileName: "clean.pdf", sha256: "clean" };
    const comparison = { ...clean, versionId: "v4", sequence: 4, fileName: "tracked-changes.pdf", sha256: "comparison" };
    render(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, effectiveStatus: "draft", consent: null, attachments: [clean], adoption: { targets: [{ documentId: "articles", versionId: "v5" }], effectiveTerms: "Upon filing" } }]} canManage canDiscuss documentChoices={[clean, comparison]} />);
    const card = within(document.getElementById("ballot-ballot-1")!);
    fireEvent.click(card.getByText("Edit draft resolution"));
    fireEvent.click(card.getByRole("button", { name: "Add documents" }));
    expect(card.queryByRole("button", { name: "Add Articles · v4" })).not.toBeInTheDocument();
    fireEvent.click(card.getByRole("checkbox", { name: "Show earlier versions" }));
    fireEvent.change(card.getByRole("searchbox", { name: "Search documents" }), { target: { value: "tracked-changes" } });
    fireEvent.click(card.getByRole("button", { name: "Add Articles · v4" }));
    expect(card.getByRole("combobox", { name: "Treatment of Articles · v4" })).toHaveValue("support");
    expect(card.getByRole("combobox", { name: "Treatment of Articles · v5" })).toHaveValue("adopt");
    expect(within(card.getByRole("combobox", { name: "Treatment of Articles · v4" })).getByRole("option", { name: "Adopt this document" })).toBeDisabled();
    fireEvent.click(card.getByRole("button", { name: "Done adding documents" }));
    fireEvent.change(card.getByLabelText("Description for Articles · v5 (optional)"), { target: { value: "Clean proposed Articles for approval" } });
    fireEvent.change(card.getByLabelText("Description for Articles · v4 (optional)"), { target: { value: "Tracked-changes comparison for reference" } });
    fireEvent.click(card.getByRole("button", { name: "Save draft resolution" }));
    await screen.findByText("Keep draft for inspection");
    const saved = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string);
    expect(saved.attachments).toEqual([{ documentId: "articles", versionId: "v5", description: "Clean proposed Articles for approval" }, { documentId: "articles", versionId: "v4", description: "Tracked-changes comparison for reference" }]);
    expect(card.getByLabelText("Description for Articles · v4 (optional)")).toHaveValue("Tracked-changes comparison for reference");
    expect(saved.adoption.targets).toEqual([{ documentId: "articles", versionId: "v5" }]);
    fireEvent.click(card.getByRole("button", { name: "Remove Articles · v4" }));
    expect(card.getByRole("combobox", { name: "Treatment of Articles · v5" })).toHaveValue("adopt");
    expect(card.queryByRole("combobox", { name: "Treatment of Articles · v4" })).not.toBeInTheDocument();
  });
  it("clears document selections after successfully creating a resolution", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({}));
    const doc = { documentId: "policy", versionId: "v1", title: "Policy", sequence: 1, fileName: "policy.pdf", sha256: "digest" };
    render(<AsyncBallots meeting={meeting} ballots={[]} canManage canDiscuss documentChoices={[doc]} />);
    fireEvent.click(screen.getByText("Add written resolution"));
    fireEvent.change(screen.getByLabelText("Resolution title"), { target: { value: "Policy" } });
    fireEvent.change(screen.getByLabelText("Exact resolution text"), { target: { value: "Adopt policy" } });
    fireEvent.click(screen.getByRole("button", { name: "Add documents" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Policy · v1" }));
    fireEvent.click(screen.getByRole("button", { name: "Save draft resolution" }));
    await waitFor(() => expect(screen.getByLabelText("Resolution title")).toHaveValue(""));
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expect(screen.getByText("No documents included yet.")).toBeVisible();
  });
  it("does not offer in-place editing or collection for a legacy draft", () => {
    render(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, effectiveStatus: "draft", consentMode: undefined, consent: null }]} canManage canDiscuss />);
    expect(screen.queryByText("Edit draft resolution")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open consent collection" })).not.toBeInTheDocument();
    expect(screen.getByText("Add written resolution")).toBeVisible();
  });
  it("requires an explicit signature and delivers consent to the displayed resolution hash", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ adopted: true }));
    render(<AsyncBallots meeting={meeting} ballots={[openBallot]} canManage={false} canDiscuss />);
    expect(screen.getByText(/4 of 5 directors have delivered consent/)).toBeVisible();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    const button = screen.getByRole("button", { name: "Sign and deliver consent" });
    fireEvent.click(button);
    expect(fetchWithBoardStepUp).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Full name as electronic signature"), { target: { value: "Director Five" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /I intend to electronically sign/ }));
    fireEvent.click(button);
    await waitFor(() => expect(fetchWithBoardStepUp).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string);
    expect(body).toEqual({ expectedVersion: 5, action: "signConsent", ballotId: "ballot-1", contentHash: "fixed-hash", signatureName: "Director Five", intent: true });
    expect(await screen.findByText(/This resolution is now adopted/)).toBeVisible();
  });
  it("does not expose majority finalization or signature controls on expired or legacy ballots", () => {
    render(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, effectiveStatus: "awaiting-finalization" }, { ...openBallot, id: "legacy", consentMode: undefined, consent: null }]} canManage canDiscuss />);
    expect(screen.queryByRole("button", { name: /Finalize|Sign and deliver consent/ })).not.toBeInTheDocument();
    expect(screen.getByText(/Collection ended · not adopted/)).toBeVisible();
    expect(screen.getByText(/historical ballot is not a signed written consent/)).toBeVisible();
  });
  it("blocks consent when the roster changed and presents withdrawal only before adoption", () => {
    const receipt = { id: "receipt", meetingId: "meeting-1", ballotId: "ballot-1", contentHash: "fixed-hash", accessId: "d1", authenticatedUserId: "auth1", email: "director@example.invalid", name: "Director", signatureName: "Director", action: "consent" as const, statement: CONSENT_STATEMENT, receivedAt: "2026-09-10T14:00:00Z", supersedesReceiptId: null };
    const { rerender } = render(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, consent: { ...openBallot.consent!, rosterChanged: true } }]} canManage={false} canDiscuss />);
    expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
    rerender(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, effectiveStatus: "awaiting-finalization", consent: { ...openBallot.consent!, viewerReceipt: receipt } }]} canManage={false} canDiscuss />);
    expect(screen.getByText("Withdraw my consent before adoption")).toBeVisible();
    rerender(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, effectiveStatus: "closed", consent: { ...openBallot.consent!, viewerReceipt: receipt, adoptedAt: receipt.receivedAt } }]} canManage={false} canDiscuss />);
    expect(screen.queryByText("Withdraw my consent before adoption")).not.toBeInTheDocument();
  });
});


describe("Resolution checklist navigation", () => {
  const ownReceipt = { id: "receipt", meetingId: "meeting-1", ballotId: "signed", contentHash: "fixed-hash", accessId: "d1", authenticatedUserId: "auth1", email: "director@example.invalid", name: "Director", signatureName: "Director", action: "consent" as const, statement: CONSENT_STATEMENT, receivedAt: "2026-09-10T14:00:00Z", supersedesReceiptId: null };
  const signed = { ...openBallot, id: "signed", title: "Already reviewed policy", consent: { ...openBallot.consent!, viewerReceipt: ownReceipt } };
  const cancelled = { ...openBallot, id: "cancelled", title: "Superseded employment resolution", effectiveStatus: "cancelled" as const };
  it("starts collapsed with personal status and filters completed and cancelled items out of the to-do list", () => {
    renderComponent(<AsyncBallots meeting={meeting} ballots={[openBallot, signed, cancelled]} canManage={false} canDiscuss />);
    expect(screen.getByText("1 item needs your attention")).toBeVisible();
    expect(screen.getByRole("button", { name: /Approve policy/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
    expect(screen.getByText("Your consent delivered")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Needs my attention (1)" }));
    expect(screen.getByRole("button", { name: /Approve policy/ })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Already reviewed policy|Superseded employment/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reference (1)" }));
    expect(screen.getByRole("button", { name: /Superseded employment/ })).toHaveTextContent("Cancelled · reference only");
    expect(fetchWithBoardStepUp).not.toHaveBeenCalled();
  });
  it("retains an unfinished signature when collapsed or filtered, and never signs through navigation", () => {
    renderComponent(<AsyncBallots meeting={meeting} ballots={[openBallot, signed]} canManage={false} canDiscuss />);
    const toggle = screen.getByRole("button", { name: /Approve policy/ });
    fireEvent.click(toggle);
    fireEvent.change(screen.getByRole("textbox", { name: "Full name as electronic signature" }), { target: { value: "Draft name" } });
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    fireEvent.click(toggle);
    expect(screen.getByRole("textbox", { name: "Full name as electronic signature" })).toHaveValue("Draft name");
    fireEvent.change(screen.getByRole("searchbox", { name: "Search resolutions" }), { target: { value: "no matches" } });
    expect(screen.getByText("No resolutions match this view.")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show all resolutions" }));
    expect(screen.getByRole("textbox", { name: "Full name as electronic signature" })).toHaveValue("Draft name");
    expect(fetchWithBoardStepUp).not.toHaveBeenCalled();
  });
  it("reveals a resolution linked by hash even when a filter hides it", async () => {
    const { unmount } = renderComponent(<AsyncBallots meeting={meeting} ballots={[openBallot, signed]} canManage={false} canDiscuss />);
    fireEvent.click(screen.getByRole("button", { name: "Needs my attention (1)" }));
    window.history.replaceState({}, "", "#ballot-signed");
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(screen.getByRole("button", { name: /Already reviewed policy/ })).toHaveAttribute("aria-expanded", "true"));
    expect(screen.getByRole("button", { name: "All (2)" })).toHaveAttribute("aria-pressed", "true");
    unmount(); window.history.replaceState({}, "", window.location.pathname);
  });
  it("does not invent a director checklist for staff or display signature controls", () => {
    renderComponent(<AsyncBallots meeting={meeting} ballots={[{ ...openBallot, viewerEligible: false }]} canManage={false} canDiscuss />);
    expect(screen.getByRole("heading", { name: "Resolutions" })).toBeVisible();
    expect(screen.queryByRole("button", { name: /Needs my attention/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Approve policy/ }));
    expect(screen.getByText("Viewing only")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
  });
});

// Exercise replies through the actual meeting action adapter and navigation.
describe("Assessment reply threads", () => {
  function reviewBallot(): AsyncBallotView {
    const source = resolutionReviewFixture(), round = source.review!.round!;
    return { ...openBallot, id: source.id, title: source.title, effectiveStatus: "draft", consent: null, reviewRequired: true,
      review: { ...source.review!, rosterChanged: false, viewerAccessId: "chair", threads: [{ roundId: round.id, submission: round.submissions[0], replies: [] }] } };
  }
  const activeMeeting = { ...meeting, endAt: "2099-01-01T00:00:00Z" };
  afterEach(() => { window.history.replaceState({}, "", window.location.pathname); });
  it("posts against the exact assessment without changing readiness and reports uncertain email separately", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ replyNotice: "unknown" }));
    const ballot = reviewBallot();
    render(<AsyncBallots meeting={activeMeeting} ballots={[ballot]} canManage={false} canDiscuss />);
    fireEvent.click(screen.getByText("Reply / Discuss (0) · Director 1"));
    expect(screen.queryByRole("textbox", { name: /Reply to Director 1/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reply to assessment" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Reply to Director 1/ }), { target: { value: "Please see the transition terms in section 2.5." } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await waitFor(() => expect(screen.getByText(/Your reply was saved.*email delivery could not be confirmed/)).toBeVisible());
    const body = JSON.parse(vi.mocked(fetchWithBoardStepUp).mock.calls[0][1]!.body as string);
    expect(body).toEqual({ expectedVersion: 5, action: "postReviewReply", ballotId: ballot.id, roundId: "round-1", contentHash: ballot.review!.round!.contentHash, submissionId: "assessment-0", replyToMessageId: null, body: "Please see the transition terms in section 2.5." });
    expect(screen.getByText(/1 of 5 reviews ready/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Sign and deliver consent" })).not.toBeInTheDocument();
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("preserves a reply draft after a failed save, collapse, and filtering", async () => {
    vi.mocked(fetchWithBoardStepUp).mockResolvedValue(Response.json({ error: "Refresh to read the updated assessment." }, { status: 409 }));
    const ballot = reviewBallot();
    render(<AsyncBallots meeting={activeMeeting} ballots={[ballot]} canManage={false} canDiscuss />);
    fireEvent.click(screen.getByText("Reply / Discuss (0) · Director 1"));
    fireEvent.click(screen.getByRole("button", { name: "Reply to assessment" }));
    fireEvent.change(screen.getByRole("textbox", { name: /Reply to Director 1/ }), { target: { value: "Unfinished response" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));
    await waitFor(() => expect(screen.getByText("Refresh to read the updated assessment.")).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Collapse all" }));
    fireEvent.click(screen.getByRole("button", { name: /Employment and compensation/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no matches" } });
    fireEvent.click(screen.getByRole("button", { name: "Show all resolutions" }));
    expect(screen.getByRole("textbox", { name: /Reply to Director 1/ })).toHaveValue("Unfinished response");
    expect(refresh).not.toHaveBeenCalled();
  });
  it.each(["consents", "cancelled", "expired", "inactive", "roster"])("retains read-only threads for %s", (condition) => {
    const ballot = reviewBallot();
    if (condition === "consents") ballot.effectiveStatus = "open";
    if (condition === "cancelled") ballot.effectiveStatus = "cancelled";
    if (condition === "roster") ballot.review!.rosterChanged = true;
    const context = condition === "expired" ? { ...activeMeeting, endAt: "2000-01-01T00:00:00Z" } : condition === "inactive" ? { ...activeMeeting, status: "closed" as const } : activeMeeting;
    render(<AsyncBallots meeting={context} ballots={[ballot]} canManage={false} canDiscuss />);
    fireEvent.click(screen.getByText("Replies (0) · Director 1"));
    expect(screen.getByText(/This assessment thread is read-only/)).toBeVisible();
    expect(screen.queryByRole("button", { name: "Reply to assessment" })).not.toBeInTheDocument();
  });
  it("opens a query target after returning from authentication", async () => {
    window.history.replaceState({}, "", "?reviewThread=assessment-0");
    renderComponent(<AsyncBallots meeting={activeMeeting} ballots={[reviewBallot()]} canManage={false} canDiscuss />);
    await waitFor(() => expect(document.getElementById("review-thread-assessment-0")).toHaveAttribute("open"));
    expect(screen.getByRole("button", { name: /Employment and compensation/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Reply to assessment" })).toBeVisible();
  });
  it.each([false, true])("opens an email deep link through filters to an earlier assessment: %s", async (earlier) => {
    const ballot = reviewBallot();
    if (earlier) {
      ballot.review!.threads = [{ ...ballot.review!.threads![0], roundId: "previous-round", submission: { ...ballot.review!.threads![0].submission, id: "earlier-assessment", assessment: "Original review with follow-up questions." } }];
    }
    const targetId = earlier ? "earlier-assessment" : "assessment-0";
    renderComponent(<AsyncBallots meeting={activeMeeting} ballots={[ballot]} canManage={false} canDiscuss />);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "no matches" } });
    window.history.replaceState({}, "", `#review-thread-${targetId}`);
    fireEvent(window, new HashChangeEvent("hashchange"));
    await waitFor(() => expect(document.getElementById(`review-thread-${targetId}`)).toHaveAttribute("open"));
    expect(screen.getByRole("button", { name: /Employment and compensation/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("searchbox")).toHaveValue("");
    if (earlier) {
      expect(screen.getByText("Original review with follow-up questions.")).toBeVisible();
      expect(screen.getByText(/This assessment thread is read-only/)).toBeVisible();
    }
  });
});

import { describe, expect, it } from "vitest";
import { resolutionTask } from "./resolution-task";
import { resolutionReviewFixture } from "@/lib/test-support/resolution-review";
import type { AsyncBallotView, MeetingSummaryView } from "./types";

const meeting = { status: "materials-published", endAt: "2099-01-01T00:00:00Z" } as MeetingSummaryView;
function reviewBallot(complete = false): AsyncBallotView {
  const source = resolutionReviewFixture(complete);
  return { ...source, consent: null, effectiveStatus: "draft", viewerEligible: false, viewerChoice: null, eligibleCount: 5, ballotsCast: 0, discussionMessages: [], reviewRequired: true,
    review: { ...source.review!, rosterChanged: false, viewerAccessId: "chair" } };
}
describe("director resolution tasks", () => {
  it("keeps a completed review separate from consent and reacts to a fresh review round", () => {
    expect(resolutionTask(reviewBallot(), meeting)).toMatchObject({ label: "Your review needed", bucket: "attention" });
    expect(resolutionTask(reviewBallot(true), meeting)).toMatchObject({ label: "Your review recorded", bucket: "waiting" });
    const changed = reviewBallot(true);
    changed.review!.round = null;
    expect(resolutionTask(changed, meeting)).toMatchObject({ label: "Waiting for review to start", bucket: "waiting" });
  });
  it("surfaces the viewer's unresolved conflict without changing it to readiness", () => {
    const ballot = reviewBallot(true);
    ballot.review!.round!.submissions = ballot.review!.round!.submissions.map((entry) => ({ ...entry, conflict: "needs-attention" }));
    expect(resolutionTask(ballot, meeting)).toMatchObject({ label: "You requested follow-up", bucket: "attention" });
    ballot.review!.rosterChanged = true;
    expect(resolutionTask(ballot, meeting)).toMatchObject({ label: "Paused · Chair action needed", bucket: "waiting" });
  });
  it("never lists closed, expired, cancelled, legacy, or unassigned review records as tasks", () => {
    const ballot = reviewBallot();
    expect(resolutionTask(ballot, { ...meeting, status: "closed" }).bucket).toBe("reference");
    expect(resolutionTask(ballot, { ...meeting, endAt: "2020-01-01T00:00:00Z" }).bucket).toBe("reference");
    expect(resolutionTask({ ...ballot, effectiveStatus: "cancelled" }, meeting).bucket).toBe("reference");
    expect(resolutionTask({ ...ballot, consentMode: undefined }, meeting).bucket).toBe("reference");
    expect(resolutionTask({ ...ballot, review: { ...ballot.review!, viewerAccessId: "someone-else" } }, meeting).bucket).toBe("waiting");
    expect(resolutionTask({ ...ballot, review: undefined }, meeting).label).toBe("Director review required");
  });
});

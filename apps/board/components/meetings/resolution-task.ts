import type { AsyncBallotView, MeetingSummaryView } from "./types";

export type ResolutionFilter = "all" | "attention" | "waiting" | "complete" | "reference";
export type ResolutionTask = {
  label: string;
  detail: string;
  bucket: Exclude<ResolutionFilter, "all">;
  tone: "attention" | "positive" | "neutral";
};

/** Presentation only: use the authorized viewer's records, never infer a signature from a review. */
export function resolutionTask(ballot: AsyncBallotView, meeting: MeetingSummaryView, now = Date.now()): ResolutionTask {
  const task = (label: string, detail: string, bucket: ResolutionTask["bucket"], tone: ResolutionTask["tone"] = "neutral"): ResolutionTask => ({ label, detail, bucket, tone });
  const consent = ballot.consent;
  const signed = consent?.viewerReceipt?.action === "consent";
  const withdrawn = consent?.viewerReceipt?.action === "withdraw";
  if (ballot.effectiveStatus === "cancelled") return task("Cancelled · reference only", "Not adopted. No further review or consent can be submitted to this item.", "reference");
  if (!ballot.consentMode) return task("Historical ballot", "This record is not a signed written consent.", "reference");
  if (ballot.effectiveStatus === "closed") return task(signed ? "Your consent delivered" : "Adopted", "Adopted by unanimous written consent. The record is available below.", signed ? "complete" : "reference", "positive");
  if (!["draft", "scheduled", "materials-published"].includes(meeting.status)) return task(signed ? "Your consent on record" : "Meeting closed", "This workspace is closed. Retained records remain available.", "reference");
  if (consent?.rosterChanged || ballot.review?.rosterChanged) return task("Paused · Chair action needed", signed ? "Your consent remains on record; the changed director roster requires a new collection." : "The director roster changed. The Chair must restart the applicable review or collection.", "waiting");
  if (ballot.effectiveStatus === "awaiting-finalization") return task(signed ? "Your consent on record" : withdrawn ? "Your consent withdrawn" : "Consent not delivered", "Collection ended without adoption. No new consents can be delivered.", "reference");
  if (ballot.effectiveStatus === "draft") {
    const review = ballot.review;
    const round = review?.round;
    if (ballot.reviewRequired && !review) return task("Director review required", "Review details are available to directors. Consent collection has not opened.", "waiting");
    if (!round) return task(ballot.reviewRequired ? "Waiting for review to start" : "Draft · not open", "The Chair has not opened this item for director action.", "waiting");
    if (now >= Date.parse(meeting.endAt)) return task("Review window ended", "The Chair must arrange the next steps. Earlier reviews remain on record.", "reference");
    if (!round.reviewers.some((person) => person.userId === review.viewerAccessId)) return task("Review in progress", "No review is assigned to you for this round.", "waiting");
    const own = round.submissions.find((entry) => entry.accessId === review.viewerAccessId);
    if (!own) return task("Your review needed", "Read the materials and record your assessment. Review is separate from consent.", "attention", "attention");
    if (own.outcome !== "ready" || own.conflict !== "none") return task("You requested follow-up", "Resolve your questions with the Chair and update your review when appropriate.", "attention", "attention");
    return task("Your review recorded", "Your review is complete. Consent collection has not opened; you have not consented yet.", "waiting", "positive");
  }
  if (!ballot.viewerEligible) return task("Viewing only", "You are not a required director for this consent. You can read the available materials and discussion.", "waiting");
  if (signed) return task("Your consent delivered", "Waiting for the remaining directors. You may view your receipt or withdraw before adoption.", "complete", "positive");
  if (ballot.effectiveStatus === "scheduled") return task(withdrawn ? "Your consent withdrawn" : "Consent opens later", "You can read the materials now; consent collection has not opened.", "waiting");
  if (!consent) return task("Consent unavailable", "Refresh the meeting to check this item's current record.", "waiting");
  return task(withdrawn ? "Your consent withdrawn" : "Your consent not delivered", withdrawn ? "Your withdrawal is on record. Review and decide whether to deliver a new consent." : "Review this resolution and decide whether to consent. An unsigned item does not indicate opposition.", "attention", "attention");
}

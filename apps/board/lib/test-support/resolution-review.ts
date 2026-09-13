import type { BoardAsyncBallot } from "../meetings";
import { REVIEW_ATTESTATION } from "../resolution-reviews";
import { resolutionReviewHash } from "../resolution-review-integrity";

export function resolutionReviewFixture(complete = false): BoardAsyncBallot {
  const reviewers = Array.from({ length: 5 }, (_, i) => ({ userId: i === 0 ? "chair" : `director-${i}`, name: `Director ${i}`, email: i === 0 ? "chair@example.invalid" : `director${i}@example.invalid` }));
  const ballot: BoardAsyncBallot = {
    id: "review-ballot", meetingId: "m", title: "Employment and compensation", motion: "Approve the attached employment resolution after the required compensation review.",
    status: "draft", consentMode: "unanimous-v1", consent: null, eligibleVoters: [], rosterHash: null,
    agendaItemId: null, quorumRequired: null, approvalRequired: null, openedAt: null, openedBy: null, closedAt: null, closedBy: null,
    cancellationReason: null, result: null, createdAt: "2026-09-09T10:00:00Z", createdBy: "chair@example.invalid", updatedAt: "2026-09-09T12:00:00Z", updatedBy: "chair@example.invalid",
    attachments: [{ documentId: "employment", versionId: "v2", sequence: 2, title: "Revised employment resolution", fileName: "employment.pdf", sha256: "a".repeat(64), description: "Clean version for review and approval" }],
    adoption: { targets: [{ documentId: "employment", versionId: "v2" }], effectiveTerms: "Upon adoption" },
    review: { instructions: "Review the compensation evidence, conflicts, services and outside-client transition.", everStarted: true, round: {
      id: "round-1", contentHash: "", rosterRevision: "r1", reviewers, startedAt: "2026-09-09T11:00:00Z", startedBy: reviewers[0].email,
      submissions: (complete ? reviewers : reviewers.slice(1, 2)).map((person, i) => ({ id: `assessment-${i}`, accessId: person.userId, authenticatedUserId: `private-auth-${person.userId}`, name: person.name, email: person.email, reviewedOn: "2026-09-09", recordedAt: "2026-09-09T12:00:00Z", outcome: "ready", conflict: "none", assessment: "PRIVATE_REVIEW: Considering the role, full-time responsibilities, source comparables and the organization's resources, I find the proposed compensation reasonable.", attestation: REVIEW_ATTESTATION })),
    } },
  };
  return { ...ballot, review: { ...ballot.review!, round: { ...ballot.review!.round!, contentHash: resolutionReviewHash(ballot, reviewers, "r1") } } };
}

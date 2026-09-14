import "server-only";
import { createHash } from "node:crypto";
import type { BoardAsyncBallot, BoardAsyncBallotVoter } from "./meetings";
import { REVIEW_ATTESTATION } from "./resolution-reviews";
import type { ResolutionReview } from "./resolution-reviews";

export function resolutionReviewPacket(ballot: Pick<BoardAsyncBallot, "title" | "motion" | "attachments" | "adoption" | "review">, reviewers: readonly BoardAsyncBallotVoter[], rosterRevision: string) {
  return {
    schema: 1,
    title: ballot.title, motion: ballot.motion,
    attachments: (ballot.attachments || []).map((item) => ({ documentId: item.documentId, versionId: item.versionId, sha256: item.sha256, title: item.title, fileName: item.fileName, sequence: item.sequence, description: item.description || "" })),
    adoption: ballot.adoption ? { targets: ballot.adoption.targets.map((item) => ({ documentId: item.documentId, versionId: item.versionId })), effectiveTerms: ballot.adoption.effectiveTerms } : null,
    instructions: ballot.review?.instructions || "", attestation: REVIEW_ATTESTATION,
    rosterRevision, reviewers: reviewers.map((person) => ({ userId: person.userId, name: person.name, email: person.email })).sort((a, b) => a.email.localeCompare(b.email)),
  };
}

export function resolutionReviewHash(ballot: Parameters<typeof resolutionReviewPacket>[0], reviewers: readonly BoardAsyncBallotVoter[], rosterRevision: string) {
  return createHash("sha256").update(JSON.stringify(resolutionReviewPacket(ballot, reviewers, rosterRevision))).digest("hex");
}

export function resolutionReviewRecordHash(review: ResolutionReview | undefined) {
  const round = review?.round;
  if (!round?.finalization) throw new Error("A finalized review record is required for this consent.");
  const record = {
    instructions: review!.instructions, roundId: round.id, contentHash: round.contentHash,
    rosterRevision: round.rosterRevision, startedAt: round.startedAt, startedBy: round.startedBy,
    reviewers: round.reviewers.map(({ userId, name, email }) => ({ userId, name, email })),
    submissions: round.submissions.map((entry) => ({ id: entry.id, accessId: entry.accessId, authenticatedUserId: entry.authenticatedUserId, name: entry.name, email: entry.email, reviewedOn: entry.reviewedOn, recordedAt: entry.recordedAt, outcome: entry.outcome, conflict: entry.conflict, assessment: entry.assessment, attestation: entry.attestation })),
    finalization: { findings: round.finalization.findings, confirmedAt: round.finalization.confirmedAt, confirmedBy: round.finalization.confirmedBy,
      ...(round.finalization.discussionHash === undefined ? {} : { discussionHash: round.finalization.discussionHash }) },
  };
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

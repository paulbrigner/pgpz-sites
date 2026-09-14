import "server-only";
import { createHash } from "node:crypto";
import type { ResolutionReview, ResolutionReviewReply, ResolutionReviewSubmission, ResolutionReviewThread } from "./resolution-reviews";

// Keep replies with the assessment version actually answered, even after its
// author updates their review or the Chair starts a different review round.
export function resolutionReviewThreads(review: ResolutionReview, history: readonly Record<string, unknown>[]): ResolutionReviewThread[] {
  const submissions = new Map<string, { roundId: string; submission: ResolutionReviewSubmission }>();
  const replies: ResolutionReviewReply[] = [];
  const key = (roundId: string, submissionId: string) => `${roundId}:${submissionId}`;
  for (const event of history) {
    const detail = event.detail as { roundId?: string; submission?: ResolutionReviewSubmission; reply?: ResolutionReviewReply } | undefined;
    if (event.action === "review-submitted" && detail?.roundId && detail.submission?.id) {
      submissions.set(key(detail.roundId, detail.submission.id), { roundId: detail.roundId, submission: detail.submission });
    }
    if (event.action === "review-reply-posted" && detail?.reply) replies.push(detail.reply);
  }
  for (const submission of review.round?.submissions || []) {
    submissions.set(key(review.round!.id, submission.id), { roundId: review.round!.id, submission });
  }
  for (const reply of replies) {
    if (!submissions.has(key(reply.roundId, reply.submissionId))) throw new Error("A retained reply's assessment could not be verified.");
  }
  return [...submissions.values()].map((entry) => ({
    ...entry,
    replies: replies.filter((reply) => reply.roundId === entry.roundId && reply.submissionId === entry.submission.id)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
  })).sort((a, b) => a.submission.recordedAt.localeCompare(b.submission.recordedAt) || a.submission.id.localeCompare(b.submission.id));
}

export function resolutionReviewDiscussionHash(roundId: string, threads: readonly ResolutionReviewThread[]) {
  const record = {
    schema: 1, roundId,
    threads: threads.filter((thread) => thread.roundId === roundId && thread.replies.length > 0)
      .sort((a, b) => a.submission.id.localeCompare(b.submission.id)).map(({ submission: s, replies }) => ({
        submission: { id: s.id, accessId: s.accessId, authenticatedUserId: s.authenticatedUserId, name: s.name, email: s.email, reviewedOn: s.reviewedOn, recordedAt: s.recordedAt, outcome: s.outcome, conflict: s.conflict, assessment: s.assessment, attestation: s.attestation },
        replies: [...replies].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).map((r) => ({ id: r.id, roundId: r.roundId, submissionId: r.submissionId, replyToMessageId: r.replyToMessageId, authorAccessId: r.authorAccessId, authenticatedUserId: r.authenticatedUserId, authorName: r.authorName, authorEmail: r.authorEmail, body: r.body, createdAt: r.createdAt })),
      })),
  };
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

import type { BoardAsyncBallotVoter } from "./meetings";

export const REVIEW_ATTESTATION = "I have reviewed the identified resolution and document versions, completed the requested due diligence and my conflict review, and accurately recorded my assessment below. This review is not consent to adopt the resolution.";

export interface ResolutionReviewSubmission {
  readonly id: string;
  readonly accessId: string;
  readonly authenticatedUserId: string;
  readonly name: string;
  readonly email: string;
  readonly reviewedOn: string;
  readonly recordedAt: string;
  readonly outcome: "ready" | "needs-attention";
  readonly conflict: "none" | "needs-attention";
  readonly assessment: string;
  readonly attestation: string;
}

export interface ResolutionReviewRound {
  readonly id: string;
  readonly contentHash: string;
  readonly rosterRevision: string;
  readonly reviewers: readonly BoardAsyncBallotVoter[];
  readonly startedAt: string;
  readonly startedBy: string;
  readonly submissions: readonly ResolutionReviewSubmission[];
  readonly finalization?: {
    readonly findings: string;
    readonly confirmedAt: string;
    readonly confirmedBy: string;
  };
}

export interface ResolutionReview {
  readonly instructions: string;
  /** Once started, this requirement cannot be removed from this resolution. */
  readonly everStarted: boolean;
  readonly round: ResolutionReviewRound | null;
}

export function reviewProgress(round: (Pick<ResolutionReviewRound, "reviewers"> & { submissions: readonly Pick<ResolutionReviewSubmission, "accessId" | "outcome" | "conflict">[] }) | null | undefined) {
  const reviewers = round?.reviewers || [];
  const submissions = round?.submissions || [];
  const ready = reviewers.filter((reviewer) => submissions.some((entry) => entry.accessId === reviewer.userId && entry.outcome === "ready" && entry.conflict === "none")).length;
  const attention = reviewers.filter((reviewer) => submissions.some((entry) => entry.accessId === reviewer.userId && (entry.outcome === "needs-attention" || entry.conflict === "needs-attention"))).length;
  return { total: reviewers.length, ready, attention, pending: reviewers.length - ready - attention, complete: reviewers.length > 0 && ready === reviewers.length };
}

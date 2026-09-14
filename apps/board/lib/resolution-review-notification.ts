import "server-only";
import { boardAccessRepository } from "./board-access-repository";
import { boardMeetingsRepository } from "./meetings-repository";
import { boardAuditLedger, authenticatedActor } from "./audit";
import { accessRecordGuard, isVotingDirector } from "./director-roster";
import { sendReviewReplyEmail } from "./resolution-review-email";
import type { BoardMember } from "./session";

type SavedReply = Awaited<ReturnType<typeof boardMeetingsRepository.postResolutionReviewReply>>;

/** Claim one delivery attempt after the reply commits. Never retry an uncertain send. */
export async function notifyResolutionReviewReply(member: BoardMember, saved: SavedReply): Promise<"sent" | "skipped" | "unknown"> {
  const { meeting, reply, recipient, ballotId } = saved;
  const input = { meetingId: meeting.id, ballotId, replyId: reply.id, actorEmail: member.email };
  let expectedStatus: "pending" | "sending" = "pending";
  let status: "sent" | "skipped" | "unknown" = "unknown";
  try {
    const current = await boardAccessRepository.getById(recipient.accessId);
    if (recipient.accessId === reply.authorAccessId || !current || current.status !== "active" || !isVotingDirector(current.role) || current.email !== recipient.email) status = "skipped";
    else {
      const claimed = await boardMeetingsRepository.updateResolutionReviewReplyNotice({ ...input, expectedStatus, status: "sending" }, { additionalTransactItems: [accessRecordGuard(current)] });
      if (!claimed) return "unknown";
      expectedStatus = "sending";
      await sendReviewReplyEmail({ meetingId: meeting.id, submissionId: reply.submissionId, to: current.email });
      status = "sent";
    }
  } catch { /* Provider acceptance may be uncertain; preserve the reply and do not retry. */ }
  try {
    const audit = await boardAuditLedger.buildAppendItems({ category: "meeting", action: "resolution_review_reply_email", outcome: status === "sent" ? "success" : "failure", actor: authenticatedActor(member), target: { type: "review-reply", id: reply.id, version: null }, metadata: new Map([["meetingId", meeting.id], ["status", status]]), idempotencyKey: `review-reply:${reply.id}:notice:${status}`, occurredAt: new Date().toISOString() });
    await boardMeetingsRepository.updateResolutionReviewReplyNotice({ ...input, expectedStatus, status }, { additionalTransactItems: audit.TransactItems as Record<string, unknown>[] });
  } catch { /* Email result retention must not turn a saved reply into a failed save. */ }
  return status;
}

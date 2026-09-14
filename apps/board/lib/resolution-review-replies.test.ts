// @vitest-environment node
import { describe, expect, it } from "vitest";
import { reviewFixture } from "./test-support/meeting-review-repository";
import type { PostResolutionReviewReplyInput } from "./meetings-repository";
import { resolutionReviewThreads, resolutionReviewDiscussionHash } from "./resolution-review-discussion";
import { resolutionReviewRecord, resolutionReviewRecordHtml, resolutionReviewPacket } from "./resolution-review-record";
import { reviewProgress } from "./resolution-reviews";

async function fixture() {
  const f = await reviewFixture(); await f.start(); await f.submit(1, { outcome: "needs-attention" });
  const input = async (extra: Partial<PostResolutionReviewReplyInput> = {}): Promise<PostResolutionReviewReplyInput> => {
    const current = await f.get(), round = current.asyncBallots[0].review!.round!;
    return { meetingId: f.meeting.id, ballotId: f.draft.id, expectedVersion: current.meeting.version, roundId: round.id, contentHash: round.contentHash,
      submissionId: round.submissions.find((s) => s.accessId === "director-1")!.id,
      accessRecord: f.access(0), authenticatedUserId: "auth-chair", roster: f.roster, body: "The transition exception is stated in Section 2.5.", occurredAt: "2026-09-09T16:00:00Z", ...extra };
  };
  const reply = async (extra: Partial<PostResolutionReviewReplyInput> = {}) => f.repo.postResolutionReviewReply(await input(extra));
  const history = () => f.repo.listResolutionReviewEvents(f.meeting.id, f.draft.id);
  return { ...f, input, reply, history };
}

describe("director assessment replies", () => {
  it("records attributed replies before consent starts without changing reviews or materials", async () => {
    const f = await fixture(), before = await f.get(), saved = await f.reply();
    const after = await f.get();
    expect(after.meeting.version).toBe(before.meeting.version + 1);
    expect(after.asyncBallots[0]).toEqual(before.asyncBallots[0]);
    expect(reviewProgress(after.asyncBallots[0].review!.round).attention).toBe(1);
    expect(after.asyncDiscussionMessages).toEqual([]);
    expect(saved.reply).toMatchObject({ authorAccessId: "director-0", authenticatedUserId: "auth-chair", authorName: "Director 0", createdAt: "2026-09-09T16:00:00.000Z" });
    expect(saved.recipient).toEqual({ accessId: "director-1", email: "director1@example.org" });
    expect(JSON.stringify(await f.history())).toContain(saved.reply.body);
    expect((await f.history()).every((event) => event.entityType === "RESOLUTION_REVIEW_EVENT")).toBe(true);
    await expect(f.reply({ expectedVersion: before.meeting.version })).rejects.toThrow(/updated by another/);
  });

  it("keeps nested replies in the target assessment and notifies the author actually answered", async () => {
    const f = await fixture(), root = await f.reply();
    const child = await f.reply({ accessRecord: f.access(1), replyToMessageId: root.reply.id, body: "Thank you; that addresses this point." });
    expect(child.recipient.accessId).toBe("director-0");
    const grandchild = await f.reply({ accessRecord: f.access(2), replyToMessageId: child.reply.id });
    expect(grandchild.reply.replyToMessageId).toBe(root.reply.id);
    expect(grandchild.recipient.accessId).toBe("director-1");
    await f.submit(2);
    const other = (await f.get()).asyncBallots[0].review!.round!.submissions.find((s) => s.accessId === "director-2")!;
    await expect(f.reply({ submissionId: other.id, replyToMessageId: root.reply.id })).rejects.toThrow(/not found in this assessment thread/);
  });

  it("retains earlier assessment threads and rounds without moving replies to new assessments", async () => {
    const f = await fixture(), original = await f.reply();
    await f.submit(1, { assessment: "My questions are answered.", occurredAt: "2026-09-09T17:00:00Z" });
    let review = (await f.get()).asyncBallots[0].review!;
    let threads = resolutionReviewThreads(review, await f.history());
    expect(threads).toHaveLength(2);
    expect(threads.find((t) => t.submission.id === original.reply.submissionId)?.replies).toHaveLength(1);
    expect(threads.find((t) => t.submission.id !== original.reply.submissionId)?.replies).toHaveLength(0);
    await expect(f.reply({ submissionId: original.reply.submissionId })).rejects.toThrow(/assessment changed/);
    await f.repo.upsertAsyncBallot({ ...f.draft, expectedVersion: (await f.get()).meeting.version, motion: "Revised terms", restartReview: true });
    review = (await f.get()).asyncBallots[0].review!;
    expect(review.round).toBeNull();
    threads = resolutionReviewThreads(review, await f.history());
    expect(threads.some((t) => t.replies.some((r) => r.id === original.reply.id))).toBe(true);
    await f.start(); await f.submit(1);
    await expect(f.reply({ roundId: original.reply.roundId })).rejects.toThrow(/materials changed/);
  });

  it.each(["executive-director", "legal-counsel", "board-support"] as const)("denies %s without changing state", async (role) => {
    const f = await fixture(), before = await f.get();
    await expect(f.reply({ accessRecord: { ...f.access(0), role } })).rejects.toThrow(/Only active directors/);
    expect(await f.get()).toEqual(before);
  });

  it("rejects revoked access, stale roster, invalid targets, and oversized or empty text", async () => {
    const f = await fixture();
    await expect(f.reply({ accessRecord: { ...f.access(0), status: "deactivated" } })).rejects.toThrow(/Only active directors/);
    await expect(f.reply({ accessRecord: { ...f.access(0), id: "outsider" } })).rejects.toThrow(/not on this resolution/);
    await expect(f.reply({ roster: { ...f.roster, revision: "new-roster" } })).rejects.toThrow(/roster changed/);
    await expect(f.reply({ contentHash: "wrong" })).rejects.toThrow(/materials changed/);
    await expect(f.reply({ submissionId: "other-resolution" })).rejects.toThrow(/assessment changed/);
    for (const body of ["", "a".repeat(4001), "invalid\u0000text"]) await expect(f.reply({ body })).rejects.toThrow();
    await expect(f.reply({ occurredAt: "2026-09-16T21:00:00Z" })).rejects.toThrow(/replies are closed/);
    expect((await f.history()).some((e) => e.action === "review-reply-posted")).toBe(false);
  });

  it("freezes replies with consent, exports their context, and detects tampering", async () => {
    const f = await fixture(); await f.reply({ body: "<script>PRIVATE_REPLY</script>" });
    for (let i = 0; i < 5; i++) await f.submit(i);
    await f.open();
    const ballot = (await f.get()).asyncBallots[0], history = await f.history();
    const record = resolutionReviewRecord(ballot, history);
    expect(record.integrityVerified).toBe(true);
    expect(ballot.review!.round!.finalization!.discussionHash).toMatch(/^[a-f0-9]{64}$/);
    expect(resolutionReviewRecordHtml(record)).toContain("&lt;script&gt;PRIVATE_REPLY&lt;/script&gt;");
    expect(resolutionReviewRecordHtml(record)).not.toContain("<script>");
    expect((await resolutionReviewPacket(record)).mimeType).toBe("application/pdf");
    const changed = history.map((e) => {
      if (e.action !== "review-reply-posted") return e;
      const detail = e.detail as { reply: Record<string, unknown> };
      return { ...e, detail: { ...detail, reply: { ...detail.reply, body: "Altered" } } };
    });
    expect(resolutionReviewRecord(ballot, changed).integrityVerified).toBe(false);
    expect(resolutionReviewRecord(ballot, history.filter((e) => e.action !== "review-reply-posted")).integrityVerified).toBe(false);
    await expect(f.reply()).rejects.toThrow(/replies are closed/);
  });

  it("blocks replies after cancellation", async () => {
    const f = await fixture(); await f.reply();
    await f.repo.cancelAsyncBallot({ meetingId: f.meeting.id, ballotId: f.draft.id, expectedVersion: (await f.get()).meeting.version, actorEmail: f.access(0).email, reviewCoordinator: f.access(0), reason: "Replaced" });
    await expect(f.reply()).rejects.toThrow(/replies are closed/);
    expect(resolutionReviewThreads((await f.get()).asyncBallots[0].review!, await f.history()).some((t) => t.replies.length)).toBe(true);
  });

  it("claims email once and keeps delivery bookkeeping outside the frozen discussion", async () => {
    const f = await fixture(), saved = await f.reply();
    const review = (await f.get()).asyncBallots[0].review!;
    const before = resolutionReviewDiscussionHash(review.round!.id, resolutionReviewThreads(review, await f.history()));
    const input = { meetingId: f.meeting.id, ballotId: f.draft.id, replyId: saved.reply.id, actorEmail: f.access(0).email, expectedStatus: "pending" as const, status: "sending" as const };
    const claims = await Promise.all([f.repo.updateResolutionReviewReplyNotice(input), f.repo.updateResolutionReviewReplyNotice(input)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    await f.repo.updateResolutionReviewReplyNotice({ ...input, expectedStatus: "sending", status: "sent" });
    expect(resolutionReviewDiscussionHash(review.round!.id, resolutionReviewThreads(review, await f.history()))).toBe(before);
  });

  it("rejects a reply racing consent opening and opening racing a reply", async () => {
    const f = await fixture(); for (let i = 0; i < 5; i++) await f.submit(i);
    const original = f.client.transactWrite.bind(f.client);
    let intercept = true;
    f.client.transactWrite = async (transaction) => {
      if (intercept && JSON.stringify(transaction).includes('"review-reply-posted"')) { intercept = false; await f.open(); }
      return original(transaction);
    };
    await expect(f.reply()).rejects.toThrow(/updated by another/);
    expect((await f.history()).some((e) => e.action === "review-reply-posted")).toBe(false);

    const g = await fixture(); for (let i = 0; i < 5; i++) await g.submit(i);
    const originalG = g.client.transactWrite.bind(g.client); let interceptG = true;
    g.client.transactWrite = async (transaction) => {
      if (interceptG && JSON.stringify(transaction).includes('"review-finalized"')) { interceptG = false; await g.reply(); }
      return originalG(transaction);
    };
    await expect(g.open()).rejects.toThrow(/updated by another/);
    expect((await g.get()).asyncBallots[0].status).toBe("draft");
    await g.open();
    expect(resolutionReviewRecord((await g.get()).asyncBallots[0], await g.history()).integrityVerified).toBe(true);
  });
});

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createBoardMeetingsRepository } from "./meetings-repository";
import { reviewFixture } from "./test-support/meeting-review-repository";
import { notifyResolutionReviewReply } from "./resolution-review-notification";
import { reviewReplyEmail } from "./resolution-review-email";
const mocks = vi.hoisted(() => ({ repo: null as ReturnType<typeof createBoardMeetingsRepository> | null, access: vi.fn(), send: vi.fn(), audit: vi.fn() }));
vi.mock("./board-access-repository", () => ({ boardAccessRepository: { getById: mocks.access } }));
vi.mock("./resolution-review-email", async (original) => ({ ...await original<typeof import("./resolution-review-email")>(), sendReviewReplyEmail: mocks.send }));
vi.mock("./audit", () => ({ authenticatedActor: (actor: unknown) => actor, boardAuditLedger: { buildAppendItems: async (input: unknown) => { mocks.audit(input); return { TransactItems: [] }; } } }));
vi.mock("./meetings-repository", async (original) => ({ ...await original<typeof import("./meetings-repository")>(), boardMeetingsRepository: {
  updateResolutionReviewReplyNotice: (...args: Parameters<ReturnType<typeof createBoardMeetingsRepository>["updateResolutionReviewReplyNotice"]>) => mocks.repo!.updateResolutionReviewReplyNotice(...args),
} }));
const member = { id: "auth-chair", name: "Chair", email: "director0@example.org", role: "chair" as const, isAdmin: true };
beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue(undefined); });
async function fixture(self = false) {
  const f = await reviewFixture(); await f.start(); await f.submit(self ? 0 : 1);
  const current = await f.get(), round = current.asyncBallots[0].review!.round!;
  const saved = await f.repo.postResolutionReviewReply({ meetingId: f.meeting.id, ballotId: f.draft.id, expectedVersion: current.meeting.version, roundId: round.id, contentHash: round.contentHash, submissionId: round.submissions[0].id, body: "PRIVATE_REPLY", accessRecord: f.access(0), authenticatedUserId: member.id, roster: f.roster, occurredAt: "2026-09-09T16:00:00Z" });
  mocks.repo = f.repo; mocks.access.mockResolvedValue(f.access(self ? 0 : 1));
  const status = () => [...f.client.items.values()].find((i) => i.sk === `NOTICE#${saved.reply.id}`)?.status;
  return { ...f, saved, status };
}
describe("assessment reply notifications", () => {
  it("sends one link-only email to the current director and retains its result", async () => {
    const f = await fixture();
    expect(await notifyResolutionReviewReply(member, f.saved)).toBe("sent");
    expect(mocks.send).toHaveBeenCalledExactlyOnceWith({ meetingId: f.meeting.id, submissionId: f.saved.reply.submissionId, to: "director1@example.org" });
    expect(f.status()).toBe("sent");
    expect(JSON.stringify(mocks.send.mock.calls)).not.toContain("PRIVATE_REPLY");
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("PRIVATE_REPLY");
    await notifyResolutionReviewReply(member, f.saved);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("prevents simultaneous notification attempts", async () => {
    const f = await fixture();
    await Promise.all([notifyResolutionReviewReply(member, f.saved), notifyResolutionReviewReply(member, f.saved)]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it.each(["deactivated", "staff", "changed-email", "missing"])("skips a %s recipient", async (kind) => {
    const f = await fixture();
    mocks.access.mockResolvedValue(kind === "missing" ? null : { ...f.access(1), ...(kind === "deactivated" ? { status: "deactivated" } : kind === "staff" ? { role: "executive-director" } : { email: "changed@example.org" }) });
    expect(await notifyResolutionReviewReply(member, f.saved)).toBe("skipped");
    expect(mocks.send).not.toHaveBeenCalled(); expect(f.status()).toBe("skipped");
  });
  it("does not send self-notifications", async () => {
    const f = await fixture(true);
    expect(await notifyResolutionReviewReply(member, f.saved)).toBe("skipped");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("preserves replies on uncertain delivery and does not retry", async () => {
    const f = await fixture(); mocks.send.mockRejectedValueOnce(new Error("Provider timeout"));
    expect(await notifyResolutionReviewReply(member, f.saved)).toBe("unknown");
    expect(f.status()).toBe("unknown");
    expect(JSON.stringify(await f.repo.listResolutionReviewEvents(f.meeting.id, f.draft.id))).toContain("PRIVATE_REPLY");
    await notifyResolutionReviewReply(member, f.saved);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("retains the successful reply if recording notification outcome fails", async () => {
    const f = await fixture(); mocks.audit.mockImplementationOnce(() => { throw new Error("Audit unavailable"); });
    expect(await notifyResolutionReviewReply(member, f.saved)).toBe("sent");
    expect(f.status()).toBe("sending");
    await notifyResolutionReviewReply(member, f.saved);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not send if recipient access changes during the claim", async () => {
    const f = await fixture();
    const previous = f.access(1); mocks.access.mockResolvedValue(previous);
    f.client.items.set("ACCESS#director-1#PROFILE", { ...previous, version: previous.version + 1, status: "deactivated" });
    expect(await notifyResolutionReviewReply(member, f.saved)).toBe("unknown");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("builds a private portal link and rejects recipient injection", () => {
    const input = { meetingId: "meeting-1", submissionId: "assessment-1", to: "director@example.invalid", body: "SECRET_BODY", title: "SECRET_TITLE", assessment: "SECRET_ASSESSMENT" };
    const email = reviewReplyEmail(input);
    expect(email.text).toContain("/meetings/meeting-1?reviewThread=assessment-1");
    expect(JSON.stringify(email)).not.toContain("SECRET_");
    expect(email.text).toContain("does not change your review status");
    for (const to of ["a@example.org,b@example.org", "a@example.org\r\nBcc:b@example.org"]) expect(() => reviewReplyEmail({ ...input, to })).toThrow();
  });
});

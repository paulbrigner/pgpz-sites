// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/meetings/[id]/ballots/route";
import { GET } from "@/app/api/meetings/[id]/ballots/[ballotId]/review-record/route";
import type { BoardAccessRecord } from "./board-access";
import type { createBoardMeetingsRepository } from "./meetings-repository";
import { reviewFixture } from "./test-support/meeting-review-repository";

const endpoints = vi.hoisted(() => ({ repo: null as ReturnType<typeof createBoardMeetingsRepository> | null, access: null as BoardAccessRecord | null }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => ({ status: "member", member: { id: "authenticated-user", email: endpoints.access!.email, role: endpoints.access!.role } }), canManageBoardMeetings: () => true }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => null, requireBoardStepUp: async () => null }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: async () => endpoints.access } }));
vi.mock("@/lib/audit", () => ({ authenticatedActor: (actor: unknown) => actor, boardAuditLedger: { buildAppendItems: async () => ({ TransactItems: [] }) } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: {} }));
vi.mock("@/lib/meetings-repository", async (original) => ({ ...await original<typeof import("./meetings-repository")>(), boardMeetingsRepository: {
  getAsyncBallot: (...args: Parameters<ReturnType<typeof createBoardMeetingsRepository>["getAsyncBallot"]>) => endpoints.repo!.getAsyncBallot(...args),
  listResolutionReviewEvents: (...args: Parameters<ReturnType<typeof createBoardMeetingsRepository>["listResolutionReviewEvents"]>) => endpoints.repo!.listResolutionReviewEvents(...args),
  cancelAsyncBallot: (...args: Parameters<ReturnType<typeof createBoardMeetingsRepository>["cancelAsyncBallot"]>) => endpoints.repo!.cancelAsyncBallot(...args),
  upsertAsyncBallot: (...args: Parameters<ReturnType<typeof createBoardMeetingsRepository>["upsertAsyncBallot"]>) => endpoints.repo!.upsertAsyncBallot(...args),
} }));

describe("required review transitions through real route and repository", () => {
  it.each(["cancelBallot", "saveBallot"])("rejects staff %s when the Chair enables review after the route's authorization read", async (action) => {
    const f = await reviewFixture();
    await f.repo.upsertAsyncBallot({ ...f.draft, review: null, expectedVersion: (await f.get()).meeting.version });
    const version = (await f.get()).meeting.version;
    const staff: BoardAccessRecord = { ...f.access(0), id: "staff", email: "staff@example.invalid", role: "executive-director" };
    f.client.items.set("ACCESS#staff#PROFILE", { ...staff });
    endpoints.access = staff;
    let first = true;
    endpoints.repo = { ...f.repo, getAsyncBallot: async (meetingId, ballotId) => {
      const snapshot = await f.repo.getAsyncBallot(meetingId, ballotId);
      if (first) {
        first = false;
        await f.repo.upsertAsyncBallot({ ...f.draft, expectedVersion: version });
        await f.start();
      }
      return snapshot;
    } };
    const response = await POST(new NextRequest("https://board.pgpz.org/api/ballots", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      action, ballotId: f.draft.id, expectedVersion: version + 2, reason: "Staff cancellation", title: "Staff replacement", motion: "Replace reviewed terms", restartReview: true,
    }) }), { params: Promise.resolve({ id: f.meeting.id }) });
    expect(response.status).toBe(400);
    expect(await response.text()).toContain("Only an active Board Chair");
    const current = await f.get(), ballot = current.asyncBallots[0];
    expect(current.meeting.version).toBe(version + 2);
    expect(ballot.status).toBe("draft");
    expect(ballot.title).toBe(f.draft.title);
    expect(ballot.review?.round).not.toBeNull();
    expect(ballot.updatedBy).toBe(f.access(0).email);
  });

  it("keeps earlier assessments exportable after material invalidation and cancellation", async () => {
    const f = await reviewFixture(); await f.start(); await f.submit(0);
    await f.repo.upsertAsyncBallot({ ...f.draft, expectedVersion: (await f.get()).meeting.version, motion: "Changed terms", restartReview: true });
    await f.repo.cancelAsyncBallot({ meetingId: f.meeting.id, ballotId: f.draft.id, expectedVersion: (await f.get()).meeting.version, actorEmail: f.access(0).email, reviewCoordinator: f.access(0), reason: "Use a different action" });
    endpoints.repo = f.repo; endpoints.access = f.access(1);
    const context = { params: Promise.resolve({ id: f.meeting.id, ballotId: f.draft.id }) };
    const request = (format: string) => new NextRequest(`https://board.pgpz.org/api/record?format=${format}`);
    const json = await GET(request("json"), context);
    expect(json.status).toBe(200);
    const record = await json.json();
    expect(record.round).toBeNull();
    expect(record.integrityVerified).toBeNull();
    expect(record.resolutionStatus).toBe("cancelled");
    expect(record.history.some((event: { action: string }) => event.action === "review-submitted")).toBe(true);
    expect(JSON.stringify(record.history)).toContain("Director 0 reviewed the sources");
    const html = await GET(request("html"), context);
    expect(html.status).toBe(200);
    expect(await html.text()).toContain("No current review round; earlier reviews retained");
    const pdf = await GET(request("pdf"), context);
    expect(pdf.status).toBe(200);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
  });
});

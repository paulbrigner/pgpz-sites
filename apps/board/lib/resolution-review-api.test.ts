// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/meetings/[id]/ballots/[ballotId]/review-record/route";
import { resolutionReviewFixture } from "./test-support/resolution-review";
const mocks = vi.hoisted(() => ({ anonymous: false, role: "member", status: "active", assurance: null as Response | null, ballot: vi.fn(), history: vi.fn() }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => mocks.anonymous ? { status: "anonymous" } : { status: "member", member: { email: "reader@example.invalid" } } }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.assurance }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: async () => ({ id: "reader", role: mocks.role, status: mocks.status }) } }));
vi.mock("@/lib/director-roster", () => ({ isVotingDirector: (role: string) => ["member", "chair", "admin"].includes(role) }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getAsyncBallot: mocks.ballot, listResolutionReviewEvents: mocks.history } }));
const context = { params: Promise.resolve({ id: "m", ballotId: "b" }) };
const request = (format = "json") => new NextRequest(`https://board.example.invalid/api/meetings/m/ballots/b/review-record?format=${format}`);
beforeEach(() => { vi.clearAllMocks(); mocks.anonymous = false; mocks.role = "member"; mocks.status = "active"; mocks.assurance = null; mocks.ballot.mockResolvedValue(resolutionReviewFixture()); mocks.history.mockResolvedValue([]); });
describe("review record access", () => {
  it("does not invent history for a draft whose review never started", async () => {
    const ballot = resolutionReviewFixture();
    mocks.ballot.mockResolvedValue({ ...ballot, review: { ...ballot.review, everStarted: false, round: null } });
    expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.history).not.toHaveBeenCalled();
  });
  it.each(["executive-director", "legal-counsel", "board-support"])("denies %s before fetching review content", async (role) => {
    mocks.role = role;
    const response = await GET(request(), context);
    expect(response.status).toBe(404); expect(mocks.ballot).not.toHaveBeenCalled(); expect(mocks.history).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("PRIVATE_REVIEW");
  });
  it("requires an authenticated passkey session and current active director status", async () => {
    mocks.anonymous = true; expect((await GET(request(), context)).status).toBe(401);
    mocks.anonymous = false; mocks.assurance = new Response(null, { status: 403 }); expect((await GET(request(), context)).status).toBe(403);
    mocks.assurance = null; mocks.status = "deactivated"; expect((await GET(request(), context)).status).toBe(404);
    expect(mocks.ballot).not.toHaveBeenCalled();
  });
  it("exports private JSON, escaped HTML and a PDF to directors", async () => {
    const json = await GET(request(), context);
    expect(json.headers.get("cache-control")).toBe("private, no-store");
    expect(await json.text()).toContain("PRIVATE_REVIEW");
    expect((await GET(request("html"), context)).headers.get("content-security-policy")).toContain("default-src 'none'");
    const pdf = await GET(request("pdf"), context);
    expect(pdf.headers.get("content-type")).toBe("application/pdf");
    expect(pdf.headers.get("content-disposition")).toContain("attachment;");
  });
});

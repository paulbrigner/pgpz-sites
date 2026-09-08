// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/meetings/[id]/ballots/route";
const mocks = vi.hoisted(() => ({
  anonymous: false, role: "member", currentRole: "member", stepUp: null as Response | null,
  sign: vi.fn(), save: vi.fn(), open: vi.fn(), cancel: vi.fn(), document: vi.fn(), audit: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ BOARD_ACCESS_TABLE: "Access", SITE_URL: "http://localhost:3303" }));
vi.mock("@/lib/dynamodb", () => ({ documentClient: { get: async () => ({ Item: { revision: "r1", ready: true, directors: [{ userId: "director", name: "Director", email: "director@example.invalid", status: "active" }] } }) } }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => mocks.anonymous ? { status: "anonymous" } : { status: "member", member: { id: "authenticated-director", email: "director@example.invalid", role: mocks.role } }, canManageBoardMeetings: (m: { role: string }) => ["chair", "executive-director"].includes(m.role) }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => null, requireBoardStepUp: async () => mocks.stepUp }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: async () => ({ id: "director", name: "Director", email: "director@example.invalid", status: "active", role: mocks.currentRole, version: 1 }) } }));
vi.mock("@/lib/audit", () => ({ authenticatedActor: (m: unknown) => m, boardAuditLedger: { buildAppendItems: async (input: unknown) => { mocks.audit(input); return { TransactItems: [] }; } } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: { getDocument: mocks.document } }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { signAsyncConsent: mocks.sign, upsertAsyncBallot: mocks.save, openAsyncBallot: mocks.open, cancelAsyncBallot: mocks.cancel } }));
const request = (body: unknown, origin = "http://localhost:3303") => new NextRequest("http://localhost:3303/api/meetings/m/ballots", { method: "POST", headers: { "content-type": "application/json", origin }, body: JSON.stringify(body) });
const context = { params: Promise.resolve({ id: "m" }) };
const body = { action: "signConsent", ballotId: "b", expectedVersion: 2, intent: true, signatureName: "Director", contentHash: "fixed" };
beforeEach(() => { vi.clearAllMocks(); mocks.anonymous = false; mocks.role = "member"; mocks.currentRole = "member"; mocks.stepUp = null; mocks.sign.mockResolvedValue({ adopted: false }); });
describe("written-consent endpoint", () => {
  it("binds identity and receipt time to the server, disregarding forged user and delivery claims", async () => {
    const result = await POST(request({ ...body, authenticatedUserId: "victim", occurredAt: "1999-01-01", accessRecord: { id: "victim" }, role: "chair" }), context);
    expect(result.status).toBe(200);
    const input = mocks.sign.mock.calls[0][0];
    expect(input.authenticatedUserId).toBe("authenticated-director");
    expect(input.accessRecord.id).toBe("director");
    expect(input.occurredAt).toBeUndefined();
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("signatureName");
  });
  it("requires authentication, step-up and a same-origin request before signatures are processed", async () => {
    mocks.anonymous = true;
    expect((await POST(request(body), context)).status).toBe(401);
    mocks.anonymous = false; mocks.stepUp = new Response(null, { status: 403 });
    expect((await POST(request(body), context)).status).toBe(403);
    mocks.stepUp = null;
    expect((await POST(request(body, "https://attacker.invalid"), context)).status).toBe(403);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
  it("denies manager actions after the actor loses the Chair role and retires old voting endpoints", async () => {
    mocks.role = "chair";
    expect((await POST(request({ action: "openBallot" }), context)).status).toBe(403);
    mocks.currentRole = "chair";
    expect((await POST(request({ action: "castVote" }), context)).status).toBe(409);
    expect((await POST(request({ action: "finalizeBallot" }), context)).status).toBe(409);
    expect(mocks.open).not.toHaveBeenCalled();
  });
  it("derives document hashes from stored versions and rejects stale or foreign meeting versions", async () => {
    mocks.role = "chair"; mocks.currentRole = "chair";
    const doc = { documentId: "doc", title: "Bylaws", ownerType: "library", status: "active", currentVersion: { versionId: "v2", originalFileName: "bylaws.pdf", sequence: 2, sha256: "server-hash" } };
    mocks.document.mockResolvedValue(doc);
    const save = { action: "saveBallot", ballotId: "b", expectedVersion: 2, title: "Adopt", motion: "Resolved", attachments: [{ documentId: "doc", versionId: "v1", sha256: "forged" }] };
    expect((await POST(request(save), context)).status).toBe(409);
    expect(mocks.save).not.toHaveBeenCalled();
    const current = { ...save, attachments: [{ documentId: "doc", versionId: "v2", sha256: "forged" }] };
    expect((await POST(request(current), context)).status).toBe(200);
    expect(mocks.save.mock.calls[0][0].attachments[0].sha256).toBe("server-hash");
    mocks.document.mockResolvedValue({ ...doc, ownerType: "meeting", meetingId: "other" });
    expect((await POST(request(current), context)).status).toBe(400);
  });
  it("rejects oversized bodies without processing a signature", async () => {
    expect((await POST(request({ ...body, padding: "a".repeat(70000) }), context)).status).toBe(413);
    expect(mocks.sign).not.toHaveBeenCalled();
  });
});

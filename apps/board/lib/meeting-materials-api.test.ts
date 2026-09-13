// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/meetings/[id]/materials/route";
import { BoardMeetingVersionConflictError } from "./meetings";
const mocks = vi.hoisted(() => ({ anonymous: false, manage: true, prepare: true, passkey: null as Response | null, stepUp: null as Response | null, meeting: vi.fn(), document: vi.fn(), versions: vi.fn(), add: vi.fn(), remove: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/config", () => ({ SITE_URL: "https://board.example.invalid" }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => mocks.anonymous ? { status: "anonymous" } : { status: "member", member: { id: "actor", email: "chair@example.invalid" } }, canManageBoardDocuments: () => mocks.manage, canPrepareBoardMeetings: () => mocks.prepare }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.passkey, requireBoardStepUp: async () => mocks.stepUp }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: { getDocument: mocks.document, listVersions: mocks.versions } }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getMeeting: mocks.meeting, addMaterialReference: mocks.add, removeMaterialReference: mocks.remove } }));
vi.mock("@/lib/audit", () => ({ boardAuditLedger: { buildAppendItems: mocks.audit }, authenticatedActor: (member: unknown) => member }));
const version = { versionId: "v1", sequence: 1, originalFileName: "sources.pdf", sha256: "a".repeat(64), objectKey: "PRIVATE_KEY" };
const document = { documentId: "doc", ownerType: "library", status: "active", title: "Evidence", description: "Sources", currentVersion: { ...version, versionId: "v2", sequence: 2 } };
const context = { params: Promise.resolve({ id: "m" }) };
const request = (body: Record<string, unknown> = {}, origin = "https://board.example.invalid") => new NextRequest("https://board.example.invalid/api/meetings/m/materials", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify({ action: "add", expectedVersion: 3, documentId: "doc", versionId: "v1", ...body }) });
beforeEach(() => {
  vi.clearAllMocks(); mocks.anonymous = false; mocks.manage = mocks.prepare = true; mocks.passkey = mocks.stepUp = null;
  mocks.meeting.mockResolvedValue({ meeting: { id: "m", status: "materials-published", version: 3 }, materialReferences: [{ id: "ref", status: "active" }] });
  mocks.document.mockResolvedValue(document); mocks.versions.mockResolvedValue([version]);
  mocks.audit.mockResolvedValue({ TransactItems: [{ Put: { audit: true } }] }); mocks.add.mockResolvedValue({ id: "m", version: 4 }); mocks.remove.mockResolvedValue({ id: "m", version: 4 });
});
describe("meeting library reference endpoint", () => {
  it("requires membership, document privileges, passkey, recent verification and same origin before reading records", async () => {
    mocks.anonymous = true; expect((await POST(request(), context)).status).toBe(401);
    mocks.anonymous = false; mocks.manage = false; expect((await POST(request(), context)).status).toBe(403);
    mocks.manage = true; mocks.passkey = new Response(null, { status: 403 }); expect((await POST(request(), context)).status).toBe(403);
    mocks.passkey = null; mocks.stepUp = new Response(null, { status: 403 }); expect((await POST(request(), context)).status).toBe(403);
    mocks.stepUp = null; expect((await POST(request({}, "https://foreign.invalid"), context)).status).toBe(403);
    expect(mocks.meeting).not.toHaveBeenCalled(); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("uses the exact retained version and server metadata, with an atomic audit append", async () => {
    const response = await POST(request({ title: "FORGED", sha256: "FORGED", actorEmail: "other@example.invalid" }), context);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.add).toHaveBeenCalledWith({ meetingId: "m", expectedVersion: 3, actorEmail: "chair@example.invalid", document: { documentId: "doc", versionId: "v1", title: "Evidence", description: "Sources", sequence: 1, fileName: "sources.pdf", sha256: version.sha256 } }, { additionalTransactItems: [{ Put: { audit: true } }] });
    expect(JSON.stringify(mocks.add.mock.calls)).not.toContain("PRIVATE_KEY");
  });
  it.each([null, { ...document, status: "archived" }, { ...document, ownerType: "meeting", meetingId: "other" }, { ...document, ownerType: "executive-session" }])("rejects non-library or unavailable records", async (value) => {
    mocks.document.mockResolvedValue(value); expect((await POST(request(), context)).status).toBe(400); expect(mocks.add).not.toHaveBeenCalled();
  });
  it("rejects missing versions, concealed drafts, closed meetings and stale meeting versions", async () => {
    mocks.versions.mockResolvedValue([]); expect((await POST(request(), context)).status).toBe(400);
    mocks.prepare = false; mocks.meeting.mockResolvedValue({ meeting: { status: "draft", version: 3 }, materialReferences: [] }); expect((await POST(request(), context)).status).toBe(404);
    mocks.meeting.mockResolvedValue({ meeting: { status: "completed", version: 3 }, materialReferences: [] }); expect((await POST(request(), context)).status).toBe(409);
    mocks.meeting.mockResolvedValue({ meeting: { status: "scheduled", version: 4 }, materialReferences: [] }); expect((await POST(request(), context)).status).toBe(409);
    expect(mocks.add).not.toHaveBeenCalled();
  });
  it("removes only an active reference in this meeting without deleting the library record", async () => {
    expect((await POST(request({ action: "remove", referenceId: "foreign" }), context)).status).toBe(404);
    expect(mocks.remove).not.toHaveBeenCalled();
    expect((await POST(request({ action: "remove", referenceId: "ref" }), context)).status).toBe(200);
    expect(mocks.remove.mock.calls[0][0]).toEqual({ meetingId: "m", expectedVersion: 3, actorEmail: "chair@example.invalid", referenceId: "ref" });
    expect(mocks.document).not.toHaveBeenCalled();
  });
  it("handles concurrent writes and suppresses provider details", async () => {
    mocks.add.mockRejectedValue(new BoardMeetingVersionConflictError("m")); expect((await POST(request(), context)).status).toBe(409);
    mocks.add.mockRejectedValue(new Error("PRIVATE_PROVIDER_DETAILS")); const response = await POST(request(), context);
    expect(response.status).toBe(409); expect(await response.text()).not.toContain("PRIVATE_PROVIDER_DETAILS");
  });
});

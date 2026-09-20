// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/meetings/route";
import { BoardMeetingVersionConflictError } from "./meetings";
const mocks = vi.hoisted(() => ({ role: "chair", currentRole: "chair", state: "member", active: true, passkey: null as Response | null, stepUp: null as Response | null, get: vi.fn(), update: vi.fn(), create: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/config", () => ({ SITE_URL: "https://board.example.invalid", BOARD_ACCESS_REGISTRY_ENABLED: true }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => ({ status: mocks.state, member: { id: "actor", role: mocks.role, email: "actor@example.invalid" } }), canManageBoardMeetings: () => ["chair", "admin", "executive-director"].includes(mocks.role), canPrepareBoardMeetings: () => ["chair", "admin", "executive-director", "board-support"].includes(mocks.role) }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.passkey, requireBoardStepUp: async () => mocks.stepUp }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: { getByEmail: async () => ({ id: "access", role: mocks.currentRole, status: mocks.active ? "active" : "inactive", version: 3 }) } }));
vi.mock("@/lib/director-roster", () => ({ accessRecordGuard: (record: unknown) => ({ ConditionCheck: { record } }) }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getActionItem: mocks.get, updateActionItem: mocks.update, recordActionItem: mocks.create } }));
vi.mock("@/lib/vault", () => ({ boardDocumentRepository: {} }));
vi.mock("@/lib/audit", () => ({ authenticatedActor: (member: unknown) => member, boardAuditLedger: { buildAppendItems: mocks.audit } }));
const body = { action: "setActionItemStatus", meetingId: "meeting", actionItemId: "task", expectedVersion: 2, status: "completed", note: "Receipt retained" };
const request = (value: unknown = body, origin = "https://board.example.invalid") => new NextRequest("https://board.example.invalid/api/meetings", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(value) });
beforeEach(() => { vi.clearAllMocks(); Object.assign(mocks, { role: "chair", currentRole: "chair", state: "member", active: true, passkey: null, stepUp: null }); mocks.get.mockResolvedValue({ id: "task", status: "open" }); mocks.update.mockResolvedValue({ version: 3 }); mocks.create.mockResolvedValue({ version: 3 }); mocks.audit.mockResolvedValue({ TransactItems: [{ Put: { audit: true } }] }); });
describe("task management API", () => {
  it.each(["chair", "admin", "executive-director", "board-support"])("permits %s and binds actor, access guard and audit to the update", async (role) => {
    mocks.role = role; mocks.currentRole = role;
    expect((await POST(request({ ...body, actorEmail: "forged", occurredAt: "1999-01-01", ownerId: "forged" }))).status).toBe(200);
    expect(mocks.update.mock.calls[0][0]).toEqual({ meetingId: "meeting", id: "task", expectedVersion: 2, actorEmail: "actor@example.invalid", changes: { status: "completed" }, note: "Receipt retained" });
    expect(mocks.update.mock.calls[0][1].additionalTransactItems).toHaveLength(2);
    expect(mocks.audit.mock.calls[0][0].metadata).toEqual(new Map([["taskId", "task"], ["previousStatus", "open"], ["status", "completed"]]));
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("Receipt retained");
  });
  it.each(["member", "legal-counsel"])("denies %s even when assigned as owner", async (role) => {
    mocks.role = role; expect((await POST(request({ ...body, ownerId: "actor" }))).status).toBe(403);expect(mocks.get).not.toHaveBeenCalled();
  });
  it("requires active current access, authentication, passkey, step-up and origin", async () => {
    mocks.state = "anonymous";expect((await POST(request())).status).toBe(401);
    mocks.state = "member";mocks.passkey = new Response(null, { status: 401 });expect((await POST(request())).status).toBe(401);
    mocks.passkey = null;mocks.stepUp = new Response(null, { status: 428 });expect((await POST(request())).status).toBe(428);
    mocks.stepUp = null;expect((await POST(request(body, "https://foreign.invalid"))).status).toBe(403);
    expect((await POST(request(body, ""))).status).toBe(403);
    mocks.active = false;expect((await POST(request())).status).toBe(403);
    mocks.active = true;mocks.currentRole = "member";expect((await POST(request())).status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });
  it("rejects missing IDs and invalid inputs; updates never silently create", async () => {
    expect((await POST(request({ ...body, actionItemId: "" }))).status).toBe(400);
    expect((await POST(request({ ...body, status: "done" }))).status).toBe(400);
    expect((await POST(request({ ...body, action: "editActionItem", changes: { ownerId: "forged" } }))).status).toBe(400);
    expect((await POST(request({ ...body, action: "editActionItem", changes: { status: "completed" } }))).status).toBe(400);
    mocks.get.mockResolvedValue(null);expect((await POST(request())).status).toBe(404);
    expect((await POST(request({ ...body, action: "upsertActionItem" }))).status).toBe(404);
    expect(mocks.create).not.toHaveBeenCalled();expect(mocks.update).not.toHaveBeenCalled();
  });
  it("routes legacy updates through the same patch operation and reports concurrency conflicts", async () => {
    expect((await POST(request({ ...body, action: "upsertActionItem", note: undefined }))).status).toBe(200);
    expect(mocks.update.mock.calls[0][0].changes).toEqual({ status: "completed" });
    mocks.update.mockRejectedValue(new BoardMeetingVersionConflictError("meeting"));expect((await POST(request())).status).toBe(409);
    expect((await POST(request({ action: "upsertActionItem", meetingId: "meeting", expectedVersion: 2, description: "File Articles", ownerName: "Secretary", dueAt: "2026-09-30" }))).status).toBe(200);
    expect(mocks.create.mock.calls[0][0]).toMatchObject({ description: "File Articles", ownerName: "Secretary", status: "open" });
  });
});

// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, PUT } from "@/app/api/meetings/[id]/notifications/route";
import { DEFAULT_MEETING_NOTIFICATION_PREFERENCE as defaults } from "./meeting-notifications";
const m = vi.hoisted(() => ({ anonymous: false, role: "board-support", status: "active", draft: false, assurance: null as Response | null, stepUp: null as Response | null, get: vi.fn(), save: vi.fn(), audit: vi.fn() }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => m.anonymous ? { status: "anonymous" } : { status: "member", member: { id: "auth", email: "caller@example.invalid" } } }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => m.assurance, requireBoardStepUp: async () => m.stepUp }));
vi.mock("@/lib/executive-session-access", () => ({ executiveAccessRecord: async () => ({ id: "caller", email: "caller@example.invalid", role: m.role, status: m.status }) }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getMeeting: async () => ({ meeting: { status: m.draft ? "draft" : "scheduled" }, asyncBallots: [{ id: "visible", title: "Visible", status: "open" }, { id: "hidden", title: "SECRET", status: "draft" }] }) } }));
vi.mock("@/lib/meeting-notifications-repository", () => ({ meetingNotificationsRepository: { get: m.get, save: m.save } }));
vi.mock("@/lib/audit", () => ({ boardAuditLedger: { buildAppendItems: m.audit }, authenticatedActor: () => ({}) }));
const context = { params: Promise.resolve({ id: "m" }) };
const request = (body?: unknown) => new NextRequest("https://board.example.invalid/api/meetings/m/notifications", body ? { method: "PUT", body: JSON.stringify(body) } : {});
beforeEach(() => { vi.clearAllMocks(); m.anonymous = false; m.role = "board-support"; m.status = "active"; m.draft = false; m.assurance = null; m.stepUp = null; m.get.mockResolvedValue(defaults); m.save.mockResolvedValue({ ...defaults, enabled: true, version: 1 }); m.audit.mockResolvedValue({ TransactItems: [] }); });
it("lets support users subscribe without exposing hidden draft items or other users' settings", async () => {
  const response = await GET(request(), context); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.text()).not.toContain("SECRET"); expect(m.get).toHaveBeenCalledWith("m", "caller");
  expect((await PUT(request({ ...defaults, enabled: true, accessId: "someone-else", email: "attacker@example.invalid" }), context)).status).toBe(200);
  expect(m.save.mock.calls[0][2]).toMatchObject({ id: "caller", email: "caller@example.invalid" });
  expect(m.save.mock.calls[0][3]).not.toHaveProperty("email");
});
it("enforces authentication, passkey, step-up and current registry access", async () => {
  m.anonymous = true; expect((await GET(request(), context)).status).toBe(401);
  m.anonymous = false; m.assurance = new Response(null, { status: 403 }); expect((await GET(request(), context)).status).toBe(403);
  m.assurance = null; m.status = "deactivated"; expect((await GET(request(), context)).status).toBe(403);
  m.status = "active"; m.stepUp = new Response(null, { status: 428 }); expect((await PUT(request(defaults), context)).status).toBe(428);
  expect(m.save).not.toHaveBeenCalled(); expect(m.get).not.toHaveBeenCalled();
});
it("rejects inaccessible meetings and resolutions and reports concurrent edits", async () => {
  m.role = "member"; m.draft = true; expect((await GET(request(), context)).status).toBe(404);
  m.draft = false; expect((await PUT(request({ ...defaults, enabled: true, scope: "items", ballotIds: ["hidden"] }), context)).status).toBe(400);
  expect(m.save).not.toHaveBeenCalled();
  m.save.mockRejectedValue({ name: "TransactionCanceledException" }); expect((await PUT(request(defaults), context)).status).toBe(409);
});

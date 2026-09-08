// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { executiveFakeClient, accessFixture, sessionFixture } from "./executive-session-test-helpers";
import type { BoardAccessRecord } from "./board-access";
import { createExecutiveSessionsRepository } from "./executive-sessions-repository";
import { participantCanAccess, visibleExecutiveSessions } from "./executive-session-access";
import * as collection from "@/app/api/meetings/[id]/executive-sessions/route";
import * as detail from "@/app/api/meetings/[id]/executive-sessions/[sessionId]/route";
import * as upload from "@/app/api/meetings/[id]/executive-sessions/[sessionId]/materials/route";
import * as download from "@/app/api/meetings/[id]/executive-sessions/[sessionId]/materials/[materialId]/route";
import { executiveBody } from "./executive-session-api";

const mocks = vi.hoisted(() => ({
  registry: true, access: new Map<string, BoardAccessRecord>(), actor: "director", anonymous: false, assurance: null as Response | null,
  stepUp: null as Response | null, repo: {} as ReturnType<typeof createExecutiveSessionsRepository>,
  client: {} as ReturnType<typeof executiveFakeClient>, audit: vi.fn(), retain: vi.fn(), read: vi.fn(),
}));
vi.mock("@/lib/config", () => ({ BOARD_ACCESS_REGISTRY_ENABLED: true, BOARD_ACCESS_TABLE: "Access", BOARD_MEETINGS_TABLE: "Meetings", SITE_URL: "http://localhost:3203" }));
vi.mock("@/lib/dynamodb", () => ({ documentClient: {} }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: {
  getByEmail: async (email: string) => [...mocks.access.values()].find((r) => r.email === email) || null,
  getById: async (id: string) => mocks.access.get(id) || null,
  list: async () => ({ records: [...mocks.access.values()], cursor: null }),
} }));
vi.mock("@/lib/session", () => ({ resolveBoardMemberState: async () => mocks.anonymous ? { status: "anonymous" } : {
  status: "member", member: { id: `auth-${mocks.actor}`, email: `${mocks.actor}@example.invalid`, name: mocks.actor,
    role: mocks.access.get(mocks.actor)?.role || "member", isAdmin: true },
} }));
vi.mock("@/lib/api-security", () => ({ requireBoardPasskeySession: async () => mocks.assurance, requireBoardStepUp: async () => mocks.stepUp }));
vi.mock("@/lib/audit", () => ({ authenticatedActor: (member: unknown) => member, boardAuditLedger: {
  buildAppendItems: async (input: unknown) => { mocks.audit(input); return { TransactItems: [] }; }, append: async (input: unknown) => { mocks.audit(input); },
} }));
vi.mock("@/lib/meetings-repository", () => ({ boardMeetingsRepository: { getMeeting: async () => ({ meeting: { id: "meeting-1", status: "scheduled", version: 1 } }) } }));
vi.mock("@/lib/executive-sessions-repository", async (original) => {
  const actual = await original<typeof import("./executive-sessions-repository")>();
  return { ...actual, executiveSessionsRepository: new Proxy({}, { get: (_, key) => mocks.repo[key as keyof typeof mocks.repo] }) };
});
vi.mock("@/lib/executive-session-storage", () => ({ retainExecutiveMaterial: mocks.retain, readExecutiveMaterial: mocks.read }));

const context = { params: Promise.resolve({ id: "meeting-1", sessionId: "session-1", materialId: "material-1" }) };
const request = (body?: Record<string, unknown>, origin?: string) => new NextRequest("http://localhost:3203/api/session", body ? {
  method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(body),
} : undefined);
const member = () => ({ id: `auth-${mocks.actor}`, name: mocks.actor, email: `${mocks.actor}@example.invalid`, role: mocks.access.get(mocks.actor)!.role, isAdmin: true });

beforeEach(async () => {
  vi.clearAllMocks(); mocks.actor = "director"; mocks.anonymous = false; mocks.assurance = null; mocks.stepUp = null;
  mocks.client = executiveFakeClient(); mocks.repo = createExecutiveSessionsRepository(mocks.client, "Meetings"); mocks.access.clear();
  for (const record of [accessFixture("director"), accessFixture("excluded"), accessFixture("chair", "chair"), accessFixture("ed", "executive-director"),
    accessFixture("support", "board-support"), accessFixture("counsel", "legal-counsel"), accessFixture("outsider-counsel", "legal-counsel")]) {
    mocks.access.set(record.id, record); mocks.client.seed("Access", { pk: `ACCESS#${record.id}`, sk: "PROFILE", ...record });
  }
  mocks.client.seed("Meetings", { pk: "MEETING#meeting-1", sk: "META", version: 1 });
  const session = await mocks.repo.create(sessionFixture(), []);
  await mocks.repo.append(session, { id: "material-1", title: "PRIVATE file", fileName: "private.txt", byteLength: 6,
    sha256: "sha", objectKey: "secret-object-key", mimeType: "text/plain", createdAt: "now", createdBy: "director" }, "MATERIAL", []);
  mocks.read.mockResolvedValue(new TextEncoder().encode("secret"));
});

describe("executive-session authorization boundary", () => {
  it.each(["excluded", "chair", "ed", "support", "outsider-counsel"])("conceals all private endpoints from %s despite generic admin capability", async (actor) => {
    mocks.actor = actor;
    const privateRead = vi.spyOn(mocks.repo, "get");
    expect(await visibleExecutiveSessions(member(), "meeting-1")).toEqual([]);
    const responses = await Promise.all([
      detail.GET(request(), context), detail.POST(request({ action: "message", expectedVersion: 2, body: "bypass" }), context),
      upload.POST(request({}), context), download.GET(request(), context),
    ]);
    for (const response of responses) { expect(response.status).toBe(404); expect(await response.text()).not.toContain("PRIVATE"); }
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.retain).not.toHaveBeenCalled();
    expect(privateRead).not.toHaveBeenCalled();
  });

  it.each(["director", "counsel"])("lets an explicitly selected active %s read and contribute", async (actor) => {
    mocks.actor = actor;
    const result = await detail.GET(request(), context); expect(result.status).toBe(200);
    const text = await result.text(); expect(text).toContain("PRIVATE"); expect(text).not.toContain("secret-object-key");
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect((await detail.POST(request({ action: "message", expectedVersion: 2, body: "PRIVATE contribution" }), context)).status).toBe(200);
    expect(await mocks.repo.messages("session-1")).toHaveLength(1);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("PRIVATE");
  });

  it("allows only the participating facilitating director to manage, never counsel", async () => {
    mocks.actor = "counsel";
    expect((await detail.POST(request({ action: "close", expectedVersion: 2 }), context)).status).toBe(403);
    expect((await upload.POST(request({}), context)).status).toBe(403);
    expect((await detail.POST(request({ action: "publish", expectedVersion: 2, summary: "text", confirmPublication: true }), context)).status).toBe(403);
    mocks.actor = "director";
    expect((await detail.POST(request({ action: "close", expectedVersion: 2 }), context)).status).toBe(200);
    expect((await detail.POST(request({ action: "message", expectedVersion: 3, body: "late" }), context)).status).toBe(409);
    expect((await upload.POST(request({}), context)).status).toBe(409);
    expect((await detail.POST(request({ action: "publish", expectedVersion: 3, summary: "Reviewed result" }), context)).status).toBe(400);
    expect((await detail.POST(request({ action: "publish", expectedVersion: 3, summary: "Reviewed result", confirmPublication: true }), context)).status).toBe(200);
    expect(JSON.stringify(await mocks.repo.reports("meeting-1"))).not.toContain("PRIVATE");
  });

  it("checks current status, kind, and immutable access identity on every request", async () => {
    const original = mocks.access.get("director")!;
    for (const record of [{ ...original, status: "deactivated" as const }, { ...original, status: "invited" as const },
      { ...original, role: "executive-director" as const }, { ...original, id: "replacement" }]) {
      mocks.access.set("director", record);
      expect((await detail.GET(request(), context)).status).toBe(404);
    }
    const session = sessionFixture();
    expect(participantCanAccess(session, accessFixture("new-director"))).toBe(false);
    expect(participantCanAccess(session, { ...accessFixture("counsel"), role: "member" })).toBe(false);
    expect(participantCanAccess({ ...session, participants: null as never }, original)).toBe(false);
  });

  it("requires passkey authentication and recent verification for every mutation", async () => {
    mocks.anonymous = true; expect((await detail.GET(request(), context)).status).toBe(401);
    mocks.anonymous = false; mocks.assurance = new Response(null, { status: 401 });
    expect((await download.GET(request(), context)).status).toBe(401);
    mocks.assurance = null; mocks.stepUp = new Response(null, { status: 428 });
    expect((await detail.POST(request({ action: "close", expectedVersion: 2 }), context)).status).toBe(428);
    expect((await upload.POST(request({}), context)).status).toBe(428);
  });

  it("conceals a valid session used under the wrong parent meeting", async () => {
    expect((await detail.GET(request(), { params: Promise.resolve({ id: "other-meeting", sessionId: "session-1" }) })).status).toBe(404);
  });

  it("downloads through the authenticated endpoint and rechecks revocation before returning bytes", async () => {
    let response = await download.GET(request(), context);
    expect(response.status).toBe(200); expect(await response.text()).toBe("secret");
    expect(response.headers.get("location")).toBeNull(); expect(response.headers.get("cache-control")).toContain("no-store");
    mocks.read.mockImplementationOnce(async () => { mocks.access.set("director", { ...mocks.access.get("director")!, status: "deactivated" }); return new Uint8Array(); });
    response = await download.GET(request(), context); expect(response.status).toBe(404);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("private.txt");
  });

  it("rejects cross-origin and oversized bodies", async () => {
    expect((await detail.POST(request({ action: "close", expectedVersion: 2 }, "https://other.example"), context)).status).toBe(403);
    await expect(executiveBody(new NextRequest("http://localhost", { method: "POST", body: "123456" }), 5)).rejects.toMatchObject({ status: 413 });
  });

  it("prepares the audit transaction after retention and rejects revocation during the upload", async () => {
    const form = () => {
      const data = new FormData(); data.set("title", "PRIVATE comparables"); data.set("expectedVersion", "2");
      data.set("file", new File(["private file"], "private.txt", { type: "text/plain" }));
      return new NextRequest("http://localhost:3203/api/upload", { method: "POST", body: data });
    };
    const material = { id: "material-2", title: "PRIVATE comparables", fileName: "private.txt", mimeType: "text/plain", byteLength: 12,
      sha256: "digest", objectKey: "retained-object", createdAt: "later", createdBy: "director" };
    mocks.retain.mockResolvedValueOnce(material);
    expect((await upload.POST(form(), context)).status).toBe(201);
    expect(mocks.audit.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.retain.mock.invocationCallOrder[0]);
    expect(JSON.stringify(mocks.audit.mock.calls)).not.toContain("PRIVATE comparables");
    // Reset only the session to exercise an independent in-flight revocation.
    mocks.client = executiveFakeClient(); mocks.repo = createExecutiveSessionsRepository(mocks.client, "Meetings");
    await mocks.repo.create({ ...sessionFixture(), version: 2 }, []);
    mocks.retain.mockImplementationOnce(async () => {
      mocks.client.seed("Access", { pk: "ACCESS#director", sk: "PROFILE", version: 2, status: "deactivated" });
      return material;
    });
    expect((await upload.POST(form(), context)).status).toBe(409);
    expect(await mocks.repo.materials("session-1")).toEqual([]);
  });
});

describe("explicit participant selection", () => {
  const creation = { title: "PRIVATE title", purpose: "PRIVATE recusal record", participantIds: ["director", "counsel"], facilitatorId: "director" };
  it("lets the Chair exclude herself and explicitly admit counsel, with no automatic staff or Chair access", async () => {
    mocks.actor = "chair"; const response = await collection.POST(request(creation), context);
    expect(response.status).toBe(201); const result = await response.json(); expect(result.participating).toBe(false);
    expect((await mocks.repo.get(result.id))?.participants.map((p) => p.accessId)).toEqual(["director", "counsel"]);
    expect((await detail.GET(request(), { params: Promise.resolve({ id: "meeting-1", sessionId: result.id }) })).status).toBe(404);
  });
  it.each(["ed", "support", "director", "counsel"])("does not let %s create a session", async (actor) => {
    mocks.actor = actor; expect((await collection.POST(request(creation), context)).status).toBe(403);
  });
  it("rejects staff participants, invalid facilitators, duplicate selections, and untrusted role claims", async () => {
    mocks.actor = "chair";
    for (const fields of [{ participantIds: ["director", "ed"] }, { facilitatorId: "counsel" },
      { participantIds: ["director", "director"] }, { participantIds: [{ id: "ed", role: "member" }] }]) {
      expect((await collection.POST(request({ ...creation, ...fields }), context)).status).toBe(400);
    }
  });
});

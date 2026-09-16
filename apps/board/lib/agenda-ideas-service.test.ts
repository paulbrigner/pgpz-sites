// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgendaIdeasService } from "./agenda-ideas-service";
import { createBoardMeetingsRepository } from "./meetings-repository";
import { accessFixture } from "./executive-session-test-helpers";
import { BOARD_ACCESS_TABLE } from "./config";
import type { BoardMember } from "./session";
import type { BoardAccessRecord } from "./board-access";

vi.mock("@/lib/vault", () => ({ boardDocumentRepository: {} }));
vi.mock("@/lib/audit", () => ({ boardAuditLedger: {}, authenticatedActor: (m: unknown) => m }));
vi.mock("@/lib/board-access-repository", () => ({ boardAccessRepository: {} }));
type Row = Record<string, unknown>;
type Op = { TableName: string; Key?: Row; Item?: Row; ConditionExpression?: string; ExpressionAttributeValues?: Row };
function fakeClient() {
  const data = new Map<string, Row>();
  const key = (table: string, row: Row) => `${table}|${row.pk}|${row.sk}`;
  let beforeWrite: (() => void) | undefined;
  const client = {
    data,
    seed(table: string, row: Row) { data.set(key(table, row), structuredClone(row)); },
    race(fn: () => void) { beforeWrite = fn; },
    async get(input: Op) { return { Item: structuredClone(data.get(key(input.TableName, input.Key!))) }; },
    async query(input: { TableName: string; ExpressionAttributeValues: Row; ExclusiveStartKey?: Row; ScanIndexForward?: boolean }) {
      const values = input.ExpressionAttributeValues;
      let rows = [...data.entries()].filter(([k, r]) => k.startsWith(`${input.TableName}|`) && r.pk === values[":pk"] && (!values[":prefix"] || String(r.sk).startsWith(String(values[":prefix"])))).map(([, r]) => r);
      rows.sort((a, b) => String(a.sk).localeCompare(String(b.sk)) * (input.ScanIndexForward === false ? -1 : 1));
      if (input.ExclusiveStartKey) { const i = rows.findIndex((r) => r.sk === input.ExclusiveStartKey!.sk); rows = rows.slice(i + 1); }
      const page = rows.slice(0, 2);
      return { Items: structuredClone(page), ...(rows.length > 2 ? { LastEvaluatedKey: { pk: page[1].pk, sk: page[1].sk } } : {}) };
    },
    async transactWrite({ TransactItems }: { TransactItems: Record<string, Op>[] }) {
      if (beforeWrite) { const run = beforeWrite; beforeWrite = undefined; run(); }
      const touched = new Set<string>();
      for (const transaction of TransactItems) {
        const op = transaction.Put || transaction.ConditionCheck;
        const id = key(op.TableName, op.Item || op.Key!);
        if (touched.has(id)) throw new Error("Duplicate transaction key"); touched.add(id);
        const row = data.get(id); const condition = op.ConditionExpression || ""; const values = op.ExpressionAttributeValues || {};
        const expectedVersion = values[":version"] ?? values[":expectedVersion"];
        const failed = condition.includes(" OR ")
          ? row && Number(row.version) > Number(expectedVersion)
          : (condition.includes("attribute_not_exists") && row) || (condition.includes("attribute_exists(") && !row) ||
            (condition.includes("#version") && row?.version !== expectedVersion) ||
            (condition.includes("#status") && row?.status !== values[":active"]);
        if (failed) { const e = new Error("condition failed"); e.name = "TransactionCanceledException"; throw e; }
      }
      for (const { Put } of TransactItems) if (Put) data.set(key(Put.TableName, Put.Item!), structuredClone(Put.Item!));
    },
  };
  return client;
}
const member = (role: BoardMember["role"] = "member"): BoardMember => ({ id: `${role}-auth`, email: `${role}@example.invalid`, name: role, role, isAdmin: role === "chair" });
let actor: BoardAccessRecord;
let client: ReturnType<typeof fakeClient>;
let service: ReturnType<typeof createAgendaIdeasService>;
let meetings: ReturnType<typeof createBoardMeetingsRepository>;
let deps: NonNullable<Parameters<typeof createAgendaIdeasService>[0]>;
const table = "ideas-test";
const create = (id = "idea-1") => ({ action: "create", id, title: "Quarterly priorities", description: "Discuss next quarter", presenter: "Director", documentIds: [] });
const version = async (id = "idea-1") => (await service.detail(member(), id)).idea.version;
function setActor(role: BoardMember["role"] = "member") {
  actor = accessFixture(role, role);
  client.seed(BOARD_ACCESS_TABLE, { pk: `ACCESS#${actor.id}`, sk: "PROFILE", ...actor });
}
beforeEach(() => {
  client = fakeClient(); setActor(); meetings = createBoardMeetingsRepository(client, table);
  deps = {
    client, table, meetings,
    access: { getByEmail: vi.fn(async () => actor) } as unknown as typeof deps.access,
    documents: { getDocument: vi.fn(async () => null), listDocuments: vi.fn(async () => []) } as unknown as typeof deps.documents,
    audit: { buildAppendItems: vi.fn(async () => ({ TransactItems: [] })) } as unknown as typeof deps.audit,
    now: () => "2026-09-16T12:00:00.000Z",
  };
  service = createAgendaIdeasService(deps);
});
async function meeting() {
  return meetings.createMeeting({ id: "meeting-1", title: "Next board meeting", type: "regular", format: "live", startAt: "2026-10-01T12:00:00Z", endAt: "2026-10-01T13:00:00Z", timeZone: "America/New_York", actorEmail: actor.email, occurredAt: deps.now() }).then((m) => meetings.changeStatus({ id: m.id, expectedVersion: m.version, status: "scheduled", actorEmail: actor.email, occurredAt: deps.now() }));
}
async function scheduleBody() {
  const m = await meeting();
  return { action: "schedule", id: "idea-1", expectedVersion: await version(), meetingId: m.id, meetingVersion: m.version, title: "Agenda copy", description: "Reviewed agenda description", presenter: "Chair", allottedMinutes: 15 };
}
describe("Agenda Ideas retained workflow", () => {
  it.each(["member", "chair", "executive-director", "legal-counsel", "board-support"] as const)("allows active %s to create and discuss without granting resolution authority", async (role) => {
    setActor(role); await service.execute(member(role), create());
    await service.execute(member(role), { action: "comment", id: "idea-1", expectedVersion: 1, messageId: "comment-1", body: "Worth discussing" });
    const detail = await service.detail(member(role), "idea-1");
    expect(detail.messages[0].authorAccessId).toBe(role);
    expect(detail.canManage).toBe(["chair", "executive-director"].includes(role));
    expect(detail.history).toHaveLength(2);
  });
  it("rejects duplicate creation and paginates retained ideas and history", async () => {
    for (const id of ["i1", "i2", "i3"]) await service.execute(member(), create(id));
    await expect(service.execute(member(), create("i1"))).rejects.toThrow(/changed/);
    const page = await service.list(member());
    expect(page.ideas).toHaveLength(2); expect(page.cursor).toBeTruthy();
    expect((await service.list(member(), page.cursor)).ideas).toHaveLength(1);
    await service.execute(member(), { action: "comment", id: "i1", expectedVersion: 1, messageId: "c1", body: "First" });
    await service.execute(member(), { action: "editComment", id: "i1", expectedVersion: 2, messageId: "c1", body: "Revised" });
    const detail = await service.detail(member(), "i1");
    expect(detail.history).toHaveLength(3);
    expect(detail.history[1].message?.body).toBe("First");
    expect(detail.messages[0]).toMatchObject({ body: "Revised", editedAt: deps.now() });
  });
  it("rejects missing, invited and deactivated access before loading records", async () => {
    const read = vi.spyOn(client, "get");
    for (const status of ["invited", "deactivated"] as const) {
      actor = { ...actor, status };
      await expect(service.list(member())).rejects.toThrow(/Active Board/);
      await expect(service.detail(member(), "idea-1")).rejects.toThrow(/Active Board/);
      await expect(service.execute(member(), create())).rejects.toThrow(/Active Board/);
    }
    vi.mocked(deps.access.getByEmail).mockResolvedValue(null);
    await expect(service.choices(member())).rejects.toThrow(/Active Board/);
    expect(read).not.toHaveBeenCalled();
  });
  it("aborts the entire write after access revocation or audit failure", async () => {
    client.race(() => client.seed(BOARD_ACCESS_TABLE, { pk: `ACCESS#${actor.id}`, sk: "PROFILE", ...actor, version: 2, status: "deactivated" }));
    await expect(service.execute(member(), create())).rejects.toThrow(/access changed/);
    expect([...client.data.values()].some((r) => r.entityType === "AGENDA_IDEA")).toBe(false);
    setActor(); vi.mocked(deps.audit.buildAppendItems).mockRejectedValue(new Error("Audit unavailable"));
    await expect(service.execute(member(), create())).rejects.toThrow(/Audit unavailable/);
    expect([...client.data.values()].some((r) => r.entityType === "AGENDA_IDEA")).toBe(false);
  });
  it("retains idea edits and prevents other authors and stale edits", async () => {
    await service.execute(member(), create());
    await service.execute(member(), { ...create(), action: "edit", title: "Revised", expectedVersion: 1 });
    await expect(service.execute(member(), { ...create(), action: "edit", expectedVersion: 1 })).rejects.toThrow(/changed/);
    setActor("chair");
    await expect(service.execute(member("chair"), { ...create(), action: "edit", expectedVersion: 2 })).rejects.toThrow(/Only the author/);
    const detail = await service.detail(member("chair"), "idea-1");
    expect(detail.history.map((r) => r.idea.title)).toEqual(["Quarterly priorities", "Revised"]);
  });
  it("allows only officers to defer, close and reopen, with explanations", async () => {
    await service.execute(member(), create());
    for (const role of ["member", "board-support", "legal-counsel"] as const) {
      setActor(role);
      await expect(service.execute(member(role), { action: "status", id: "idea-1", expectedVersion: 1, status: "deferred", reason: "Later" })).rejects.toThrow(/Only the Chair/);
    }
    setActor("executive-director");
    await expect(service.execute(member("executive-director"), { action: "status", id: "idea-1", expectedVersion: 1, status: "closed", reason: "" })).rejects.toThrow(/explanation/);
    await service.execute(member("executive-director"), { action: "status", id: "idea-1", expectedVersion: 1, status: "closed", reason: "Already addressed" });
    await expect(service.execute(member(), { action: "comment", id: "idea-1", expectedVersion: 2, messageId: "c1", body: "Comment" })).rejects.toThrow(/closed/);
    await service.execute(member("executive-director"), { action: "status", id: "idea-1", expectedVersion: 2, status: "open", reason: "New information" });
    expect((await service.detail(member(), "idea-1")).idea.status).toBe("open");
  });
  it("retains withdrawal and refuses withdrawal by another author", async () => {
    await service.execute(member(), create()); setActor("chair");
    await expect(service.execute(member("chair"), { action: "withdraw", id: "idea-1", expectedVersion: 1, reason: "Withdraw" })).rejects.toThrow(/Only the author/);
    setActor(); await service.execute(member(), { action: "withdraw", id: "idea-1", expectedVersion: 1, reason: "No longer needed" });
    expect((await service.detail(member(), "idea-1")).idea.status).toBe("withdrawn");
    expect((await service.detail(member(), "idea-1")).history).toHaveLength(2);
  });
  it("enforces reply ownership, author-only edits and duplicate comment rejection", async () => {
    await service.execute(member(), create()); await service.execute(member(), create("other"));
    await service.execute(member(), { action: "comment", id: "idea-1", expectedVersion: 1, messageId: "c1", body: "Original" });
    await expect(service.execute(member(), { action: "comment", id: "other", expectedVersion: 1, messageId: "c2", body: "Foreign", replyToId: "c1" })).rejects.toThrow(/Reply target/);
    await service.execute(member(), { action: "comment", id: "idea-1", expectedVersion: 2, messageId: "c2", body: "Reply", replyToId: "c1" });
    await expect(service.execute(member(), { action: "comment", id: "idea-1", expectedVersion: 3, messageId: "c2", body: "Duplicate" })).rejects.toThrow(/changed/);
    setActor("board-support");
    await expect(service.execute(member("board-support"), { action: "editComment", id: "idea-1", expectedVersion: 3, messageId: "c1", body: "Rewrite" })).rejects.toThrow(/Only the author/);
    expect((await service.detail(member(), "idea-1")).messages).toHaveLength(2);
  });
  it("stores read markers per viewer without acknowledging unseen revisions or regressing", async () => {
    await service.execute(member(), create());
    expect((await service.list(member())).ideas[0].unread).toBe(true);
    await service.execute(member(), { action: "read", id: "idea-1", expectedVersion: 1 });
    expect((await service.list(member())).ideas[0].unread).toBe(false);
    await service.execute(member(), { action: "comment", id: "idea-1", expectedVersion: 1, messageId: "c1", body: "New" });
    await service.execute(member(), { action: "read", id: "idea-1", expectedVersion: 1 });
    expect((await service.list(member())).ideas[0].unread).toBe(true);
    await expect(service.execute(member(), { action: "read", id: "idea-1", expectedVersion: 3 })).rejects.toThrow(/Invalid read/);
    await service.execute(member(), { action: "read", id: "idea-1", expectedVersion: 2 });
    await service.execute(member(), { action: "read", id: "idea-1", expectedVersion: 1 });
    expect((await service.list(member())).ideas[0].unread).toBe(false);
    setActor("chair"); expect((await service.list(member("chair"))).ideas[0].unread).toBe(true);
  });
  it("rejects archived, missing and meeting-owned document references; hides later archival", async () => {
    const getDoc = vi.mocked(deps.documents.getDocument);
    for (const doc of [null, { ownerType: "meeting", status: "active" }, { ownerType: "library", status: "archived" }]) {
      getDoc.mockResolvedValue(doc as Awaited<ReturnType<typeof getDoc>>);
      await expect(service.execute(member(), { ...create(), documentIds: ["doc-1"] })).rejects.toThrow(/active documents/);
    }
    getDoc.mockResolvedValue({ documentId: "doc-1", title: "Shared", ownerType: "library", status: "active" } as Awaited<ReturnType<typeof getDoc>>);
    await service.execute(member(), { ...create(), documentIds: ["doc-1"] });
    expect((await service.detail(member(), "idea-1")).documents).toHaveLength(1);
    getDoc.mockResolvedValue({ documentId: "doc-1", title: "Archived secret", ownerType: "library", status: "archived" } as Awaited<ReturnType<typeof getDoc>>);
    expect(JSON.stringify(await service.detail(member(), "idea-1"))).not.toContain("Archived secret");
  });
  it("atomically links a reviewed agenda copy, preserves it through later idea edits and prevents duplicates", async () => {
    await service.execute(member(), create()); const body = await scheduleBody(); setActor("chair");
    const noticeCount = () => [...client.data.values()].filter((r) => r.entityType === "MEETING_NOTIFICATION_EVENT").length;
    const beforePlacement = noticeCount();
    await service.execute(member("chair"), body);
    expect(noticeCount()).toBe(beforePlacement);
    const record = await meetings.getMeeting("meeting-1");
    expect(record!.agendaItems[0]).toMatchObject({ sourceIdeaId: "idea-1", title: "Agenda copy", allottedMinutes: 15 });
    expect((await service.detail(member(), "idea-1")).idea).toMatchObject({ status: "scheduled", scheduledMeetingId: "meeting-1", agendaItemId: "idea-idea-1" });
    await expect(service.execute(member("chair"), { ...body, expectedVersion: 2 })).rejects.toThrow(/unscheduled/);
    setActor(); await service.execute(member(), { ...create(), action: "edit", title: "Later idea title", expectedVersion: 2 });
    expect((await meetings.getMeeting("meeting-1"))!.agendaItems[0].title).toBe("Agenda copy");
    await meetings.upsertAgendaItem({ ...record!.agendaItems[0], sourceIdeaId: undefined, title: "Officer edits agenda", expectedVersion: record!.meeting.version, actorEmail: "chair@example.invalid" });
    expect((await meetings.getMeeting("meeting-1"))!.agendaItems[0].sourceIdeaId).toBe("idea-1");
    expect(noticeCount()).toBe(beforePlacement + 1);
  });
  it("rejects unauthorized scheduling and stale meetings without partial agenda records", async () => {
    await service.execute(member(), create()); const body = await scheduleBody();
    await expect(service.execute(member(), body)).rejects.toThrow(/Only the Chair/);
    setActor("board-support"); await expect(service.execute(member("board-support"), body)).rejects.toThrow(/Only the Chair/);
    setActor("chair"); await expect(service.execute(member("chair"), { ...body, meetingVersion: 0 })).rejects.toThrow(/meeting changed/);
    client.race(() => client.seed(BOARD_ACCESS_TABLE, { pk: "ACCESS#chair", sk: "PROFILE", ...actor, status: "deactivated", version: 2 }));
    await expect(service.execute(member("chair"), body)).rejects.toThrow();
    setActor();
    expect((await meetings.getMeeting("meeting-1"))!.agendaItems).toHaveLength(0);
    expect((await service.detail(member(), "idea-1")).idea.status).toBe("open");
  });
});

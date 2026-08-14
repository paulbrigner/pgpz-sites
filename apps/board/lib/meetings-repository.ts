import "server-only";

import { randomUUID } from "node:crypto";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import {
  BOARD_ACTION_ITEM_STATUSES,
  BOARD_AGENDA_ITEM_KINDS,
  BOARD_ATTENDANCE_STATUSES,
  BOARD_DELIVERY_KINDS,
  BOARD_DELIVERY_STATUSES,
  BOARD_DECISION_OUTCOMES,
  BOARD_MEETING_STATUSES,
  BOARD_MEETING_TYPES,
  BOARD_MINUTES_STATUSES,
  BoardMeetingVersionConflictError,
  type BoardAgendaItem,
  type BoardMeeting,
  type BoardMeetingActionItem,
  type BoardMeetingAttendance,
  type BoardMeetingDecision,
  type BoardMeetingDelivery,
  type BoardMeetingDetail,
  type BoardMeetingListPage,
  type BoardMeetingStatus,
} from "@/lib/meetings";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type BoardMeetingsDocumentClient = any;
export type BoardMeetingTransactItem = Record<string, unknown>;
export interface BoardMeetingMutationOptions { readonly additionalTransactItems?: readonly BoardMeetingTransactItem[] }

export interface CreateBoardMeetingInput {
  readonly id?: string; readonly title: string; readonly description?: string;
  readonly type: BoardMeeting["type"]; readonly startAt: string; readonly endAt: string;
  readonly timeZone: string; readonly location?: string; readonly virtualUrl?: string | null;
  readonly quorumRequired?: number | null;
  readonly actorEmail: string; readonly occurredAt?: string;
}
export interface UpdateBoardMeetingInput extends Partial<Pick<BoardMeeting, "title" | "description" | "type" | "startAt" | "endAt" | "timeZone" | "location" | "virtualUrl" | "quorumRequired">> {
  readonly id: string; readonly expectedVersion: number; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface ChangeBoardMeetingStatusInput {
  readonly id: string; readonly expectedVersion: number; readonly status: BoardMeetingStatus;
  readonly cancellationReason?: string | null; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface ConfirmBoardMeetingQuorumInput {
  readonly meetingId: string; readonly expectedVersion: number; readonly confirmed: boolean;
  readonly actorEmail: string; readonly occurredAt?: string;
}
export interface UpsertBoardAgendaItemInput extends Omit<BoardAgendaItem, "meetingId" | "updatedAt" | "updatedBy"> {
  readonly meetingId: string; readonly expectedVersion: number; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface RecordBoardAttendanceInput extends Omit<BoardMeetingAttendance, "meetingId" | "updatedAt" | "updatedBy"> {
  readonly meetingId: string; readonly expectedVersion: number; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface RecordBoardDecisionInput extends Omit<BoardMeetingDecision, "meetingId" | "recordedAt" | "recordedBy"> {
  readonly meetingId: string; readonly expectedVersion: number; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface RecordBoardActionItemInput extends Omit<BoardMeetingActionItem, "meetingId" | "updatedAt" | "updatedBy"> {
  readonly meetingId: string; readonly expectedVersion: number; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface SetBoardMinutesInput {
  readonly meetingId: string; readonly expectedVersion: number; readonly status: BoardMeeting["minutesStatus"];
  readonly documentId?: string | null; readonly actorEmail: string; readonly occurredAt?: string;
}
export interface RecordBoardDeliveryInput extends Omit<BoardMeetingDelivery, "meetingId" | "occurredAt" | "actorEmail"> {
  readonly meetingId: string; readonly actorEmail: string; readonly occurredAt?: string;
}

const META_SK = "META";
const TIMELINE_PK = "MEETINGS";
const meetingPk = (id: string) => `MEETING#${id}`;
const timelineSk = (meeting: Pick<BoardMeeting, "startAt" | "id">) => `${meeting.startAt}#${meeting.id}`;
const entitySk = (kind: string, id: string) => `${kind}#${id}`;
type Row = Record<string, unknown>;

const required = (value: unknown, field: string) => {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) throw new Error(`${field} is required`);
  return text;
};
const instant = (value: string | undefined, field: string) => {
  const text = value || new Date().toISOString();
  if (Number.isNaN(Date.parse(text))) throw new Error(`${field} must be an ISO date-time`);
  return new Date(text).toISOString();
};
const timeZone = (value: unknown) => {
  const text = required(value, "timeZone");
  try { new Intl.DateTimeFormat("en-US", { timeZone: text }).format(); }
  catch { throw new Error("timeZone must be a valid IANA time zone"); }
  return text;
};
const optionalMeetingUrl = (value: string | null | undefined) => {
  const text = value?.trim();
  if (!text) return null;
  let url: URL;
  try { url = new URL(text); } catch { throw new Error("virtualUrl must be a valid URL"); }
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  if (url.protocol !== "https:" && !(local && url.protocol === "http:")) {
    throw new Error("virtualUrl must use HTTPS (HTTP is allowed only for localhost)");
  }
  return url.toString();
};
const member = <T extends readonly string[]>(value: unknown, values: T, field: string): T[number] => {
  if (!values.includes(value as T[number])) throw new Error(`${field} is invalid`);
  return value as T[number];
};
const assertVersion = (value: number) => {
  if (!Number.isInteger(value) || value < 1) throw new Error("expectedVersion must be a positive integer");
};
const conditional = (error: unknown) => ["ConditionalCheckFailedException", "TransactionCanceledException"].includes(String((error as { name?: unknown })?.name));

function meetingItem(meeting: BoardMeeting): Row {
  return { pk: meetingPk(meeting.id), sk: META_SK, entityType: "MEETING", ...meeting, timelinePk: TIMELINE_PK, timelineSk: timelineSk(meeting) };
}
function toMeeting(item: Row | undefined): BoardMeeting | null {
  if (!item || item.entityType !== "MEETING") return null;
  const status = member(item.status, BOARD_MEETING_STATUSES, "status");
  const type = member(item.type, BOARD_MEETING_TYPES, "type");
  const minutesStatus = member(item.minutesStatus, BOARD_MINUTES_STATUSES, "minutesStatus");
  const id = String(item.id || "");
  if (!id) return null;
  return {
    id, title: String(item.title || ""), description: String(item.description || ""), type, status,
    startAt: String(item.startAt || ""), endAt: String(item.endAt || ""), timeZone: String(item.timeZone || "UTC"),
    location: String(item.location || ""), virtualUrl: item.virtualUrl == null ? null : String(item.virtualUrl),
    version: Number(item.version), minutesStatus, minutesDocumentId: item.minutesDocumentId == null ? null : String(item.minutesDocumentId),
    cancellationReason: item.cancellationReason == null ? null : String(item.cancellationReason),
    quorumRequired: item.quorumRequired == null ? null : Number(item.quorumRequired),
    quorumConfirmedAt: item.quorumConfirmedAt == null ? null : String(item.quorumConfirmedAt),
    quorumConfirmedBy: item.quorumConfirmedBy == null ? null : String(item.quorumConfirmedBy),
    createdAt: String(item.createdAt || ""), createdBy: String(item.createdBy || ""),
    updatedAt: String(item.updatedAt || ""), updatedBy: String(item.updatedBy || ""),
  };
}

export function createBoardMeetingsRepository(client: BoardMeetingsDocumentClient = documentClient, tableName = BOARD_MEETINGS_TABLE) {
  const resolvedTable = required(tableName, "BOARD_MEETINGS_TABLE");
  async function getMeta(id: string) {
    const result = await client.get({ TableName: resolvedTable, Key: { pk: meetingPk(required(id, "meetingId")), sk: META_SK }, ConsistentRead: true });
    return toMeeting(result?.Item);
  }
  async function rows(id: string): Promise<Row[]> {
    const result = await client.query({ TableName: resolvedTable, KeyConditionExpression: "#pk = :pk", ExpressionAttributeNames: { "#pk": "pk" }, ExpressionAttributeValues: { ":pk": meetingPk(id) } });
    return (result.Items || []) as Row[];
  }
  async function getMeeting(id: string): Promise<BoardMeetingDetail | null> {
    const all = await rows(required(id, "meetingId"));
    const meeting = toMeeting(all.find((row) => row.sk === META_SK));
    if (!meeting) return null;
    return {
      meeting,
      agendaItems: (all.filter((r) => r.entityType === "AGENDA_ITEM") as unknown as BoardAgendaItem[])
        .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
      attendance: (all.filter((r) => r.entityType === "ATTENDANCE") as unknown as BoardMeetingAttendance[])
        .sort((a, b) => a.name.localeCompare(b.name) || a.userId.localeCompare(b.userId)),
      decisions: (all.filter((r) => r.entityType === "DECISION") as unknown as BoardMeetingDecision[])
        .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt) || a.id.localeCompare(b.id)),
      actionItems: (all.filter((r) => r.entityType === "ACTION_ITEM") as unknown as BoardMeetingActionItem[])
        .sort((a, b) => (a.dueAt || "9999").localeCompare(b.dueAt || "9999") || a.id.localeCompare(b.id)),
      deliveries: (all.filter((r) => r.entityType === "DELIVERY") as unknown as BoardMeetingDelivery[])
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.id.localeCompare(b.id)),
    };
  }
  async function listMeetings(options: { scope: "upcoming" | "past"; now?: string; limit?: number; cursor?: Record<string, unknown> }): Promise<BoardMeetingListPage> {
    const now = instant(options.now, "now");
    const limit = Math.min(Math.max(Math.trunc(options.limit ?? 25), 1), 100);
    const upcoming = options.scope === "upcoming";
    const result = await client.query({
      TableName: resolvedTable, IndexName: "Timeline",
      KeyConditionExpression: `#timelinePk = :timelinePk AND #timelineSk ${upcoming ? ">=" : "<"} :boundary`,
      ExpressionAttributeNames: { "#timelinePk": "timelinePk", "#timelineSk": "timelineSk" },
      ExpressionAttributeValues: { ":timelinePk": TIMELINE_PK, ":boundary": now },
      ScanIndexForward: upcoming, Limit: limit, ...(options.cursor ? { ExclusiveStartKey: options.cursor } : {}),
    });
    return { meetings: (result.Items || []).map((r: Row) => toMeeting(r)).filter(Boolean) as BoardMeeting[], cursor: result.LastEvaluatedKey || null };
  }
  function revision(meeting: BoardMeeting, action: string, actorEmail: string, occurredAt: string, detail: unknown): Row {
    return { pk: meetingPk(meeting.id), sk: `REVISION#${occurredAt}#${randomUUID()}`, entityType: "MEETING_REVISION", meetingId: meeting.id, version: meeting.version, action, actorEmail, occurredAt, detail };
  }
  function mutationItems(previous: BoardMeeting, next: BoardMeeting, action: string, actorEmail: string, occurredAt: string, detail: unknown, child?: { item: Row; immutable?: boolean }): BoardMeetingTransactItem[] {
    return [
      { Put: { TableName: resolvedTable, Item: meetingItem(next), ConditionExpression: "#version = :expectedVersion", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":expectedVersion": previous.version } } },
      ...(child ? [{ Put: {
        TableName: resolvedTable,
        Item: child.item,
        ...(child.immutable ? {
          ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)",
          ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        } : {}),
      } }] : []),
      { Put: { TableName: resolvedTable, Item: revision(next, action, actorEmail, occurredAt, detail), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
    ];
  }
  async function commit(previous: BoardMeeting, next: BoardMeeting, action: string, actorEmail: string, occurredAt: string, detail: unknown, child: { item: Row; immutable?: boolean } | undefined, options?: BoardMeetingMutationOptions) {
    const items = [...mutationItems(previous, next, action, actorEmail, occurredAt, detail, child), ...(options?.additionalTransactItems || [])];
    if (items.length > 100) throw new Error("Board meeting transaction exceeds 100 items");
    try { await client.transactWrite({ TransactItems: items }); }
    catch (error) { if (conditional(error)) throw new BoardMeetingVersionConflictError(previous.id); throw error; }
    return next;
  }
  async function begin(id: string, expectedVersion: number, actorEmail: string, occurredAt?: string) {
    assertVersion(expectedVersion);
    const previous = await getMeta(id);
    if (!previous) throw new Error("Board meeting not found");
    if (previous.version !== expectedVersion) throw new BoardMeetingVersionConflictError(id);
    const at = instant(occurredAt, "occurredAt");
    return { previous, at, actor: required(actorEmail, "actorEmail") };
  }
  return {
    getMeeting, listMeetings,
    async createMeeting(input: CreateBoardMeetingInput, options?: BoardMeetingMutationOptions) {
      const id = required(input.id || randomUUID(), "id"); const at = instant(input.occurredAt, "occurredAt");
      const actor = required(input.actorEmail, "actorEmail"); const startAt = instant(input.startAt, "startAt"); const endAt = instant(input.endAt, "endAt");
      if (endAt <= startAt) throw new Error("endAt must be after startAt");
      if (input.quorumRequired != null && (!Number.isInteger(input.quorumRequired) || input.quorumRequired < 1)) throw new Error("quorumRequired must be a positive integer");
      const meeting: BoardMeeting = { id, title: required(input.title, "title"), description: input.description?.trim() || "", type: member(input.type, BOARD_MEETING_TYPES, "type"), status: "draft", startAt, endAt, timeZone: timeZone(input.timeZone), location: input.location?.trim() || "", virtualUrl: optionalMeetingUrl(input.virtualUrl), version: 1, minutesStatus: "not-started", minutesDocumentId: null, cancellationReason: null, quorumRequired: input.quorumRequired ?? null, quorumConfirmedAt: null, quorumConfirmedBy: null, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
      const items: BoardMeetingTransactItem[] = [
        { Put: { TableName: resolvedTable, Item: meetingItem(meeting), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        { Put: { TableName: resolvedTable, Item: revision(meeting, "created", actor, at, meeting), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        ...(options?.additionalTransactItems || []),
      ];
      if (items.length > 100) throw new Error("Board meeting transaction exceeds 100 items");
      try { await client.transactWrite({ TransactItems: items }); } catch (error) { if (conditional(error)) throw new BoardMeetingVersionConflictError(id); throw error; }
      return meeting;
    },
    async updateMeeting(input: UpdateBoardMeetingInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.id, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (input.quorumRequired !== undefined && input.quorumRequired !== null && (!Number.isInteger(input.quorumRequired) || input.quorumRequired < 1)) throw new Error("quorumRequired must be a positive integer or null");
      const next: BoardMeeting = { ...previous, ...(input.title !== undefined ? { title: required(input.title, "title") } : {}), ...(input.description !== undefined ? { description: input.description.trim() } : {}), ...(input.type !== undefined ? { type: member(input.type, BOARD_MEETING_TYPES, "type") } : {}), ...(input.startAt !== undefined ? { startAt: instant(input.startAt, "startAt") } : {}), ...(input.endAt !== undefined ? { endAt: instant(input.endAt, "endAt") } : {}), ...(input.timeZone !== undefined ? { timeZone: timeZone(input.timeZone) } : {}), ...(input.location !== undefined ? { location: input.location.trim() } : {}), ...(input.virtualUrl !== undefined ? { virtualUrl: optionalMeetingUrl(input.virtualUrl) } : {}), ...(input.quorumRequired !== undefined ? { quorumRequired: input.quorumRequired } : {}), version: previous.version + 1, updatedAt: at, updatedBy: actor };
      if (next.endAt <= next.startAt) throw new Error("endAt must be after startAt");
      return commit(previous, next, "updated", actor, at, input, undefined, options);
    },
    async changeStatus(input: ChangeBoardMeetingStatusInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.id, input.expectedVersion, input.actorEmail, input.occurredAt);
      const status = member(input.status, BOARD_MEETING_STATUSES, "status");
      const transitions: Record<BoardMeetingStatus, readonly BoardMeetingStatus[]> = {
        draft: ["scheduled", "cancelled"],
        scheduled: ["draft", "materials-published", "completed", "cancelled"],
        "materials-published": ["scheduled", "completed", "cancelled"],
        completed: ["closed"], closed: [], cancelled: ["draft", "scheduled"],
      };
      if (status !== previous.status && !transitions[previous.status].includes(status)) throw new Error(`invalid meeting status transition: ${previous.status} to ${status}`);
      if (status === "closed" && previous.minutesStatus !== "approved") throw new Error("approved minutes are required before a meeting can be closed");
      const next = { ...previous, status, cancellationReason: status === "cancelled" ? required(input.cancellationReason, "cancellationReason") : null, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "status-changed", actor, at, { from: previous.status, to: status }, undefined, options);
    },
    async confirmQuorum(input: ConfirmBoardMeetingQuorumInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (previous.status === "draft" || previous.status === "cancelled" || previous.status === "closed") throw new Error("quorum can be confirmed only for an active or completed meeting");
      const next: BoardMeeting = { ...previous, quorumConfirmedAt: input.confirmed ? at : null, quorumConfirmedBy: input.confirmed ? actor : null, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, input.confirmed ? "quorum-confirmed" : "quorum-cleared", actor, at, { quorumRequired: previous.quorumRequired }, undefined, options);
    },
    async upsertAgendaItem(input: UpsertBoardAgendaItemInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (!Number.isInteger(input.order) || input.order < 0) throw new Error("order must be a non-negative integer");
      const child: BoardAgendaItem = { meetingId: previous.id, id: required(input.id, "id"), order: input.order, title: required(input.title, "title"), description: input.description.trim(), kind: member(input.kind, BOARD_AGENDA_ITEM_KINDS, "kind"), presenter: input.presenter.trim(), allottedMinutes: input.allottedMinutes == null ? null : Math.max(0, Math.trunc(input.allottedMinutes)), status: input.status, updatedAt: at, updatedBy: actor };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "agenda-item-upserted", actor, at, child, { item: { pk: meetingPk(previous.id), sk: entitySk("AGENDA", child.id), entityType: "AGENDA_ITEM", ...child } }, options);
    },
    async recordAttendance(input: RecordBoardAttendanceInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      const child: BoardMeetingAttendance = { meetingId: previous.id, userId: required(input.userId, "userId"), name: required(input.name, "name"), email: required(input.email, "email").toLowerCase(), status: member(input.status, BOARD_ATTENDANCE_STATUSES, "status"), arrivedAt: input.arrivedAt ? instant(input.arrivedAt, "arrivedAt") : null, departedAt: input.departedAt ? instant(input.departedAt, "departedAt") : null, quorumEligible: Boolean(input.quorumEligible), notes: input.notes.trim(), updatedAt: at, updatedBy: actor };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "attendance-recorded", actor, at, child, { item: { pk: meetingPk(previous.id), sk: entitySk("ATTENDANCE", child.userId), entityType: "ATTENDANCE", ...child } }, options);
    },
    async recordDecision(input: RecordBoardDecisionInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (previous.status !== "completed") throw new Error("decisions can be finalized only after the meeting is completed");
      if (previous.quorumRequired != null && !previous.quorumConfirmedAt) throw new Error("quorum must be confirmed before decisions are finalized");
      for (const count of [input.yes, input.no, input.abstain, input.recused]) if (!Number.isInteger(count) || count < 0) throw new Error("vote counts must be non-negative integers");
      const child: BoardMeetingDecision = { meetingId: previous.id, id: required(input.id, "id"), agendaItemId: input.agendaItemId, title: required(input.title, "title"), motion: required(input.motion, "motion"), mover: input.mover, seconder: input.seconder, yes: input.yes, no: input.no, abstain: input.abstain, recused: input.recused, outcome: member(input.outcome, BOARD_DECISION_OUTCOMES, "outcome"), supersedesDecisionId: input.supersedesDecisionId, recordedAt: at, recordedBy: actor };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "decision-recorded", actor, at, child, { item: { pk: meetingPk(previous.id), sk: entitySk("DECISION", child.id), entityType: "DECISION", ...child }, immutable: true }, options);
    },
    async recordActionItem(input: RecordBoardActionItemInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      const child: BoardMeetingActionItem = { meetingId: previous.id, id: required(input.id, "id"), agendaItemId: input.agendaItemId, description: required(input.description, "description"), ownerId: input.ownerId, ownerName: input.ownerName.trim(), dueAt: input.dueAt ? instant(input.dueAt, "dueAt") : null, status: member(input.status, BOARD_ACTION_ITEM_STATUSES, "status"), updatedAt: at, updatedBy: actor };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "action-item-recorded", actor, at, child, { item: { pk: meetingPk(previous.id), sk: entitySk("ACTION", child.id), entityType: "ACTION_ITEM", ...child } }, options);
    },
    async setMinutes(input: SetBoardMinutesInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      const minutesStatus = member(input.status, BOARD_MINUTES_STATUSES, "status");
      const transitions: Record<BoardMeeting["minutesStatus"], readonly BoardMeeting["minutesStatus"][]> = {
        "not-started": ["draft"], draft: ["pending-approval", "approved"],
        "pending-approval": ["draft", "approved"], approved: ["amended"], amended: ["approved"],
      };
      if (minutesStatus !== previous.minutesStatus && !transitions[previous.minutesStatus].includes(minutesStatus)) throw new Error(`invalid minutes status transition: ${previous.minutesStatus} to ${minutesStatus}`);
      if (minutesStatus !== "not-started" && !["completed", "closed"].includes(previous.status)) throw new Error("minutes can be recorded only after the meeting is completed");
      if (minutesStatus !== "not-started" && !input.documentId) throw new Error("documentId is required for minutes");
      const next = { ...previous, minutesStatus, minutesDocumentId: input.documentId?.trim() || null, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "minutes-updated", actor, at, { minutesStatus, documentId: next.minutesDocumentId }, undefined, options);
    },
    async recordDelivery(input: RecordBoardDeliveryInput, options?: BoardMeetingMutationOptions) {
      const meetingId = required(input.meetingId, "meetingId");
      const previous = await getMeta(meetingId);
      if (!previous) throw new Error("Board meeting not found");
      const at = instant(input.occurredAt, "occurredAt");
      const actor = required(input.actorEmail, "actorEmail");
      if (input.status === "failed" && !input.failureReason?.trim()) throw new Error("failureReason is required for a failed delivery");
      const child: BoardMeetingDelivery = { meetingId: previous.id, id: required(input.id, "id"), communicationId: required(input.communicationId, "communicationId"), attemptId: required(input.attemptId, "attemptId"), kind: member(input.kind, BOARD_DELIVERY_KINDS, "kind"), status: member(input.status, BOARD_DELIVERY_STATUSES, "status"), recipientEmail: required(input.recipientEmail, "recipientEmail").toLowerCase(), idempotencyKey: required(input.idempotencyKey, "idempotencyKey"), failureReason: input.failureReason?.trim() || null, occurredAt: at, actorEmail: actor };
      const items: BoardMeetingTransactItem[] = [
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(previous.id), sk: META_SK }, ConditionExpression: "attribute_exists(#pk)", ExpressionAttributeNames: { "#pk": "pk" } } },
        ...(child.status === "pending" ? [{ Put: {
          TableName: resolvedTable,
          Item: { pk: meetingPk(previous.id), sk: `DELIVERY_IDEMPOTENCY#${child.idempotencyKey}`, entityType: "DELIVERY_IDEMPOTENCY", idempotencyKey: child.idempotencyKey, attemptId: child.attemptId, communicationId: child.communicationId, recipientEmail: child.recipientEmail, status: "pending", createdAt: at },
          // A confirmed failure may be retried with the same communication ID;
          // a pending or sent attempt remains protected from duplicate delivery.
          ConditionExpression: "attribute_not_exists(#pk) OR #status = :failed",
          ExpressionAttributeNames: { "#pk": "pk", "#status": "status" },
          ExpressionAttributeValues: { ":failed": "failed" },
        } }] : [{ Put: {
          TableName: resolvedTable,
          Item: { pk: meetingPk(previous.id), sk: `DELIVERY_IDEMPOTENCY#${child.idempotencyKey}`, entityType: "DELIVERY_IDEMPOTENCY", idempotencyKey: child.idempotencyKey, attemptId: child.attemptId, communicationId: child.communicationId, recipientEmail: child.recipientEmail, status: child.status, createdAt: at },
          ConditionExpression: "#attemptId = :attemptId AND #status = :pending",
          ExpressionAttributeNames: { "#attemptId": "attemptId", "#status": "status" },
          ExpressionAttributeValues: { ":attemptId": child.attemptId, ":pending": "pending" },
        } }]),
        { Put: { TableName: resolvedTable, Item: { pk: meetingPk(previous.id), sk: `DELIVERY#${child.attemptId}#${child.status}#${child.id}`, entityType: "DELIVERY", ...child }, ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        { Put: { TableName: resolvedTable, Item: revision(previous, "delivery-recorded", actor, at, child), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        ...(options?.additionalTransactItems || []),
      ];
      if (items.length > 100) throw new Error("Board meeting transaction exceeds 100 items");
      try { await client.transactWrite({ TransactItems: items }); }
      catch (error) { if (conditional(error)) throw new Error("Board meeting delivery already recorded or meeting unavailable"); throw error; }
      return child;
    },
  };
}

export const boardMeetingsRepository = createBoardMeetingsRepository();

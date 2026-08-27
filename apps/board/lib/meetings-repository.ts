import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import {
  BOARD_ACTION_ITEM_STATUSES,
  BOARD_AGENDA_ITEM_KINDS,
  BOARD_ASYNC_BALLOT_STATUSES,
  BOARD_ASYNC_VOTE_CHOICES,
  BOARD_DISCUSSION_EDIT_WINDOW_SECONDS,
  BOARD_ATTENDANCE_STATUSES,
  BOARD_DELIVERY_KINDS,
  BOARD_DELIVERY_STATUSES,
  BOARD_DECISION_OUTCOMES,
  BOARD_MEETING_STATUSES,
  BOARD_MEETING_FORMATS,
  BOARD_MEETING_TYPES,
  BOARD_MINUTES_STATUSES,
  BoardMeetingVersionConflictError,
  tallyBoardAsyncBallot,
  type BoardAsyncBallot,
  type BoardAsyncBallotVoter,
  type BoardAsyncVote,
  type BoardAsyncVoteChoice,
  type BoardAsyncDiscussionMessage,
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
  readonly type: BoardMeeting["type"]; readonly format?: BoardMeeting["format"]; readonly startAt: string; readonly endAt: string;
  readonly timeZone: string; readonly location?: string; readonly virtualUrl?: string | null;
  readonly quorumRequired?: number | null;
  readonly actorEmail: string; readonly occurredAt?: string;
}
export interface UpdateBoardMeetingInput extends Partial<Pick<BoardMeeting, "title" | "description" | "type" | "format" | "startAt" | "endAt" | "timeZone" | "location" | "virtualUrl" | "quorumRequired">> {
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
export interface UpsertBoardAsyncBallotInput {
  readonly meetingId: string; readonly expectedVersion: number; readonly id: string;
  readonly agendaItemId?: string | null; readonly title: string; readonly motion: string;
  readonly quorumRequired?: number | null; readonly approvalRequired?: number | null;
  readonly actorEmail: string; readonly occurredAt?: string;
}
export interface OpenBoardAsyncBallotInput {
  readonly meetingId: string; readonly expectedVersion: number; readonly ballotId: string;
  readonly eligibleVoters: readonly BoardAsyncBallotVoter[];
  readonly actorEmail: string; readonly occurredAt?: string;
}
export interface CastBoardAsyncVoteInput {
  readonly meetingId: string; readonly ballotId: string; readonly choice: BoardAsyncVoteChoice;
  readonly voter: BoardAsyncBallotVoter; readonly occurredAt?: string;
}
export interface CreateBoardAsyncDiscussionMessageInput {
  readonly meetingId: string; readonly ballotId: string; readonly id?: string;
  readonly replyToMessageId?: string | null; readonly body: string;
  readonly authorUserId: string; readonly authorName: string; readonly authorEmail: string;
  readonly occurredAt?: string;
}
export interface EditBoardAsyncDiscussionMessageInput {
  readonly meetingId: string; readonly ballotId: string; readonly messageId: string;
  readonly body: string; readonly expectedUpdatedAt: string; readonly authorUserId: string;
  readonly occurredAt?: string;
}
export interface CloseBoardAsyncBallotInput {
  readonly meetingId: string; readonly expectedVersion: number; readonly ballotId: string;
  readonly actorEmail: string; readonly occurredAt?: string;
}
export interface CancelBoardAsyncBallotInput {
  readonly meetingId: string; readonly expectedVersion: number; readonly ballotId: string;
  readonly reason: string; readonly actorEmail: string; readonly occurredAt?: string;
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
const optionalPositiveInteger = (value: number | null | undefined, field: string) => {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) throw new Error(`${field} must be a positive integer or null`);
  return value;
};
const conditional = (error: unknown) => ["ConditionalCheckFailedException", "TransactionCanceledException"].includes(String((error as { name?: unknown })?.name));
const voterKey = (email: string) => createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const rosterHash = (voters: readonly BoardAsyncBallotVoter[]) => createHash("sha256")
  .update(voters.map((voter) => voter.email.trim().toLowerCase()).sort().join("\n"))
  .digest("hex");

function meetingItem(meeting: BoardMeeting): Row {
  return { pk: meetingPk(meeting.id), sk: META_SK, entityType: "MEETING", ...meeting, timelinePk: TIMELINE_PK, timelineSk: timelineSk(meeting) };
}
function toMeeting(item: Row | undefined): BoardMeeting | null {
  if (!item || item.entityType !== "MEETING") return null;
  const status = member(item.status, BOARD_MEETING_STATUSES, "status");
  const type = member(item.type, BOARD_MEETING_TYPES, "type");
  const format = member(item.format || "live", BOARD_MEETING_FORMATS, "format");
  const minutesStatus = member(item.minutesStatus, BOARD_MINUTES_STATUSES, "minutesStatus");
  const id = String(item.id || "");
  if (!id) return null;
  return {
    id, title: String(item.title || ""), description: String(item.description || ""), type, format, status,
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

function toAsyncBallot(item: Row): BoardAsyncBallot | null {
  if (item.entityType !== "ASYNC_BALLOT") return null;
  const status = member(item.status, BOARD_ASYNC_BALLOT_STATUSES, "ballot status");
  const eligibleVoters = Array.isArray(item.eligibleVoters)
    ? item.eligibleVoters.map((value) => value as BoardAsyncBallotVoter)
    : [];
  return {
    id: String(item.id || ""), meetingId: String(item.meetingId || ""),
    agendaItemId: item.agendaItemId == null ? null : String(item.agendaItemId),
    title: String(item.title || ""), motion: String(item.motion || ""), status,
    eligibleVoters, rosterHash: item.rosterHash == null ? null : String(item.rosterHash),
    quorumRequired: item.quorumRequired == null ? null : Number(item.quorumRequired),
    approvalRequired: item.approvalRequired == null ? null : Number(item.approvalRequired),
    openedAt: item.openedAt == null ? null : String(item.openedAt), openedBy: item.openedBy == null ? null : String(item.openedBy),
    closedAt: item.closedAt == null ? null : String(item.closedAt), closedBy: item.closedBy == null ? null : String(item.closedBy),
    cancellationReason: item.cancellationReason == null ? null : String(item.cancellationReason),
    result: item.result == null ? null : item.result as BoardAsyncBallot["result"],
    createdAt: String(item.createdAt || ""), createdBy: String(item.createdBy || ""),
    updatedAt: String(item.updatedAt || ""), updatedBy: String(item.updatedBy || ""),
  };
}

function toAsyncVote(item: Row): BoardAsyncVote | null {
  if (item.entityType !== "ASYNC_VOTE") return null;
  return {
    meetingId: String(item.meetingId || ""), ballotId: String(item.ballotId || ""),
    voterUserId: String(item.voterUserId || ""), voterName: String(item.voterName || ""),
    voterEmail: String(item.voterEmail || "").toLowerCase(),
    choice: member(item.choice, BOARD_ASYNC_VOTE_CHOICES, "vote choice"),
    castAt: String(item.castAt || ""), updatedAt: String(item.updatedAt || ""),
  };
}

function toAsyncDiscussionMessage(item: Row | undefined): BoardAsyncDiscussionMessage | null {
  if (!item || item.entityType !== "ASYNC_DISCUSSION_MESSAGE") return null;
  const id = String(item.id || "");
  if (!id) return null;
  return {
    id, meetingId: String(item.meetingId || ""), ballotId: String(item.ballotId || ""),
    replyToMessageId: item.replyToMessageId == null ? null : String(item.replyToMessageId),
    authorUserId: String(item.authorUserId || ""), authorName: String(item.authorName || ""),
    authorEmail: String(item.authorEmail || "").toLowerCase(), body: String(item.body || ""),
    createdAt: String(item.createdAt || ""), updatedAt: String(item.updatedAt || ""),
    editedAt: item.editedAt == null ? null : String(item.editedAt),
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
      asyncBallots: all.map(toAsyncBallot).filter((value): value is BoardAsyncBallot => Boolean(value))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
      asyncVotes: all.map(toAsyncVote).filter((value): value is BoardAsyncVote => Boolean(value))
        .sort((a, b) => a.ballotId.localeCompare(b.ballotId) || a.voterEmail.localeCompare(b.voterEmail)),
      asyncDiscussionMessages: all.map(toAsyncDiscussionMessage).filter((value): value is BoardAsyncDiscussionMessage => Boolean(value))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
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
    let meetings = (result.Items || []).map((r: Row) => toMeeting(r)).filter(Boolean) as BoardMeeting[];
    if (upcoming && !options.cursor) {
      // The Timeline index is keyed by start time, so also recover meetings
      // whose start has passed but whose live or voting window is still open.
      const activeResult = await client.query({
        TableName: resolvedTable, IndexName: "Timeline",
        KeyConditionExpression: "#timelinePk = :timelinePk AND #timelineSk < :boundary",
        ExpressionAttributeNames: { "#timelinePk": "timelinePk", "#timelineSk": "timelineSk" },
        ExpressionAttributeValues: { ":timelinePk": TIMELINE_PK, ":boundary": now },
        ScanIndexForward: false, Limit: 100,
      });
      const active: BoardMeeting[] = ((activeResult.Items || []) as Row[]).map((r) => toMeeting(r)).filter((meeting): meeting is BoardMeeting => meeting !== null && meeting.endAt >= now);
      meetings = [...active, ...meetings].sort((a, b) => a.startAt.localeCompare(b.startAt)).slice(0, limit);
    } else if (!upcoming) {
      meetings = meetings.filter((meeting) => meeting.endAt < now).slice(0, limit);
    }
    return { meetings, cursor: result.LastEvaluatedKey || null };
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
  async function getAsyncBallot(meetingId: string, ballotId: string) {
    const result = await client.get({
      TableName: resolvedTable,
      Key: { pk: meetingPk(required(meetingId, "meetingId")), sk: entitySk("BALLOT", required(ballotId, "ballotId")) },
      ConsistentRead: true,
    });
    return result?.Item ? toAsyncBallot(result.Item as Row) : null;
  }
  function asyncBallotItem(ballot: BoardAsyncBallot): Row {
    return { pk: meetingPk(ballot.meetingId), sk: entitySk("BALLOT", ballot.id), entityType: "ASYNC_BALLOT", ...ballot };
  }
  async function getAsyncDiscussionMessage(meetingId: string, messageId: string) {
    const result = await client.get({
      TableName: resolvedTable,
      Key: { pk: meetingPk(required(meetingId, "meetingId")), sk: entitySk("DISCUSSION", required(messageId, "messageId")) },
      ConsistentRead: true,
    });
    return toAsyncDiscussionMessage(result?.Item as Row | undefined);
  }
  function discussionBody(value: string) {
    const body = required(value, "message");
    if (body.length > 4000) throw new Error("message must be 4,000 characters or fewer");
    return body;
  }
  function asyncDiscussionItem(message: BoardAsyncDiscussionMessage): Row {
    return { pk: meetingPk(message.meetingId), sk: entitySk("DISCUSSION", message.id), entityType: "ASYNC_DISCUSSION_MESSAGE", ...message };
  }
  function asyncDiscussionRevision(message: BoardAsyncDiscussionMessage, action: "created" | "edited", occurredAt: string): Row {
    return {
      pk: meetingPk(message.meetingId), sk: `DISCUSSION_REVISION#${message.ballotId}#${occurredAt}#${randomUUID()}`,
      entityType: "ASYNC_DISCUSSION_REVISION", action, ...message, occurredAt,
    };
  }
  return {
    getMeeting, listMeetings,
    async createMeeting(input: CreateBoardMeetingInput, options?: BoardMeetingMutationOptions) {
      const id = required(input.id || randomUUID(), "id"); const at = instant(input.occurredAt, "occurredAt");
      const actor = required(input.actorEmail, "actorEmail"); const startAt = instant(input.startAt, "startAt"); const endAt = instant(input.endAt, "endAt");
      if (endAt <= startAt) throw new Error("endAt must be after startAt");
      if (input.quorumRequired != null && (!Number.isInteger(input.quorumRequired) || input.quorumRequired < 1)) throw new Error("quorumRequired must be a positive integer");
      const format = member(input.format || "live", BOARD_MEETING_FORMATS, "format");
      const meeting: BoardMeeting = { id, title: required(input.title, "title"), description: input.description?.trim() || "", type: member(input.type, BOARD_MEETING_TYPES, "type"), format, status: "draft", startAt, endAt, timeZone: timeZone(input.timeZone), location: format === "asynchronous" ? "" : input.location?.trim() || "", virtualUrl: format === "asynchronous" ? null : optionalMeetingUrl(input.virtualUrl), version: 1, minutesStatus: "not-started", minutesDocumentId: null, cancellationReason: null, quorumRequired: input.quorumRequired ?? null, quorumConfirmedAt: null, quorumConfirmedBy: null, createdAt: at, createdBy: actor, updatedAt: at, updatedBy: actor };
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
      const format = input.format === undefined ? previous.format : member(input.format, BOARD_MEETING_FORMATS, "format");
      const next: BoardMeeting = { ...previous, ...(input.title !== undefined ? { title: required(input.title, "title") } : {}), ...(input.description !== undefined ? { description: input.description.trim() } : {}), ...(input.type !== undefined ? { type: member(input.type, BOARD_MEETING_TYPES, "type") } : {}), format, ...(input.startAt !== undefined ? { startAt: instant(input.startAt, "startAt") } : {}), ...(input.endAt !== undefined ? { endAt: instant(input.endAt, "endAt") } : {}), ...(input.timeZone !== undefined ? { timeZone: timeZone(input.timeZone) } : {}), location: format === "asynchronous" ? "" : input.location !== undefined ? input.location.trim() : previous.location, virtualUrl: format === "asynchronous" ? null : input.virtualUrl !== undefined ? optionalMeetingUrl(input.virtualUrl) : previous.virtualUrl, ...(input.quorumRequired !== undefined ? { quorumRequired: input.quorumRequired } : {}), version: previous.version + 1, updatedAt: at, updatedBy: actor };
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
    async upsertAsyncBallot(input: UpsertBoardAsyncBallotInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (previous.format !== "asynchronous") throw new Error("ballots are available only for asynchronous meetings");
      if (previous.status !== "draft") throw new Error("ballots can be prepared only while the meeting is a draft");
      const existing = await getAsyncBallot(previous.id, input.id);
      if (existing && existing.status !== "draft") throw new Error("an opened ballot cannot be edited");
      const quorumRequired = optionalPositiveInteger(input.quorumRequired, "quorumRequired");
      const approvalRequired = optionalPositiveInteger(input.approvalRequired, "approvalRequired");
      const ballot: BoardAsyncBallot = {
        id: required(input.id, "ballotId"), meetingId: previous.id,
        agendaItemId: input.agendaItemId?.trim() || null,
        title: required(input.title, "title"), motion: required(input.motion, "motion"), status: "draft",
        eligibleVoters: [], rosterHash: null, quorumRequired, approvalRequired,
        openedAt: null, openedBy: null, closedAt: null, closedBy: null,
        cancellationReason: null, result: null,
        createdAt: existing?.createdAt || at, createdBy: existing?.createdBy || actor,
        updatedAt: at, updatedBy: actor,
      };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, existing ? "async-ballot-updated" : "async-ballot-created", actor, at, { ballotId: ballot.id, title: ballot.title }, { item: asyncBallotItem(ballot) }, options);
    },
    async openAsyncBallot(input: OpenBoardAsyncBallotInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (previous.format !== "asynchronous") throw new Error("ballots are available only for asynchronous meetings");
      if (!["scheduled", "materials-published"].includes(previous.status)) throw new Error("schedule the asynchronous meeting before opening ballots");
      if (at >= previous.endAt) throw new Error("the voting deadline has already passed");
      const existing = await getAsyncBallot(previous.id, input.ballotId);
      if (!existing) throw new Error("ballot not found");
      if (existing.status !== "draft") throw new Error("only a draft ballot can be opened");
      const byEmail = new Map<string, BoardAsyncBallotVoter>();
      for (const voter of input.eligibleVoters) {
        const email = required(voter.email, "voter email").toLowerCase();
        byEmail.set(email, { userId: required(voter.userId, "voter userId"), name: required(voter.name, "voter name"), email });
      }
      const eligibleVoters = [...byEmail.values()].sort((a, b) => a.email.localeCompare(b.email));
      if (eligibleVoters.length === 0) throw new Error("at least one active director is required");
      const quorumRequired = existing.quorumRequired ?? previous.quorumRequired ?? Math.floor(eligibleVoters.length / 2) + 1;
      const approvalRequired = existing.approvalRequired ?? Math.floor(eligibleVoters.length / 2) + 1;
      if (quorumRequired > eligibleVoters.length) throw new Error("quorumRequired cannot exceed eligible directors");
      if (approvalRequired > eligibleVoters.length) throw new Error("approvalRequired cannot exceed eligible directors");
      const ballot: BoardAsyncBallot = { ...existing, status: "open", eligibleVoters, rosterHash: rosterHash(eligibleVoters), quorumRequired, approvalRequired, openedAt: at, openedBy: actor, updatedAt: at, updatedBy: actor };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "async-ballot-opened", actor, at, { ballotId: ballot.id, eligibleCount: eligibleVoters.length, rosterHash: ballot.rosterHash, quorumRequired, approvalRequired }, { item: asyncBallotItem(ballot) }, options);
    },
    async castAsyncVote(input: CastBoardAsyncVoteInput, options?: BoardMeetingMutationOptions) {
      const meetingId = required(input.meetingId, "meetingId");
      const ballotId = required(input.ballotId, "ballotId");
      const meeting = await getMeta(meetingId);
      if (!meeting || meeting.format !== "asynchronous") throw new Error("asynchronous meeting not found");
      const ballot = await getAsyncBallot(meetingId, ballotId);
      if (!ballot || ballot.status !== "open") throw new Error("this ballot is not open");
      const at = instant(input.occurredAt, "occurredAt");
      if (at < meeting.startAt) throw new Error("voting has not opened yet");
      if (at >= meeting.endAt) throw new Error("the voting deadline has passed");
      const email = required(input.voter.email, "voter email").toLowerCase();
      const eligible = ballot.eligibleVoters.find((voter) => voter.email === email);
      if (!eligible) throw new Error("the current user is not eligible for this ballot");
      const choice = member(input.choice, BOARD_ASYNC_VOTE_CHOICES, "vote choice");
      const currentKey = { pk: meetingPk(meetingId), sk: `BALLOT_VOTE#${ballotId}#${voterKey(email)}` };
      const currentResult = await client.get({ TableName: resolvedTable, Key: currentKey, ConsistentRead: true });
      const current = currentResult?.Item ? toAsyncVote(currentResult.Item as Row) : null;
      const vote: BoardAsyncVote = {
        meetingId, ballotId, voterUserId: eligible.userId,
        voterName: eligible.name, voterEmail: eligible.email, choice,
        castAt: current?.castAt || at, updatedAt: at,
      };
      const items: BoardMeetingTransactItem[] = [
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(meetingId), sk: META_SK }, ConditionExpression: "#format = :asynchronous AND (#status = :scheduled OR #status = :materialsPublished) AND #startAt <= :now AND #endAt > :now", ExpressionAttributeNames: { "#format": "format", "#status": "status", "#startAt": "startAt", "#endAt": "endAt" }, ExpressionAttributeValues: { ":asynchronous": "asynchronous", ":scheduled": "scheduled", ":materialsPublished": "materials-published", ":now": at } } },
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(meetingId), sk: entitySk("BALLOT", ballotId) }, ConditionExpression: "#status = :open", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":open": "open" } } },
        { Put: { TableName: resolvedTable, Item: { ...currentKey, entityType: "ASYNC_VOTE", ...vote } } },
        { Put: { TableName: resolvedTable, Item: { pk: meetingPk(meetingId), sk: `BALLOT_VOTE_REVISION#${ballotId}#${at}#${randomUUID()}`, entityType: "ASYNC_VOTE_REVISION", ...vote }, ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        ...(options?.additionalTransactItems || []),
      ];
      if (items.length > 100) throw new Error("Board vote transaction exceeds 100 items");
      try { await client.transactWrite({ TransactItems: items }); }
      catch (error) { if (conditional(error)) throw new Error("the ballot changed or the voting window closed; refresh and try again"); throw error; }
      return vote;
    },
    async createAsyncDiscussionMessage(input: CreateBoardAsyncDiscussionMessageInput, options?: BoardMeetingMutationOptions) {
      const meetingId = required(input.meetingId, "meetingId");
      const ballotId = required(input.ballotId, "ballotId");
      const meeting = await getMeta(meetingId);
      if (!meeting || meeting.format !== "asynchronous") throw new Error("asynchronous meeting not found");
      const ballot = await getAsyncBallot(meetingId, ballotId);
      if (!ballot || ballot.status !== "open") throw new Error("this discussion is not open");
      const at = instant(input.occurredAt, "occurredAt");
      if (at < meeting.startAt) throw new Error("discussion has not opened yet");
      if (at >= meeting.endAt) throw new Error("discussion has closed");
      if (!["scheduled", "materials-published"].includes(meeting.status)) throw new Error("this discussion is not open");
      let replyToMessageId = input.replyToMessageId?.trim() || null;
      if (replyToMessageId) {
        const parent = await getAsyncDiscussionMessage(meetingId, replyToMessageId);
        if (!parent || parent.ballotId !== ballotId) throw new Error("reply target was not found in this discussion");
        replyToMessageId = parent.replyToMessageId || parent.id;
      }
      const message: BoardAsyncDiscussionMessage = {
        id: required(input.id || randomUUID(), "messageId"), meetingId, ballotId, replyToMessageId,
        authorUserId: required(input.authorUserId, "authorUserId"),
        authorName: required(input.authorName, "authorName"),
        authorEmail: required(input.authorEmail, "authorEmail").toLowerCase(),
        body: discussionBody(input.body), createdAt: at, updatedAt: at, editedAt: null,
      };
      const items: BoardMeetingTransactItem[] = [
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(meetingId), sk: META_SK }, ConditionExpression: "#format = :asynchronous AND (#status = :scheduled OR #status = :materialsPublished) AND #startAt <= :now AND #endAt > :now", ExpressionAttributeNames: { "#format": "format", "#status": "status", "#startAt": "startAt", "#endAt": "endAt" }, ExpressionAttributeValues: { ":asynchronous": "asynchronous", ":scheduled": "scheduled", ":materialsPublished": "materials-published", ":now": at } } },
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(meetingId), sk: entitySk("BALLOT", ballotId) }, ConditionExpression: "#status = :open", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":open": "open" } } },
        { Put: { TableName: resolvedTable, Item: asyncDiscussionItem(message), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        { Put: { TableName: resolvedTable, Item: asyncDiscussionRevision(message, "created", at), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        ...(options?.additionalTransactItems || []),
      ];
      if (items.length > 100) throw new Error("Board discussion transaction exceeds 100 items");
      try { await client.transactWrite({ TransactItems: items }); }
      catch (error) { if (conditional(error)) throw new Error("the discussion changed or closed; refresh and try again"); throw error; }
      return message;
    },
    async editAsyncDiscussionMessage(input: EditBoardAsyncDiscussionMessageInput, options?: BoardMeetingMutationOptions) {
      const meetingId = required(input.meetingId, "meetingId");
      const ballotId = required(input.ballotId, "ballotId");
      const messageId = required(input.messageId, "messageId");
      const authorUserId = required(input.authorUserId, "authorUserId");
      const expectedUpdatedAt = instant(input.expectedUpdatedAt, "expectedUpdatedAt");
      const current = await getAsyncDiscussionMessage(meetingId, messageId);
      if (!current || current.ballotId !== ballotId) throw new Error("discussion message not found");
      if (current.authorUserId !== authorUserId) throw new Error("only the author may edit this message");
      if (current.updatedAt !== expectedUpdatedAt) throw new Error("the message changed; refresh and try again");
      const meeting = await getMeta(meetingId);
      const ballot = await getAsyncBallot(meetingId, ballotId);
      if (!meeting || meeting.format !== "asynchronous" || !ballot || ballot.status !== "open") throw new Error("this discussion is not open");
      const at = instant(input.occurredAt, "occurredAt");
      if (at < meeting.startAt || at >= meeting.endAt) throw new Error("discussion is closed");
      if (at < current.createdAt || Date.parse(at) - Date.parse(current.createdAt) > BOARD_DISCUSSION_EDIT_WINDOW_SECONDS * 1000) {
        throw new Error("messages can be edited for 15 minutes after posting");
      }
      const message: BoardAsyncDiscussionMessage = { ...current, body: discussionBody(input.body), updatedAt: at, editedAt: at };
      const items: BoardMeetingTransactItem[] = [
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(meetingId), sk: META_SK }, ConditionExpression: "#format = :asynchronous AND (#status = :scheduled OR #status = :materialsPublished) AND #startAt <= :now AND #endAt > :now", ExpressionAttributeNames: { "#format": "format", "#status": "status", "#startAt": "startAt", "#endAt": "endAt" }, ExpressionAttributeValues: { ":asynchronous": "asynchronous", ":scheduled": "scheduled", ":materialsPublished": "materials-published", ":now": at } } },
        { ConditionCheck: { TableName: resolvedTable, Key: { pk: meetingPk(meetingId), sk: entitySk("BALLOT", ballotId) }, ConditionExpression: "#status = :open", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":open": "open" } } },
        { Put: { TableName: resolvedTable, Item: asyncDiscussionItem(message), ConditionExpression: "#authorUserId = :authorUserId AND #updatedAt = :expectedUpdatedAt", ExpressionAttributeNames: { "#authorUserId": "authorUserId", "#updatedAt": "updatedAt" }, ExpressionAttributeValues: { ":authorUserId": authorUserId, ":expectedUpdatedAt": expectedUpdatedAt } } },
        { Put: { TableName: resolvedTable, Item: asyncDiscussionRevision(message, "edited", at), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        ...(options?.additionalTransactItems || []),
      ];
      if (items.length > 100) throw new Error("Board discussion transaction exceeds 100 items");
      try { await client.transactWrite({ TransactItems: items }); }
      catch (error) { if (conditional(error)) throw new Error("the discussion changed or closed; refresh and try again"); throw error; }
      return message;
    },
    async closeAsyncBallot(input: CloseBoardAsyncBallotInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      if (previous.format !== "asynchronous") throw new Error("ballots are available only for asynchronous meetings");
      if (previous.status !== "scheduled" && previous.status !== "materials-published") throw new Error("ballots can be finalized only for an active asynchronous meeting");
      const detail = await getMeeting(previous.id);
      const ballot = detail?.asyncBallots.find((candidate) => candidate.id === input.ballotId);
      if (!ballot || ballot.status !== "open") throw new Error("only an open ballot can be finalized");
      const votes = detail?.asyncVotes.filter((vote) => vote.ballotId === ballot.id) || [];
      if (at < previous.endAt) throw new Error("the ballot can be finalized only after the voting deadline");
      const result = tallyBoardAsyncBallot(ballot, votes);
      const closed: BoardAsyncBallot = { ...ballot, status: "closed", result, closedAt: at, closedBy: actor, updatedAt: at, updatedBy: actor };
      const decision: BoardMeetingDecision = {
        id: `async-${ballot.id}`, meetingId: previous.id, agendaItemId: ballot.agendaItemId,
        title: ballot.title, motion: ballot.motion, mover: null, seconder: null,
        yes: result.yes, no: result.no, abstain: result.abstain, recused: result.recused,
        outcome: result.outcome, recordedAt: at, recordedBy: actor, supersedesDecisionId: null,
      };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      const items: BoardMeetingTransactItem[] = [
        { Put: { TableName: resolvedTable, Item: meetingItem(next), ConditionExpression: "#version = :expectedVersion", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":expectedVersion": previous.version } } },
        { Put: { TableName: resolvedTable, Item: asyncBallotItem(closed), ConditionExpression: "#status = :open", ExpressionAttributeNames: { "#status": "status" }, ExpressionAttributeValues: { ":open": "open" } } },
        { Put: { TableName: resolvedTable, Item: { pk: meetingPk(previous.id), sk: entitySk("DECISION", decision.id), entityType: "DECISION", ...decision }, ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        { Put: { TableName: resolvedTable, Item: revision(next, "async-ballot-closed", actor, at, { ballotId: ballot.id, rosterHash: ballot.rosterHash, result }), ConditionExpression: "attribute_not_exists(#pk) AND attribute_not_exists(#sk)", ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" } } },
        ...(options?.additionalTransactItems || []),
      ];
      if (items.length > 100) throw new Error("Board ballot finalization transaction exceeds 100 items");
      try { await client.transactWrite({ TransactItems: items }); }
      catch (error) { if (conditional(error)) throw new BoardMeetingVersionConflictError(previous.id); throw error; }
      return next;
    },
    async cancelAsyncBallot(input: CancelBoardAsyncBallotInput, options?: BoardMeetingMutationOptions) {
      const { previous, at, actor } = await begin(input.meetingId, input.expectedVersion, input.actorEmail, input.occurredAt);
      const existing = await getAsyncBallot(previous.id, input.ballotId);
      if (!existing || existing.status === "closed" || existing.status === "cancelled") throw new Error("only a draft or open ballot can be cancelled");
      const reason = required(input.reason, "cancellation reason");
      const ballot: BoardAsyncBallot = { ...existing, status: "cancelled", cancellationReason: reason, updatedAt: at, updatedBy: actor };
      const next = { ...previous, version: previous.version + 1, updatedAt: at, updatedBy: actor };
      return commit(previous, next, "async-ballot-cancelled", actor, at, { ballotId: ballot.id, reason }, { item: asyncBallotItem(ballot) }, options);
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

import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { accessRecordGuard } from "@/lib/director-roster";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { boardDocumentRepository } from "@/lib/vault";
import { boardMeetingsRepository, type BoardMeetingsDocumentClient } from "@/lib/meetings-repository";
import { roleCanManageBoardMeetings, isBoardAccessRole, type BoardAccessRecord } from "@/lib/board-access";
import type { BoardMember } from "@/lib/session";
import { IdeaError, ideaDiscussionOpen, ideaId, ideaText, type AgendaIdea, type IdeaChoices, type IdeaDetail, type IdeaMessage, type IdeaRevision } from "@/lib/agenda-ideas";

const INDEX = "AGENDA_IDEAS";
const pk = (id: string) => `AGENDA_IDEA#${ideaId(id)}`;
type Row = Record<string, unknown>;
const defaults = {
  client: documentClient as BoardMeetingsDocumentClient,
  table: BOARD_MEETINGS_TABLE,
  access: boardAccessRepository,
  audit: boardAuditLedger,
  documents: boardDocumentRepository,
  meetings: boardMeetingsRepository,
  now: () => new Date().toISOString(),
};

/** Every entry point checks the current registry. Writes bind that check and the
 * audit append to the same transaction; there is no email or deletion path. */
export function createAgendaIdeasService(deps: typeof defaults = defaults) {
  const { client, table } = deps;
  async function access(member: BoardMember): Promise<BoardAccessRecord> {
    const record = await deps.access.getByEmail(member.email);
    if (!member.id || !record || record.status !== "active" || !isBoardAccessRole(record.role)) throw new IdeaError("Active Board access is required.", 403);
    return record;
  }
  async function get(id: string): Promise<AgendaIdea> {
    const result = await client.get({ TableName: table, Key: { pk: pk(id), sk: "META" }, ConsistentRead: true });
    if (!result.Item || result.Item.entityType !== "AGENDA_IDEA") throw new IdeaError("Agenda idea not found.", 404);
    return result.Item.idea as AgendaIdea;
  }
  async function queryAll(partition: string, prefix?: string): Promise<Row[]> {
    const rows: Row[] = [];
    let cursor: Row | undefined;
    do {
      const response = await client.query({ TableName: table, ConsistentRead: true,
        KeyConditionExpression: `#pk = :pk${prefix ? " AND begins_with(#sk, :prefix)" : ""}`,
        ExpressionAttributeNames: { "#pk": "pk", ...(prefix ? { "#sk": "sk" } : {}) },
        ExpressionAttributeValues: { ":pk": partition, ...(prefix ? { ":prefix": prefix } : {}) },
        ...(cursor ? { ExclusiveStartKey: cursor } : {}),
      });
      rows.push(...(response.Items || [])); cursor = response.LastEvaluatedKey;
    } while (cursor);
    return rows;
  }
  function put(row: Row, condition = "attribute_not_exists(pk)") {
    return { Put: { TableName: table, Item: row, ConditionExpression: condition } };
  }
  function metadata(idea: AgendaIdea, previous?: AgendaIdea) {
    return { Put: { TableName: table, Item: { pk: pk(idea.id), sk: "META", entityType: "AGENDA_IDEA", version: idea.version, idea },
      ...(previous ? { ConditionExpression: "#version = :version", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": previous.version } } : { ConditionExpression: "attribute_not_exists(pk)" }),
    } };
  }
  async function transaction(items: Row[]) {
    try { await client.transactWrite({ TransactItems: items }); }
    catch (error) {
      if (["TransactionCanceledException", "ConditionalCheckFailedException"].includes((error as Error).name)) throw new IdeaError("The record or your access changed. Refresh and try again.", 409);
      throw error;
    }
  }
  async function mutationItems(member: BoardMember, actor: BoardAccessRecord, idea: AgendaIdea, previous: AgendaIdea | undefined, action: string, message: IdeaMessage | null = null) {
    const id = randomUUID();
    const history: IdeaRevision = { id, action, actorName: actor.name, occurredAt: idea.updatedAt, idea, message };
    const audit = await deps.audit.buildAppendItems({
      category: "meeting", action: `agenda_idea_${action}`, outcome: "success",
      actor: authenticatedActor({ ...member, role: actor.role }),
      target: { type: "agenda-idea", id: idea.id, version: String(idea.version) },
      metadata: new Map([["revisionSha256", createHash("sha256").update(JSON.stringify(history)).digest("hex")]]),
      idempotencyKey: `agenda-idea-${id}`, occurredAt: idea.updatedAt,
    });
    return [metadata(idea, previous), put({ pk: pk(idea.id), sk: `REVISION#${idea.updatedAt}#${id}`, entityType: "AGENDA_IDEA_REVISION", history }), accessRecordGuard(actor), ...(audit.TransactItems as Row[])];
  }
  async function documentIds(value: unknown): Promise<string[]> {
    if (!Array.isArray(value) || value.length > 10) throw new IdeaError("Select up to ten library documents.");
    const ids = [...new Set(value.map(ideaId))];
    for (const id of ids) {
      const doc = await deps.documents.getDocument(id);
      if (!doc || doc.status !== "active" || doc.ownerType === "meeting") throw new IdeaError("Select active documents from the Board library.");
    }
    return ids;
  }
  async function visibleMeeting(id: string | null) {
    if (!id) return null;
    const record = await deps.meetings.getMeeting(id);
    return record && record.meeting.status !== "draft" ? record : null;
  }
  async function content(body: Row) {
    const preferredMeetingId = body.preferredMeetingId ? ideaId(body.preferredMeetingId) : null;
    if (preferredMeetingId) {
      const meeting = await visibleMeeting(preferredMeetingId);
      if (!meeting || !["scheduled", "materials-published"].includes(meeting.meeting.status) || meeting.meeting.endAt <= deps.now()) throw new IdeaError("Choose an upcoming published meeting, or Future meeting.");
    }
    return {
      title: ideaText(body.title, "Title", 200), description: ideaText(body.description, "Explanation", 10000),
      presenter: ideaText(body.presenter ?? "", "Presenter", 200, true),
      preferredMeetingId, documentIds: await documentIds(body.documentIds ?? []),
    };
  }
  function expected(idea: AgendaIdea, body: Row) {
    if (!Number.isSafeInteger(body.expectedVersion) || body.expectedVersion !== idea.version) throw new IdeaError("This idea changed. Refresh before saving.", 409);
  }
  function manager(actor: BoardAccessRecord) {
    if (!roleCanManageBoardMeetings(actor.role)) throw new IdeaError("Only the Chair or Executive Director can manage agenda placement and status.", 403);
  }
  return {
    async list(member: BoardMember, cursor?: string) {
      const actor = await access(member);
      if (cursor && (typeof cursor !== "string" || cursor.length > 180 || !/^[\dTZ:.\-]+#[a-zA-Z0-9_-]+$/.test(cursor))) throw new IdeaError("Invalid page.");
      const page = await client.query({ TableName: table, ConsistentRead: true, Limit: 25, ScanIndexForward: false,
        KeyConditionExpression: "#pk = :pk", ExpressionAttributeNames: { "#pk": "pk" }, ExpressionAttributeValues: { ":pk": INDEX },
        ...(cursor ? { ExclusiveStartKey: { pk: INDEX, sk: cursor } } : {}),
      });
      const ideas = await Promise.all((page.Items || []).map(async (row: Row) => {
        const idea = await get(String(row.ideaId));
        const read = await client.get({ TableName: table, Key: { pk: `AGENDA_IDEAS_READ#${actor.id}`, sk: idea.id }, ConsistentRead: true });
        return { ...idea, unread: Number(read.Item?.version ?? 0) < idea.version };
      }));
      return { ideas: ideas as (AgendaIdea & { unread: boolean })[], cursor: page.LastEvaluatedKey?.sk as string | undefined };
    },
    async choices(member: BoardMember): Promise<IdeaChoices> {
      await access(member);
      const [docs, page] = await Promise.all([deps.documents.listDocuments({ status: "active" }), deps.meetings.listMeetings({ scope: "upcoming", limit: 100 })]);
      return {
        documents: docs.filter((d) => d.status === "active" && d.ownerType !== "meeting").map((d) => ({ id: d.documentId, title: d.displayName || d.title })),
        meetings: page.meetings.filter((m) => ["scheduled", "materials-published"].includes(m.status) && m.endAt > deps.now()).map((m) => ({ id: m.id, title: m.title, version: m.version, startAt: m.startAt, timeZone: m.timeZone })),
      };
    },
    async detail(member: BoardMember, id: string): Promise<IdeaDetail> {
      const actor = await access(member);
      let idea = await get(id);
      let rows = await queryAll(pk(id));
      const latest = await get(id);
      if (latest.version !== idea.version) {
        idea = latest;
        rows = await queryAll(pk(id));
        if ((await get(id)).version !== idea.version) throw new IdeaError("Activity changed while loading. Refresh to see the latest discussion.", 409);
      }
      const docs = await Promise.all(idea.documentIds.map((docId) => deps.documents.getDocument(docId)));
      const [preferred, scheduled] = await Promise.all([visibleMeeting(idea.preferredMeetingId), visibleMeeting(idea.scheduledMeetingId)]);
      return { idea, viewerAccessId: actor.id, canManage: roleCanManageBoardMeetings(actor.role),
        messages: rows.filter((r) => r.entityType === "AGENDA_IDEA_MESSAGE").map((r) => r.message as IdeaMessage).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
        history: rows.filter((r) => r.entityType === "AGENDA_IDEA_REVISION").map((r) => r.history as IdeaRevision).sort((a, b) => a.idea.version - b.idea.version),
        documents: docs.filter((d) => d && d.status === "active" && d.ownerType !== "meeting").map((d) => ({ id: d!.documentId, title: d!.displayName || d!.title })),
        preferredMeeting: preferred ? { id: preferred.meeting.id, title: preferred.meeting.title } : null,
        scheduledMeeting: scheduled ? { id: scheduled.meeting.id, title: scheduled.meeting.title, status: scheduled.meeting.status, agendaItemActive: scheduled.agendaItems.some((a) => a.id === idea.agendaItemId && a.status === "active") } : null,
      };
    },
    async execute(member: BoardMember, body: Row) {
      const actor = await access(member);
      const action = body.action;
      const at = deps.now();
      if (action === "create") {
        const id = ideaId(body.id);
        const idea: AgendaIdea = { ...await content(body), id, authorAccessId: actor.id, authorName: actor.name,
          status: "open", reason: "", version: 1, createdAt: at, updatedAt: at, editedAt: null, scheduledMeetingId: null, agendaItemId: null };
        await transaction([...await mutationItems(member, actor, idea, undefined, "created"), put({ pk: INDEX, sk: `${at}#${id}`, ideaId: id })]);
        return { id };
      }
      const previous = await get(ideaId(body.id));
      if (action === "read") {
        if (!Number.isSafeInteger(body.expectedVersion) || Number(body.expectedVersion) < 1 || Number(body.expectedVersion) > previous.version) throw new IdeaError("Invalid read version.");
        const key = { pk: `AGENDA_IDEAS_READ#${actor.id}`, sk: previous.id };
        const seen = await client.get({ TableName: table, Key: key, ConsistentRead: true });
        if (Number(seen.Item?.version ?? 0) >= Number(body.expectedVersion)) return { id: previous.id };
        await transaction([{ Put: { TableName: table, Item: { ...key, version: body.expectedVersion },
          ConditionExpression: "attribute_not_exists(pk) OR #version <= :version", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": body.expectedVersion } } }, accessRecordGuard(actor)]);
        return { id: previous.id };
      }
      expected(previous, body);
      const idea = { ...previous, version: previous.version + 1, updatedAt: at };
      if (action === "edit") {
        if (actor.id !== previous.authorAccessId) throw new IdeaError("Only the author can edit this idea.", 403);
        if (!ideaDiscussionOpen(previous)) throw new IdeaError("Reopen the idea before editing.");
        Object.assign(idea, await content(body), { editedAt: at });
        await transaction(await mutationItems(member, actor, idea, previous, "edited"));
      } else if (action === "status") {
        manager(actor);
        if (!["open", "deferred", "closed"].includes(String(body.status))) throw new IdeaError("Choose Open, Deferred, or Closed.");
        // Once placed, the meeting agenda owns that placement. A status change
        // must not silently remove/reassign the agenda item or enable duplicates.
        if (previous.scheduledMeetingId && body.status !== "closed") throw new IdeaError("This idea is already linked to an agenda. Manage that agenda in its meeting.");
        idea.status = body.status as "open" | "deferred" | "closed";
        idea.reason = ideaText(body.reason, "Status explanation", 2000);
        await transaction(await mutationItems(member, actor, idea, previous, "status_changed"));
      } else if (action === "withdraw") {
        if (actor.id !== previous.authorAccessId) throw new IdeaError("Only the author can withdraw this idea.", 403);
        if (previous.scheduledMeetingId || !ideaDiscussionOpen(previous)) throw new IdeaError("Only unscheduled, open or deferred ideas can be withdrawn.");
        idea.status = "withdrawn"; idea.reason = ideaText(body.reason, "Withdrawal explanation", 2000);
        await transaction(await mutationItems(member, actor, idea, previous, "withdrawn"));
      } else if (action === "comment" || action === "editComment") {
        if (!ideaDiscussionOpen(previous)) throw new IdeaError("Discussion is closed.");
        const id = ideaId(body.messageId);
        let message: IdeaMessage;
        if (action === "editComment") {
          const row = await client.get({ TableName: table, Key: { pk: pk(idea.id), sk: `MESSAGE#${id}` }, ConsistentRead: true });
          if (!row.Item) throw new IdeaError("Comment not found.", 404);
          message = row.Item.message as IdeaMessage;
          if (message.authorAccessId !== actor.id) throw new IdeaError("Only the author can edit this comment.", 403);
          message = { ...message, body: ideaText(body.body, "Comment", 10000), editedAt: at };
        } else {
          let replyToId = body.replyToId ? ideaId(body.replyToId) : null;
          if (replyToId) {
            const row = await client.get({ TableName: table, Key: { pk: pk(idea.id), sk: `MESSAGE#${replyToId}` }, ConsistentRead: true });
            if (!row.Item) throw new IdeaError("Reply target not found in this idea.");
            replyToId = (row.Item.message as IdeaMessage).replyToId || replyToId;
          }
          message = { id, authorAccessId: actor.id, authorName: actor.name, body: ideaText(body.body, "Comment", 10000), replyToId, createdAt: at, editedAt: null };
        }
        await transaction([...await mutationItems(member, actor, idea, previous, action === "comment" ? "commented" : "comment_edited", message),
          put({ pk: pk(idea.id), sk: `MESSAGE#${id}`, entityType: "AGENDA_IDEA_MESSAGE", message }, action === "comment" ? "attribute_not_exists(pk)" : "attribute_exists(pk)")]);
      } else if (action === "schedule") {
        manager(actor);
        if (previous.scheduledMeetingId || !["open", "deferred"].includes(previous.status)) throw new IdeaError("Only unscheduled open or deferred ideas can be added to an agenda.");
        const record = await deps.meetings.getMeeting(ideaId(body.meetingId));
        if (!record || !["scheduled", "materials-published"].includes(record.meeting.status) || record.meeting.endAt <= at) throw new IdeaError("Select an upcoming published meeting.");
        if (record.meeting.version !== body.meetingVersion) throw new IdeaError("The meeting changed. Refresh before adding the idea.", 409);
        const allottedMinutes = body.allottedMinutes === null || body.allottedMinutes === "" ? null : Number(body.allottedMinutes);
        if (allottedMinutes !== null && (!Number.isInteger(allottedMinutes) || allottedMinutes < 1 || allottedMinutes > 480)) throw new IdeaError("Choose between 1 and 480 minutes.");
        const agendaItemId = `idea-${idea.id}`;
        idea.status = "scheduled"; idea.scheduledMeetingId = record.meeting.id; idea.agendaItemId = agendaItemId; idea.reason = "Added to the meeting agenda.";
        await deps.meetings.upsertAgendaItem({
          id: agendaItemId, meetingId: record.meeting.id, expectedVersion: record.meeting.version,
          sourceIdeaId: idea.id, title: ideaText(body.title, "Agenda title", 200), description: ideaText(body.description, "Agenda description", 10000),
          presenter: ideaText(body.presenter ?? "", "Presenter", 200, true), allottedMinutes, kind: "discussion", status: "active",
          order: Math.max(-1, ...record.agendaItems.map((a) => a.order)) + 1, actorEmail: actor.email, occurredAt: at,
        }, { additionalTransactItems: await mutationItems(member, actor, idea, previous, "scheduled") });
      } else throw new IdeaError("Unknown agenda idea action.");
      return { id: idea.id };
    },
  };
}

export const agendaIdeasService = createAgendaIdeasService();

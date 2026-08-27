import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import {
  canManageBoardMeetings,
  canPrepareBoardMeetings,
  resolveBoardMemberState,
  type BoardMember,
} from "@/lib/session";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { boardDocumentRepository } from "@/lib/vault";
import {
  BOARD_ACTION_ITEM_STATUSES,
  BOARD_AGENDA_ITEM_KINDS,
  BOARD_ATTENDANCE_STATUSES,
  BOARD_MEETING_FORMATS,
  BOARD_MEETING_STATUSES,
  BOARD_MEETING_TYPES,
  BOARD_MINUTES_STATUSES,
  BoardMeetingVersionConflictError,
  type BoardMeetingStatus,
} from "@/lib/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Authorization =
  | { response: NextResponse; member: null }
  | { response: null; member: BoardMember };

async function authorize(request: NextRequest, capability: "read" | "prepare" | "manage", stepUp: boolean): Promise<Authorization> {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") {
    return { response: NextResponse.json({ error: "Authentication required." }, { status: 401 }), member: null };
  }
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return { response: assurance, member: null };
  if (capability === "prepare" && !canPrepareBoardMeetings(state.member)) {
    return { response: NextResponse.json({ error: "Meeting preparation access required." }, { status: 403 }), member: null };
  }
  if (capability === "manage" && !canManageBoardMeetings(state.member)) {
    return { response: NextResponse.json({ error: "Meeting management access required." }, { status: 403 }), member: null };
  }
  if (stepUp) {
    const verification = await requireBoardStepUp(request.headers, state.member);
    if (verification) return { response: verification, member: null };
  }
  return { response: null, member: state.member };
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function integer(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function memberOf<T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return values.includes(value as T[number]) ? value as T[number] : fallback;
}

async function auditItems(member: BoardMember, input: {
  action: string;
  meetingId: string;
  version: number;
  metadata?: ReadonlyArray<readonly [string, string | number | boolean | null]>;
}) {
  return (await boardAuditLedger.buildAppendItems({
    category: "meeting",
    action: input.action,
    outcome: "success",
    actor: authenticatedActor(member),
    target: { type: "meeting", id: input.meetingId, version: String(input.version) },
    metadata: input.metadata?.length ? new Map(input.metadata) : undefined,
    idempotencyKey: randomUUID(),
    occurredAt: new Date().toISOString(),
  })).TransactItems as Record<string, unknown>[];
}

export async function GET(request: NextRequest) {
  const authorization = await authorize(request, "read", false);
  if (authorization.response) return authorization.response;
  const scope = request.nextUrl.searchParams.get("view") === "past" ? "past" : "upcoming";
  const requestedLimit = integer(request.nextUrl.searchParams.get("limit"), 25);
  const limit = Math.min(Math.max(requestedLimit, 1), 100);
  try {
    const page = await boardMeetingsRepository.listMeetings({ scope, limit });
    const maySeeDrafts = canPrepareBoardMeetings(authorization.member);
    return NextResponse.json({
      meetings: page.meetings.filter((meeting) => maySeeDrafts || meeting.status !== "draft"),
      cursor: page.cursor,
    });
  } catch (error) {
    console.error("[board] failed to list meetings", error);
    return NextResponse.json({ error: "Unable to load Board meetings." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action);
  const capability = action === "rsvp"
    ? "read"
    : action === "setStatus" || action === "confirmQuorum" || action === "recordDecision"
      ? "manage"
      : "prepare";
  const authorization = await authorize(request, capability, action !== "rsvp");
  if (authorization.response) return authorization.response;
  const member = authorization.member;
  const meetingId = text(body?.meetingId || body?.id);
  const expectedVersion = integer(body?.expectedVersion);

  try {
    if (action === "create") {
      const id = randomUUID();
      const audit = await auditItems(member, { action: "meeting_created", meetingId: id, version: 1 });
      const meeting = await boardMeetingsRepository.createMeeting({
        id,
        title: text(body?.title),
        description: text(body?.description),
        type: memberOf(body?.type, BOARD_MEETING_TYPES, "regular"),
        format: memberOf(body?.format, BOARD_MEETING_FORMATS, "live"),
        startAt: text(body?.startAt),
        endAt: text(body?.endAt),
        timeZone: text(body?.timeZone) || "America/New_York",
        location: text(body?.location),
        virtualUrl: nullableText(body?.virtualUrl),
        quorumRequired: body?.quorumRequired == null || body?.quorumRequired === "" ? null : integer(body.quorumRequired),
        actorEmail: member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting }, { status: 201 });
    }

    if (!meetingId || expectedVersion < 1) {
      return NextResponse.json({ error: "meetingId and expectedVersion are required." }, { status: 400 });
    }

    if (action === "rsvp") {
      const current = await boardMeetingsRepository.getMeeting(meetingId);
      if (current?.meeting.format === "asynchronous") return NextResponse.json({ error: "Asynchronous meetings use authenticated ballots rather than attendance responses." }, { status: 409 });
      const status = memberOf(body?.status, ["accepted", "declined", "tentative"] as const, "accepted");
      const audit = await auditItems(member, {
        action: "meeting_rsvp_recorded",
        meetingId,
        version: expectedVersion + 1,
        metadata: [["response", status]],
      });
      const meeting = await boardMeetingsRepository.recordAttendance({
        meetingId,
        expectedVersion,
        actorEmail: member.email,
        userId: member.id,
        name: member.name,
        email: member.email,
        status,
        arrivedAt: null,
        departedAt: null,
        quorumEligible: member.role === "member" || member.role === "chair" || member.role === "admin",
        notes: "",
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "update") {
      const current = await boardMeetingsRepository.getMeeting(meetingId);
      if (!current) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
      if (body?.format !== undefined && body.format !== current.meeting.format) {
        if (current.meeting.status !== "draft") return NextResponse.json({ error: "The meeting format cannot change after scheduling." }, { status: 409 });
        if (current.asyncBallots.length > 0) return NextResponse.json({ error: "The meeting format cannot change after a written resolution has been prepared." }, { status: 409 });
      }
      if (!canManageBoardMeetings(member)) {
        if (current.meeting.status !== "draft") {
          return NextResponse.json({ error: "Only the Chair or Executive Director may change a published meeting." }, { status: 403 });
        }
      }
      const audit = await auditItems(member, { action: "meeting_updated", meetingId, version: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.updateMeeting({
        id: meetingId,
        expectedVersion,
        actorEmail: member.email,
        ...(body?.title !== undefined ? { title: text(body.title) } : {}),
        ...(body?.description !== undefined ? { description: text(body.description) } : {}),
        ...(body?.type !== undefined ? { type: memberOf(body.type, BOARD_MEETING_TYPES, "regular") } : {}),
        ...(body?.format !== undefined ? { format: memberOf(body.format, BOARD_MEETING_FORMATS, "live") } : {}),
        ...(body?.startAt !== undefined ? { startAt: text(body.startAt) } : {}),
        ...(body?.endAt !== undefined ? { endAt: text(body.endAt) } : {}),
        ...(body?.timeZone !== undefined ? { timeZone: text(body.timeZone) } : {}),
        ...(body?.location !== undefined ? { location: text(body.location) } : {}),
        ...(body?.virtualUrl !== undefined ? { virtualUrl: nullableText(body.virtualUrl) } : {}),
        ...(body?.quorumRequired !== undefined ? { quorumRequired: body.quorumRequired == null || body.quorumRequired === "" ? null : integer(body.quorumRequired) } : {}),
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "setStatus") {
      const status = memberOf(body?.status, BOARD_MEETING_STATUSES, "draft") as BoardMeetingStatus;
      if (status === "completed") {
        const current = await boardMeetingsRepository.getMeeting(meetingId);
        const unfinished = current?.meeting.format === "asynchronous" && current.asyncBallots.some((ballot) => ballot.status === "draft" || ballot.status === "open");
        if (unfinished) return NextResponse.json({ error: "Finalize or cancel every asynchronous ballot before completing the meeting." }, { status: 409 });
      }
      const audit = await auditItems(member, {
        action: status === "cancelled" ? "meeting_cancelled" : `meeting_${status.replaceAll("-", "_")}`,
        meetingId,
        version: expectedVersion + 1,
        metadata: [["status", status]],
      });
      const meeting = await boardMeetingsRepository.changeStatus({
        id: meetingId,
        expectedVersion,
        status,
        cancellationReason: nullableText(body?.cancellationReason),
        actorEmail: member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "confirmQuorum") {
      const current = await boardMeetingsRepository.getMeeting(meetingId);
      if (current?.meeting.format === "asynchronous") return NextResponse.json({ error: "Quorum is calculated separately for each asynchronous ballot." }, { status: 409 });
      const confirmed = body?.confirmed !== false;
      const audit = await auditItems(member, {
        action: confirmed ? "meeting_quorum_confirmed" : "meeting_quorum_cleared",
        meetingId,
        version: expectedVersion + 1,
      });
      const meeting = await boardMeetingsRepository.confirmQuorum({
        meetingId,
        expectedVersion,
        confirmed,
        actorEmail: member.email,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "upsertAgendaItem" || action === "removeAgendaItem") {
      const itemId = text(body?.itemId) || randomUUID();
      const removed = action === "removeAgendaItem";
      const audit = await auditItems(member, { action: removed ? "agenda_item_removed" : "agenda_item_updated", meetingId, version: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.upsertAgendaItem({
        meetingId,
        expectedVersion,
        actorEmail: member.email,
        id: itemId,
        order: integer(body?.order),
        title: text(body?.title) || (removed ? "Removed agenda item" : ""),
        description: text(body?.description),
        kind: memberOf(body?.kind, BOARD_AGENDA_ITEM_KINDS, "information"),
        presenter: text(body?.presenter),
        allottedMinutes: body?.allottedMinutes == null ? null : integer(body.allottedMinutes),
        status: removed ? "removed" : "active",
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "recordAttendance") {
      const current = await boardMeetingsRepository.getMeeting(meetingId);
      if (current?.meeting.format === "asynchronous") return NextResponse.json({ error: "Asynchronous meetings do not use attendance records." }, { status: 409 });
      const attendeeEmail = text(body?.email).toLowerCase();
      const audit = await auditItems(member, { action: "attendance_recorded", meetingId, version: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.recordAttendance({
        meetingId,
        expectedVersion,
        actorEmail: member.email,
        // Manual attendance entries do not necessarily map to an auth user. The
        // normalized email gives those entries a stable key so corrections
        // update the same attendee instead of creating duplicates.
        userId: text(body?.userId) || `email:${attendeeEmail}`,
        name: text(body?.name),
        email: attendeeEmail,
        status: memberOf(body?.status, BOARD_ATTENDANCE_STATUSES, "invited"),
        arrivedAt: nullableText(body?.arrivedAt),
        departedAt: nullableText(body?.departedAt),
        quorumEligible: body?.quorumEligible !== false,
        notes: text(body?.notes),
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "recordDecision") {
      const current = await boardMeetingsRepository.getMeeting(meetingId);
      if (current?.meeting.format === "asynchronous") {
        return NextResponse.json({ error: "Asynchronous decisions must be finalized from their authenticated ballots." }, { status: 409 });
      }
      const decisionId = text(body?.decisionId) || randomUUID();
      const audit = await auditItems(member, { action: "decision_recorded", meetingId, version: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.recordDecision({
        meetingId,
        expectedVersion,
        actorEmail: member.email,
        id: decisionId,
        agendaItemId: nullableText(body?.agendaItemId),
        title: text(body?.title),
        motion: text(body?.motion),
        mover: nullableText(body?.mover),
        seconder: nullableText(body?.seconder),
        yes: integer(body?.yes),
        no: integer(body?.no),
        abstain: integer(body?.abstain),
        recused: integer(body?.recused),
        outcome: ["passed", "failed", "withdrawn", "tabled"].includes(body?.outcome) ? body.outcome : "passed",
        supersedesDecisionId: nullableText(body?.supersedesDecisionId),
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "upsertActionItem") {
      const actionItemId = text(body?.actionItemId) || randomUUID();
      const audit = await auditItems(member, { action: "action_item_recorded", meetingId, version: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.recordActionItem({
        meetingId,
        expectedVersion,
        actorEmail: member.email,
        id: actionItemId,
        agendaItemId: nullableText(body?.agendaItemId),
        description: text(body?.description),
        ownerId: nullableText(body?.ownerId),
        ownerName: text(body?.ownerName),
        dueAt: nullableText(body?.dueAt),
        status: memberOf(body?.status, BOARD_ACTION_ITEM_STATUSES, "open"),
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    if (action === "setMinutesStatus") {
      const status = memberOf(body?.status, BOARD_MINUTES_STATUSES, "not-started");
      if ((status === "approved" || status === "amended") && !canManageBoardMeetings(member)) {
        return NextResponse.json({ error: "Only the Chair or Executive Director may record minutes approval." }, { status: 403 });
      }
      const documentId = nullableText(body?.documentId);
      if (status !== "not-started") {
        const document = documentId ? await boardDocumentRepository.getDocument(documentId) : null;
        if (!document || document.ownerType !== "meeting" || document.meetingId !== meetingId || document.meetingSection !== "minutes" || document.status !== "active") {
          return NextResponse.json({ error: "Select an active minutes document owned by this meeting." }, { status: 400 });
        }
      }
      const audit = await auditItems(member, { action: `minutes_${status.replaceAll("-", "_")}`, meetingId, version: expectedVersion + 1 });
      const meeting = await boardMeetingsRepository.setMinutes({
        meetingId,
        expectedVersion,
        actorEmail: member.email,
        status,
        documentId,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ meeting });
    }

    return NextResponse.json({ error: "Unsupported meeting action." }, { status: 400 });
  } catch (error) {
    if (error instanceof BoardMeetingVersionConflictError) {
      return NextResponse.json({ error: "This meeting changed. Refresh and try again." }, { status: 409 });
    }
    const message = error instanceof Error ? error.message : "Unable to update the meeting.";
    console.error("[board] meeting operation failed", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

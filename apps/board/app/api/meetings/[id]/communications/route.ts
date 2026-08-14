import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { buildMeetingCalendar } from "@/lib/meeting-calendar";
import {
  buildBoardMeetingEmail,
  buildMeetingCommunicationIdempotencyKey,
  buildMeetingPortalUrl,
  deliverBoardMeetingEmail,
  type MeetingCommunicationKind,
} from "@/lib/meeting-email";
import { BOARD_DELIVERY_KINDS } from "@/lib/meetings";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { EMAIL_FROM, SITE_URL } from "@/lib/config";
import { canSendBoardMeetingCommunications, resolveBoardMemberState } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionKinds: Record<string, MeetingCommunicationKind> = {
  "send-invitation": "invitation",
  "send-materials-ready": "materials-ready",
  "send-reminder": "reminder",
  "send-update": "update",
  "send-cancellation": "cancellation",
};

function normalizeRequestedRecipients(value: unknown) {
  if (!Array.isArray(value)) return null;
  return new Set(value.map((email) => typeof email === "string" ? email.trim().toLowerCase() : "").filter(Boolean));
}

function communicationAllowed(kind: MeetingCommunicationKind, status: string) {
  if (kind === "cancellation") return status === "cancelled";
  if (kind === "materials-ready") return status === "materials-published";
  if (kind === "reminder" || kind === "invitation" || kind === "update") {
    return status === "scheduled" || status === "materials-published";
  }
  return false;
}

function configuredOrganizer() {
  const bracketed = EMAIL_FROM.match(/<([^<>]+)>\s*$/)?.[1]?.trim();
  return { email: bracketed || EMAIL_FROM.trim(), name: "PGPZ Board" };
}

async function deliveryAuditItems(input: {
  member: Parameters<typeof authenticatedActor>[0];
  action: string;
  meetingId: string;
  meetingVersion: number;
  deliveryId: string;
  kind: MeetingCommunicationKind;
  recipientEmail: string;
  outcome: "success" | "failure";
}) {
  return (await boardAuditLedger.buildAppendItems({
    category: "meeting",
    action: input.action,
    outcome: input.outcome,
    actor: authenticatedActor(input.member),
    target: { type: "meeting-delivery", id: input.deliveryId, version: String(input.meetingVersion) },
    metadata: new Map<string, string | number | boolean | null>([
      ["meetingId", input.meetingId],
      ["kind", input.kind],
      ["recipient", input.recipientEmail],
    ]),
    idempotencyKey: randomUUID(),
    occurredAt: new Date().toISOString(),
  })).TransactItems as Record<string, unknown>[];
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  if (!canSendBoardMeetingCommunications(state.member)) {
    return NextResponse.json({ error: "Meeting communications access required." }, { status: 403 });
  }
  const verification = await requireBoardStepUp(request.headers, state.member);
  if (verification) return verification;

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const requestedKind = typeof body?.kind === "string" && BOARD_DELIVERY_KINDS.includes(body.kind)
    ? body.kind as MeetingCommunicationKind
    : actionKinds[typeof body?.action === "string" ? body.action : ""];
  if (!requestedKind) return NextResponse.json({ error: "Select a valid meeting communication." }, { status: 400 });

  const detail = await boardMeetingsRepository.getMeeting(id);
  if (!detail) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  const meeting = detail.meeting;
  const expectedVersion = Number(body?.expectedVersion);
  if (Number.isInteger(expectedVersion) && expectedVersion > 0 && expectedVersion !== meeting.version) {
    return NextResponse.json({ error: "This meeting changed. Refresh before sending." }, { status: 409 });
  }
  if (!communicationAllowed(requestedKind, meeting.status)) {
    return NextResponse.json({ error: "That communication is not available for the meeting's current status." }, { status: 409 });
  }

  const roster = await boardAccessRepository.list({ status: "active", limit: 250 });
  const requestedRecipients = normalizeRequestedRecipients(body?.recipientEmails);
  const recipients = roster.records
    .filter((record) => !requestedRecipients || requestedRecipients.has(record.email))
    .map((record) => ({ email: record.email, name: record.name }))
    .sort((a, b) => a.email.localeCompare(b.email));
  if (recipients.length === 0) {
    return NextResponse.json({ error: "No active Board recipients were selected." }, { status: 400 });
  }

  const communicationId = typeof body?.communicationId === "string" && body.communicationId.trim()
    ? body.communicationId.trim().slice(0, 200)
    : randomUUID();
  const portalUrl = buildMeetingPortalUrl(SITE_URL, meeting.id);
  const sent: string[] = [];
  const failed: string[] = [];
  const skipped: string[] = [];

  for (const recipient of recipients) {
    const attemptId = randomUUID();
    const idempotencyKey = buildMeetingCommunicationIdempotencyKey({
      communicationId,
      meetingId: meeting.id,
      kind: requestedKind,
      sequence: meeting.version,
      recipientEmail: recipient.email,
    });
    if (detail.deliveries.some((delivery) => delivery.idempotencyKey === idempotencyKey && (delivery.status === "sent" || delivery.status === "pending"))) {
      skipped.push(recipient.email);
      continue;
    }
    const pendingId = randomUUID();
    const pendingAudit = await deliveryAuditItems({
      member: state.member,
      action: "meeting_communication_requested",
      meetingId: meeting.id,
      meetingVersion: meeting.version,
      deliveryId: pendingId,
      kind: requestedKind,
      recipientEmail: recipient.email,
      outcome: "success",
    });
    await boardMeetingsRepository.recordDelivery({
      id: pendingId,
      communicationId,
      attemptId,
      meetingId: meeting.id,
      kind: requestedKind,
      status: "pending",
      recipientEmail: recipient.email,
      idempotencyKey,
      actorEmail: state.member.email,
      failureReason: null,
    }, { additionalTransactItems: pendingAudit });

    let emailAcceptedForDelivery = false;
    try {
      const includeCalendar = requestedKind === "invitation" || requestedKind === "update" || requestedKind === "cancellation";
      const calendar = includeCalendar ? buildMeetingCalendar({
        meetingId: meeting.id,
        title: meeting.title,
        startsAt: meeting.startAt,
        endsAt: meeting.endAt,
        portalUrl,
        sequence: meeting.version,
        method: requestedKind === "cancellation" ? "CANCEL" : "REQUEST",
        description: meeting.description,
        location: meeting.location,
        virtualUrl: meeting.virtualUrl,
        // Calendar updates and cancellations must retain the same organizer,
        // regardless of whether the Chair or Executive Director sends them.
        organizer: configuredOrganizer(),
        attendee: recipient,
      }) : null;
      await deliverBoardMeetingEmail(buildBoardMeetingEmail({
        kind: requestedKind,
        meetingId: meeting.id,
        meetingTitle: meeting.title,
        startsAt: meeting.startAt,
        timeZone: meeting.timeZone,
        portalUrl,
        recipient,
        location: meeting.location,
        virtualUrl: meeting.virtualUrl,
        calendar,
      }));
      emailAcceptedForDelivery = true;
      const resultId = randomUUID();
      const audit = await deliveryAuditItems({
        member: state.member,
        action: "meeting_communication_sent",
        meetingId: meeting.id,
        meetingVersion: meeting.version,
        deliveryId: resultId,
        kind: requestedKind,
        recipientEmail: recipient.email,
        outcome: "success",
      });
      await boardMeetingsRepository.recordDelivery({
        id: resultId, communicationId, attemptId, meetingId: meeting.id, kind: requestedKind,
        status: "sent", recipientEmail: recipient.email, idempotencyKey, actorEmail: state.member.email,
        failureReason: null,
      }, { additionalTransactItems: audit });
      sent.push(recipient.email);
    } catch (error) {
      const resultId = randomUUID();
      const audit = await deliveryAuditItems({
        member: state.member,
        action: emailAcceptedForDelivery ? "meeting_communication_result_unconfirmed" : "meeting_communication_failed",
        meetingId: meeting.id,
        meetingVersion: meeting.version,
        deliveryId: resultId,
        kind: requestedKind,
        recipientEmail: recipient.email,
        outcome: "failure",
      });
      await boardMeetingsRepository.recordDelivery({
        id: resultId, communicationId, attemptId, meetingId: meeting.id, kind: requestedKind,
        status: "failed", recipientEmail: recipient.email, idempotencyKey, actorEmail: state.member.email,
        failureReason: emailAcceptedForDelivery ? "delivery_result_unconfirmed" : "delivery_failed",
      }, { additionalTransactItems: audit });
      console.error(`[board] meeting communication failed for ${recipient.email}`, error);
      failed.push(recipient.email);
    }
  }

  return NextResponse.json({
    communicationId,
    sentCount: sent.length,
    skippedCount: skipped.length,
    failedCount: failed.length,
    failed,
  }, { status: failed.length ? 207 : 200 });
}

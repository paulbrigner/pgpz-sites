import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { canParticipateBoardDiscussions, resolveBoardMemberState } from "@/lib/session";
import { boardMeetingsRepository } from "@/lib/meetings-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

async function discussionAuditItems(input: {
  member: Parameters<typeof authenticatedActor>[0];
  action: "async_discussion_message_created" | "async_discussion_message_edited";
  meetingId: string;
  meetingVersion: number;
  ballotId: string;
  messageId: string;
  body: string;
  replyToMessageId: string | null;
  occurredAt: string;
}) {
  return (await boardAuditLedger.buildAppendItems({
    category: "meeting",
    action: input.action,
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "meeting-discussion-message", id: input.messageId, version: input.occurredAt },
    metadata: new Map([
      ["meetingId", input.meetingId],
      ["meetingVersion", String(input.meetingVersion)],
      ["ballotId", input.ballotId],
      ["replyToMessageId", input.replyToMessageId || ""],
      ["bodySha256", createHash("sha256").update(input.body).digest("hex")],
    ]),
    idempotencyKey: randomUUID(),
    occurredAt: input.occurredAt,
  })).TransactItems as Record<string, unknown>[];
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  if (!canParticipateBoardDiscussions(state.member)) {
    return NextResponse.json({ error: "Your Board role has read-only access to resolution discussions." }, { status: 403 });
  }
  const verification = await requireBoardStepUp(request.headers, state.member);
  if (verification) return verification;

  const { id: meetingId } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action);
  const ballotId = text(body?.ballotId);
  const messageBody = text(body?.body);
  const occurredAt = new Date().toISOString();
  const detail = await boardMeetingsRepository.getMeeting(meetingId);
  if (!detail) return NextResponse.json({ error: "Board meeting not found." }, { status: 404 });

  try {
    if (action === "createMessage") {
      const messageId = text(body?.messageId) || randomUUID();
      const replyToMessageId = text(body?.replyToMessageId) || null;
      const audit = await discussionAuditItems({
        member: state.member, action: "async_discussion_message_created",
        meetingId, meetingVersion: detail.meeting.version, ballotId, messageId,
        body: messageBody, replyToMessageId, occurredAt,
      });
      const message = await boardMeetingsRepository.createAsyncDiscussionMessage({
        meetingId, ballotId, id: messageId, replyToMessageId, body: messageBody,
        authorUserId: state.member.id, authorName: state.member.name,
        authorEmail: state.member.email, occurredAt,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ message });
    }

    if (action === "editMessage") {
      const messageId = text(body?.messageId);
      const current = detail.asyncDiscussionMessages.find((message) => message.id === messageId && message.ballotId === ballotId);
      const audit = await discussionAuditItems({
        member: state.member, action: "async_discussion_message_edited",
        meetingId, meetingVersion: detail.meeting.version, ballotId, messageId,
        body: messageBody, replyToMessageId: current?.replyToMessageId || null, occurredAt,
      });
      const message = await boardMeetingsRepository.editAsyncDiscussionMessage({
        meetingId, ballotId, messageId, body: messageBody,
        expectedUpdatedAt: text(body?.expectedUpdatedAt), authorUserId: state.member.id,
        occurredAt,
      }, { additionalTransactItems: audit });
      return NextResponse.json({ message });
    }

    return NextResponse.json({ error: "Select a valid discussion action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The discussion message could not be saved.";
    const conflict = /changed|closed|Conditional|Transaction/i.test(message);
    return NextResponse.json({ error: message }, { status: conflict ? 409 : 400 });
  }
}

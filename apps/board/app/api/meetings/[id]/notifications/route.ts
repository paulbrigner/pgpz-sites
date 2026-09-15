import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveBoardMemberState } from "@/lib/session";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { executiveAccessRecord } from "@/lib/executive-session-access";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { meetingNotificationsRepository } from "@/lib/meeting-notifications-repository";
import { parseNotificationPreference } from "@/lib/meeting-notifications";
import { notificationMeetingVisible, notificationBallotVisible } from "@/lib/meeting-notification-access";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

async function handle(request: NextRequest, context: Context, save: boolean) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  if (save) { const stepUp = await requireBoardStepUp(request.headers, state.member); if (stepUp) return stepUp; }
  const access = await executiveAccessRecord(state.member);
  if (access?.status !== "active") return NextResponse.json({ error: "Notification subscriptions require active access in the Board user registry." }, { status: 403 });
  const { id } = await context.params;
  const detail = await boardMeetingsRepository.getMeeting(id);
  if (!detail || !notificationMeetingVisible(detail.meeting.status, access.role)) return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  const ballots = detail.asyncBallots.filter((b) => notificationBallotVisible(b, access.role)).map((b) => ({ id: b.id, title: b.title }));
  if (!save) return NextResponse.json({ preference: await meetingNotificationsRepository.get(id, access.id), ballots, email: access.email }, { headers: { "Cache-Control": "private, no-store" } });
  try {
    const preference = parseNotificationPreference(await request.json(), ballots.map((b) => b.id));
    const audit = await boardAuditLedger.buildAppendItems({ category: "meeting", action: "meeting_notification_preferences_updated", outcome: "success", actor: authenticatedActor(state.member), target: { type: "meeting-notification-preference", id: `${id}:${access.id}`, version: String(preference.version + 1) }, metadata: new Map([["meetingId", id], ["enabled", String(preference.enabled)]]), idempotencyKey: randomUUID(), occurredAt: new Date().toISOString() });
    return NextResponse.json({ preference: await meetingNotificationsRepository.save(id, state.member, access, preference, audit.TransactItems as Record<string, unknown>[]) });
  } catch (error) {
    if (["TransactionCanceledException", "ConditionalCheckFailedException"].includes((error as Error).name)) return NextResponse.json({ error: "Your settings or access changed. Refresh and try again." }, { status: 409 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to save notification settings." }, { status: 400 });
  }
}
export const GET = (request: NextRequest, context: Context) => handle(request, context, false);
export const PUT = (request: NextRequest, context: Context) => handle(request, context, true);

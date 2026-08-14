import { NextRequest, NextResponse } from "next/server";
import { auditBestEffort, authenticatedActor } from "@/lib/audit";
import { requireBoardPasskeySession } from "@/lib/api-security";
import { buildMeetingCalendar } from "@/lib/meeting-calendar";
import { buildMeetingPortalUrl } from "@/lib/meeting-email";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { SITE_URL } from "@/lib/config";
import { canPrepareBoardMeetings, resolveBoardMemberState } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const { id } = await context.params;
  const detail = await boardMeetingsRepository.getMeeting(id);
  if (!detail || (detail.meeting.status === "draft" && !canPrepareBoardMeetings(state.member))) {
    return NextResponse.json({ error: "Meeting not found." }, { status: 404 });
  }
  if (detail.meeting.status === "cancelled") {
    return NextResponse.json({ error: "This meeting was cancelled." }, { status: 409 });
  }
  const meeting = detail.meeting;
  const artifact = buildMeetingCalendar({
    meetingId: meeting.id,
    title: meeting.title,
    startsAt: meeting.startAt,
    endsAt: meeting.endAt,
    portalUrl: buildMeetingPortalUrl(SITE_URL, meeting.id),
    sequence: meeting.version,
    method: "PUBLISH",
    description: meeting.description,
    location: meeting.location,
    virtualUrl: meeting.virtualUrl,
  });
  await auditBestEffort({
    category: "meeting",
    action: "calendar_downloaded",
    outcome: "success",
    actor: authenticatedActor(state.member),
    target: { type: "meeting", id: meeting.id, version: String(meeting.version) },
  });
  return new NextResponse(artifact.content, {
    headers: {
      "content-type": artifact.contentType,
      "content-disposition": `attachment; filename="${artifact.filename}"`,
      "cache-control": "private, no-store",
    },
  });
}

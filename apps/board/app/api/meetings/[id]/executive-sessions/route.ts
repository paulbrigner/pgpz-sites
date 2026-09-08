import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { BOARD_MEETINGS_TABLE } from "@/lib/config";
import { executiveApi, executiveJson, executiveJsonBody } from "@/lib/executive-session-api";
import { executiveMutationGuards, requireExecutiveCreator, visibleExecutiveSessions } from "@/lib/executive-session-access";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { executiveText, isDirectorRole, ExecutiveSessionError, type ExecutiveSession } from "@/lib/executive-sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  return executiveApi(request, false, async (member) => {
    const { id } = await context.params;
    const sessions = await visibleExecutiveSessions(member, id);
    return executiveJson({ sessions: sessions.map((s) => ({ id: s.id, title: s.title, status: s.status })) });
  });
}

export async function POST(request: NextRequest, context: Context) {
  return executiveApi(request, true, async (member) => {
    const creator = await requireExecutiveCreator(member);
    const { id: meetingId } = await context.params;
    const meeting = (await boardMeetingsRepository.getMeeting(meetingId))?.meeting;
    if (!meeting) throw new ExecutiveSessionError(404, "Meeting not found.");
    if (!["scheduled", "materials-published"].includes(meeting.status)) throw new ExecutiveSessionError(409, "Schedule the ordinary meeting before opening a restricted session.");
    const body = await executiveJsonBody(request);
    const title = executiveText(body.title, "Title", 200);
    const purpose = executiveText(body.purpose, "Purpose and exclusions", 4000);
    const ids = body.participantIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 30 || ids.some((id) => typeof id !== "string") || new Set(ids).size !== ids.length) {
      throw new ExecutiveSessionError(400, "Select between 1 and 30 distinct participants.");
    }
    const selected = await Promise.all((ids as string[]).map((id) => boardAccessRepository.getById(id)));
    if (selected.some((r) => !r || r.status !== "active" || (!isDirectorRole(r.role) && r.role !== "legal-counsel"))) {
      throw new ExecutiveSessionError(400, "Select only active directors and explicitly invited Legal Counsel.");
    }
    const records = selected.map((r) => r!);
    const facilitator = records.find((r) => r.id === body.facilitatorId && isDirectorRole(r.role));
    if (!facilitator) throw new ExecutiveSessionError(400, "Choose a participating director to facilitate this session.");
    const session: ExecutiveSession = {
      id: randomUUID(), meetingId, title, purpose, facilitatorId: facilitator.id,
      participants: records.map((r) => ({ accessId: r.id, email: r.email, name: r.name, kind: isDirectorRole(r.role) ? "director" : "counsel" })),
      status: "open", version: 1, createdAt: new Date().toISOString(), createdBy: member.id,
      closedAt: null, closedBy: null, publishedAt: null,
    };
    const guards = await executiveMutationGuards(member, session.id, "created", [creator, ...records]);
    guards.push({ ConditionCheck: {
      TableName: BOARD_MEETINGS_TABLE, Key: { pk: `MEETING#${meetingId}`, sk: "META" },
      ConditionExpression: "#version = :version", ExpressionAttributeNames: { "#version": "version" }, ExpressionAttributeValues: { ":version": meeting.version },
    } });
    await executiveSessionsRepository.create(session, guards);
    return executiveJson({ id: session.id, participating: records.some((r) => r.id === creator.id) }, 201);
  });
}

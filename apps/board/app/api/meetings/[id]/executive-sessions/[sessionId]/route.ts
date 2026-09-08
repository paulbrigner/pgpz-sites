import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { executiveApi, executiveJson, executiveJsonBody, requireExecutiveVersion } from "@/lib/executive-session-api";
import { executiveMutationGuards, requireExecutiveAccess } from "@/lib/executive-session-access";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { executiveText, executiveMaterialView, ExecutiveSessionError } from "@/lib/executive-sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return executiveApi(request, false, async (member) => {
    const { id, sessionId } = await context.params;
    const { session, canManage } = await requireExecutiveAccess(member, id, sessionId);
    const [messages, materials] = await Promise.all([executiveSessionsRepository.messages(sessionId), executiveSessionsRepository.materials(sessionId)]);
    return executiveJson({ session, canManage, messages, materials: materials.map(executiveMaterialView) });
  });
}

export async function POST(request: NextRequest, context: Context) {
  return executiveApi(request, true, async (member) => {
    const { id, sessionId } = await context.params;
    // Conceal the session before parsing actions or returning validation details.
    const { session, record, canManage } = await requireExecutiveAccess(member, id, sessionId);
    const body = await executiveJsonBody(request);
    requireExecutiveVersion(body.expectedVersion, session.version);
    const action = body.action;
    if (!["message", "close", "publish"].includes(String(action))) throw new ExecutiveSessionError(400, "Invalid session action.");
    if (action !== "message" && !canManage) throw new ExecutiveSessionError(403, "Only the facilitating director can close or publish this session.");
    if (action === "message") {
      const message = { id: randomUUID(), authorId: member.id, authorName: member.name, body: executiveText(body.body, "Message", 12000), createdAt: new Date().toISOString() };
      await executiveSessionsRepository.append(session, message, "MESSAGE", await executiveMutationGuards(member, sessionId, "message_added", [record]));
    } else if (action === "close") {
      await executiveSessionsRepository.close(session, member.id, await executiveMutationGuards(member, sessionId, "closed", [record]));
    } else {
      if (body.confirmPublication !== true) throw new ExecutiveSessionError(400, "Confirm that this exact summary may be shared with all active Board portal users.");
      const summary = executiveText(body.summary, "Reviewed outcome", 12000);
      await executiveSessionsRepository.publish(session, summary, member.name, await executiveMutationGuards(member, sessionId, "outcome_published", [record]));
    }
    return executiveJson({ ok: true });
  });
}

import type { NextRequest } from "next/server";
import { executiveApi, executiveBody, executiveJson, requireExecutiveVersion } from "@/lib/executive-session-api";
import { executiveMutationGuards, requireExecutiveAccess } from "@/lib/executive-session-access";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { retainExecutiveMaterial } from "@/lib/executive-session-storage";
import { executiveText, EXECUTIVE_MATERIAL_MAX_BYTES, ExecutiveSessionError } from "@/lib/executive-sessions";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; sessionId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return executiveApi(request, true, async (member) => {
    const { id, sessionId } = await context.params;
    const { session, record } = await requireExecutiveAccess(member, id, sessionId, true);
    if (session.status !== "open") throw new ExecutiveSessionError(409, "This session is closed and its record is read-only.");
    const bytes = await executiveBody(request, EXECUTIVE_MATERIAL_MAX_BYTES + 64 * 1024);
    let form: FormData;
    try { form = await new Response(bytes as BodyInit, { headers: { "content-type": request.headers.get("content-type") || "" } }).formData(); }
    catch { throw new ExecutiveSessionError(400, "Invalid upload."); }
    requireExecutiveVersion(Number(form.get("expectedVersion")), session.version);
    const title = executiveText(form.get("title"), "Material title", 200);
    const file = form.get("file");
    if (!(file instanceof File)) throw new ExecutiveSessionError(400, "Choose a file.");
    const material = await retainExecutiveMaterial(file, title, member.id);
    // Read the global audit head only after the slower storage work so unrelated
    // audit activity during retention does not invalidate this upload.
    const guards = await executiveMutationGuards(member, sessionId, "material_added", [record]);
    // A simultaneous close or access revocation rejects the metadata write.
    // An unreferenced retained object remains private; retention forbids deleting it.
    await executiveSessionsRepository.append(session, material, "MATERIAL", guards);
    return executiveJson({ id: material.id }, 201);
  });
}

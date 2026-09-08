import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { executiveApi } from "@/lib/executive-session-api";
import { requireExecutiveAccess } from "@/lib/executive-session-access";
import { executiveSessionsRepository } from "@/lib/executive-sessions-repository";
import { readExecutiveMaterial } from "@/lib/executive-session-storage";
import { ExecutiveSessionError } from "@/lib/executive-sessions";
import { authenticatedActor, boardAuditLedger } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; sessionId: string; materialId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return executiveApi(request, false, async (member) => {
    const { id, sessionId, materialId } = await context.params;
    await requireExecutiveAccess(member, id, sessionId);
    const material = (await executiveSessionsRepository.materials(sessionId)).find((item) => item.id === materialId);
    if (!material) throw new ExecutiveSessionError(404, "Material not found.");
    const bytes = await readExecutiveMaterial(material);
    // Recheck after storage access; never issue a reusable presigned download URL.
    await requireExecutiveAccess(member, id, sessionId);
    await boardAuditLedger.append({
      category: "document_read", action: "executive_material_downloaded", outcome: "success", actor: authenticatedActor(member),
      target: { type: "executive-session", id: sessionId, version: materialId },
      idempotencyKey: randomUUID(), occurredAt: new Date().toISOString(),
    });
    return new Response(bytes as BodyInit, { headers: {
      "Content-Type": material.mimeType, "Content-Length": String(bytes.byteLength),
      "Content-Disposition": `attachment; filename="restricted-material"; filename*=UTF-8''${encodeURIComponent(material.fileName).replace(/'/g, "%27")}`,
      "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff",
    } });
  });
}

import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { canManageBoardDocuments, canPrepareBoardMeetings, resolveBoardMemberState } from "@/lib/session";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { boardDocumentRepository } from "@/lib/vault";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { SITE_URL } from "@/lib/config";
import { executiveJson as json, executiveJsonBody } from "@/lib/executive-session-api";
import { ExecutiveSessionError } from "@/lib/executive-sessions";
import { BoardMeetingVersionConflictError } from "@/lib/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return json({ error: "Authentication required." }, 401);
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  if (!canManageBoardDocuments(state.member)) return json({ error: "Document management access required." }, 403);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(SITE_URL).origin) return json({ error: "Invalid request origin." }, 403);
  const verification = await requireBoardStepUp(request.headers, state.member);
  if (verification) return verification;

  try {
    const { id: meetingId } = await context.params;
    const body = await executiveJsonBody(request);
    const action = text(body.action);
    if (!["add", "remove"].includes(action)) return json({ error: "Select a valid preparation-material action." }, 400);
    const expectedVersion = Number(body.expectedVersion);
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) return json({ error: "A meeting version is required." }, 400);
    const record = await boardMeetingsRepository.getMeeting(meetingId);
    if (!record || (record.meeting.status === "draft" && !canPrepareBoardMeetings(state.member))) return json({ error: "Meeting not found." }, 404);
    if (record.meeting.version !== expectedVersion) return json({ error: "The meeting changed. Refresh and try again." }, 409);
    if (!["draft", "scheduled", "materials-published"].includes(record.meeting.status)) return json({ error: "Preparation references can change only in an active meeting." }, 409);
    const audit = await boardAuditLedger.buildAppendItems({
      category: "meeting", action: `meeting_material_reference_${action === "add" ? "added" : "removed"}`, outcome: "success",
      actor: authenticatedActor(state.member), target: { type: "meeting", id: meetingId, version: String(expectedVersion + 1) },
      idempotencyKey: randomUUID(), occurredAt: new Date().toISOString(),
    });
    const options = { additionalTransactItems: audit.TransactItems as Record<string, unknown>[] };
    const input = { meetingId, expectedVersion, actorEmail: state.member.email };
    if (action === "remove") {
      const referenceId = text(body.referenceId);
      if (!record.materialReferences.some((ref) => ref.id === referenceId && ref.status === "active")) return json({ error: "Preparation reference not found." }, 404);
      const meeting = await boardMeetingsRepository.removeMaterialReference({ ...input, referenceId }, options);
      return json({ meeting });
    }
    const documentId = text(body.documentId), versionId = text(body.versionId);
    if (!documentId || !versionId) return json({ error: "Choose an exact library document version." }, 400);
    const document = await boardDocumentRepository.getDocument(documentId);
    if (!document || document.ownerType !== "library" || document.status !== "active") return json({ error: "Choose an active Document Library item." }, 400);
    const version = document.currentVersion.versionId === versionId ? document.currentVersion
      : (await boardDocumentRepository.listVersions(documentId)).find((candidate) => candidate.versionId === versionId);
    if (!version) return json({ error: "That document version is unavailable. Refresh the library choices." }, 400);
    const meeting = await boardMeetingsRepository.addMaterialReference({ ...input, document: {
      documentId, versionId, title: document.displayName || document.title, description: document.description,
      sequence: version.sequence, fileName: version.originalFileName, sha256: version.sha256,
    } }, options);
    return json({ meeting });
  } catch (error) {
    if (error instanceof ExecutiveSessionError) return json({ error: error.message }, error.status);
    if (error instanceof BoardMeetingVersionConflictError) return json({ error: "The meeting changed. Refresh and try again." }, 409);
    if (error instanceof Error && error.message === "This document version is already in Preparation materials.") return json({ error: error.message }, 409);
    if (error instanceof Error && error.message === "A meeting may reference at most 50 library document versions.") return json({ error: error.message }, 400);
    return json({ error: "The reference could not be saved. Refresh the meeting and try again." }, 409);
  }
}

import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { roleCanManageBoardMeetings } from "@/lib/board-access";
import { ExecutiveSessionError } from "@/lib/executive-sessions";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { canManageBoardMeetings, resolveBoardMemberState } from "@/lib/session";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { boardDocumentRepository } from "@/lib/vault";
import { accessRecordGuard, readDirectorRoster } from "@/lib/director-roster";
import { executiveJson as json, executiveJsonBody } from "@/lib/executive-session-api";
import { SITE_URL } from "@/lib/config";
import { validateConsentAdoption, type ConsentAttachment } from "@/lib/written-consents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return json({ error: "Authentication required." }, 401);
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(SITE_URL).origin) return json({ error: "Invalid request origin." }, 403);
  const verification = await requireBoardStepUp(request.headers, state.member);
  if (verification) return verification;

  try {
    const { id: meetingId } = await context.params;
    const body = await executiveJsonBody(request);
    const action = text(body.action);
    const ballotId = text(body.ballotId) || randomUUID();
    if (ballotId.length > 200 || /[#\x00-\x1f]/.test(ballotId)) return json({ error: "Invalid resolution identifier." }, 400);
    const expectedVersion = Number(body.expectedVersion);
    const accessRecord = await boardAccessRepository.getByEmail(state.member.email);
    if (!accessRecord || accessRecord.status !== "active") return json({ error: "Active Board access is required." }, 403);
    if (!["signConsent", "withdrawConsent"].includes(action) && (!canManageBoardMeetings(state.member) || !roleCanManageBoardMeetings(accessRecord.role))) {
      return json({ error: "Only the Board Chair or Executive Director may manage written resolutions." }, 403);
    }
    if (["castVote", "finalizeBallot"].includes(action)) return json({ error: "Ordinary async voting is retired. Each resolution requires every director's signed consent." }, 409);
    const audit = await boardAuditLedger.buildAppendItems({
      category: "meeting", action: `written_consent_${action}`, outcome: "success",
      actor: authenticatedActor(state.member), target: { type: "meeting-ballot", id: ballotId, version: String(expectedVersion + 1) },
      metadata: new Map([["meetingId", meetingId]]), idempotencyKey: randomUUID(), occurredAt: new Date().toISOString(),
    });
    const options = { additionalTransactItems: audit.TransactItems as Record<string, unknown>[] };

    if (action === "saveBallot") {
      if (body.quorumRequired != null || body.approvalRequired != null) return json({ error: "Every director must consent; custom thresholds are not permitted." }, 400);
      const refs = body.attachments ?? [];
      if (!Array.isArray(refs) || refs.length > 20) return json({ error: "Select at most 20 document versions." }, 400);
      const attachments: ConsentAttachment[] = [];
      for (const ref of refs) {
        const documentId = text(ref?.documentId), versionId = text(ref?.versionId);
        if (!documentId || !versionId || attachments.some((item) => item.documentId === documentId)) throw new Error("Select each document once with its exact version.");
        const document = await boardDocumentRepository.getDocument(documentId);
        if (!document || document.status !== "active" || (document.ownerType === "meeting" && document.meetingId !== meetingId)) throw new Error("Select an active library document or a document in this workspace.");
        if (document.currentVersion.versionId !== versionId) throw new Error("A selected document changed. Refresh and review the current version before saving.");
        const version = document.currentVersion;
        attachments.push({ documentId, versionId, title: document.displayName || document.title, fileName: version.originalFileName, sequence: version.sequence, sha256: version.sha256 });
      }
      const meeting = await boardMeetingsRepository.upsertAsyncBallot({
        meetingId, expectedVersion, id: ballotId, agendaItemId: text(body.agendaItemId) || null,
        title: text(body.title), motion: text(body.motion), attachments, adoption: validateConsentAdoption(body.adoption, attachments), actorEmail: state.member.email,
      }, { additionalTransactItems: [accessRecordGuard(accessRecord), ...options.additionalTransactItems] });
      return json({ meeting, ballotId });
    }
    if (action === "openBallot") {
      const roster = await readDirectorRoster();
      if (!roster?.ready) return json({ error: "Consent collection needs the director-roster initialization described in the Board deployment runbook." }, 409);
      if (body.rosterRevision !== roster.revision) return json({ error: "The roster changed. Refresh and review every director before opening." }, 409);
      const meeting = await boardMeetingsRepository.openAsyncBallot({
        meetingId, expectedVersion, ballotId, roster, rosterConfirmed: body.rosterConfirmed === true,
        eligibleVoters: roster.directors.map(({ userId, name, email }) => ({ userId, name, email })), actorEmail: state.member.email,
      }, { additionalTransactItems: [accessRecordGuard(accessRecord), ...options.additionalTransactItems] });
      return json({ meeting });
    }
    if (action === "signConsent" || action === "withdrawConsent") {
      const result = await boardMeetingsRepository.signAsyncConsent({
        meetingId, expectedVersion, ballotId, action: action === "signConsent" ? "consent" : "withdraw",
        signatureName: text(body.signatureName), intent: body.intent === true, contentHash: text(body.contentHash),
        accessRecord, authenticatedUserId: state.member.id, roster: await readDirectorRoster(),
      }, options);
      return json(result);
    }
    if (action === "cancelBallot") {
      const meeting = await boardMeetingsRepository.cancelAsyncBallot({ meetingId, expectedVersion, ballotId, reason: text(body.reason), actorEmail: state.member.email }, { additionalTransactItems: [accessRecordGuard(accessRecord), ...options.additionalTransactItems] });
      return json({ meeting });
    }
    return json({ error: "Select a valid written-consent action." }, 400);
  } catch (error) {
    if (error instanceof ExecutiveSessionError) return json({ error: error.message }, error.status);
    // Expected validation messages contain no provider details or signature text.
    if (error instanceof Error && !/Exception$/.test(error.name)) {
      const status = /updated by another|changed|initialize/.test(error.message) ? 409 : 400;
      return json({ error: error.message }, status);
    }
    return json({ error: "The record changed or could not be saved. Refresh and verify your receipt before retrying." }, 409);
  }
}

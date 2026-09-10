import "server-only";
import { randomUUID } from "node:crypto";
import { boardDocumentRepository, VaultAuthorizationError, VaultValidationError } from "@/lib/vault";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { boardAccessRepository } from "@/lib/board-access-repository";
import { accessRecordGuard } from "@/lib/director-roster";
import { roleCanManageBoardMeetings } from "@/lib/board-access";
import { canManageBoardMeetings, type BoardMember } from "@/lib/session";
import { OptimisticConcurrencyError } from "@pgpz/document-vault/server";

/** An officer's recorded designation, separate from adoption and latest upload. */
export async function setDocumentInEffect(input: {
  member: BoardMember; documentId: string; versionId: string | null; expectedRevision: number; reason: string;
}) {
  if (!canManageBoardMeetings(input.member)) throw new VaultAuthorizationError();
  const access = await boardAccessRepository.getByEmail(input.member.email);
  if (!access || access.status !== "active" || !roleCanManageBoardMeetings(access.role)) throw new VaultAuthorizationError();
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0 || !input.reason.trim() || input.reason.trim().length > 1000) {
    throw new VaultValidationError("effect-input", "A current document revision and an explanation of up to 1,000 characters are required.");
  }
  const document = await boardDocumentRepository.getDocument(input.documentId);
  if (!document || document.ownerType === "meeting") throw new VaultValidationError("not-found", "Library document not found.");
  if (document.revision !== input.expectedRevision) throw new OptimisticConcurrencyError(input.documentId);
  if (input.versionId !== null && document.status !== "active") throw new VaultValidationError("archived", "Restore the document before marking a version in effect.");
  const version = input.versionId === null ? null : (await boardDocumentRepository.listVersions(input.documentId)).find((v) => v.versionId === input.versionId);
  if (input.versionId !== null && !version) throw new VaultValidationError("version", "Select a version belonging to this document.");
  const now = new Date().toISOString();
  const reason = input.reason.trim();
  const inEffect = version ? { versionId: version.versionId, sha256: version.sha256, reason, recordedAt: now, recordedBy: input.member.id } : null;
  const audit = await boardAuditLedger.buildAppendItems({
    category: "document_lifecycle", action: inEffect ? "document_in_effect_set" : "document_in_effect_cleared", outcome: "success",
    actor: authenticatedActor({ ...input.member, role: access.role }), target: { type: "document", id: document.documentId, version: version?.versionId ?? null },
    metadata: new Map<string, string | null>([["previous-version", document.inEffect?.versionId ?? null], ["sha256", version?.sha256 ?? null], ["reason", reason]]),
    idempotencyKey: `document-effect-${randomUUID()}`, occurredAt: now,
  });
  return boardDocumentRepository.setInEffect({ documentId: document.documentId, expectedRevision: input.expectedRevision, inEffect, reason, actorId: input.member.id, now }, [accessRecordGuard(access), ...audit.TransactItems]);
}

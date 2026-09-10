import "server-only";
import type { BoardAsyncBallot } from "./meetings";
import { consentDigest, consentPayload } from "./written-consent-integrity";
import { validateConsentAdoption } from "./written-consents";

/** Index rows are locators, never evidence on their own. Every read verifies
 * the retained action and all current receipts before claiming adoption. */
export function hasVerifiedAdoption(ballot: BoardAsyncBallot): boolean {
  const consent = ballot.consent;
  if ((consent?.schema !== 2 && consent?.schema !== 3) || !ballot.adoption || ballot.status !== "closed" || ballot.result?.outcome !== "passed" || !ballot.closedAt || !ballot.eligibleVoters.length) return false;
  try { validateConsentAdoption(ballot.adoption, ballot.attachments || []); } catch { return false; }
  if (consentDigest(consentPayload(ballot, consent)) !== consent.contentHash) return false;
  if (new Set(ballot.eligibleVoters.map((v) => v.userId)).size !== ballot.eligibleVoters.length || consent.receipts.length !== ballot.eligibleVoters.length) return false;
  return ballot.eligibleVoters.every((voter) => consent.receipts.filter((receipt) => receipt.accessId === voter.userId && receipt.email === voter.email && receipt.action === "consent" && receipt.contentHash === consent.contentHash && receipt.meetingId === ballot.meetingId && receipt.ballotId === ballot.id && receipt.statement === consent.statement && receipt.signatureName.trim() && receipt.authenticatedUserId).length === 1);
}

export function isAdoptionTarget(ballot: BoardAsyncBallot, documentId: string, versionId?: string) {
  return hasVerifiedAdoption(ballot) && Boolean(ballot.adoption?.targets.some((target) => target.documentId === documentId && (!versionId || target.versionId === versionId)));
}

export function documentAdoptionView(ballot: BoardAsyncBallot, documentId: string) {
  if (!isAdoptionTarget(ballot, documentId)) return null;
  const target = ballot.adoption!.targets.find((target) => target.documentId === documentId)!;
  const attachment = ballot.attachments!.find((doc) => doc.documentId === documentId && doc.versionId === target.versionId)!;
  const base = `/api/meetings/${encodeURIComponent(ballot.meetingId)}/ballots/${encodeURIComponent(ballot.id)}`;
  return {
    meetingId: ballot.meetingId, resolutionId: ballot.id, resolutionTitle: ballot.title,
    versionId: attachment.versionId, sequence: attachment.sequence, sha256: attachment.sha256,
    adoptedAt: ballot.closedAt!, effectiveTerms: ballot.adoption!.effectiveTerms,
    signatureCount: ballot.consent!.receipts.length, directorCount: ballot.eligibleVoters.length,
    recordHref: `${base}/record`, packetHref: `${base}/packet?document=${encodeURIComponent(documentId)}`,
    originalHref: `/api/documents/${encodeURIComponent(documentId)}/download?version=${encodeURIComponent(attachment.versionId)}&consentMeeting=${encodeURIComponent(ballot.meetingId)}&consentBallot=${encodeURIComponent(ballot.id)}`,
  };
}
export type DocumentAdoptionView = NonNullable<ReturnType<typeof documentAdoptionView>>;

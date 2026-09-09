import { createHash } from "node:crypto";
import type { DocumentVersion } from "@pgpz/document-vault";
import type { BoardAsyncBallot } from "../meetings";
import { CONSENT_STATEMENT, ROSTER_CONFIRMATION, WITHDRAWAL_STATEMENT } from "../written-consents";
import { consentDigest, consentPayload } from "../written-consent-integrity";

export function adoptedFixture(bytes: Uint8Array = new Uint8Array(Buffer.from("Approved policy")), mimeType = "text/plain") {
  const version: DocumentVersion = {
    versionId: "v1", sequence: 1, source: "upload", restoredFromVersionId: null,
    objectKey: "board/objects/doc/v1", originalFileName: mimeType === "application/pdf" ? "policy.pdf" : "policy.txt", mimeType, byteLength: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"), sha256Algorithm: "sha256", uploadedAt: "2026-09-09T12:00:00Z", uploadedBy: "chair",
  };
  const ballot: BoardAsyncBallot = {
    id: "b", meetingId: "m", title: "Adopt policy", motion: "Resolved, the attached policy is adopted.", consentMode: "unanimous-v1", status: "closed",
    eligibleVoters: Array.from({ length: 5 }, (_, i) => ({ userId: `d${i}`, name: `Director ${i}`, email: `d${i}@example.invalid` })),
    attachments: [{ documentId: "doc", versionId: "v1", title: "Policy", fileName: version.originalFileName, sequence: 1, sha256: version.sha256 }],
    adoption: { targets: [{ documentId: "doc", versionId: "v1" }], effectiveTerms: "Effective October 1, 2026, subject to the conditions in the resolution." },
    consent: { schema: 2, contentHash: "", rosterRevision: "roster1", rosterConfirmation: ROSTER_CONFIRMATION, confirmedBy: "chair", confirmedAt: "2026-09-10T12:00:00Z", startAt: "2026-09-10T12:00:00Z", endAt: "2026-09-15T12:00:00Z", statement: CONSENT_STATEMENT, withdrawalStatement: WITHDRAWAL_STATEMENT, receipts: [] },
    agendaItemId: null, rosterHash: "roster", quorumRequired: 5, approvalRequired: 5,
    openedAt: "2026-09-10T12:00:00Z", openedBy: "chair", closedAt: "2026-09-11T12:00:00Z", closedBy: "d4@example.invalid",
    cancellationReason: null, result: { yes: 5, no: 0, abstain: 0, recused: 0, ballotsCast: 5, quorumMet: true, outcome: "passed" },
    createdAt: "2026-09-09T12:00:00Z", createdBy: "chair", updatedAt: "2026-09-11T12:00:00Z", updatedBy: "director5",
  };
  ballot.consent!.contentHash = consentDigest(consentPayload(ballot, ballot.consent!));
  ballot.consent!.receipts = ballot.eligibleVoters.map((voter, i) => ({ id: `receipt${i}`, meetingId: "m", ballotId: "b", contentHash: ballot.consent!.contentHash, accessId: voter.userId, authenticatedUserId: `auth${i}`, email: voter.email, name: voter.name, signatureName: voter.name, action: "consent", statement: CONSENT_STATEMENT, receivedAt: "2026-09-11T12:00:00Z", supersedesReceiptId: null }));
  return { ballot, version, bytes, documentId: "doc", receipts: ballot.consent!.receipts, siteUrl: "https://board.example.invalid" };
}

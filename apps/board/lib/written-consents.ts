/** Client-safe text and record contract. Changing either declaration requires a
 * new schema version; opened records retain the exact declaration they used. */
export const CONSENT_STATEMENT = "I have reviewed this resolution and its identified document versions. I approve the action described, intend my typed name and authenticated submission to be my electronic signature, and deliver this signed consent to Pretty Good Policy for Zcash through its Board portal.";
export const WITHDRAWAL_STATEMENT = "I withdraw my consent to this resolution. I intend my typed name and authenticated submission to be my electronic signature and deliver this signed revocation to Pretty Good Policy for Zcash through its Board portal.";
export const ROSTER_CONFIRMATION = "I confirm that the listed directors are every director currently in office, and that this action is permitted without a meeting under the applicable articles, bylaws, and law. Any conflict or recusal requiring a different approval procedure has been resolved before collection.";

export interface ConsentAttachment {
  documentId: string;
  versionId: string;
  title: string;
  fileName: string;
  sequence: number;
  sha256: string;
}
/** Explicit adoption targets, signed alongside the resolution. Other attached
 * documents are supporting material and acquire no adoption status. */
export interface ConsentAdoption {
  targets: { documentId: string; versionId: string }[];
  /** Human-reviewed terms; the portal does not infer whether conditions are met. */
  effectiveTerms: string;
}

export function validateConsentAdoption(value: unknown, attachments: readonly ConsentAttachment[]): ConsentAdoption {
  if (value == null) return { targets: [], effectiveTerms: "" };
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid document adoption instructions.");
  const input = value as Record<string, unknown>;
  if (!Array.isArray(input.targets) || input.targets.length > 20 || typeof input.effectiveTerms !== "string" || input.effectiveTerms.length > 2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(input.effectiveTerms)) throw new Error("Select adoption targets and enter effective terms of at most 2000 characters.");
  const seen = new Set<string>();
  const targets = input.targets.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Invalid adoption target.");
    const { documentId, versionId } = value as Record<string, unknown>;
    if (typeof documentId !== "string" || typeof versionId !== "string" || seen.has(documentId) || !attachments.some((doc) => doc.documentId === documentId && doc.versionId === versionId)) throw new Error("Each adoption target must be an attached document version, selected once.");
    seen.add(documentId);
    return { documentId, versionId };
  });
  return { targets, effectiveTerms: input.effectiveTerms.trim() };
}
export interface ConsentReceipt {
  id: string;
  meetingId: string;
  ballotId: string;
  contentHash: string;
  accessId: string;
  authenticatedUserId: string;
  email: string;
  name: string;
  signatureName: string;
  action: "consent" | "withdraw";
  statement: string;
  receivedAt: string;
  supersedesReceiptId: string | null;
}
export interface WrittenConsent {
  schema: 1 | 2;
  contentHash: string;
  rosterRevision: string;
  rosterConfirmation: string;
  confirmedBy: string;
  confirmedAt: string;
  startAt: string;
  endAt: string;
  statement: string;
  withdrawalStatement: string;
  /** Latest receipt per director, including revocations. Full history is append-only. */
  receipts: ConsentReceipt[];
}

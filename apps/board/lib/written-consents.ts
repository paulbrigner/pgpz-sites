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
  schema: 1;
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

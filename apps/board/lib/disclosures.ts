/** Board-owned disclosure contracts. No disclosure answers belong in the ordinary library or meeting record. */
// Schema 1 prompts are immutable. Future questionnaire changes must introduce a new schema.
export const DISCLOSURE_CATEGORIES = [
  "Employers, clients, consulting, board or advisory roles, and relevant professional affiliations",
  "Ownership, investments, compensation, grants, creditors, vendors, and prospective relationships",
  "Material ZEC or other digital asset exposure relevant to PGPZ decisions",
  "Related persons or controlled entities with relevant interests",
  "Political roles, candidacy, fundraising, or campaign relationships reasonably attributable to PGPZ",
  "Gifts, sponsored travel, speaking fees, and other outside benefits",
  "Other actual, potential, or perceived conflicts",
] as const;

export const DISCLOSURE_ACKNOWLEDGMENT = "I have received, read, and agree to comply with the Conflict of Interest Policy. I have disclosed all interests that I reasonably believe may be material and will update this disclosure promptly if circumstances change. I understand that the Corporation may rely on this statement for governance, tax, grant, and public-accountability purposes.";
export const DISCLOSURE_ELECTRONIC_CONSENT = "By typing my name and selecting Sign and deliver, I intend to sign this individual disclosure electronically and deliver it to PGPZ for retention. This is my personal disclosure, not a Board vote or consent to a resolution.";

export type DisclosureIdentity = { accessId: string; email: string; name: string; role: string };
export type DisclosurePolicy = { documentId: string; versionId: string; title: string; sequence: number; sha256: string; adoption: "proposed" | "adopted" };
export type DisclosureForm = { roles: string; matter: string; answers: { choice: "" | "none" | "disclosed"; details: string }[] };
export type DisclosureDraft = { form: DisclosureForm; hash: string; savedAt: string };
/** Admission and register metadata only. Never add answers, private matter titles, or review notes here. */
export type DisclosureRequest = {
  id: string; version: number; kind: "annual" | "matter"; year: number; dueDate: string | null;
  subject: DisclosureIdentity; reviewer: DisclosureIdentity; counsel: DisclosureIdentity | null; excludedIds: string[];
  policy: DisclosurePolicy; createdAt: string; createdBy: string;
  status: "requested" | "submitted" | "needs-information" | "reviewed" | "satisfactory";
  revision: number; latestHash: string | null; lastNoticeAt: string | null; lastNoticeStatus: "sending" | "sent" | "unknown" | null;
};
export type DisclosureSubmission = {
  kind: "submission"; schema: 1; requestId: string; revision: number; previousHash: string | null;
  disclosureKind: DisclosureRequest["kind"]; year: number; policy: DisclosurePolicy; form: DisclosureForm;
  questions: readonly string[];
  actor: DisclosureIdentity & { userId: string }; signedName: string; deliveredAt: string;
  acknowledgment: string; electronicConsent: string; hash: string;
};
export type DisclosureEvent = DisclosureSubmission | {
  kind: "review" | "routing" | "notice"; at: string; actor: DisclosureIdentity;
  revision: number; note: string; outcome: string;
};
export type DisclosureView = { request: DisclosureRequest; events: DisclosureEvent[]; draft: DisclosureDraft | null; isSubject: boolean; isReviewer: boolean; isCounsel: boolean };
export type DisclosureRegisterRow = Pick<DisclosureRequest, "id" | "version" | "year" | "kind" | "dueDate" | "status" | "revision"> & { name: string; canOpen: boolean };
export type DisclosureCandidate = DisclosureIdentity;

export class DisclosureError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = "DisclosureError"; }
}
export const disclosureDirector = (role: string) => ["chair", "admin", "member"].includes(role);
export const disclosureChair = (role: string) => role === "chair" || role === "admin";
export const disclosureStatus = (status: DisclosureRequest["status"]) => ({ requested: "Awaiting signature", submitted: "Awaiting review", "needs-information": "Update requested", reviewed: "Review recorded", satisfactory: "Review complete — satisfactory" })[status];
/** Preserve legacy review outcomes; completion must be explicitly recorded. */
export function disclosureOutcome(outcome: string): string {
  if (outcome === "satisfactory" || outcome === "reviewed" || outcome === "needs-information") return disclosureStatus(outcome);
  return outcome === "counsel-advice" ? "Counsel advice recorded" : outcome;
}
export function disclosureAcknowledgment(policy: DisclosurePolicy) {
  return DISCLOSURE_ACKNOWLEDGMENT + (policy.adoption === "proposed" ? " This version is proposed; my agreement to comply takes effect upon its adoption. A materially changed policy requires a new acknowledgment." : "");
}
export function disclosureText(value: unknown, label: string, maximum: number, required = true): string {
  if (typeof value !== "string" || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || (required && !value.trim())) throw new DisclosureError(400, `${label} is required and must be no longer than ${maximum} characters.`);
  return value.trim();
}
export function normalizeDisclosureForm(value: unknown, kind: DisclosureRequest["kind"], complete = true): DisclosureForm {
  if (!value || typeof value !== "object") throw new DisclosureError(400, "Complete the disclosure form.");
  const form = value as Record<string, unknown>;
  if (!Array.isArray(form.answers) || form.answers.length !== DISCLOSURE_CATEGORIES.length) throw new DisclosureError(400, "Answer every disclosure category.");
  return {
    roles: disclosureText(form.roles, "Your roles", 300, complete),
    matter: disclosureText(form.matter, "Matter and relevant circumstances", 4000, complete && kind === "matter"),
    answers: form.answers.map((answer) => {
      if (!answer || !(complete ? ["none", "disclosed"] : ["", "none", "disclosed"]).includes(answer.choice)) throw new DisclosureError(400, "Select None or Disclose for every category.");
      const details = disclosureText(answer.details, "Disclosure details", 4000, complete && answer.choice === "disclosed");
      if (answer.choice === "none" && details) throw new DisclosureError(400, "Choose Disclose to retain details for this category.");
      return { choice: answer.choice, details };
    }),
  };
}

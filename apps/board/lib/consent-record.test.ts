import { describe, expect, it } from "vitest";
import { consentRecord, consentRecordHtml } from "./consent-record";
import { consentDigest, consentPayload } from "./written-consent-integrity";
import type { BoardAsyncBallot } from "./meetings";
import { CONSENT_STATEMENT, WITHDRAWAL_STATEMENT, ROSTER_CONFIRMATION, type ConsentReceipt } from "./written-consents";
const receipt = (email: string): ConsentReceipt => ({ id: email, meetingId: "m", ballotId: "b", contentHash: "hash", accessId: email, authenticatedUserId: email, email, name: email, signatureName: "<script>alert(1)</script>", action: "consent", statement: CONSENT_STATEMENT, receivedAt: "2026-09-10T12:00:00Z", supersedesReceiptId: null });
const receipts = [receipt("one@example.invalid"), receipt("two@example.invalid")];
const ballot = {
  id: "b", meetingId: "m", title: "<img src=x onerror=alert(1)>", motion: "Resolved, adopt this exact text.", consentMode: "unanimous-v1", status: "open", eligibleVoters: receipts.map((r) => ({ userId: r.accessId, name: r.name, email: r.email })),
  attachments: [{ documentId: "doc", versionId: "v1", sequence: 1, fileName: "bylaws.pdf", title: "Bylaws", sha256: "digest" }],
  consent: { schema: 1, contentHash: "hash", rosterRevision: "r1", rosterConfirmation: ROSTER_CONFIRMATION, confirmedBy: "chair", confirmedAt: "date", startAt: "start", endAt: "end", statement: CONSENT_STATEMENT, withdrawalStatement: WITHDRAWAL_STATEMENT, receipts },
  agendaItemId: null, rosterHash: "roster", quorumRequired: 2, approvalRequired: 2,
  openedAt: "2026-09-10T12:00:00Z", openedBy: "chair", closedAt: null, closedBy: null,
  cancellationReason: null, result: null, createdAt: "2026-09-10T12:00:00Z", createdBy: "chair",
  updatedAt: "2026-09-10T12:00:00Z", updatedBy: "chair",
} satisfies BoardAsyncBallot;
describe("per-resolution corporate record", () => {
  it("binds schema 3 descriptions to the digest and safely exports them", () => {
    const described: BoardAsyncBallot = { ...ballot, attachments: ballot.attachments.map(doc => ({ ...doc, description: "Comparison <script>private</script>" })), consent: { ...ballot.consent, schema: 3 } };
    described.consent!.contentHash = consentDigest(consentPayload(described, described.consent!));
    const record = consentRecord(described, receipts, receipts[0].email);
    expect(record.contentIntegrityVerified).toBe(true);
    expect(record.attachments[0].description).toBe("Comparison <script>private</script>");
    expect(consentRecordHtml(record)).toContain("Comparison &lt;script&gt;");
    expect(consentRecordHtml(record)).not.toContain("<script>");
    described.attachments![0].description = "Approve instead";
    expect(consentRecord(described, receipts, receipts[0].email).contentIntegrityVerified).toBe(false);
  });
  it.each([1, 2] as const)("preserves schema %s payloads and omits unsigned descriptions from records", (schema) => {
    const original = { ...ballot, consent: { ...ballot.consent, schema } };
    const described = { ...original, attachments: ballot.attachments.map(doc => ({ ...doc, description: "UNSIGNED DESCRIPTION" })) };
    expect(consentPayload(described, described.consent)).toEqual(consentPayload(original, original.consent));
    const record = consentRecord(described, receipts, receipts[0].email);
    expect(record.attachments[0]).not.toHaveProperty("description");
    expect(consentRecordHtml(record)).not.toContain("UNSIGNED DESCRIPTION");
  });

  it("keeps the digest stable when DynamoDB reorders nested map properties", () => {
    const reordered = { ...ballot,
      attachments: ballot.attachments.map((doc) => ({ sha256: doc.sha256, sequence: doc.sequence, fileName: doc.fileName, title: doc.title, versionId: doc.versionId, documentId: doc.documentId })),
      eligibleVoters: ballot.eligibleVoters.map((director) => ({ email: director.email, name: director.name, userId: director.userId })),
    };
    expect(consentDigest(consentPayload(reordered, ballot.consent))).toBe(consentDigest(consentPayload(ballot, ballot.consent)));
  });
  it("exports exact versions and only the viewer's receipts before adoption", () => {
    const record = consentRecord(ballot, receipts, receipts[0].email);
    expect(record.signatures).toHaveLength(1);
    expect(record.receiptHistory).toHaveLength(1);
    expect(record.status).toBe("not-adopted");
    expect(record.attachments[0].versionId).toBe("v1");
  });
  it("includes every signature on adoption and provides a reproducible content digest", () => {
    const hash = consentDigest(consentPayload(ballot, ballot.consent!));
    const adopted = { ...ballot, status: "closed" as const, closedAt: "2026-09-10T12:00:00Z", result: { yes: 2, no: 0, abstain: 0, recused: 0, ballotsCast: 2, quorumMet: true, outcome: "passed" as const }, consent: { ...ballot.consent!, contentHash: hash } };
    const record = consentRecord(adopted, receipts, "support@example.invalid");
    expect(record.signatures).toHaveLength(2);
    expect(record.contentIntegrityVerified).toBe(true);
    expect(consentDigest(record.canonicalPayload)).toBe(record.contentHash);
    expect(consentRecord({ ...adopted, motion: "Changed" }, receipts, receipts[0].email).contentIntegrityVerified).toBe(false);
  });
  it("escapes document and signature content in printable HTML", () => {
    const html = consentRecordHtml(consentRecord(ballot, receipts, receipts[0].email));
    expect(html).not.toContain("<script>"); expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("version=v1");
  });
});

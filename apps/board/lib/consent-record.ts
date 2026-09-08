import "server-only";
import { consentDigest, consentPayload } from "@/lib/written-consent-integrity";
import type { BoardAsyncBallot } from "@/lib/meetings";
import type { ConsentReceipt } from "@/lib/written-consents";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function consentRecord(ballot: BoardAsyncBallot, receipts: readonly ConsentReceipt[], viewerEmail: string) {
  if (!ballot.consent) throw new Error("A signed-consent record is not available for a legacy ballot.");
  const complete = ballot.status === "closed" && ballot.result?.outcome === "passed";
  const visible = (receipt: ConsentReceipt) => complete || receipt.email === viewerEmail;
  return {
    corporation: "Pretty Good Policy for Zcash", recordType: "Action without a meeting by unanimous written consent", schema: 1,
    meetingId: ballot.meetingId, resolutionId: ballot.id, title: ballot.title, resolution: ballot.motion,
    status: complete ? "adopted" : ballot.status === "cancelled" ? "cancelled-without-adoption" : "not-adopted",
    adoptedAt: complete ? ballot.closedAt : null,
    attachments: ballot.attachments || [], directors: ballot.eligibleVoters,
    canonicalPayload: consentPayload(ballot, ballot.consent),
    contentIntegrityVerified: consentDigest(consentPayload(ballot, ballot.consent)) === ballot.consent.contentHash,
    contentHash: ballot.consent.contentHash, rosterRevision: ballot.consent.rosterRevision,
    rosterConfirmation: ballot.consent.rosterConfirmation, confirmedBy: ballot.consent.confirmedBy, confirmedAt: ballot.consent.confirmedAt,
    startAt: ballot.consent.startAt, endAt: ballot.consent.endAt,
    consentStatement: ballot.consent.statement, withdrawalStatement: ballot.consent.withdrawalStatement,
    signatures: ballot.consent.receipts.filter((receipt) => receipt.action === "consent" && visible(receipt)),
    receiptHistory: receipts.filter(visible),
    receiptDisclosure: complete ? "Complete signature and withdrawal history." : "Before adoption, this export contains only the viewing director's receipts. All receipts remain retained by the corporation.",
  };
}

export function consentRecordHtml(record: ReturnType<typeof consentRecord>) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(record.title)} — consent record</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#152829}h1{line-height:1.2}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.meta{font-size:13px;overflow-wrap:anywhere}article{border-top:1px solid #aab8b8;margin-top:20px;padding-top:10px}a{color:#164b50}@media print{body{margin:0}article{break-inside:avoid}}</style></head><body>
  <p>${escape(record.corporation)}</p><h1>${escape(record.title)}</h1><p>${escape(record.recordType)}</p>
  <p><strong>${record.status === "adopted" ? `Adopted ${escape(record.adoptedAt)}` : "Not adopted"}</strong> · ${escape(record.status)}</p>
  <p class="meta">Workspace: ${escape(record.meetingId)} · Resolution: ${escape(record.resolutionId)}<br>SHA-256: ${escape(record.contentHash)}<br>Collection: ${escape(record.startAt)} through ${escape(record.endAt)}</p>
  ${record.contentIntegrityVerified ? "" : "<p><strong>Integrity check failed. This exported text does not match the signed resolution digest.</strong></p>"}
  <h2>Exact resolution</h2><pre>${escape(record.resolution)}</pre>
  <h2>Incorporated document versions</h2>${record.attachments.length ? record.attachments.map((doc) => `<article><a href="/api/documents/${encodeURIComponent(doc.documentId)}/download?version=${encodeURIComponent(doc.versionId)}&amp;consentMeeting=${encodeURIComponent(record.meetingId)}&amp;consentBallot=${encodeURIComponent(record.resolutionId)}">${escape(doc.title)} · v${escape(doc.sequence)}</a><p class="meta">${escape(doc.fileName)}<br>Version: ${escape(doc.versionId)}<br>SHA-256: ${escape(doc.sha256)}</p></article>`).join("") : "<p>None.</p>"}
  <h2>Every required director</h2><ul>${record.directors.map((director) => `<li>${escape(director.name)} (${escape(director.email)})</li>`).join("")}</ul>
  <p>${escape(record.rosterConfirmation)}</p><p class="meta">Confirmed by ${escape(record.confirmedBy)} at ${escape(record.confirmedAt)}. Roster revision: ${escape(record.rosterRevision)}</p>
  <h2>Electronic-signature declarations</h2><p>${escape(record.consentStatement)}</p><p>${escape(record.withdrawalStatement)}</p>
  <h2>Current signed consents</h2>${record.signatures.length ? record.signatures.map((receipt) => `<article><strong>${escape(receipt.signatureName)}</strong><p>${escape(receipt.name)} (${escape(receipt.email)})<br>Received by the corporation: ${escape(receipt.receivedAt)}</p><p class="meta">Receipt: ${escape(receipt.id)}<br>Authenticated user: ${escape(receipt.authenticatedUserId)} · Director access record: ${escape(receipt.accessId)}</p></article>`).join("") : "<p>No visible current consents.</p>"}
  <h2>Receipt history</h2><p>${escape(record.receiptDisclosure)}</p>${record.receiptHistory.map((receipt) => `<article><strong>${escape(receipt.action)}: ${escape(receipt.signatureName)}</strong><p class="meta">${escape(receipt.receivedAt)} · ${escape(receipt.email)}<br>Receipt: ${escape(receipt.id)}<br>Prior receipt: ${escape(receipt.supersedesReceiptId || "none")}<br>Resolution SHA-256: ${escape(receipt.contentHash)}</p></article>`).join("")}
  <p>Use your browser's Print command to retain a PDF copy. These records describe adoption of the resolution; conditions stated in its text still apply.</p></body></html>`;
}

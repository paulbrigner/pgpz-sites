import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import type { BoardAsyncBallot } from "./meetings";
import { resolutionReviewHash, resolutionReviewRecordHash } from "./resolution-review-integrity";
import { reviewProgress } from "./resolution-reviews";
import { consentDigest, consentPayload } from "./written-consent-integrity";
import { resolutionReviewThreads, resolutionReviewDiscussionHash } from "./resolution-review-discussion";

const escape = (value: unknown) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function resolutionReviewRecord(ballot: BoardAsyncBallot, history: readonly Record<string, unknown>[]) {
  const review = ballot.review, round = review?.round;
  if (!review || (!round && !review.everStarted)) throw new Error("A review round has not started for the current draft.");
  const threads = resolutionReviewThreads(review, history);
  const discussionVerified = !round?.finalization?.discussionHash || resolutionReviewDiscussionHash(round.id, threads) === round.finalization.discussionHash;
  return {
    schema: 1, corporation: "Pretty Good Policy for Zcash", recordType: "Director review before written consent",
    meetingId: ballot.meetingId, resolutionId: ballot.id, title: ballot.title, resolution: ballot.motion,
    resolutionStatus: ballot.status, adoptedAt: ballot.closedAt, instructions: review.instructions,
    attachments: ballot.attachments || [], adoption: ballot.adoption || null, round, progress: reviewProgress(round),
    integrityVerified: !round ? null : discussionVerified && resolutionReviewHash(ballot, round.reviewers, round.rosterRevision) === round.contentHash && (!ballot.consent || ballot.consent.schema !== 4 || consentDigest(consentPayload(ballot, ballot.consent)) === ballot.consent.contentHash),
    finalizedReviewHash: round?.finalization ? resolutionReviewRecordHash(review) : null,
    consentHash: ballot.consent?.contentHash || null,
    declaration: "This record documents individual reviews and findings presented for adoption. It is not a signed consent, a certification that all legal requirements were met, or an adoption record. Individual review dates are self-reported; recorded-at times are server timestamps. Sensitive deliberations and disclosures remain in their separate restricted records.",
    threads, history,
  };
}

export function resolutionReviewRecordHtml(record: ReturnType<typeof resolutionReviewRecord>) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(record.title)} - review record</title><style>body{font:16px/1.6 system-ui,sans-serif;max-width:850px;margin:40px auto;padding:0 24px;color:#152829}h1{line-height:1.2}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.meta{font-size:12px;overflow-wrap:anywhere}article{border-top:1px solid #aab8b8;margin-top:20px;padding-top:10px}a{color:#164b50}@media print{body{margin:0}article{break-inside:avoid}details{display:none}details.history[open]{display:block}}</style></head><body>
  <p>${escape(record.corporation)} | Directors only</p><h1>${escape(record.title)}</h1><h2>Review before consent</h2>
  <p>${escape(record.declaration)}</p><p><strong>${!record.round ? "No current review round; earlier reviews retained" : record.round.finalization ? "Review record finalized for consent" : "Review in progress"}</strong>${record.round ? ` - ${record.progress.ready} of ${record.progress.total} ready.` : "."} Resolution status: ${escape(record.resolutionStatus)}.</p>
  ${record.integrityVerified !== false ? "" : "<p><strong>Integrity check failed. Do not rely on this record until the Chair resolves the mismatch.</strong></p>"}
  <p class="meta">Workspace: ${escape(record.meetingId)}<br>Resolution: ${escape(record.resolutionId)}<br>Review round: ${escape(record.round?.id || "No current review round")}<br>Reviewed materials SHA-256: ${escape(record.round?.contentHash || "Not currently reviewed")}<br>Final review record SHA-256: ${escape(record.finalizedReviewHash || "Not finalized")}<br>Consent SHA-256: ${escape(record.consentHash || "Not opened")}</p>
  <h2>Requested review</h2><pre>${escape(record.instructions)}</pre><p class="meta">Started by ${escape(record.round?.startedBy || "Not started for current materials")} at ${escape(record.round?.startedAt || "Not started for current materials")}. Roster revision: ${escape(record.round?.rosterRevision || "No current roster")}</p>
  <h2>Individual reviews</h2>${(record.round?.reviewers || []).map((person) => {
    const entry = record.round!.submissions.find((item) => item.accessId === person.userId);
    return `<article><h3>${escape(person.name)}</h3>${entry ? `<p>Review date: ${escape(entry.reviewedOn)}<br>Recorded at: ${escape(entry.recordedAt)}<br>Outcome: ${entry.outcome === "ready" ? "Ready for consent" : "Follow-up required"}<br>Conflict review: ${entry.conflict === "none" ? "No conflict requiring recusal reported" : "Requires attention"}</p><pre>${escape(entry.assessment)}</pre><p>${escape(entry.attestation)}</p><p class="meta">Submission: ${escape(entry.id)}</p>` : "<p>Review pending. No completion or conflict determination is assumed.</p>"}</article>`;
  }).join("")}
  <h2>Assessment replies</h2><p>Replies do not change an assessment or constitute consent. Each thread identifies the assessment version it answered.</p>
  ${record.threads.filter((thread) => thread.replies.length).map((thread) => `<article><h3>${escape(thread.submission.name)} - ${thread.roundId === record.round?.id ? "Current review round" : "Earlier review round"}</h3><p class="meta">Review round: ${escape(thread.roundId)}<br>Assessment: ${escape(thread.submission.id)}<br>Recorded: ${escape(thread.submission.recordedAt)}</p><pre>${escape(thread.submission.assessment)}</pre>${thread.replies.map((reply) => `<article><strong>${escape(reply.authorName)}</strong><p class="meta">${escape(reply.createdAt)}<br>Reply: ${escape(reply.id)}${reply.replyToMessageId ? `<br>In reply to: ${escape(reply.replyToMessageId)}` : ""}</p><pre>${escape(reply.body)}</pre></article>`).join("")}</article>`).join("") || "<p>No assessment replies.</p>"}
  <h2>Findings presented for adoption</h2>${record.round?.finalization ? `<pre>${escape(record.round?.finalization.findings)}</pre><p class="meta">Finalized by ${escape(record.round?.finalization.confirmedBy)} at ${escape(record.round?.finalization.confirmedAt)}</p>` : "<p>Not yet finalized by the Chair.</p>"}
  <h2>${record.round ? "Exact resolution reviewed" : "Current resolution - not reviewed"}</h2><pre>${escape(record.resolution)}</pre>
  <h2>${record.round ? "Document versions reviewed" : "Current document versions - not reviewed"}</h2>${record.attachments.map((doc) => `<article><strong>${escape(doc.title)} - v${doc.sequence}</strong><p>${escape(doc.description || "")}</p><p class="meta">Document: ${escape(doc.documentId)}<br>Version: ${escape(doc.versionId)}<br>SHA-256: ${escape(doc.sha256)}</p></article>`).join("") || "<p>No attachments.</p>"}
  <details class="history" ${record.round ? "" : "open"}><summary>Retained review history (${record.history.length} events)</summary><pre class="meta">${escape(JSON.stringify(record.history, null, 2))}</pre></details>
  <p>Use Print to save this current review record as a PDF. The JSON export and downloadable packet also retain previous review rounds and assessments.</p></body></html>`;
}

export async function resolutionReviewPacket(record: ReturnType<typeof resolutionReviewRecord>) {
  const json = JSON.stringify(record, null, 2), html = resolutionReviewRecordHtml(record);
  try {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([612, 792]), y = 730;
    function linesFor(text: string, heading = false) {
      const face = heading ? bold : font, size = heading ? 12 : 10;
      const lines: string[] = [];
      for (const logical of text.replace(/\r\n?/g, "\n").replaceAll("\t", "    ").split("\n")) {
        let line = "";
        for (const char of logical) {
          if (face.widthOfTextAtSize(line + char, size) > 504) {
            const space = line.lastIndexOf(" ");
            lines.push(space > 0 ? line.slice(0, space) : line);
            line = space > 0 ? line.slice(space + 1) : "";
          }
          line += char;
        }
        lines.push(line);
      }
      return lines;
    }
    function newPage() { page = pdf.addPage([612, 792]); y = 730; }
    function paragraph(text: string, heading = false) {
      const face = heading ? bold : font, size = heading ? 12 : 10, leading = heading ? 18 : 14;
      const lines = linesFor(text, heading), height = lines.length * leading + 8;
      if (y - Math.min(height + (heading ? 44 : 0), 670) < 60) newPage();
      for (const line of lines) {
        if (y < 60) newPage();
        page.drawText(line, { x: 54, y, font: face, size, color: rgb(0.07, 0.16, 0.17) }); y -= leading;
      }
      y -= 8;
    }
    paragraph("PGPZ | Director review before consent", true); paragraph(record.title, true);
    paragraph(`${!record.round ? "No current review round; earlier reviews retained" : `${record.round.finalization ? "Finalized for consent" : "Review in progress"} - ${record.progress.ready} of ${record.progress.total} ready`}`);
    paragraph(record.declaration);
    if (record.integrityVerified === false) paragraph("INTEGRITY CHECK FAILED. Contact the Chair before relying on this record.", true);
    paragraph(`Review round: ${record.round?.id || "No current review round"}\nMaterials SHA-256: ${record.round?.contentHash || "Not currently reviewed"}\nFinal review SHA-256: ${record.finalizedReviewHash || "Not finalized"}\nConsent SHA-256: ${record.consentHash || "Not opened"}`);
    paragraph("Requested review", true); paragraph(record.instructions);
    for (const person of record.round?.reviewers || []) {
      const entry = record.round!.submissions.find((item) => item.accessId === person.userId);
      // Keep ordinary director blocks together. Very long assessments may
      // span pages, while each paragraph remains intact where it can fit.
      const reserve = entry ? linesFor(person.name, true).length * 18 + 8
        + (5 + linesFor(entry.assessment).length + linesFor(entry.attestation).length) * 14 + 24 : 80;
      if (reserve <= 670 && y - reserve < 60) newPage();
      paragraph(person.name, true);
      if (!entry) { paragraph("Review pending. No completion or conflict determination is assumed."); continue; }
      paragraph(`Review date: ${entry.reviewedOn}\nRecorded at: ${entry.recordedAt}\nOutcome: ${entry.outcome === "ready" ? "Ready for consent" : "Follow-up required"}\nConflict review: ${entry.conflict === "none" ? "No conflict requiring recusal reported" : "Requires attention"}`);
      paragraph(entry.assessment); paragraph(entry.attestation);
    }
    if (record.threads.some((thread) => thread.replies.length)) {
      paragraph("Assessment replies", true);
      paragraph("Replies do not change assessments or constitute consent. Threads remain linked to the assessment version answered.");
      for (const thread of record.threads.filter((item) => item.replies.length)) {
        paragraph(`${thread.submission.name} - ${thread.roundId === record.round?.id ? "Current review round" : "Earlier review round"}`, true);
        paragraph(`Review round: ${thread.roundId}\nAssessment: ${thread.submission.id}\nRecorded: ${thread.submission.recordedAt}\n${thread.submission.assessment}`);
        for (const reply of thread.replies) paragraph(`${reply.authorName} - ${reply.createdAt}\nReply: ${reply.id}${reply.replyToMessageId ? `\nIn reply to: ${reply.replyToMessageId}` : ""}\n${reply.body}`);
      }
    }
    paragraph("Findings presented for adoption", true);
    paragraph(record.round?.finalization ? `${record.round?.finalization.findings}\n\nFinalized by ${record.round?.finalization.confirmedBy} at ${record.round?.finalization.confirmedAt}` : "Not yet finalized by the Chair.");
    paragraph(record.round ? "Exact resolution reviewed" : "Current resolution - not reviewed", true); paragraph(record.resolution);
    paragraph(record.round ? "Document versions reviewed" : "Current document versions - not reviewed", true);
    for (const doc of record.attachments) paragraph(`${doc.title} - v${doc.sequence}\n${doc.description || ""}\nDocument: ${doc.documentId}\nVersion: ${doc.versionId}\nSHA-256: ${doc.sha256}`);
    paragraph(`Workspace: ${record.meetingId}\nResolution: ${record.resolutionId}\nReview started by ${record.round?.startedBy || "Not started for current materials"} at ${record.round?.startedAt || "Not started for current materials"}\nThe complete review history is embedded in review-record.json and review-record.html.`);
    if (!record.round) {
      paragraph("Earlier review history - not approval of current materials", true);
      for (const event of record.history) paragraph(JSON.stringify(event, null, 2));
    }
    for (const [i, sheet] of pdf.getPages().entries()) sheet.drawText(`PGPZ | Directors only | Review record | ${i + 1} of ${pdf.getPageCount()}`, { x: 54, y: 30, size: 8, font });
    await pdf.attach(Buffer.from(json), "review-record.json", { mimeType: "application/json" });
    await pdf.attach(Buffer.from(html), "review-record.html", { mimeType: "text/html" });
    pdf.setTitle(`${record.title} - director review`); pdf.setProducer("PGPZ Board portal");
    const bytes = await pdf.save();
    if (bytes.length <= 4 * 1024 * 1024) return { bytes, mimeType: "application/pdf", fileName: "director-review-record.pdf" };
  } catch {
    // Preserve unsupported Unicode verbatim in UTF-8 HTML/JSON instead of
    // replacing characters in a director's retained assessment.
  }
  const zip = new JSZip(); zip.file("review-record.json", json); zip.file("review-record.html", html);
  zip.file("README.txt", "Open review-record.html and use Print to save a PDF. UTF-8 HTML and JSON preserve text that could not be safely rendered by the PDF generator. This review record is not a signed consent.\n");
  const bytes = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (bytes.length > 4 * 1024 * 1024) throw new Error("Review packet exceeds the download limit. Use the JSON or HTML record.");
  return { bytes, mimeType: "application/zip", fileName: "director-review-record.zip" };
}

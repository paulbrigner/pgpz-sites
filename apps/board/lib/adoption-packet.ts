import "server-only";
import { createHash } from "node:crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";
import { sanitizeFilename } from "@pgpz/document-vault/server";
import type { DocumentVersion } from "@pgpz/document-vault";
import type { BoardAsyncBallot } from "./meetings";
import type { ConsentReceipt } from "./written-consents";
import { isAdoptionTarget } from "./document-adoptions";
import { consentRecord, consentRecordHtml } from "./consent-record";

// Stay below the buffered hosting response limit (including base64 overhead).
// Larger records remain downloadable individually through their consent record.
export const MAX_PACKET_SOURCE_BYTES = 12 * 1024 * 1024;
export const MAX_PACKET_RESPONSE_BYTES = 4 * 1024 * 1024;
export class AdoptionPacketError extends Error {
  constructor(message: string, public readonly status = 409) { super(message); }
}

export async function buildAdoptionPacket(input: {
  ballot: BoardAsyncBallot; documentId: string; version: DocumentVersion;
  bytes: Uint8Array; receipts: readonly ConsentReceipt[]; siteUrl: string;
}) {
  const { ballot, documentId, version, bytes } = input;
  if (!isAdoptionTarget(ballot, documentId, version.versionId)) throw new AdoptionPacketError("A verified adoption record is required.");
  const target = ballot.attachments!.find((doc) => doc.documentId === documentId && doc.versionId === version.versionId)!;
  const hash = createHash("sha256").update(bytes).digest("hex");
  if (target.sha256 !== version.sha256 || hash !== target.sha256 || bytes.length !== version.byteLength) throw new AdoptionPacketError("The retained document failed its integrity check. Contact the Chair.");
  if (bytes.length > MAX_PACKET_SOURCE_BYTES) throw new AdoptionPacketError("This document is too large for a combined packet. Download the original and consent record separately.", 413);
  // The full append-only history must include every current receipt. It is
  // fetched by the server, never supplied by a browser requesting an export.
  // DynamoDB map key order is not stable; compare named fields.
  const fields: (keyof ConsentReceipt)[] = ["id", "meetingId", "ballotId", "contentHash", "accessId", "authenticatedUserId", "email", "name", "signatureName", "action", "statement", "receivedAt", "supersedesReceiptId"];
  if (!ballot.consent!.receipts.every((receipt) => input.receipts.some((entry) => fields.every((key) => entry[key] === receipt[key])))) throw new AdoptionPacketError("The complete consent history is unavailable. Retry the download.");
  const record = consentRecord(ballot, input.receipts, "");
  const recordJson = JSON.stringify(record, null, 2);
  const origin = new URL(input.siteUrl).origin;
  const html = consentRecordHtml(record).replaceAll('href="/api/', `href="${origin}/api/`);
  const name = sanitizeFilename(version.originalFileName).slice(0, 160);
  const stem = name.replace(/\.[^.]+$/, "") || "document";
  const manifest = { documentId, versionId: version.versionId, originalFileName: version.originalFileName, originalSha256: hash, resolutionContentHash: record.contentHash, resolutionId: ballot.id, meetingId: ballot.meetingId, adoptedAt: ballot.closedAt, effectiveTerms: ballot.adoption!.effectiveTerms };

  let fallbackReason = "The original is not a PDF. Its exact bytes and the signed consent record are included separately.";
  if (version.mimeType === "application/pdf") {
    try {
      const source = await PDFDocument.load(bytes, { updateMetadata: false });
      if (source.getPageCount() > 150 || source.getForm().getFields().length) throw new Error("Use the original for long or interactive PDFs.");
      const pdf = await PDFDocument.create();
      const pages = await pdf.copyPages(source, source.getPageIndices());
      for (const page of pages) pdf.addPage(page);
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
      let page = pdf.addPage([612, 792]), y = 738;
      function paragraph(text: string, heading = false) {
        const face = heading ? bold : font, size = heading ? 12 : 10, lineHeight = heading ? 18 : 14;
        const lines: string[] = [];
        for (const logical of text.replace(/\r\n?/g, "\n").split("\n")) {
          // Split long words as well as ordinary prose; never clip a receipt ID.
          let line = "";
          for (const char of logical.replaceAll("\t", "    ")) {
            if (face.widthOfTextAtSize(line + char, size) > 504) {
              const space = line.lastIndexOf(" ");
              lines.push(space > 0 ? line.slice(0, space) : line);
              line = space > 0 ? line.slice(space + 1) : "";
            }
            line += char;
          }
          lines.push(line);
        }
        // Keep signature/receipt blocks together and avoid stranded headings.
        const reserve = heading ? 64 : Math.min(lines.length * lineHeight + 8, 280);
        if (y - reserve < 62) { page = pdf.addPage([612, 792]); y = 738; }
        for (const value of lines) {
          if (y < 62) { page = pdf.addPage([612, 792]); y = 738; }
          page.drawText(value, { x: 54, y, font: face, size, color: rgb(0.07, 0.16, 0.17) }); y -= lineHeight;
        }
        y -= 8;
      }
      paragraph("PGPZ | Document adoption record", true);
      paragraph(`${target.title} - Version ${target.sequence}`);
      paragraph(`Adopted by unanimous written consent: ${record.adoptedAt}`);
      paragraph(`Effective date / conditions: ${record.adoption!.effectiveTerms || "See the resolution. Adoption does not establish that implementation conditions have been met."}`);
      paragraph("This appendix reproduces the existing electronic consents. It is not a new signature or a Secretary certification. The original file and complete consent record are embedded as attachments; the retained original remains authoritative.");
      paragraph(`Original SHA-256: ${hash}\nDocument: ${documentId}\nVersion: ${version.versionId}\nResolution: ${ballot.id}\nWorkspace: ${ballot.meetingId}\nResolution SHA-256: ${record.contentHash}`);
      paragraph("Exact resolution", true); paragraph(record.resolution);
      paragraph("Document adoption targets", true);
      for (const ref of record.adoption!.targets) paragraph(`${record.attachments.find((doc) => doc.documentId === ref.documentId)?.title || ref.documentId}\nDocument ${ref.documentId}, version ${ref.versionId}`);
      paragraph("All incorporated document versions", true);
      for (const ref of record.attachments) paragraph(`${ref.title} - Version ${ref.sequence}\nDocument: ${ref.documentId}\nVersion: ${ref.versionId}\nSHA-256: ${ref.sha256}`);
      paragraph("Electronic-signature declaration", true); paragraph(record.consentStatement);
      paragraph(`Every required director (${record.directors.length})`, true);
      for (const director of record.directors) paragraph(`${director.name} (${director.email})`);
      paragraph("Signed consents", true);
      for (const receipt of record.signatures) paragraph(`${receipt.signatureName}\nDirector: ${receipt.name} (${receipt.email})\nDelivered: ${receipt.receivedAt}\nReceipt: ${receipt.id}\nAuthenticated user: ${receipt.authenticatedUserId}\nDirector access record: ${receipt.accessId}`);
      paragraph("Receipt history", true);
      paragraph("Withdrawal declaration (applies only to receipts explicitly marked withdraw):");
      paragraph(record.withdrawalStatement);
      for (const receipt of record.receiptHistory) paragraph(`${receipt.action}: ${receipt.signatureName}\nDelivered: ${receipt.receivedAt}\nReceipt: ${receipt.id}\nPrior receipt: ${receipt.supersedesReceiptId || "None"}`);
      pdf.getPages().slice(pages.length).forEach((appendix, i) => appendix.drawText(`PGPZ adoption record | Appendix ${i + 1}`, { x: 54, y: 30, size: 9, font, color: rgb(0.3, 0.35, 0.35) }));
      await pdf.attach(bytes, `original-${name}`, { mimeType: version.mimeType, description: "Exact approved original; verify against the recorded SHA-256." });
      await pdf.attach(Buffer.from(recordJson), "consent-record.json", { mimeType: "application/json" });
      await pdf.attach(Buffer.from(html), "consent-record.html", { mimeType: "text/html" });
      pdf.setTitle(`${target.title} - adoption packet`);
      pdf.setProducer("PGPZ Board portal");
      const result = await pdf.save();
      if (result.length <= MAX_PACKET_RESPONSE_BYTES) return { bytes: result, mimeType: "application/pdf", fileName: `${stem}-adoption.pdf` };
      fallbackReason = "A combined PDF exceeded the download limit. The exact original and complete consent evidence are included separately.";
    } catch {
      // No lossy character substitution, decrypted PDFs, flattened forms, or
      // rewritten originals. UTF-8 HTML/JSON preserves every signed character.
      fallbackReason = "This PDF could not be safely combined (for example, an interactive or encrypted PDF, unsupported typography, or a long document). The exact original and complete consent evidence are included separately.";
    }
  }
  const zip = new JSZip();
  zip.file(`original/${name}`, bytes);
  zip.file("consent-record.html", html);
  zip.file("consent-record.json", recordJson);
  zip.file("manifest.json", JSON.stringify(manifest, null, 2));
  zip.file("README.txt", `${fallbackReason}\n\nOpen consent-record.html to read the resolution and electronic signatures. This packet reproduces existing consents and contains no new signature or Secretary certification. Supporting attachments are identified in the consent record but are not automatically adopted or copied into this packet.\n`);
  const result = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
  if (result.length > MAX_PACKET_RESPONSE_BYTES) throw new AdoptionPacketError("This document is too large for a combined packet. Download the original and consent record separately.", 413);
  return { bytes: result, mimeType: "application/zip", fileName: `${stem}-adoption.zip` };
}

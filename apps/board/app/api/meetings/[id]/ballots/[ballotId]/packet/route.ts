import { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { contentDisposition } from "@pgpz/document-vault/server";
import { resolveBoardMemberState } from "@/lib/session";
import { requireBoardPasskeySession } from "@/lib/api-security";
import { boardMeetingsRepository } from "@/lib/meetings-repository";
import { boardDocumentRepository } from "@/lib/vault";
import { boardDocumentObjectStore, isLocalBoardDocumentStorageEnabled } from "@/lib/object-store";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { BOARD_DOCUMENTS_RETAINED_BUCKET, SITE_URL } from "@/lib/config";
import { s3Client } from "@/lib/s3";
import { isAdoptionTarget } from "@/lib/document-adoptions";
import { AdoptionPacketError, buildAdoptionPacket, MAX_PACKET_SOURCE_BYTES } from "@/lib/adoption-packet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; ballotId: string }> }) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return new Response(null, { status: 401, headers });
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const { id, ballotId } = await context.params;
  const documentId = request.nextUrl.searchParams.get("document") || "";
  try {
    const ballot = await boardMeetingsRepository.getAsyncBallot(id, ballotId);
    if (!ballot || !isAdoptionTarget(ballot, documentId)) return new Response(null, { status: 404, headers });
    const document = await boardDocumentRepository.getDocument(documentId);
    // Executive-session objects and disclosures have no ordinary vault META.
    // Foreign meeting documents cannot be introduced via forged locator rows.
    if (!document || (document.ownerType === "meeting" && document.meetingId !== id)) return new Response(null, { status: 404, headers });
    const target = ballot.adoption!.targets.find((ref) => ref.documentId === documentId)!;
    const version = (await boardDocumentRepository.listVersions(documentId)).find((version) => version.versionId === target.versionId);
    if (!version) return new Response(null, { status: 404, headers });
    if (version.byteLength > MAX_PACKET_SOURCE_BYTES) throw new AdoptionPacketError("This document is too large for a combined packet. Download the original and consent record separately.", 413);
    let bytes: Uint8Array;
    if (isLocalBoardDocumentStorageEnabled) {
      const stored = await boardDocumentObjectStore.readRetained?.(version.objectKey);
      if (!stored) return new Response(null, { status: 404, headers });
      bytes = stored.bytes;
    } else {
      if (!BOARD_DOCUMENTS_RETAINED_BUCKET) throw new Error("Storage unavailable");
      const object = await s3Client.send(new GetObjectCommand({ Bucket: BOARD_DOCUMENTS_RETAINED_BUCKET, Key: version.objectKey }));
      if (!object.Body) return new Response(null, { status: 404, headers });
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of object.Body as AsyncIterable<Uint8Array>) {
        length += chunk.length;
        if (length > MAX_PACKET_SOURCE_BYTES) throw new AdoptionPacketError("The retained file exceeds the packet limit. Download the original and consent record separately.", 413);
        chunks.push(Buffer.from(chunk));
      }
      bytes = Buffer.concat(chunks);
    }
    const receipts = await boardMeetingsRepository.listConsentReceipts(id, ballotId);
    const packet = await buildAdoptionPacket({ ballot, documentId, version, bytes, receipts, siteUrl: SITE_URL });
    await boardAuditLedger.append({ category: "document_read", action: "adoption_packet_downloaded", outcome: "success", actor: authenticatedActor(state.member), target: { type: "document", id: documentId, version: version.versionId }, metadata: new Map([["meetingId", id], ["resolutionId", ballotId]]), idempotencyKey: `adoption-packet-${crypto.randomUUID()}`, occurredAt: new Date().toISOString() });
    return new Response(new Uint8Array(packet.bytes), { headers: { ...headers, "Content-Type": packet.mimeType, "Content-Disposition": contentDisposition({ mimeType: packet.mimeType, originalFileName: packet.fileName }).replace(/^inline;/, "attachment;") } });
  } catch (error) {
    return Response.json({ error: error instanceof AdoptionPacketError ? error.message : "The adoption packet could not be created. The original document and consent record remain available separately." }, { status: error instanceof AdoptionPacketError ? error.status : 503, headers });
  }
}

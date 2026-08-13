import { NextRequest } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { resolveBoardMemberState, canManageBoardDocuments } from "@/lib/session";
import { boardDocumentRepository } from "@/lib/vault";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { contentDisposition } from "@pgpz/document-vault/server";
import { s3Client } from "@/lib/s3";
import { BOARD_DOCUMENTS_RETAINED_BUCKET } from "@/lib/config";
import { requireBoardPasskeySession } from "@/lib/api-security";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Params) {
  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") return new Response(null, { status: 401 });
  const member = state.member;
  const assurance = await requireBoardPasskeySession(request.headers, member);
  if (assurance) return assurance;

  const { id } = await context.params;
  const requestedVersion = request.nextUrl.searchParams.get("version");

  const item = await boardDocumentRepository.getDocument(id);
  if (!item || (item.status === "archived" && !canManageBoardDocuments(member))) {
    return new Response(null, { status: 404 });
  }

  const version =
    requestedVersion && requestedVersion !== item.currentVersion.versionId
      ? (await boardDocumentRepository.listVersions(id)).find((v) => v.versionId === requestedVersion)
      : item.currentVersion;
  if (!version) return new Response(null, { status: 404 });

  // One logical "download authorized" event for the exact version; S3 data
  // events provide object-level GET evidence.
  await boardAuditLedger.append({
    category: "document_read",
    action: "download_authorized",
    outcome: "success",
    actor: authenticatedActor(member),
    target: { type: "document", id, version: version.versionId },
    idempotencyKey: `download-${id}-${version.versionId}-${Date.now()}`,
    occurredAt: new Date().toISOString(),
  }).catch(() => {});

  if (!BOARD_DOCUMENTS_RETAINED_BUCKET) return new Response(null, { status: 500 });
  const url = await getSignedUrl(
    s3Client,
    new GetObjectCommand({
      Bucket: BOARD_DOCUMENTS_RETAINED_BUCKET,
      Key: version.objectKey,
      ResponseContentDisposition: contentDisposition({ mimeType: version.mimeType, originalFileName: version.originalFileName }),
      ResponseContentType: version.mimeType,
    }),
    { expiresIn: 120 },
  );
  return new Response(null, { status: 302, headers: { Location: url } });
}

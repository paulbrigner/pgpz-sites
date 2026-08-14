import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { resolveBoardMemberState } from "@/lib/session";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { boardDocumentRepository } from "@/lib/vault";
import { canManageBoardDocuments } from "@/lib/session";
import {
  addVersion,
  createDocument,
  restoreVersion,
  setArchived,
  updateDisplayName,
  updateMetadata,
  VaultAuthorizationError,
  VaultValidationError,
} from "@/lib/vault";
import { buildStagingKey } from "@/lib/object-store";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";
import { BOARD_DOCUMENTS_STAGING_BUCKET } from "@/lib/config";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";

export const runtime = "nodejs";

const UNAUTHORIZED = () => NextResponse.json({ error: "Authentication required" }, { status: 401 });

function memberFor(request: NextRequest, requireManager: boolean, requireStepUp: boolean) {
  return (async () => {
    const state = await resolveBoardMemberState(request.headers);
    if (state.status !== "member") return { response: UNAUTHORIZED(), member: null };
    const assurance = await requireBoardPasskeySession(request.headers, state.member);
    if (assurance) return { response: assurance, member: null };
    if (requireManager && !canManageBoardDocuments(state.member)) {
      return { response: NextResponse.json({ error: "Not authorized to manage documents" }, { status: 403 }), member: null };
    }
    if (requireStepUp) {
      const stepUp = await requireBoardStepUp(request.headers, state.member);
      if (stepUp) return { response: stepUp, member: null };
    }
    return { response: null, member: state.member };
  })();
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

export async function GET(request: NextRequest) {
  const { response, member } = await memberFor(request, false, false);
  if (response) return response;
  void member;
  const items = await boardDocumentRepository.listDocuments({ status: "active" });
  return NextResponse.json(
    items.map((item) => ({
      id: item.documentId,
      title: item.title,
      description: item.description,
      category: item.category,
      status: item.status,
      currentVersion: { versionId: item.currentVersion.versionId, fileName: item.currentVersion.originalFileName, size: item.currentVersion.byteLength, uploadedAt: item.currentVersion.uploadedAt },
      versionCount: item.versionCount,
    })),
  );
}

export async function POST(request: NextRequest) {
  const { response, member } = await memberFor(request, true, true);
  if (response || !member) return response ?? NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = await request.json().catch(() => ({}));
  const action = text(body?.action);
  const ok = (payload: unknown) => NextResponse.json(payload);
  const fail = (error: unknown) => {
    if (error instanceof VaultValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof VaultAuthorizationError) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }
    console.error("[board] document operation failed", error);
    return NextResponse.json({ error: "Document operation failed" }, { status: 500 });
  };

  try {
    switch (action) {
      case "prepareUpload": {
        const operationId = randomUUID();
        const stagingKey = buildStagingKey("board", operationId);
        const uploadUrl = await getSignedUrl(
          s3Client,
          new PutObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey }),
          { expiresIn: 600 },
        );
        await boardAuditLedger.append({
          category: "document_lifecycle",
          action: "upload_prepared",
          outcome: "success",
          actor: authenticatedActor(member),
          target: { type: "upload", id: operationId, version: null },
          idempotencyKey: `upload-prepared-${operationId}`,
          occurredAt: new Date().toISOString(),
        });
        return ok({ stagingKey, uploadUrl, expiresInSeconds: 600 });
      }
      case "create": {
        const item = await createDocument({
          member,
          stagedKey: text(body?.stagingKey),
          fileName: text(body?.fileName) || "document.pdf",
          title: text(body?.title),
          description: text(body?.description),
          category: text(body?.category),
          visibility: text(body?.visibility) || "members",
          ownerType: body?.ownerType === "meeting" ? "meeting" : "library",
          meetingId: text(body?.meetingId),
          meetingSection: body?.meetingSection,
          agendaItemId: text(body?.agendaItemId) || null,
        });
        return ok(item);
      }
      case "addVersion": {
        const item = await addVersion({ member, documentId: text(body?.documentId), stagedKey: text(body?.stagingKey), fileName: text(body?.fileName) || "document.pdf" });
        return ok(item);
      }
      case "restore": {
        const item = await restoreVersion({ member, documentId: text(body?.documentId), versionId: text(body?.versionId) });
        if (!item) return NextResponse.json({ error: "Document not found" }, { status: 404 });
        return ok(item);
      }
      case "archive":
      case "unarchive": {
        const item = await setArchived({ member, documentId: text(body?.documentId), archived: action === "archive" });
        if (!item) return NextResponse.json({ error: "Document not found" }, { status: 404 });
        return ok(item);
      }
      case "updateMetadata": {
        const item = await updateMetadata({ member, documentId: text(body?.documentId), title: text(body?.title), description: text(body?.description), category: text(body?.category), visibility: text(body?.visibility) || "members" });
        if (!item) return NextResponse.json({ error: "Document not found" }, { status: 404 });
        return ok(item);
      }
      case "updateDisplayName": {
        const item = await updateDisplayName({ member, documentId: text(body?.documentId), displayName: text(body?.displayName) });
        if (!item) return NextResponse.json({ error: "Document not found" }, { status: 404 });
        return ok(item);
      }
      default:
        return fail(new VaultValidationError("unknown-action", "Unknown document action."));
    }
  } catch (error) {
    return fail(error);
  }
}

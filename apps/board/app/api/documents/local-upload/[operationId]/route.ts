import { NextRequest, NextResponse } from "next/server";
import { MAX_DOCUMENT_BYTES } from "@pgpz/document-vault";
import { requireBoardPasskeySession, requireBoardStepUp } from "@/lib/api-security";
import { canManageBoardDocuments, resolveBoardMemberState } from "@/lib/session";
import {
  boardDocumentObjectStore,
  buildStagingKey,
  isLocalBoardDocumentStorageEnabled,
} from "@/lib/object-store";

export const runtime = "nodejs";

type Params = { params: Promise<{ operationId: string }> };

export async function PUT(request: NextRequest, context: Params) {
  if (!isLocalBoardDocumentStorageEnabled || !boardDocumentObjectStore.writeStaged) {
    return NextResponse.json({ error: "Local document storage is not enabled." }, { status: 404 });
  }

  const state = await resolveBoardMemberState(request.headers);
  if (state.status !== "member") {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  if (!canManageBoardDocuments(state.member)) {
    return NextResponse.json({ error: "Not authorized to manage documents." }, { status: 403 });
  }
  const assurance = await requireBoardPasskeySession(request.headers, state.member);
  if (assurance) return assurance;
  const stepUp = await requireBoardStepUp(request.headers, state.member);
  if (stepUp) return stepUp;

  const { operationId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(operationId)) {
    return NextResponse.json({ error: "Invalid upload operation." }, { status: 400 });
  }
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "Document exceeds the 50 MB limit." }, { status: 413 });
  }
  const bytes = new Uint8Array(await request.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Document is empty." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_DOCUMENT_BYTES) {
    return NextResponse.json({ error: "Document exceeds the 50 MB limit." }, { status: 413 });
  }
  await boardDocumentObjectStore.writeStaged(
    buildStagingKey("board", operationId),
    bytes,
    request.headers.get("content-type") || "application/octet-stream",
  );
  return new Response(null, { status: 204 });
}

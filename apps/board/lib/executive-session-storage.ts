import "server-only";

import { randomUUID } from "node:crypto";
import { PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { buildObjectKey, classifyUploadedObject, contentMatchesType } from "@pgpz/document-vault";
import { BOARD_DOCUMENTS_STAGING_BUCKET, BOARD_DOCUMENTS_RETAINED_BUCKET } from "@/lib/config";
import { s3Client } from "@/lib/s3";
import { boardDocumentObjectStore, computeSha256 } from "@/lib/object-store";
import { BOARD_DOCUMENT_TYPE_POLICY, boardExtensionMatchesMimeType } from "@/lib/document-policy";
import { EXECUTIVE_MATERIAL_MAX_BYTES, ExecutiveSessionError, type ExecutiveMaterial } from "@/lib/executive-sessions";

/** Private files have no ordinary vault document record or public download locator.
 * Staging keys are created and consumed server-side, never accepted from clients. */
export async function retainExecutiveMaterial(file: File, title: string, actorId: string): Promise<ExecutiveMaterial> {
  if (!file.size || file.size > EXECUTIVE_MATERIAL_MAX_BYTES) throw new ExecutiveSessionError(400, "Choose a file no larger than 4 MiB.");
  if (!file.name || file.name.length > 200 || /[\r\n\u0000]/.test(file.name)) throw new ExecutiveSessionError(400, "Invalid filename.");
  const classified = classifyUploadedObject({ byteLength: file.size, mimeType: file.type, originalFileName: file.name }, BOARD_DOCUMENT_TYPE_POLICY);
  if (!classified.accepted || !boardExtensionMatchesMimeType(classified.extension, classified.mimeType)) throw new ExecutiveSessionError(400, "Unsupported file type or mismatched extension.");
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!contentMatchesType(classified.mimeType, bytes)) throw new ExecutiveSessionError(400, "File contents do not match the declared type.");
  const id = randomUUID();
  const objectKey = buildObjectKey("board", id, randomUUID());
  const stagingKey = `board/staging/${randomUUID()}`;
  try {
    if (boardDocumentObjectStore.writeStaged) await boardDocumentObjectStore.writeStaged(stagingKey, bytes, classified.mimeType);
    else {
      if (!BOARD_DOCUMENTS_STAGING_BUCKET) throw new Error("Storage is not configured");
      await s3Client.send(new PutObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey, Body: bytes, ContentType: classified.mimeType }));
    }
    const staged = await boardDocumentObjectStore.readStaged(stagingKey);
    if (staged.metadata.sha256 !== computeSha256(bytes)) throw new Error("Upload changed during retention");
    await boardDocumentObjectStore.promoteVerified(stagingKey, objectKey, staged);
  } finally {
    await boardDocumentObjectStore.deleteStaging(stagingKey).catch(() => {});
  }
  return { id, title, fileName: file.name, mimeType: classified.mimeType, byteLength: bytes.byteLength,
    sha256: computeSha256(bytes), objectKey, createdAt: new Date().toISOString(), createdBy: actorId };
}

export async function readExecutiveMaterial(material: ExecutiveMaterial): Promise<Uint8Array> {
  const bytes = boardDocumentObjectStore.readRetained
    ? (await boardDocumentObjectStore.readRetained(material.objectKey)).bytes
    : await (await s3Client.send(new GetObjectCommand({ Bucket: BOARD_DOCUMENTS_RETAINED_BUCKET, Key: material.objectKey }))).Body!.transformToByteArray();
  if (bytes.byteLength !== material.byteLength || computeSha256(bytes) !== material.sha256) throw new Error("Retained file failed integrity verification");
  return bytes;
}

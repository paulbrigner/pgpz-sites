import "server-only";

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { ObjectMetadata, ObjectStore } from "@pgpz/document-vault/server";
import { s3Client } from "@/lib/s3";
import { BOARD_DOCUMENTS_STAGING_BUCKET, BOARD_DOCUMENTS_RETAINED_BUCKET } from "@/lib/config";

export { buildObjectKey, buildStagingKey } from "@pgpz/document-vault";

const metadataOf = (r: { ContentLength?: number; ContentType?: string; Metadata?: Record<string, string> }): ObjectMetadata => ({
  byteLength: Number(r.ContentLength) || 0,
  mimeType: r.ContentType ?? "application/octet-stream",
  sha256: r.Metadata?.sha256 ?? "",
});

export function computeSha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * S3 object store for the Board document vault. Staging is short-lived and the
 * only deletable boundary; retained objects are promoted to immutable final
 * keys with a real SHA-256 stored in object metadata (never the ETag).
 */
export const boardDocumentObjectStore: ObjectStore & {
  readStaged(stagingKey: string): Promise<{ bytes: Buffer; metadata: ObjectMetadata }>;
} = {
  async head(retainedKey) {
    if (!BOARD_DOCUMENTS_RETAINED_BUCKET) return null;
    const result = await s3Client.send(
      new HeadObjectCommand({ Bucket: BOARD_DOCUMENTS_RETAINED_BUCKET, Key: retainedKey }),
    );
    return metadataOf(result);
  },

  async promote(stagingKey, retainedKey) {
    if (!BOARD_DOCUMENTS_STAGING_BUCKET || !BOARD_DOCUMENTS_RETAINED_BUCKET) {
      throw new Error("Board document storage is not configured.");
    }
    const staged = await s3Client.send(
      new HeadObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey }),
    );
    const meta = metadataOf(staged);
    if (!meta.sha256) throw new Error("Staged object is missing its SHA-256 metadata.");
    await s3Client.send(
      new CopyObjectCommand({
        Bucket: BOARD_DOCUMENTS_RETAINED_BUCKET,
        Key: retainedKey,
        CopySource: `${BOARD_DOCUMENTS_STAGING_BUCKET}/${stagingKey}`,
        MetadataDirective: "REPLACE",
        Metadata: { sha256: meta.sha256 },
        ContentType: meta.mimeType,
      }),
    );
    return meta;
  },

  async deleteStaging(stagingKey) {
    if (!BOARD_DOCUMENTS_STAGING_BUCKET) return;
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey }),
    );
  },

  async readStaged(stagingKey) {
    if (!BOARD_DOCUMENTS_STAGING_BUCKET) throw new Error("Board document storage is not configured.");
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey }),
    );
    const bytes = await streamToBuffer(result.Body);
    const meta = metadataOf(result as never);
    return { bytes, metadata: { ...meta, sha256: computeSha256(bytes) } };
  },
};

async function streamToBuffer(body: unknown): Promise<Buffer> {
  if (!body) return Buffer.alloc(0);
  if (typeof (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray === "function") {
    return Buffer.from(await (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray());
  }
  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

export function newDocumentId(): string {
  return randomUUID();
}

export function newVersionId(): string {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 12)}`;
}

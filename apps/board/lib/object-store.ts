import "server-only";

import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import type { ObjectMetadata, ObjectStore } from "@pgpz/document-vault/server";
import { s3Client } from "@/lib/s3";
import {
  BOARD_DOCUMENTS_LOCAL_STORAGE_PATH,
  BOARD_DOCUMENTS_STAGING_BUCKET,
  BOARD_DOCUMENTS_RETAINED_BUCKET,
} from "@/lib/config";

export { buildObjectKey, buildStagingKey } from "@pgpz/document-vault";

/**
 * A board staging key is strictly `<board>/staging/<uuid>`, issued by the
 * server in `prepareUpload`. Any other shape — a retained `objects/` path,
 * another actor's prefix, a free-form string, or an extra segment — must never
 * be promoted into the vault. This regex is the boundary that stops staged-object
 * substitution (a manager repointing create/addVersion at content they did not
 * stage). The prefix literal mirrors `BOARD_DOCUMENT_PREFIX` in lib/vault.ts.
 */
const STAGING_PREFIX = "board";
const BOARD_STAGING_KEY_RE =
  /^[0-9A-Za-z_-]+\/staging\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** True only for a well-formed, single-segment-prefix staging key ending in a UUID. */
export function isBoardStagingKey(candidate: string): boolean {
  if (typeof candidate !== "string") return false;
  const match = BOARD_STAGING_KEY_RE.exec(candidate);
  if (!match) return false;
  // The prefix must be exactly the board staging namespace (`board/staging/`),
  // not some other `*/staging/<uuid>` key that happens to share the shape.
  return candidate.startsWith(`${STAGING_PREFIX}/staging/`);
}

function assertValidStagingKey(stagingKey: string): void {
  if (!isBoardStagingKey(stagingKey)) {
    throw new Error(`Refusing to operate on invalid staging key (must match ${STAGING_PREFIX}/staging/<uuid>).`);
  }
}

const BOARD_RETAINED_KEY_RE =
  /^board\/objects\/[0-9a-f-]{36}\/[0-9A-Za-z._-]+$/;

function assertValidRetainedKey(retainedKey: string): void {
  if (!BOARD_RETAINED_KEY_RE.test(retainedKey)) {
    throw new Error("Refusing to operate on an invalid retained object key.");
  }
}

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
export type BoardDocumentObjectStore = ObjectStore & {
  readStaged(stagingKey: string): Promise<{ bytes: Buffer; metadata: ObjectMetadata }>;
  /** Present only on the local adapter; browser uploads never receive a raw
   * filesystem path. */
  writeStaged?(stagingKey: string, bytes: Uint8Array, mimeType: string): Promise<ObjectMetadata>;
  /** Present only on the local adapter; production downloads remain presigned
   * S3 redirects. */
  readRetained?(retainedKey: string): Promise<{ bytes: Buffer; metadata: ObjectMetadata }>;
};

const s3BoardDocumentObjectStore: BoardDocumentObjectStore = {
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
    assertValidStagingKey(stagingKey);
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
    assertValidStagingKey(stagingKey);
    await s3Client.send(
      new DeleteObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey }),
    );
  },

  async readStaged(stagingKey) {
    if (!BOARD_DOCUMENTS_STAGING_BUCKET) throw new Error("Board document storage is not configured.");
    assertValidStagingKey(stagingKey);
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: BOARD_DOCUMENTS_STAGING_BUCKET, Key: stagingKey }),
    );
    const bytes = await streamToBuffer(result.Body);
    const meta = metadataOf(result as never);
    return { bytes, metadata: { ...meta, sha256: computeSha256(bytes) } };
  },
};

type StoredMetadata = Readonly<{ byteLength: number; mimeType: string; sha256: string }>;

/** Board-owned local adapter used only by the offline development stack. It
 * preserves the same staging/promote boundary as S3 and refuses to overwrite a
 * retained version, while making no claim to emulate KMS or Object Lock. */
export function createLocalBoardDocumentObjectStore(rootPath: string): BoardDocumentObjectStore {
  const root = resolve(rootPath);

  function objectPath(key: string) {
    const candidate = resolve(root, key);
    if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) {
      throw new Error("Object key escapes the configured local storage root.");
    }
    return candidate;
  }

  const metadataPath = (key: string) => `${objectPath(key)}.metadata.json`;

  async function readStored(key: string) {
    const [bytes, rawMetadata] = await Promise.all([
      readFile(objectPath(key)),
      readFile(metadataPath(key), "utf8"),
    ]);
    const parsed = JSON.parse(rawMetadata) as StoredMetadata;
    const actualSha256 = computeSha256(bytes);
    if (parsed.sha256 !== actualSha256 || parsed.byteLength !== bytes.byteLength) {
      throw new Error("Local document bytes do not match their retained metadata.");
    }
    return { bytes, metadata: parsed as ObjectMetadata };
  }

  async function writeStored(key: string, bytes: Uint8Array, mimeType: string, immutable: boolean) {
    const path = objectPath(key);
    const metadata: StoredMetadata = {
      byteLength: bytes.byteLength,
      mimeType: mimeType.trim().toLowerCase() || "application/octet-stream",
      sha256: computeSha256(bytes),
    };
    await mkdir(dirname(path), { recursive: true });
    const flag = immutable ? "wx" : "w";
    await writeFile(path, bytes, { flag });
    try {
      await writeFile(metadataPath(key), `${JSON.stringify(metadata)}\n`, { flag });
    } catch (error) {
      await rm(path, { force: true });
      throw error;
    }
    return metadata;
  }

  return {
    async head(retainedKey) {
      assertValidRetainedKey(retainedKey);
      try {
        return (await readStored(retainedKey)).metadata;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
        throw error;
      }
    },
    async promote(stagingKey, retainedKey) {
      assertValidStagingKey(stagingKey);
      assertValidRetainedKey(retainedKey);
      const staged = await readStored(stagingKey);
      await writeStored(retainedKey, staged.bytes, staged.metadata.mimeType, true);
      return staged.metadata;
    },
    async deleteStaging(stagingKey) {
      assertValidStagingKey(stagingKey);
      await Promise.all([
        rm(objectPath(stagingKey), { force: true }),
        rm(metadataPath(stagingKey), { force: true }),
      ]);
    },
    async readStaged(stagingKey) {
      assertValidStagingKey(stagingKey);
      return readStored(stagingKey);
    },
    async writeStaged(stagingKey, bytes, mimeType) {
      assertValidStagingKey(stagingKey);
      return writeStored(stagingKey, bytes, mimeType, false);
    },
    async readRetained(retainedKey) {
      assertValidRetainedKey(retainedKey);
      return readStored(retainedKey);
    },
  };
}

export const isLocalBoardDocumentStorageEnabled = Boolean(BOARD_DOCUMENTS_LOCAL_STORAGE_PATH);

export const boardDocumentObjectStore: BoardDocumentObjectStore =
  isLocalBoardDocumentStorageEnabled
    ? createLocalBoardDocumentObjectStore(BOARD_DOCUMENTS_LOCAL_STORAGE_PATH)
    : s3BoardDocumentObjectStore;

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

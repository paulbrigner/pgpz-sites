/**
 * Neutral governance document-vault domain model.
 *
 * Owns document/version contracts, metadata validation, the immutable-version
 * lifecycle, optimistic-concurrency helpers, and the repository/object-store
 * interfaces. It owns NO application concerns: no brand copy, no governance
 * category values or role names, no environment reads, no AWS singleton, no
 * table/bucket names, and no Next.js route ownership. Each site supplies its
 * categories, visibility policy, file-type allowlist, and adapters.
 */

export type DocumentStatus = "active" | "archived";

export type UploadStage =
  | "preparing"
  | "uploading"
  | "scanning"
  | "accepted"
  | "rejected"
  | "failed";

/** Immutable, content-addressed logical version. */
export type DocumentVersion = Readonly<{
  versionId: string;
  /** Monotonic 1-based version number within the document. */
  sequence: number;
  source: "upload" | "promote" | "restore";
  /** Set when source === "restore": the preserved version it references. */
  restoredFromVersionId: string | null;
  /** Opaque final object key; never derived from user input. */
  objectKey: string;
  /** Real content digest (never the S3 ETag). */
  sha256: string;
  sha256Algorithm: "sha256";
  mimeType: string;
  byteLength: number;
  originalFileName: string;
  uploadedAt: string;
  /** Stable actor id of the uploader/restorer. */
  uploadedBy: string | null;
}>;

export type DocumentRecord = Readonly<{
  documentId: string;
  title: string;
  description: string;
  /** App-owned category key (e.g. "incorporation", "agreements"). */
  category: string;
  /** App-owned visibility policy value (never hard-coded here). */
  visibility: string;
  status: DocumentStatus;
  /** Optimistic-concurrency guard; every transition bumps it. */
  revision: number;
  currentVersionId: string;
  createdBy: string | null;
  createdAt: string;
  updatedBy: string | null;
  updatedAt: string;
}>;

/** A document plus its current version, as surfaced to consumers. */
export type DocumentItem = Readonly<
  DocumentRecord & {
    currentVersion: DocumentVersion;
    versionCount: number;
  }
>;

export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024; // 50 MB
export const MAX_DOCUMENT_TITLE = 200;
export const MAX_DOCUMENT_DESCRIPTION = 2000;
export const MAX_VERSION_HISTORY_PAGE = 200;

/** Site-provided policy fragment for classifying uploaded bytes. */
export type DocumentTypePolicy = Readonly<{
  /** Exact MIME types accepted, e.g. ["application/pdf","text/plain"]. */
  allowedMimeTypes: ReadonlyArray<string>;
  /** Extensions permitted, e.g. [".pdf",".txt"]. */
  allowedExtensions: ReadonlyArray<string>;
}>;

export const DEFAULT_DOCUMENT_TYPE_POLICY: DocumentTypePolicy = {
  allowedMimeTypes: ["application/pdf", "text/plain", "text/csv"],
  allowedExtensions: [".pdf", ".txt", ".csv"],
};

export type ClassificationResult =
  | { accepted: true; mimeType: string; extension: string }
  | { accepted: false; reason: string };

function extensionOf(fileName: string): string {
  const last = fileName.lastIndexOf(".");
  return last >= 0 ? fileName.slice(last).toLowerCase() : "";
}

export function normalizeDocumentTitle(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** Validates user-supplied metadata; returns an array of message keys. */
export function validateDocumentMetadata(input: {
  title: string;
  description: string;
  category: string;
}): string[] {
  const issues: string[] = [];
  const title = normalizeDocumentTitle(input.title);
  if (!title) issues.push("title.required");
  if (title.length > MAX_DOCUMENT_TITLE) issues.push("title.too-long");
  if (input.description.trim().length > MAX_DOCUMENT_DESCRIPTION) issues.push("description.too-long");
  if (!input.category.trim()) issues.push("category.required");
  if (input.category.trim().length > 80) issues.push("category.too-long");
  return issues;
}

export function normalizeDocumentMetadata(input: {
  title: string;
  description: string;
  category: string;
}): { title: string; description: string; category: string } {
  return {
    title: normalizeDocumentTitle(input.title),
    description: input.description.trim(),
    category: input.category.trim(),
  };
}

export function classifyUploadedObject(input: {
  byteLength: number;
  mimeType: string;
  originalFileName: string;
}, policy: DocumentTypePolicy = DEFAULT_DOCUMENT_TYPE_POLICY): ClassificationResult {
  if (!Number.isFinite(input.byteLength) || input.byteLength <= 0) {
    return { accepted: false, reason: "empty" };
  }
  if (input.byteLength > MAX_DOCUMENT_BYTES) {
    return { accepted: false, reason: "too-large" };
  }
  const mime = (input.mimeType ?? "").trim().toLowerCase();
  if (!mime) return { accepted: false, reason: "missing-content-type" };
  const extension = extensionOf(input.originalFileName);
  if (!policy.allowedMimeTypes.includes(mime)) {
    return { accepted: false, reason: "unsupported-content-type" };
  }
  if (!policy.allowedExtensions.includes(extension)) {
    return { accepted: false, reason: "unsupported-extension" };
  }
  return { accepted: true, mimeType: mime, extension };
}

/** Magic-byte signature check so a mislabeled object is rejected, not displayed.
 * Mirrors the Community/Coalition public-files guard. */
export function contentMatchesType(mimeType: string, bytes: Uint8Array): boolean {
  if (mimeType === "application/pdf") {
    return (
      bytes.length >= 5 &&
      bytes[0] === 0x25 && // %
      bytes[1] === 0x50 && // P
      bytes[2] === 0x44 && // D
      bytes[3] === 0x46 && // F
      bytes[4] === 0x2d // -
    );
  }
  if (mimeType === "application/zip" || mimeType === "application/x-zip-compressed") {
    return (
      bytes.length >= 4 &&
      bytes[0] === 0x50 && // P
      bytes[1] === 0x4b && // K
      ((bytes[2] === 0x03 && bytes[3] === 0x04) ||
        (bytes[2] === 0x05 && bytes[3] === 0x06) ||
        (bytes[2] === 0x07 && bytes[3] === 0x08))
    );
  }
  if (mimeType === "application/json") {
    if (bytes.includes(0)) return false;
    try {
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
      return true;
    } catch {
      return false;
    }
  }
  if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "text/markdown") {
    return !bytes.includes(0);
  }
  return false;
}

/** Version lifecycle transitions (pure; the repository enforces the revision
 * condition so two writers can never both succeed). */
export function acceptUploadVersion(record: DocumentRecord, version: DocumentVersion): DocumentRecord {
  return {
    ...record,
    currentVersionId: version.versionId,
    revision: record.revision + 1,
    status: "active",
    updatedAt: version.uploadedAt,
    updatedBy: version.uploadedBy,
  };
}

export function restoreVersion(
  record: DocumentRecord,
  target: DocumentVersion,
  now: string,
  actorId: string | null,
): { version: DocumentVersion; next: DocumentRecord } {
  const version: DocumentVersion = {
    ...target,
    sequence: record.revision + 1,
    source: "restore",
    restoredFromVersionId: target.versionId,
    uploadedAt: now,
    uploadedBy: actorId,
  };
  return { version, next: acceptUploadVersion(record, version) };
}

export function setDocumentArchived(
  record: DocumentRecord,
  archived: boolean,
  now: string,
  actorId: string | null,
): DocumentRecord {
  return {
    ...record,
    status: archived ? "archived" : "active",
    revision: record.revision + 1,
    updatedAt: now,
    updatedBy: actorId,
  };
}

export function updateDocumentMetadata(
  record: DocumentRecord,
  metadata: { title: string; description: string; category: string; visibility: string },
  now: string,
  actorId: string | null,
): DocumentRecord {
  return {
    ...record,
    title: normalizeDocumentTitle(metadata.title),
    description: metadata.description.trim(),
    category: metadata.category.trim(),
    visibility: metadata.visibility,
    revision: record.revision + 1,
    updatedAt: now,
    updatedBy: actorId,
  };
}

/** Builds an opaque final object key from server-controlled inputs only. */
export function buildObjectKey(prefix: string, documentId: string, versionId: string): string {
  return `${prefix}/objects/${documentId}/${versionId}`.replace(/\/+/g, "/");
}

/** Builds a unique, server-controlled staging key for an upload intent. */
export function buildStagingKey(prefix: string, operationId: string): string {
  return `${prefix}/staging/${operationId}`.replace(/\/+/g, "/");
}

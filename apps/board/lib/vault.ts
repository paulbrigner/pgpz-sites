import "server-only";

import { randomUUID } from "node:crypto";
import type { DocumentItem, DocumentVersion } from "@pgpz/document-vault";
import {
  buildObjectKey,
  classifyUploadedObject,
  contentMatchesType,
  normalizeDocumentMetadata,
  restoreVersion as computeRestored,
  validateDocumentMetadata,
} from "@pgpz/document-vault";
import type { BoardMember } from "@/lib/session";
import { boardDocumentObjectStore, computeSha256, isBoardStagingKey, newDocumentId } from "@/lib/object-store";
import { createBoardDocumentRepository } from "@/lib/documents-repository";
import { boardAuditLedger, authenticatedActor } from "@/lib/audit";
import { BOARD_DOCUMENT_TYPE_POLICY, boardExtensionMatchesMimeType } from "@/lib/document-policy";

export const boardDocumentRepository = createBoardDocumentRepository();
export const BOARD_DOCUMENT_PREFIX = "board";

export class VaultValidationError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VaultValidationError";
    this.code = code;
  }
}

export class VaultAuthorizationError extends Error {
  constructor() {
    super("Not authorized to manage board documents.");
    this.name = "VaultAuthorizationError";
  }
}

function assertDocumentManager(member: BoardMember): void {
  if (!member.isAdmin) throw new VaultAuthorizationError();
}

/**
 * The vault only promotes objects that live under the server-issued board
 * staging namespace. Accepting an arbitrary caller-supplied key would let a
 * manager repoint create/addVersion at content they never staged (staged-object
 * substitution). We enforce the strict `board/staging/<uuid>` shape here, and
 * again as defense-in-depth inside the object store.
 */
function assertStagedKeyOwned(stagedKey: string): void {
  if (!isBoardStagingKey(stagedKey)) {
    throw new VaultValidationError("staging-key", "Upload staging key is invalid or expired.");
  }
}

function newVersionId() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 12)}`;
}

export async function createDocument(input: {
  member: BoardMember;
  stagedKey: string;
  fileName: string;
  title: string;
  description: string;
  category: string;
  visibility?: string;
}): Promise<DocumentItem> {
  assertDocumentManager(input.member);

  const metadataIssues = validateDocumentMetadata({ title: input.title, description: input.description, category: input.category });
  if (metadataIssues.length > 0) throw new VaultValidationError("metadata", `Invalid document metadata: ${metadataIssues.join(", ")}`);
  assertStagedKeyOwned(input.stagedKey);
  const { title, description, category } = normalizeDocumentMetadata({ title: input.title, description: input.description, category: input.category });

  // Validate + promote the staged object to an immutable retained key.
  const staged = await boardDocumentObjectStore.readStaged(input.stagedKey);
  const classified = classifyUploadedObject(
    { byteLength: staged.metadata.byteLength, mimeType: staged.metadata.mimeType, originalFileName: input.fileName },
    BOARD_DOCUMENT_TYPE_POLICY,
  );
  if (!classified.accepted) throw new VaultValidationError(classified.reason, `Upload rejected: ${classified.reason}.`);
  if (!boardExtensionMatchesMimeType(classified.extension, classified.mimeType)) {
    throw new VaultValidationError("type-extension-mismatch", "Upload contents and filename type do not match.");
  }
  const bytes = staged.bytes;
  if (!contentMatchesType(classified.mimeType, new Uint8Array(bytes))) {
    throw new VaultValidationError("signature-mismatch", "Upload contents do not match their declared type.");
  }

  const documentId = newDocumentId();
  const versionId = newVersionId();
  const finalKey = buildObjectKey(BOARD_DOCUMENT_PREFIX, documentId, versionId);
  await boardDocumentObjectStore.promote(input.stagedKey, finalKey);
  await boardDocumentObjectStore.deleteStaging(input.stagedKey).catch(() => {});

  const version: DocumentVersion = {
    versionId,
    sequence: 1,
    source: "upload",
    restoredFromVersionId: null,
    objectKey: finalKey,
    sha256: computeSha256(bytes),
    sha256Algorithm: "sha256",
    mimeType: classified.mimeType,
    byteLength: staged.metadata.byteLength,
    originalFileName: input.fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.member.id,
  };

  const item = await boardDocumentRepository.createDocument({
    documentId,
    title,
    description,
    category,
    visibility: input.visibility ?? "members",
    version,
    actorId: input.member.id,
  });

  await boardAuditLedger.append({
    category: "document_lifecycle",
    action: "document_created",
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "document", id: documentId, version: versionId },
    metadata: new Map<string, string | number | boolean | null>([["title", title], ["category", category], ["size", staged.metadata.byteLength]]),
    idempotencyKey: `doc-created-${documentId}`,
    occurredAt: new Date().toISOString(),
  });
  return item;
}

export async function addVersion(input: {
  member: BoardMember;
  documentId: string;
  stagedKey: string;
  fileName: string;
}): Promise<DocumentItem> {
  assertDocumentManager(input.member);
  const existing = await boardDocumentRepository.getDocument(input.documentId);
  if (!existing) throw new VaultValidationError("not-found", "Document not found.");
  assertStagedKeyOwned(input.stagedKey);

  const staged = await boardDocumentObjectStore.readStaged(input.stagedKey);
  const classified = classifyUploadedObject(
    { byteLength: staged.metadata.byteLength, mimeType: staged.metadata.mimeType, originalFileName: input.fileName },
    BOARD_DOCUMENT_TYPE_POLICY,
  );
  if (!classified.accepted) throw new VaultValidationError(classified.reason, `Upload rejected: ${classified.reason}.`);
  if (!boardExtensionMatchesMimeType(classified.extension, classified.mimeType)) {
    throw new VaultValidationError("type-extension-mismatch", "Upload contents and filename type do not match.");
  }
  if (!contentMatchesType(classified.mimeType, new Uint8Array(staged.bytes))) {
    throw new VaultValidationError("signature-mismatch", "Upload contents do not match their declared type.");
  }

  const versionId = newVersionId();
  const finalKey = buildObjectKey(BOARD_DOCUMENT_PREFIX, input.documentId, versionId);
  await boardDocumentObjectStore.promote(input.stagedKey, finalKey);
  await boardDocumentObjectStore.deleteStaging(input.stagedKey).catch(() => {});

  const version: DocumentVersion = {
    versionId,
    sequence: existing.revision + 1,
    source: "upload",
    restoredFromVersionId: null,
    objectKey: finalKey,
    sha256: computeSha256(staged.bytes),
    sha256Algorithm: "sha256",
    mimeType: classified.mimeType,
    byteLength: staged.metadata.byteLength,
    originalFileName: input.fileName,
    uploadedAt: new Date().toISOString(),
    uploadedBy: input.member.id,
  };

  const item = await boardDocumentRepository.acceptVersion({
    documentId: input.documentId,
    expectedRevision: existing.revision,
    head: existing,
    version,
    actorId: input.member.id,
  });
  await boardAuditLedger.append({
    category: "document_lifecycle",
    action: "version_created",
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "document", id: input.documentId, version: versionId },
    metadata: new Map<string, string | number | boolean | null>([["size", staged.metadata.byteLength], ["from-version", existing.currentVersionId]]),
    idempotencyKey: `version-${input.documentId}-${versionId}`,
    occurredAt: new Date().toISOString(),
  });
  return item;
}

export async function restoreVersion(input: { member: BoardMember; documentId: string; versionId: string }): Promise<DocumentItem | null> {
  assertDocumentManager(input.member);
  const item = await boardDocumentRepository.getDocument(input.documentId);
  if (!item) return null;
  const target = (await boardDocumentRepository.listVersions(input.documentId)).find((v) => v.versionId === input.versionId);
  if (!target) throw new VaultValidationError("version-not-found", "Version not found.");
  const { version, next } = computeRestored(item, target, new Date().toISOString(), input.member.id);
  await boardDocumentRepository.acceptVersion({
    documentId: input.documentId,
    expectedRevision: item.revision,
    head: next,
    version,
    actorId: input.member.id,
  });
  await boardAuditLedger.append({
    category: "document_lifecycle",
    action: "version_restored",
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "document", id: input.documentId, version: input.versionId },
    idempotencyKey: `restore-${input.documentId}-${input.versionId}`,
    occurredAt: new Date().toISOString(),
  });
  return boardDocumentRepository.getDocument(input.documentId);
}

export async function setArchived(input: { member: BoardMember; documentId: string; archived: boolean }): Promise<DocumentItem | null> {
  assertDocumentManager(input.member);
  const item = await boardDocumentRepository.setArchived(input.documentId, input.archived, input.member.id, new Date().toISOString());
  if (!item) return null;
  await boardAuditLedger.append({
    category: "document_lifecycle",
    action: input.archived ? "document_archived" : "document_unarchived",
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "document", id: input.documentId, version: item.currentVersion.versionId },
    idempotencyKey: `archive-${input.documentId}-${String(input.archived)}`,
    occurredAt: new Date().toISOString(),
  });
  return item;
}

export async function updateMetadata(input: {
  member: BoardMember;
  documentId: string;
  title: string;
  description: string;
  category: string;
  visibility: string;
}): Promise<DocumentItem | null> {
  assertDocumentManager(input.member);
  const issues = validateDocumentMetadata({ title: input.title, description: input.description, category: input.category });
  if (issues.length > 0) throw new VaultValidationError("metadata", `Invalid document metadata: ${issues.join(", ")}`);
  const normalized = normalizeDocumentMetadata({ title: input.title, description: input.description, category: input.category });
  const item = await boardDocumentRepository.updateMetadata(input.documentId, { ...normalized, visibility: input.visibility }, input.member.id);
  if (!item) return null;
  await boardAuditLedger.append({
    category: "document_lifecycle",
    action: "metadata_updated",
    outcome: "success",
    actor: authenticatedActor(input.member),
    target: { type: "document", id: input.documentId, version: item.currentVersion.versionId },
    metadata: new Map<string, string | number | boolean | null>([["category", normalized.category]]),
    idempotencyKey: `meta-${input.documentId}-${input.member.id}-${Date.now()}`,
    occurredAt: new Date().toISOString(),
  });
  return item;
}

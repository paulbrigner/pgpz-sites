import "server-only";

import type {
  DocumentItem,
  DocumentRecord,
  DocumentVersion,
} from "../domain";
import { acceptUploadVersion, updateDocumentMetadata } from "../domain";
import {
  OptimisticConcurrencyError,
  type AcceptVersionInput,
  type DocumentFilter,
  type DocumentRepository,
  type NewDocumentInput,
} from "./repository";

type Row = { record: DocumentRecord; versions: DocumentVersion[] };

/** In-memory reference repository used by tests and the read-only Reference
 * proof. Enforces the same revision-based optimistic concurrency the DynamoDB
 * adapter must. */
export function createInMemoryDocumentRepository(): DocumentRepository {
  const rows = new Map<string, Row>();

  const toItem = (row: Row): DocumentItem => {
    const current = row.versions.find((version) => version.versionId === row.record.currentVersionId);
    if (!current) throw new Error(`Document ${row.record.documentId} has no current version.`);
    return { ...row.record, currentVersion: current, versionCount: row.versions.length };
  };

  return {
    async getDocument(documentId) {
      const row = rows.get(documentId);
      return row ? toItem(row) : null;
    },

    async listDocuments(filter) {
      const items = [...rows.values()].map(toItem);
      return items.filter((item) => {
        if (filter?.category && item.category !== filter.category) return false;
        if (filter?.status && item.status !== filter.status) return false;
        if (filter?.term) {
          const term = filter.term.toLowerCase();
          if (!item.title.toLowerCase().includes(term) && !item.description.toLowerCase().includes(term)) {
            return false;
          }
        }
        return true;
      });
    },

    async listVersions(documentId) {
      const row = rows.get(documentId);
      return row ? [...row.versions].sort((a, b) => a.sequence - b.sequence) : [];
    },

    async createDocument(input: NewDocumentInput) {
      const now = new Date().toISOString();
      const record: DocumentRecord = {
        documentId: input.documentId,
        title: input.title,
        description: input.description,
        category: input.category,
        visibility: input.visibility,
        status: "active",
        revision: 0,
        currentVersionId: input.version.versionId,
        createdBy: input.actorId,
        createdAt: now,
        updatedBy: input.actorId,
        updatedAt: now,
      };
      const row: Row = { record, versions: [input.version] };
      rows.set(record.documentId, row);
      return toItem(row);
    },

    async acceptVersion(input: AcceptVersionInput) {
      const row = rows.get(input.documentId);
      if (!row) throw new Error(`Unknown document ${input.documentId}`);
      if (row.record.revision !== input.expectedRevision) {
        throw new OptimisticConcurrencyError(input.documentId);
      }
      row.record = acceptUploadVersion(row.record, input.version);
      row.versions = [...row.versions.filter((v) => v.versionId !== input.version.versionId), input.version];
      return toItem(row);
    },

    async setArchived(documentId, archived, actorId, now) {
      const row = rows.get(documentId);
      if (!row) return null;
      row.record = { ...row.record, status: archived ? "archived" : "active", revision: row.record.revision + 1, updatedAt: now, updatedBy: actorId };
      return toItem(row);
    },

    async updateMetadata(documentId, metadata, actorId) {
      const row = rows.get(documentId);
      if (!row) return null;
      row.record = updateDocumentMetadata(row.record, metadata, new Date().toISOString(), actorId);
      return toItem(row);
    },
  };
}

/** Deterministic read-only fixtures for the Reference proof. */
export async function seedReferenceDocuments(repo: DocumentRepository): Promise<DocumentItem[]> {
  const now = "2026-08-06T00:00:00.000Z";
  const items: DocumentItem[] = [];
  const mk = (
    title: string,
    category: string,
    versionId: string,
    sequence: number,
    mimeType: string,
    byteLength: number,
  ): DocumentVersion => ({
    versionId,
    sequence,
    source: "upload",
    restoredFromVersionId: null,
    objectKey: `reference/objects/seed/${versionId}`,
    sha256: "0".repeat(64),
    sha256Algorithm: "sha256",
    mimeType,
    byteLength,
    originalFileName: `${title}.pdf`,
    uploadedAt: now,
    uploadedBy: "seed",
  });

  const seeds: ReadonlyArray<readonly [string, string]> = [
    ["Reference Articles of Incorporation", "incorporation"],
    ["Reference Board Agreement", "agreements"],
    ["Reference Conflict of Interest Policy", "policies"],
  ];
  for (const [title, category] of seeds) {
    const version = mk(title, category, `${category}-v1`, 1, "application/pdf", 12_345);
    const created = await repo.createDocument({
      documentId: `reference-${category}`,
      title,
      description: `Synthetic ${title.toLowerCase()} for the reference proof.`,
      category,
      visibility: "members",
      version,
      actorId: "seed",
    });
    items.push(created);
  }
  return items;
}

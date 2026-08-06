import "server-only";

import type { DocumentItem, DocumentRecord, DocumentVersion } from "@pgpz/document-vault";
import { acceptUploadVersion, setDocumentArchived, updateDocumentMetadata } from "@pgpz/document-vault";
import {
  OptimisticConcurrencyError,
  type AcceptVersionInput,
  type DocumentFilter,
  type DocumentRepository,
  type NewDocumentInput,
} from "@pgpz/document-vault/server";
import { documentClient } from "@/lib/dynamodb";
import { BOARD_DOCUMENTS_TABLE } from "@/lib/config";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type VaultDocumentClient = any;
const META_SK = "META";
const VERSION_PREFIX = "VERSION#";
const LIBRARY_PK = "DOCUMENTS";

const pad = (sequence: number) => String(sequence).padStart(8, "0");
const docPk = (documentId: string) => `DOCUMENT#${documentId}`;
const versionSk = (sequence: number, versionId: string) => `${VERSION_PREFIX}${pad(sequence)}#${versionId}`;

type Row = Record<string, unknown>;

function metaRecord(record: DocumentRecord, includeLibrary = false): Row {
  return {
    pk: docPk(record.documentId),
    sk: META_SK,
    type: "DOCUMENT_META",
    documentId: record.documentId,
    title: record.title,
    description: record.description,
    category: record.category,
    visibility: record.visibility,
    status: record.status,
    revision: record.revision,
    currentVersionId: record.currentVersionId,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedBy: record.updatedBy,
    updatedAt: record.updatedAt,
    ...(includeLibrary ? { libraryPk: LIBRARY_PK } : {}),
  };
}

function metaToRecord(item: Row | undefined | null): DocumentRecord | null {
  if (!item || item.type !== "DOCUMENT_META") return null;
  const documentId = String(item.documentId ?? "");
  const currentVersionId = String(item.currentVersionId ?? "");
  if (!documentId || !currentVersionId) return null;
  return {
    documentId,
    title: String(item.title ?? ""),
    description: String(item.description ?? ""),
    category: String(item.category ?? ""),
    visibility: String(item.visibility ?? "members"),
    status: item.status === "archived" ? "archived" : "active",
    revision: Number(item.revision) || 0,
    currentVersionId,
    createdBy: item.createdBy == null ? null : String(item.createdBy),
    createdAt: String(item.createdAt),
    updatedBy: item.updatedBy == null ? null : String(item.updatedBy),
    updatedAt: String(item.updatedAt),
  };
}

function versionItem(documentId: string, version: DocumentVersion): Row {
  return {
    pk: docPk(documentId),
    sk: versionSk(version.sequence, version.versionId),
    type: "DOCUMENT_VERSION",
    versionId: version.versionId,
    sequence: version.sequence,
    source: version.source,
    restoredFromVersionId: version.restoredFromVersionId,
    objectKey: version.objectKey,
    sha256: version.sha256,
    sha256Algorithm: version.sha256Algorithm,
    mimeType: version.mimeType,
    byteLength: version.byteLength,
    originalFileName: version.originalFileName,
    uploadedAt: version.uploadedAt,
    uploadedBy: version.uploadedBy,
  };
}

function itemToVersion(item: Row | undefined | null): DocumentVersion | null {
  if (!item || item.type !== "DOCUMENT_VERSION") return null;
  const versionId = String(item.versionId ?? "");
  if (!versionId) return null;
  return {
    versionId,
    sequence: Number(item.sequence) || 0,
    source: item.source === "restore" ? "restore" : item.source === "promote" ? "promote" : "upload",
    restoredFromVersionId: item.restoredFromVersionId == null ? null : String(item.restoredFromVersionId),
    objectKey: String(item.objectKey ?? ""),
    sha256: String(item.sha256 ?? ""),
    sha256Algorithm: "sha256",
    mimeType: String(item.mimeType ?? ""),
    byteLength: Number(item.byteLength) || 0,
    originalFileName: String(item.originalFileName ?? "download"),
    uploadedAt: String(item.uploadedAt ?? ""),
    uploadedBy: item.uploadedBy == null ? null : String(item.uploadedBy),
  };
}

function isConditional(error: unknown) {
  return (error as { name?: unknown } | null)?.name === "ConditionalCheckFailedException" ||
    (error as { name?: unknown } | null)?.name === "TransactionCanceledException";
}

export function createBoardDocumentRepository(client: VaultDocumentClient = documentClient): DocumentRepository {
  const tableName = BOARD_DOCUMENTS_TABLE;

  async function getMeta(documentId: string): Promise<DocumentRecord | null> {
    const result = await client.get({ TableName: tableName, Key: { pk: docPk(documentId), sk: META_SK } });
    return metaToRecord(result?.Item as Row | undefined);
  }

  async function listVersionRows(documentId: string): Promise<Row[]> {
    const rows: Row[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;
    do {
      const result = await client.query({
        TableName: tableName,
        KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
        ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
        ExpressionAttributeValues: { ":pk": docPk(documentId), ":prefix": VERSION_PREFIX },
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      });
      exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
      rows.push(...((result.Items || []) as Row[]));
    } while (exclusiveStartKey);
    return rows;
  }

  async function toItem(record: DocumentRecord): Promise<DocumentItem> {
    const rows = await listVersionRows(record.documentId);
    const versions = rows.map(itemToVersion).filter((v): v is DocumentVersion => !!v);
    const current = versions.find((v) => v.versionId === record.currentVersionId);
    if (!current) throw new Error(`Document ${record.documentId} has no current version.`);
    return { ...record, currentVersion: current, versionCount: versions.length };
  }

  return {
    async getDocument(documentId) {
      const record = await getMeta(documentId);
      return record ? toItem(record) : null;
    },

    async listDocuments(filter?: DocumentFilter) {
      const metas: DocumentRecord[] = [];
      let exclusiveStartKey: Record<string, unknown> | undefined;
      do {
        const result = await client.query({
          TableName: tableName,
          IndexName: "Library",
          KeyConditionExpression: "#lp = :lp",
          ExpressionAttributeNames: { "#lp": "libraryPk" },
          ExpressionAttributeValues: { ":lp": LIBRARY_PK },
          ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
        });
        exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
        for (const keyRow of (result.Items || []) as Row[]) {
          const pk = String(keyRow.pk ?? "");
          if (!pk.startsWith("DOCUMENT#")) continue;
          const meta = await getMeta(pk.slice("DOCUMENT#".length));
          if (meta) metas.push(meta);
        }
      } while (exclusiveStartKey);

      const records = metas.filter((record) => {
        if (filter?.category && record.category !== filter.category) return false;
        if (filter?.status && record.status !== filter.status) return false;
        if (filter?.term) {
          const term = filter.term.toLowerCase();
          if (!record.title.toLowerCase().includes(term) && !record.description.toLowerCase().includes(term)) return false;
        }
        return true;
      }); // sorted by updatedAt desc
      records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

      const items: DocumentItem[] = [];
      for (const record of records) {
        try {
          items.push(await toItem(record));
        } catch {
          // skip a document whose current version is missing
        }
      }
      return items;
    },

    async listVersions(documentId) {
      const rows = await listVersionRows(documentId);
      return rows.map(itemToVersion).filter((v): v is DocumentVersion => !!v).sort((a, b) => a.sequence - b.sequence);
    },

    async createDocument(input: NewDocumentInput) {
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
        createdAt: new Date().toISOString(),
        updatedBy: input.actorId,
        updatedAt: new Date().toISOString(),
      };
      const version = input.version;
      await client.transactWrite({
        TransactItems: [
          { Put: { TableName: tableName, Item: metaRecord(record, true), ConditionExpression: "attribute_not_exists(#pk)", ExpressionAttributeNames: { "#pk": "pk" } } },
          { Put: { TableName: tableName, Item: versionItem(input.documentId, { ...version, sequence: 1 }) } },
        ],
      });
      return toItem({ ...record, currentVersionId: input.version.versionId });
    },

    async acceptVersion(input: AcceptVersionInput) {
      const current = await getMeta(input.documentId);
      if (!current) throw new Error(`Unknown document ${input.documentId}`);
      if (current.revision !== input.expectedRevision) throw new OptimisticConcurrencyError(input.documentId);
      const version = { ...input.version, sequence: current.revision + 1 };
      const next = acceptUploadVersion(current, version);
      try {
        await client.transactWrite({
          TransactItems: [
            { Put: { TableName: tableName, Item: versionItem(input.documentId, version), ConditionExpression: "attribute_not_exists(#sk)", ExpressionAttributeNames: { "#sk": "sk" } } },
            { Update: updateHeadStatement(current, next) },
          ],
        });
      } catch (error) {
        if (isConditional(error)) throw new OptimisticConcurrencyError(input.documentId);
        throw error;
      }
      return toItem(next);
    },

    async setArchived(documentId, archived, actorId, now) {
      const current = await getMeta(documentId);
      if (!current) return null;
      const next = setDocumentArchived(current, archived, now, actorId);
      await client.update(updateMetaStatement(current, next));
      return toItem(next);
    },

    async updateMetadata(documentId, metadata, actorId) {
      const current = await getMeta(documentId);
      if (!current) return null;
      const next = updateDocumentMetadata(current, metadata, new Date().toISOString(), actorId);
      await client.update(updateMetaStatement(current, next));
      return toItem(next);
    },
  };

  function updateHeadStatement(prev: DocumentRecord, next: DocumentRecord) {
    return {
      TableName: tableName,
      Key: { pk: docPk(next.documentId), sk: META_SK },
      UpdateExpression:
        "SET currentVersionId = :currentVersionId, #rev = :nextRevision, #updAt = :updatedAt, #updBy = :updatedBy",
      ExpressionAttributeNames: { "#rev": "revision", "#updAt": "updatedAt", "#updBy": "updatedBy" },
      ExpressionAttributeValues: {
        ":currentVersionId": next.currentVersionId,
        ":nextRevision": next.revision,
        ":updatedAt": next.updatedAt,
        ":updatedBy": next.updatedBy,
        ":expectedRevision": prev.revision,
      },
      ConditionExpression: "#rev = :expectedRevision",
    };
  }

  function updateMetaStatement(prev: DocumentRecord, next: DocumentRecord) {
    return {
      TableName: tableName,
      Key: { pk: docPk(next.documentId), sk: META_SK },
      UpdateExpression:
        "SET title = :title, description = :description, category = :category, visibility = :visibility, #status = :status, #rev = :nextRevision, #updAt = :updatedAt, #updBy = :updatedBy",
      ExpressionAttributeNames: { "#status": "status", "#rev": "revision", "#updAt": "updatedAt", "#updBy": "updatedBy" },
      ExpressionAttributeValues: {
        ":title": next.title,
        ":description": next.description,
        ":category": next.category,
        ":visibility": next.visibility,
        ":status": next.status,
        ":nextRevision": next.revision,
        ":updatedAt": next.updatedAt,
        ":updatedBy": next.updatedBy,
        ":expectedRevision": prev.revision,
      },
      ConditionExpression: "#rev = :expectedRevision",
    };
  }
}

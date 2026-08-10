import "server-only";

import { randomUUID } from "node:crypto";
import {
  normalizePublicFilePath,
  normalizePublicFileAccess,
  publicFileContentType,
  publicFileTitleFromPath,
  publicFileUrl,
  type PublicFileItem,
  type PublicFileAccess,
  type PublicFileStatus,
} from "./domain";

export type PublicFileDocumentClient = {
  get(input: Record<string, unknown>): Promise<{ Item?: unknown }>;
  put(input: Record<string, unknown>): Promise<unknown>;
  query(input: Record<string, unknown>): Promise<{
    Items?: unknown[];
    LastEvaluatedKey?: unknown;
  }>;
  update(input: Record<string, unknown>): Promise<unknown>;
};

export type PublicFileRuntimeDependencies = {
  documentClient: PublicFileDocumentClient;
  tableName: string;
  bucket: string | null | undefined;
  prefix: string;
  siteUrl: string;
};

let configuredRuntime: PublicFileRuntimeDependencies | null = null;

export function configurePublicFileRuntime(dependencies: PublicFileRuntimeDependencies) {
  configuredRuntime = dependencies;
}

const runtime = () => {
  if (!configuredRuntime) {
    throw new Error("Public-file runtime has not been configured.");
  }
  return configuredRuntime;
};

const PUBLIC_FILE_LIBRARY_PK = "PUBLIC_FILE_LIBRARY";
const PUBLIC_FILE_SK_PREFIX = "FILE#";
const MAX_PREVIOUS_VERSIONS = 100;

export type PublicFileVersion = {
  versionId: string;
  s3Key: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  etag: string | null;
  uploadedAt: string;
  uploadedBy: string | null;
};

export type PublicFileRecord = Omit<PublicFileItem, "url" | "previousVersionCount"> & {
  revision: number;
  versionId: string;
  s3Bucket: string;
  s3Key: string;
  etag: string | null;
  previousVersions: PublicFileVersion[];
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const nullableText = (value: unknown) => text(value) || null;

const normalizePreviousVersions = (value: unknown): PublicFileVersion[] =>
  Array.isArray(value)
    ? value
        .map((candidate) => {
          if (!candidate || typeof candidate !== "object") return null;
          const item = candidate as Record<string, unknown>;
          const versionId = text(item.versionId);
          const s3Key = text(item.s3Key);
          const contentType = text(item.contentType);
          if (!versionId || !s3Key || !contentType) return null;
          return {
            versionId,
            s3Key,
            originalFileName: text(item.originalFileName) || "download",
            contentType,
            fileSize: Math.max(0, Number(item.fileSize) || 0),
            etag: nullableText(item.etag),
            uploadedAt: text(item.uploadedAt),
            uploadedBy: nullableText(item.uploadedBy),
          };
        })
        .filter((item): item is PublicFileVersion => !!item)
    : [];

const publicFileRecordFromItem = (
  item: Record<string, unknown> | undefined | null,
): PublicFileRecord | null => {
  if (!item || item.type !== "PUBLIC_FILE") return null;
  const path = text(item.path);
  const contentType = text(item.contentType);
  const s3Bucket = text(item.s3Bucket);
  const s3Key = text(item.s3Key);
  const versionId = text(item.versionId);
  if (!path || !contentType || !s3Bucket || !s3Key || !versionId) return null;

  const status: PublicFileStatus = item.status === "archived" ? "archived" : "active";
  return {
    path,
    title: text(item.title) || publicFileTitleFromPath(path),
    description: text(item.description),
    originalFileName: text(item.originalFileName) || path.split("/").pop() || "download",
    contentType,
    fileSize: Math.max(0, Number(item.fileSize) || 0),
    access: normalizePublicFileAccess(item.access),
    revision: Math.max(0, Number(item.revision) || 0),
    versionId,
    s3Bucket,
    s3Key,
    etag: nullableText(item.etag),
    status,
    createdAt: text(item.createdAt),
    createdBy: nullableText(item.createdBy),
    updatedAt: text(item.updatedAt),
    updatedBy: nullableText(item.updatedBy),
    archivedAt: nullableText(item.archivedAt),
    archivedBy: nullableText(item.archivedBy),
    previousVersions: normalizePreviousVersions(item.previousVersions),
  };
};

export function getPublicFilesBucket() {
  return runtime().bucket?.trim() || "";
}

export function publicFileObjectKey(path: string, versionId: string) {
  const normalizedPath = normalizePublicFilePath(path);
  const extension = normalizedPath.slice(normalizedPath.lastIndexOf("."));
  const stem = normalizedPath.slice(0, -extension.length);
  return `${runtime().prefix}/objects/${stem}/${versionId}${extension}`;
}

export function createPublicFileVersionId() {
  return `${Date.now().toString(36)}-${randomUUID().slice(0, 12)}`;
}

export function publicFileRecordToItem(record: PublicFileRecord): PublicFileItem {
  return {
    path: record.path,
    title: record.title,
    description: record.description,
    originalFileName: record.originalFileName,
    contentType: record.contentType,
    fileSize: record.fileSize,
    access: record.access,
    status: record.status,
    createdAt: record.createdAt,
    createdBy: record.createdBy,
    updatedAt: record.updatedAt,
    updatedBy: record.updatedBy,
    archivedAt: record.archivedAt,
    archivedBy: record.archivedBy,
    previousVersionCount: record.previousVersions.length,
    url: publicFileUrl(record.path, runtime().siteUrl),
  };
}

export async function getPublicFileRecord(
  rawPath: string,
  options: { includeArchived?: boolean } = {},
) {
  const path = normalizePublicFilePath(rawPath);
  const result = await runtime().documentClient.get({
    TableName: runtime().tableName,
    Key: {
      pk: PUBLIC_FILE_LIBRARY_PK,
      sk: `${PUBLIC_FILE_SK_PREFIX}${path}`,
    },
  });
  const record = publicFileRecordFromItem(result.Item as Record<string, unknown> | undefined);
  if (
    !record ||
    record.path !== path ||
    (!options.includeArchived && record.status !== "active")
  ) {
    return null;
  }
  return record;
}

export async function listPublicFileRecords() {
  const items: Record<string, unknown>[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const result = await runtime().documentClient.query({
      TableName: runtime().tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :prefix)",
      ExpressionAttributeNames: {
        "#pk": "pk",
        "#sk": "sk",
      },
      ExpressionAttributeValues: {
        ":pk": PUBLIC_FILE_LIBRARY_PK,
        ":prefix": PUBLIC_FILE_SK_PREFIX,
      },
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    });
    items.push(...((result.Items || []) as Record<string, unknown>[]));
    exclusiveStartKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (exclusiveStartKey);

  return items
    .map((item) => publicFileRecordFromItem(item as Record<string, unknown>))
    .filter((item): item is PublicFileRecord => !!item)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

const currentVersion = (record: PublicFileRecord): PublicFileVersion => ({
  versionId: record.versionId,
  s3Key: record.s3Key,
  originalFileName: record.originalFileName,
  contentType: record.contentType,
  fileSize: record.fileSize,
  etag: record.etag,
  uploadedAt: record.updatedAt,
  uploadedBy: record.updatedBy,
});

export async function savePublicFileUpload(input: {
  path: string;
  title: string;
  description: string;
  originalFileName: string;
  contentType: string;
  fileSize: number;
  access: PublicFileAccess;
  versionId: string;
  s3Bucket: string;
  s3Key: string;
  etag: string | null;
  adminUserId: string | null;
}) {
  const path = normalizePublicFilePath(input.path);
  const existing = await getPublicFileRecord(path, { includeArchived: true });
  const now = new Date().toISOString();
  const record: PublicFileRecord = {
    path,
    title: input.title.trim() || existing?.title || publicFileTitleFromPath(path),
    description: input.description.trim(),
    originalFileName: input.originalFileName.trim() || path.split("/").pop() || "download",
    contentType: publicFileContentType(path) || input.contentType,
    fileSize: input.fileSize,
    access: normalizePublicFileAccess(input.access),
    revision: (existing?.revision || 0) + 1,
    versionId: input.versionId,
    s3Bucket: input.s3Bucket,
    s3Key: input.s3Key,
    etag: input.etag,
    status: "active",
    createdAt: existing ? existing.createdAt : now,
    createdBy: existing ? existing.createdBy : input.adminUserId,
    updatedAt: now,
    updatedBy: input.adminUserId,
    archivedAt: null,
    archivedBy: null,
    previousVersions: existing
      ? [currentVersion(existing), ...existing.previousVersions].slice(0, MAX_PREVIOUS_VERSIONS)
      : [],
  };

  await runtime().documentClient.put({
    TableName: runtime().tableName,
    Item: {
      pk: PUBLIC_FILE_LIBRARY_PK,
      sk: `${PUBLIC_FILE_SK_PREFIX}${path}`,
      type: "PUBLIC_FILE",
      ...record,
    },
    ConditionExpression: existing
      ? "#revision = :expectedRevision"
      : "attribute_not_exists(#pk)",
    ExpressionAttributeNames: existing
      ? { "#revision": "revision" }
      : { "#pk": "pk" },
    ...(existing
      ? {
          ExpressionAttributeValues: {
            ":expectedRevision": existing.revision,
          },
        }
      : {}),
  });
  return record;
}

export async function updatePublicFileMetadata(input: {
  path: string;
  title: string;
  description: string;
  access: PublicFileAccess;
  adminUserId: string | null;
}) {
  const existing = await getPublicFileRecord(input.path, { includeArchived: true });
  if (!existing) return null;
  const now = new Date().toISOString();
  await runtime().documentClient.update({
    TableName: runtime().tableName,
    Key: {
      pk: PUBLIC_FILE_LIBRARY_PK,
      sk: `${PUBLIC_FILE_SK_PREFIX}${existing.path}`,
    },
    UpdateExpression:
      "SET #title = :title, #description = :description, #access = :access, #revision = :nextRevision, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
    ExpressionAttributeNames: {
      "#title": "title",
      "#description": "description",
      "#access": "access",
      "#revision": "revision",
      "#updatedAt": "updatedAt",
      "#updatedBy": "updatedBy",
    },
    ExpressionAttributeValues: {
      ":title": input.title.trim() || publicFileTitleFromPath(existing.path),
      ":description": input.description.trim(),
      ":access": normalizePublicFileAccess(input.access),
      ":expectedRevision": existing.revision,
      ":nextRevision": existing.revision + 1,
      ":updatedAt": now,
      ":updatedBy": input.adminUserId,
    },
    ConditionExpression: "#revision = :expectedRevision",
  });
  return getPublicFileRecord(existing.path, { includeArchived: true });
}

export async function setPublicFileArchived(input: {
  path: string;
  archived: boolean;
  adminUserId: string | null;
}) {
  const existing = await getPublicFileRecord(input.path, { includeArchived: true });
  if (!existing) return null;
  const now = new Date().toISOString();
  await runtime().documentClient.update({
    TableName: runtime().tableName,
    Key: {
      pk: PUBLIC_FILE_LIBRARY_PK,
      sk: `${PUBLIC_FILE_SK_PREFIX}${existing.path}`,
    },
    UpdateExpression:
      "SET #status = :status, #archivedAt = :archivedAt, #archivedBy = :archivedBy, #revision = :nextRevision, #updatedAt = :updatedAt, #updatedBy = :updatedBy",
    ExpressionAttributeNames: {
      "#status": "status",
      "#archivedAt": "archivedAt",
      "#archivedBy": "archivedBy",
      "#revision": "revision",
      "#updatedAt": "updatedAt",
      "#updatedBy": "updatedBy",
    },
    ExpressionAttributeValues: {
      ":status": input.archived ? "archived" : "active",
      ":archivedAt": input.archived ? now : null,
      ":archivedBy": input.archived ? input.adminUserId : null,
      ":expectedRevision": existing.revision,
      ":nextRevision": existing.revision + 1,
      ":updatedAt": now,
      ":updatedBy": input.adminUserId,
    },
    ConditionExpression: "#revision = :expectedRevision",
  });
  return getPublicFileRecord(existing.path, { includeArchived: true });
}

export async function restorePreviousPublicFileVersion(input: {
  path: string;
  adminUserId: string | null;
}) {
  const existing = await getPublicFileRecord(input.path, { includeArchived: true });
  const previous = existing?.previousVersions[0];
  if (!existing || !previous) return null;
  const now = new Date().toISOString();
  const record: PublicFileRecord = {
    ...existing,
    revision: existing.revision + 1,
    versionId: previous.versionId,
    s3Key: previous.s3Key,
    originalFileName: previous.originalFileName,
    contentType: previous.contentType,
    fileSize: previous.fileSize,
    etag: previous.etag,
    status: "active",
    updatedAt: now,
    updatedBy: input.adminUserId,
    archivedAt: null,
    archivedBy: null,
    previousVersions: [
      currentVersion(existing),
      ...existing.previousVersions.slice(1),
    ].slice(0, MAX_PREVIOUS_VERSIONS),
  };
  await runtime().documentClient.put({
    TableName: runtime().tableName,
    Item: {
      pk: PUBLIC_FILE_LIBRARY_PK,
      sk: `${PUBLIC_FILE_SK_PREFIX}${existing.path}`,
      type: "PUBLIC_FILE",
      ...record,
    },
    ConditionExpression: "#revision = :expectedRevision",
    ExpressionAttributeNames: {
      "#revision": "revision",
    },
    ExpressionAttributeValues: {
      ":expectedRevision": existing.revision,
    },
  });
  return record;
}

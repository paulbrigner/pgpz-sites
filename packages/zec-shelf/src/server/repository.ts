import "server-only";

import { randomUUID } from "node:crypto";
import type {
  DeleteCommandInput,
  DeleteCommandOutput,
  GetCommandInput,
  GetCommandOutput,
  PutCommandInput,
  PutCommandOutput,
  QueryCommandInput,
  QueryCommandOutput,
  TransactWriteCommandInput,
  TransactWriteCommandOutput,
} from "@aws-sdk/lib-dynamodb";
import {
  cleanZecShelfDraft,
  type ZecShelfCheckState,
  type ZecShelfResource,
  type ZecShelfResourceDraft,
  type ZecShelfSeedResource,
} from "../domain";

const RESOURCE_PREFIX = "RESOURCE#";
const SHELF_META_SK = "META";

export type ZecShelfDocumentClient = {
  get(input: GetCommandInput): Promise<GetCommandOutput>;
  put(input: PutCommandInput): Promise<PutCommandOutput>;
  query(input: QueryCommandInput): Promise<QueryCommandOutput>;
  delete(input: DeleteCommandInput): Promise<DeleteCommandOutput>;
  transactWrite(input: TransactWriteCommandInput): Promise<TransactWriteCommandOutput>;
};

export type CreateZecShelfRepositoryOptions = {
  documentClient: ZecShelfDocumentClient;
  tableName: string;
  partitionKey: string;
  initialResources: readonly ZecShelfSeedResource[];
  now?: () => string;
  createId?: () => string;
};

export type ZecShelfRepository = {
  getResources(): Promise<ZecShelfResource[]>;
  getResource(id: string): Promise<ZecShelfResource | null>;
  createResource(input: Partial<ZecShelfResourceDraft>): Promise<ZecShelfResource>;
  updateResource(id: string, input: Partial<ZecShelfResourceDraft>): Promise<ZecShelfResource>;
  reorderResources(order: string[]): Promise<void>;
  deleteResource(id: string): Promise<void>;
  saveCheckResult(resource: ZecShelfResource): Promise<void>;
};

type StoredResource = ZecShelfResource & {
  pk: string;
  sk: string;
  itemType: "zec-shelf-resource";
};

function isCheckState(value: unknown): value is ZecShelfCheckState {
  return value === "unchecked" || value === "baseline" || value === "same" || value === "changed" || value === "error";
}

function fromStored(item: Record<string, unknown>): ZecShelfResource {
  return {
    id: String(item.id),
    title: String(item.title),
    url: String(item.url),
    description: String(item.description),
    category: String(item.category),
    position: Number(item.position),
    contentSignature: typeof item.contentSignature === "string" ? item.contentSignature : null,
    lastCheckedAt: typeof item.lastCheckedAt === "string" ? item.lastCheckedAt : null,
    lastChangedAt: typeof item.lastChangedAt === "string" ? item.lastChangedAt : null,
    lastHttpStatus: typeof item.lastHttpStatus === "number" ? item.lastHttpStatus : null,
    checkState: isCheckState(item.checkState) ? item.checkState : "unchecked",
    previewUrl: typeof item.previewUrl === "string" ? item.previewUrl : null,
    previewUpdatedAt: typeof item.previewUpdatedAt === "string" ? item.previewUpdatedAt : null,
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

function isConditionalFailure(error: unknown) {
  return (error as { name?: string })?.name === "ConditionalCheckFailedException";
}

export function createZecShelfRepository({
  documentClient,
  tableName,
  partitionKey,
  initialResources,
  now = () => new Date().toISOString(),
  createId = randomUUID,
}: CreateZecShelfRepositoryOptions): ZecShelfRepository {
  function resourceKey(id: string) {
    return { pk: partitionKey, sk: `${RESOURCE_PREFIX}${id}` };
  }

  function toStored(resource: ZecShelfResource): StoredResource {
    return {
      ...resourceKey(resource.id),
      itemType: "zec-shelf-resource",
      ...resource,
    };
  }

  async function queryResources(): Promise<ZecShelfResource[]> {
    const result = await documentClient.query({
      TableName: tableName,
      KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
      ExpressionAttributeValues: { ":pk": partitionKey, ":prefix": RESOURCE_PREFIX },
      ConsistentRead: true,
    });

    return (result.Items || [])
      .map((item) => fromStored(item))
      .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
  }

  async function seedResourcesIfEmpty() {
    const timestamp = now();
    await Promise.all(initialResources.map(async (draft, position) => {
      const resource: ZecShelfResource = {
        ...draft,
        position,
        contentSignature: null,
        lastCheckedAt: null,
        lastChangedAt: null,
        lastHttpStatus: null,
        checkState: "unchecked",
        previewUrl: null,
        previewUpdatedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      await documentClient.put({
        TableName: tableName,
        Item: toStored(resource),
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }).catch((error: unknown) => {
        if (!isConditionalFailure(error)) throw error;
      });
    }));
  }

  async function getResources(): Promise<ZecShelfResource[]> {
    const metadata = await documentClient.get({
      TableName: tableName,
      Key: { pk: partitionKey, sk: SHELF_META_SK },
      ConsistentRead: true,
    });
    if (!metadata.Item) {
      await seedResourcesIfEmpty();
      await documentClient.put({
        TableName: tableName,
        Item: {
          pk: partitionKey,
          sk: SHELF_META_SK,
          itemType: "zec-shelf-metadata",
          initializedAt: now(),
        },
        ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
      }).catch((error: unknown) => {
        if (!isConditionalFailure(error)) throw error;
      });
    }
    return queryResources();
  }

  async function getResource(id: string) {
    const result = await documentClient.get({ TableName: tableName, Key: resourceKey(id) });
    return result.Item ? fromStored(result.Item) : null;
  }

  async function createResource(input: Partial<ZecShelfResourceDraft>) {
    const resources = await getResources();
    const draft = cleanZecShelfDraft(input);
    if (resources.some((resource) => resource.url === draft.url)) {
      throw new Error("That website is already on the shelf.");
    }
    const timestamp = now();
    const resource: ZecShelfResource = {
      id: createId(),
      ...draft,
      position: resources.length,
      contentSignature: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastHttpStatus: null,
      checkState: "unchecked",
      previewUrl: null,
      previewUpdatedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await documentClient.put({ TableName: tableName, Item: toStored(resource) });
    return resource;
  }

  async function updateResource(id: string, input: Partial<ZecShelfResourceDraft>) {
    const resources = await getResources();
    const current = resources.find((resource) => resource.id === id);
    if (!current) throw new Error("That resource no longer exists.");
    const draft = cleanZecShelfDraft(input);
    if (resources.some((resource) => resource.id !== id && resource.url === draft.url)) {
      throw new Error("That website is already on the shelf.");
    }
    const urlChanged = current.url !== draft.url;
    const resource: ZecShelfResource = {
      ...current,
      ...draft,
      updatedAt: now(),
      ...(urlChanged ? {
        contentSignature: null,
        lastCheckedAt: null,
        lastChangedAt: null,
        lastHttpStatus: null,
        checkState: "unchecked" as const,
        previewUrl: null,
        previewUpdatedAt: null,
      } : {}),
    };
    await documentClient.put({ TableName: tableName, Item: toStored(resource) });
    return resource;
  }

  async function reorderResources(order: string[]) {
    const resources = await getResources();
    if (order.length !== resources.length || new Set(order).size !== resources.length) {
      throw new Error("The saved order is incomplete.");
    }
    const byId = new Map(resources.map((resource) => [resource.id, resource]));
    if (order.some((id) => !byId.has(id))) throw new Error("The saved order includes an unknown resource.");
    const timestamp = now();
    await documentClient.transactWrite({
      TransactItems: order.map((id, position) => ({
        Put: {
          TableName: tableName,
          Item: toStored({ ...byId.get(id)!, position, updatedAt: timestamp }),
        },
      })),
    });
  }

  async function deleteResource(id: string) {
    const resources = await getResources();
    if (!resources.some((resource) => resource.id === id)) throw new Error("That resource no longer exists.");
    const remaining = resources.filter((resource) => resource.id !== id);
    const timestamp = now();
    await documentClient.transactWrite({
      TransactItems: [
        { Delete: { TableName: tableName, Key: resourceKey(id) } },
        ...remaining.map((resource, position) => ({
          Put: {
            TableName: tableName,
            Item: toStored({ ...resource, position, updatedAt: timestamp }),
          },
        })),
      ],
    });
  }

  async function saveCheckResult(resource: ZecShelfResource) {
    await documentClient.put({ TableName: tableName, Item: toStored(resource) });
  }

  return {
    getResources,
    getResource,
    createResource,
    updateResource,
    reorderResources,
    deleteResource,
    saveCheckResult,
  };
}

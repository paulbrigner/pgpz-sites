import "server-only";

import { createAdapterFactory } from "better-auth/adapters";
import {
  assertDynamoDBInjection,
  type BetterAuthDynamoDBConfig,
  type DynamoDBDocumentClientLike,
  type DynamoDBItem,
} from "./dynamodb-contract";

export type BetterAuthAdapterCondition = {
  field?: string;
  value?: any;
  operator?: string;
  connector?: string;
  mode?: string;
};

type AdapterRecord = DynamoDBItem & {
  id?: string;
  pk?: string;
  sk?: string;
  type?: string;
  GSI1PK?: string;
  GSI1SK?: string;
  expires?: number;
};

const MODEL_TYPE_PREFIX = "BETTER_AUTH";
const MODEL_NAMES = new Set([
  "better_auth_users",
  "better_auth_sessions",
  "better_auth_accounts",
  "better_auth_verifications",
]);

const modelType = (model: string) => `${MODEL_TYPE_PREFIX}#${model}`;
const modelKey = (model: string, id: string) => ({
  pk: `${modelType(model)}#${id}`,
  sk: `${modelType(model)}#${id}`,
});

const cleanRecord = (item: AdapterRecord | null | undefined) => {
  if (!item) return null;
  const {
    pk: _pk,
    sk: _sk,
    type: _type,
    GSI1PK: _gsi1pk,
    GSI1SK: _gsi1sk,
    expires: _expires,
    ...record
  } = item;
  return record;
};

const stringValue = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : "";

function assertSupportedModel(model: string) {
  if (!MODEL_NAMES.has(model)) throw new Error(`Unsupported Better Auth model: ${model}`);
}

function indexedAttributes(model: string, data: AdapterRecord) {
  if (model === "better_auth_users" && data.email) {
    return {
      GSI1PK: `${modelType(model)}#email#${String(data.email).toLowerCase()}`,
      GSI1SK: String(data.id),
    };
  }
  if (model === "better_auth_sessions" && data.token) {
    return {
      GSI1PK: `${modelType(model)}#token#${String(data.token)}`,
      GSI1SK: String(data.id),
    };
  }
  if (model === "better_auth_verifications" && data.identifier) {
    return {
      GSI1PK: `${modelType(model)}#identifier#${String(data.identifier)}`,
      GSI1SK: String(data.id),
    };
  }
  if (model === "better_auth_accounts" && data.providerId && data.accountId) {
    return {
      GSI1PK: `${modelType(model)}#provider#${String(data.providerId)}#${String(data.accountId)}`,
      GSI1SK: String(data.id),
    };
  }
  return {};
}

function ttlAttributes(model: string, data: AdapterRecord) {
  if (model !== "better_auth_sessions" && model !== "better_auth_verifications") return {};
  const expiresAt = data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt);
  const expiresAtMs = expiresAt.getTime();
  return Number.isFinite(expiresAtMs) ? { expires: Math.ceil(expiresAtMs / 1000) } : {};
}

function storedItem(model: string, data: AdapterRecord): AdapterRecord {
  assertSupportedModel(model);
  const record = cleanRecord(data) || {};
  const id = stringValue(record.id);
  if (!id) throw new Error(`Better Auth ${model} record is missing id.`);
  return {
    ...modelKey(model, id),
    type: modelType(model),
    ...record,
    ...indexedAttributes(model, record),
    ...ttlAttributes(model, record),
  };
}

function compareValues(left: any, right: any) {
  if (left instanceof Date) left = left.toISOString();
  if (right instanceof Date) right = right.toISOString();
  if (typeof left === "string" && typeof right === "string") return left.localeCompare(right);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function matchesCondition(item: AdapterRecord, condition: BetterAuthAdapterCondition) {
  const field = stringValue(condition.field);
  const operator = condition.operator || "eq";
  const mode = condition.mode || "sensitive";
  let left = item[field];
  let right = condition.value;

  if (mode === "insensitive") {
    if (typeof left === "string") left = left.toLowerCase();
    if (typeof right === "string") right = right.toLowerCase();
    if (Array.isArray(right)) {
      right = right.map((value) => (typeof value === "string" ? value.toLowerCase() : value));
    }
  }

  if (operator === "eq") return right === null ? left == null : left === right;
  if (operator === "ne") return left !== right;
  if (operator === "lt") return compareValues(left, right) < 0;
  if (operator === "lte") return compareValues(left, right) <= 0;
  if (operator === "gt") return compareValues(left, right) > 0;
  if (operator === "gte") return compareValues(left, right) >= 0;
  if (operator === "in") return Array.isArray(right) && right.includes(left);
  if (operator === "not_in") return Array.isArray(right) && !right.includes(left);
  if (operator === "contains") return typeof left === "string" && typeof right === "string" && left.includes(right);
  if (operator === "starts_with") return typeof left === "string" && typeof right === "string" && left.startsWith(right);
  if (operator === "ends_with") return typeof left === "string" && typeof right === "string" && left.endsWith(right);
  throw new Error(`Unsupported Better Auth where operator: ${operator}`);
}

function matchesWhere(item: AdapterRecord, where: BetterAuthAdapterCondition[] | undefined) {
  if (!where?.length) return true;
  let result = matchesCondition(item, where[0]);
  for (let index = 1; index < where.length; index += 1) {
    const connector = where[index].connector === "OR" ? "OR" : "AND";
    const current = matchesCondition(item, where[index]);
    result = connector === "OR" ? result || current : result && current;
  }
  return result;
}

function projectRecord(item: AdapterRecord | undefined, select?: string[]) {
  const record = cleanRecord(item);
  if (!record || !select?.length) return record;
  return select.reduce((next, field) => {
    if (field in record) next[field] = record[field];
    return next;
  }, {} as AdapterRecord);
}

function conditionValues(condition: BetterAuthAdapterCondition | undefined) {
  if (!condition) return [];
  const operator = condition.operator || "eq";
  const values = operator === "eq"
    ? [condition.value]
    : operator === "in" && Array.isArray(condition.value)
      ? condition.value
      : [];
  return values.filter((value) => value !== null && value !== undefined && String(value) !== "");
}

function indexPartitionKeys(model: string, where: BetterAuthAdapterCondition[] | undefined) {
  if (!where?.length || where.slice(1).some((condition) => condition.connector === "OR")) return null;
  const condition = (field: string) => where.find((candidate) => candidate.field === field);
  const prefix = modelType(model);

  if (model === "better_auth_users") {
    const values = conditionValues(condition("email"));
    return values.length ? values.map((value) => `${prefix}#email#${String(value).toLowerCase()}`) : null;
  }
  if (model === "better_auth_sessions") {
    const values = conditionValues(condition("token"));
    return values.length ? values.map((value) => `${prefix}#token#${String(value)}`) : null;
  }
  if (model === "better_auth_verifications") {
    const values = conditionValues(condition("identifier"));
    return values.length ? values.map((value) => `${prefix}#identifier#${String(value)}`) : null;
  }
  if (model === "better_auth_accounts") {
    const providerValues = conditionValues(condition("providerId"));
    const accountValues = conditionValues(condition("accountId"));
    if (providerValues.length !== 1 || accountValues.length !== 1) return null;
    return [`${prefix}#provider#${String(providerValues[0])}#${String(accountValues[0])}`];
  }
  return null;
}

type RuntimeConfig = {
  documentClient: DynamoDBDocumentClientLike;
  tableName: string;
  indexName: string;
};

function runtimeConfig(config: BetterAuthDynamoDBConfig): RuntimeConfig {
  assertDynamoDBInjection(config, ["get", "put", "query", "scan", "delete", "update"]);
  return {
    documentClient: config.documentClient,
    tableName: config.tableName.trim(),
    indexName: config.indexName?.trim() || "GSI1",
  };
}

export function createBetterAuthAdapterImplementation(config: BetterAuthDynamoDBConfig) {
  const { documentClient, tableName, indexName } = runtimeConfig(config);

  async function queryModelIndex(model: string, partitionKey: string) {
    const items: AdapterRecord[] = [];
    let ExclusiveStartKey: Record<string, any> | undefined;
    do {
      const result = await documentClient.query({
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: "#gsi1pk = :gsi1pk",
        ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
        ExpressionAttributeValues: { ":gsi1pk": partitionKey },
        ExclusiveStartKey,
      });
      for (const item of result.Items || []) {
        if (item.type === modelType(model)) items.push(item as AdapterRecord);
      }
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  async function scanModel(model: string) {
    assertSupportedModel(model);
    const items: AdapterRecord[] = [];
    let ExclusiveStartKey: Record<string, any> | undefined;
    do {
      const result = await documentClient.scan({
        TableName: tableName,
        FilterExpression: "#type = :type",
        ExpressionAttributeNames: { "#type": "type" },
        ExpressionAttributeValues: { ":type": modelType(model) },
        ExclusiveStartKey,
      });
      for (const item of result.Items || []) items.push(item as AdapterRecord);
      ExclusiveStartKey = result.LastEvaluatedKey;
    } while (ExclusiveStartKey);
    return items;
  }

  async function findMatching(model: string, where?: BetterAuthAdapterCondition[]) {
    const idCondition = where?.find(
      (condition) => condition.field === "id" && (condition.operator || "eq") === "eq",
    );
    if (idCondition?.value) {
      const result = await documentClient.get({
        TableName: tableName,
        Key: modelKey(model, String(idCondition.value)),
      });
      const item = result.Item as AdapterRecord | undefined;
      return item && item.type === modelType(model) && matchesWhere(item, where) ? [item] : [];
    }

    const partitionKeys = indexPartitionKeys(model, where);
    if (partitionKeys) {
      const indexedItems = (await Promise.all(partitionKeys.map((key) => queryModelIndex(model, key)))).flat();
      const uniqueItems = Array.from(
        new Map(indexedItems.map((item) => [`${item.pk || ""}#${item.sk || ""}`, item])).values(),
      );
      return uniqueItems.filter((item) => matchesWhere(item, where));
    }
    return (await scanModel(model)).filter((item) => matchesWhere(item, where));
  }

  async function putRecord(model: string, data: AdapterRecord) {
    const item = storedItem(model, data);
    await documentClient.put({ TableName: tableName, Item: item });
    return cleanRecord(item);
  }

  return {
    create: async <T>({ model, data }: { model: string; data: T }) =>
      (await putRecord(model, data as AdapterRecord)) as T,
    findOne: async <T>({ model, where, select }: { model: string; where?: BetterAuthAdapterCondition[]; select?: string[] }) => {
      const [item] = await findMatching(model, where);
      return projectRecord(item, select) as T | null;
    },
    findMany: async <T>({
      model,
      where,
      limit = 100,
      offset = 0,
      sortBy,
      select,
    }: {
      model: string;
      where?: BetterAuthAdapterCondition[];
      limit?: number;
      offset?: number;
      sortBy?: { field: string; direction?: "asc" | "desc" };
      select?: string[];
    }) => {
      let items = await findMatching(model, where);
      if (sortBy?.field) {
        const direction = sortBy.direction === "desc" ? -1 : 1;
        items = items.sort((a, b) => direction * compareValues(a[sortBy.field], b[sortBy.field]));
      }
      return items.slice(offset, offset + limit).map((item) => projectRecord(item, select) as T);
    },
    count: async ({ model, where }: { model: string; where?: BetterAuthAdapterCondition[] }) =>
      (await findMatching(model, where)).length,
    update: async <T>({ model, where, update }: { model: string; where?: BetterAuthAdapterCondition[]; update: T }) => {
      if (!where?.length) return null;
      const [item] = await findMatching(model, where);
      if (!item?.id) return null;
      return (await putRecord(model, { ...cleanRecord(item), ...(update as AdapterRecord) })) as T;
    },
    updateMany: async <T>({ model, where, update }: { model: string; where?: BetterAuthAdapterCondition[]; update: T }) => {
      const items = await findMatching(model, where);
      for (const item of items) {
        if (item.id) await putRecord(model, { ...cleanRecord(item), ...(update as AdapterRecord) });
      }
      return items.length;
    },
    delete: async ({ model, where }: { model: string; where?: BetterAuthAdapterCondition[] }) => {
      if (!where?.length) return;
      const [item] = await findMatching(model, where);
      if (!item?.pk || !item?.sk) return;
      await documentClient.delete({ TableName: tableName, Key: { pk: item.pk, sk: item.sk } });
    },
    deleteMany: async ({ model, where }: { model: string; where?: BetterAuthAdapterCondition[] }) => {
      const items = await findMatching(model, where);
      for (const item of items) {
        if (item.pk && item.sk) {
          await documentClient.delete({ TableName: tableName, Key: { pk: item.pk, sk: item.sk } });
        }
      }
      return items.length;
    },
    consumeOne: async <T>({ model, where }: { model: string; where?: BetterAuthAdapterCondition[] }) => {
      if (!where?.length) return null;
      const [item] = await findMatching(model, where);
      if (!item?.pk || !item?.sk) return null;
      try {
        await documentClient.delete({
          TableName: tableName,
          Key: { pk: item.pk, sk: item.sk },
          ConditionExpression: "attribute_exists(#pk)",
          ExpressionAttributeNames: { "#pk": "pk" },
        });
      } catch (error: any) {
        if (error?.name === "ConditionalCheckFailedException") return null;
        throw error;
      }
      return cleanRecord(item) as T | null;
    },
    incrementOne: async <T>({
      model,
      where,
      increment,
      set,
    }: {
      model: string;
      where?: BetterAuthAdapterCondition[];
      increment?: Record<string, number>;
      set?: Record<string, unknown>;
    }) => {
      if (!where?.length) return null;
      const [item] = await findMatching(model, where);
      if (!item?.id) return null;
      const next: AdapterRecord = { ...cleanRecord(item), ...set };
      for (const [field, delta] of Object.entries(increment || {})) {
        next[field] = (typeof next[field] === "number" ? next[field] : 0) + Number(delta || 0);
      }
      return (await putRecord(model, next)) as T;
    },
  };
}

export function createBetterAuthDynamoDBAdapter(config: BetterAuthDynamoDBConfig) {
  runtimeConfig(config);
  return createAdapterFactory({
    config: {
      adapterId: config.adapterId?.trim() || "pgpz-dynamodb-better-auth",
      adapterName: config.adapterName?.trim() || "PGPZ DynamoDB Better Auth",
      supportsBooleans: true,
      supportsDates: false,
      supportsJSON: false,
      supportsArrays: false,
      supportsNumericIds: false,
      transaction: false,
    },
    adapter: () => createBetterAuthAdapterImplementation(config),
  });
}

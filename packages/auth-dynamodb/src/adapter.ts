import "server-only";

import { createAdapterFactory } from "better-auth/adapters";
import {
  assertDynamoDBInjection,
  type BetterAuthDynamoDBConfig,
  type BetterAuthUserEmailOwnershipConfig,
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
  GSI2PK?: string;
  GSI2SK?: string;
  expires?: number;
  adapterVersion?: number;
};

const MODEL_TYPE_PREFIX = "BETTER_AUTH";
const MODEL_NAMES = new Set([
  "better_auth_users",
  "better_auth_sessions",
  "better_auth_accounts",
  "better_auth_verifications",
]);
const MAX_WRITE_ATTEMPTS = 4;
const INDEX_OR_TTL_FIELDS = new Set([
  "id",
  "email",
  "token",
  "identifier",
  "providerId",
  "accountId",
  "userId",
  "expiresAt",
]);
const PHYSICAL_FIELDS = new Set([
  "pk",
  "sk",
  "type",
  "GSI1PK",
  "GSI1SK",
  "GSI2PK",
  "GSI2SK",
  "expires",
  "adapterVersion",
]);

class AdapterWriteConflictError extends Error {
  constructor() {
    super("Better Auth record changed during a concurrent write.");
    this.name = "AdapterWriteConflictError";
  }
}

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
    GSI2PK: _gsi2pk,
    GSI2SK: _gsi2sk,
    expires: _expires,
    adapterVersion: _adapterVersion,
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
  const userIdAttributes =
    (model === "better_auth_sessions" || model === "better_auth_accounts") &&
      stringValue(data.userId)
      ? {
          GSI2PK: `${modelType(model)}#userId#${stringValue(data.userId)}`,
          GSI2SK: String(data.id),
        }
      : {};
  if (model === "better_auth_users" && data.email) {
    return {
      GSI1PK: `${modelType(model)}#email#${String(data.email).toLowerCase()}`,
      GSI1SK: String(data.id),
    };
  }
  if (model === "better_auth_sessions" && data.token) {
    return {
      ...userIdAttributes,
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
      ...userIdAttributes,
      GSI1PK: `${modelType(model)}#provider#${String(data.providerId)}#${String(data.accountId)}`,
      GSI1SK: String(data.id),
    };
  }
  return userIdAttributes;
}

function ttlAttributes(model: string, data: AdapterRecord) {
  if (model !== "better_auth_sessions" && model !== "better_auth_verifications") return {};
  const expiresAt = data.expiresAt instanceof Date ? data.expiresAt : new Date(data.expiresAt);
  const expiresAtMs = expiresAt.getTime();
  return Number.isFinite(expiresAtMs) ? { expires: Math.ceil(expiresAtMs / 1000) } : {};
}

function storedItem(
  model: string,
  data: AdapterRecord,
  previous?: AdapterRecord | null,
): AdapterRecord {
  assertSupportedModel(model);
  const record = cleanRecord(data) || {};
  const id = stringValue(record.id);
  if (!id) throw new Error(`Better Auth ${model} record is missing id.`);
  const previousVersion = Number.isInteger(previous?.adapterVersion)
    ? Number(previous?.adapterVersion)
    : 0;
  return {
    ...modelKey(model, id),
    type: modelType(model),
    ...record,
    ...indexedAttributes(model, record),
    ...ttlAttributes(model, record),
    adapterVersion: previous ? previousVersion + 1 : 1,
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

type IndexPartitionPlan = {
  indexName: string;
  partitionKeyAttribute: "GSI1PK" | "GSI2PK";
  partitionKeys: string[];
};

function indexPartitionKeys(
  model: string,
  where: BetterAuthAdapterCondition[] | undefined,
  indexName: string,
  userIdIndexName: string,
): IndexPartitionPlan | null {
  if (!where?.length || where.slice(1).some((condition) => condition.connector === "OR")) return null;
  const condition = (field: string) => where.find((candidate) => candidate.field === field);
  const prefix = modelType(model);

  if (model === "better_auth_users") {
    const values = conditionValues(condition("email"));
    return values.length
      ? {
          indexName,
          partitionKeyAttribute: "GSI1PK",
          partitionKeys: values.map((value) => `${prefix}#email#${String(value).toLowerCase()}`),
        }
      : null;
  }
  if (model === "better_auth_sessions") {
    const values = conditionValues(condition("token"));
    if (values.length) {
      return {
        indexName,
        partitionKeyAttribute: "GSI1PK",
        partitionKeys: values.map((value) => `${prefix}#token#${String(value)}`),
      };
    }
  }
  if (model === "better_auth_verifications") {
    const values = conditionValues(condition("identifier"));
    return values.length
      ? {
          indexName,
          partitionKeyAttribute: "GSI1PK",
          partitionKeys: values.map((value) => `${prefix}#identifier#${String(value)}`),
        }
      : null;
  }
  if (model === "better_auth_accounts") {
    const providerValues = conditionValues(condition("providerId"));
    const accountValues = conditionValues(condition("accountId"));
    if (providerValues.length === 1 && accountValues.length === 1) {
      return {
        indexName,
        partitionKeyAttribute: "GSI1PK",
        partitionKeys: [`${prefix}#provider#${String(providerValues[0])}#${String(accountValues[0])}`],
      };
    }
  }
  if (model === "better_auth_sessions" || model === "better_auth_accounts") {
    const userIdCondition = condition("userId");
    const userIds = conditionValues(userIdCondition);
    const operator = userIdCondition?.operator || "eq";
    if (userIdCondition && (operator === "eq" || operator === "in")) {
      return {
        indexName: userIdIndexName,
        partitionKeyAttribute: "GSI2PK",
        partitionKeys: userIds.map((value) => `${prefix}#userId#${String(value)}`),
      };
    }
  }
  return null;
}

type RuntimeConfig = {
  documentClient: DynamoDBDocumentClientLike;
  tableName: string;
  indexName: string;
  userIdIndexName: string;
  userEmailOwnership?: BetterAuthUserEmailOwnershipConfig;
};

function runtimeConfig(config: BetterAuthDynamoDBConfig): RuntimeConfig {
  const methods = ["get", "put", "query", "scan", "delete", "update"];
  if (config.userEmailOwnership) methods.push("transactWrite");
  assertDynamoDBInjection(config, methods);
  return {
    documentClient: config.documentClient,
    tableName: config.tableName.trim(),
    indexName: config.indexName?.trim() || "GSI1",
    userIdIndexName: config.userIdIndexName?.trim() || "GSI2",
    userEmailOwnership: config.userEmailOwnership,
  };
}

function isConditionalFailure(error: any) {
  return error?.name === "ConditionalCheckFailedException";
}

function putCondition(previous?: AdapterRecord | null) {
  if (!previous) {
    return {
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
    };
  }
  const previousVersion = Number.isInteger(previous.adapterVersion)
    ? Number(previous.adapterVersion)
    : null;
  return {
    ConditionExpression: previousVersion === null
      ? "attribute_exists(#pk) AND #id = :id AND attribute_not_exists(#adapterVersion)"
      : "attribute_exists(#pk) AND #id = :id AND #adapterVersion = :previousVersion",
    ExpressionAttributeNames: {
      "#pk": "pk",
      "#id": "id",
      "#adapterVersion": "adapterVersion",
    },
    ExpressionAttributeValues: {
      ":id": String(previous.id),
      ...(previousVersion === null ? {} : { ":previousVersion": previousVersion }),
    },
  };
}

function identityPut(item: AdapterRecord, previous?: AdapterRecord | null) {
  const condition = putCondition(previous);
  if (!previous) return { Put: { TableName: "", Item: item, ...condition } };
  return {
    Put: {
      TableName: "",
      Item: item,
      ...condition,
      ConditionExpression: `${condition.ConditionExpression} AND #email = :oldEmail`,
      ExpressionAttributeNames: {
        ...condition.ExpressionAttributeNames,
        "#email": "email",
      },
      ExpressionAttributeValues: {
        ...condition.ExpressionAttributeValues,
        ":oldEmail": previous.email ?? null,
      },
    },
  };
}

export function createBetterAuthAdapterImplementation(config: BetterAuthDynamoDBConfig) {
  const { documentClient, tableName, indexName, userIdIndexName, userEmailOwnership } = runtimeConfig(config);

  async function queryModelIndex(
    model: string,
    plan: IndexPartitionPlan,
    partitionKey: string,
  ) {
    const items: AdapterRecord[] = [];
    let ExclusiveStartKey: Record<string, any> | undefined;
    do {
      const result = await documentClient.query({
        TableName: tableName,
        IndexName: plan.indexName,
        KeyConditionExpression: "#indexpk = :indexpk",
        ExpressionAttributeNames: { "#indexpk": plan.partitionKeyAttribute },
        ExpressionAttributeValues: { ":indexpk": partitionKey },
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
    const hasOrPredicate = where?.slice(1).some((condition) => condition.connector === "OR");
    const idCondition = where?.find(
      (condition) => condition.field === "id" && (condition.operator || "eq") === "eq",
    );
    if (idCondition?.value && !hasOrPredicate) {
      const result = await documentClient.get({
        TableName: tableName,
        Key: modelKey(model, String(idCondition.value)),
      });
      const item = result.Item as AdapterRecord | undefined;
      return item && item.type === modelType(model) && matchesWhere(item, where) ? [item] : [];
    }

    const indexPlan = indexPartitionKeys(model, where, indexName, userIdIndexName);
    if (indexPlan) {
      const indexedItems = (await Promise.all(
        indexPlan.partitionKeys.map((key) => queryModelIndex(model, indexPlan, key)),
      )).flat();
      const uniqueItems = Array.from(
        new Map(indexedItems.map((item) => [`${item.pk || ""}#${item.sk || ""}`, item])).values(),
      );
      return uniqueItems.filter((item) => matchesWhere(item, where));
    }
    return (await scanModel(model)).filter((item) => matchesWhere(item, where));
  }

  async function getOwnership(email: string) {
    if (!userEmailOwnership) return null;
    const result = await documentClient.get({
      TableName: tableName,
      Key: userEmailOwnership.ownershipKey(email),
      ConsistentRead: true,
    });
    return result.Item || null;
  }

  function assertOwnership(record: DynamoDBItem | null | undefined, betterAuthUserId: string) {
    if (!userEmailOwnership) return;
    try {
      userEmailOwnership.assertCompatible(record, { betterAuthUserId });
    } catch {
      throw userEmailOwnership.collisionError();
    }
  }

  async function putRecord(
    model: string,
    data: AdapterRecord,
    previous?: AdapterRecord | null,
  ) {
    const item = storedItem(model, data, previous);
    if (model !== "better_auth_users" || !userEmailOwnership) {
      try {
        await documentClient.put({
          TableName: tableName,
          Item: item,
          ...putCondition(previous),
        });
      } catch (error: any) {
        if (isConditionalFailure(error)) throw new AdapterWriteConflictError();
        throw error;
      }
      return cleanRecord(item);
    }

    const betterAuthUserId = String(item.id);
    const oldEmail = userEmailOwnership.normalizeEmail(previous?.email);
    const newEmail = userEmailOwnership.normalizeEmail(item.email);
    const transactItems: DynamoDBItem[] = [];

    if (!previous && !newEmail) {
      throw new Error("Better Auth user creation requires an email.");
    }
    if (oldEmail !== newEmail && oldEmail) {
      const oldOwnership = await getOwnership(oldEmail);
      if (!oldOwnership) {
        throw new Error("Email ownership must be backfilled before changing a Better Auth user email.");
      }
      assertOwnership(oldOwnership, betterAuthUserId);
      if (oldOwnership.appUserId) {
        throw new Error("Bound account email changes must update the application identity atomically.");
      }
    }
    if (newEmail) {
      const targetOwnership = await getOwnership(newEmail);
      assertOwnership(targetOwnership, betterAuthUserId);
      transactItems.push(userEmailOwnership.claimTransactionItem({
        tableName,
        email: newEmail,
        betterAuthUserId,
      }));
    }
    const put = identityPut(item, previous);
    put.Put.TableName = tableName;
    transactItems.push(put);
    if (oldEmail && oldEmail !== newEmail) {
      transactItems.push(userEmailOwnership.releaseTransactionItem({
        tableName,
        email: oldEmail,
        betterAuthUserId,
      }));
    }

    try {
      await documentClient.transactWrite!({ TransactItems: transactItems });
    } catch (error: any) {
      if (error?.name === "TransactionCanceledException" && newEmail) {
        const targetOwnership = await getOwnership(newEmail);
        assertOwnership(targetOwnership, betterAuthUserId);
        if (previous) throw new AdapterWriteConflictError();
      }
      throw error;
    }
    return cleanRecord(item);
  }

  async function updateRecordWithRetry<T>(
    model: string,
    where: BetterAuthAdapterCondition[],
    mutate: (record: AdapterRecord) => AdapterRecord,
  ): Promise<T | null> {
    let lastConflict: Error | null = null;
    for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt += 1) {
      const [item] = await findMatching(model, where);
      const record = cleanRecord(item);
      if (!item?.id || !record) return null;
      try {
        return (await putRecord(model, mutate(record), item)) as T;
      } catch (error: any) {
        if (!(error instanceof AdapterWriteConflictError)) throw error;
        lastConflict = error;
      }
    }
    throw lastConflict || new AdapterWriteConflictError();
  }

  async function deleteRecord(model: string, item: AdapterRecord) {
    if (!item.pk || !item.sk) return;
    if (
      model !== "better_auth_users" ||
      !userEmailOwnership ||
      !item.id ||
      !userEmailOwnership.normalizeEmail(item.email)
    ) {
      await documentClient.delete({ TableName: tableName, Key: { pk: item.pk, sk: item.sk } });
      return;
    }

    const email = userEmailOwnership.normalizeEmail(item.email);
    const ownership = await getOwnership(email);
    assertOwnership(ownership, String(item.id));
    await documentClient.transactWrite!({
      TransactItems: [
        userEmailOwnership.releaseBetterAuthTransactionItem({
          tableName,
          email,
          betterAuthUserId: String(item.id),
          preserveAppOwner: !!ownership?.appUserId,
        }),
        {
          Delete: {
            TableName: tableName,
            Key: { pk: item.pk, sk: item.sk },
            ConditionExpression: "attribute_exists(#pk) AND #id = :id AND #email = :email",
            ExpressionAttributeNames: { "#pk": "pk", "#id": "id", "#email": "email" },
            ExpressionAttributeValues: { ":id": String(item.id), ":email": item.email },
          },
        },
      ],
    });
  }

  function canUseAtomicUpdate(
    model: string,
    where: BetterAuthAdapterCondition[],
    increment: Record<string, number>,
    set: Record<string, unknown>,
  ) {
    const idConditions = where.filter(
      (condition) => condition.field === "id" && (condition.operator || "eq") === "eq",
    );
    const fields = [...Object.keys(increment), ...Object.keys(set)];
    return model !== "better_auth_users" &&
      idConditions.length === 1 &&
      where.length === 1 &&
      !!idConditions[0].value &&
      fields.length > 0 &&
      fields.every((field) => !PHYSICAL_FIELDS.has(field) && !INDEX_OR_TTL_FIELDS.has(field)) &&
      Object.keys(increment).every((field) => !(field in set));
  }

  async function atomicUpdate<T>(
    model: string,
    where: BetterAuthAdapterCondition[],
    increment: Record<string, number>,
    set: Record<string, unknown>,
  ): Promise<T | null> {
    const [item] = await findMatching(model, where);
    if (!item?.id) return null;
    const setEntries = Object.entries(set);
    const incrementEntries = Object.entries(increment);
    const names: Record<string, string> = {
      "#id": "id",
      "#type": "type",
      "#adapterVersion": "adapterVersion",
    };
    const values: Record<string, unknown> = {
      ":expectedId": String(item.id),
      ":expectedType": modelType(model),
      ":versionOne": 1,
    };
    const actions: string[] = [];

    if (setEntries.length) {
      actions.push(`SET ${setEntries.map(([field, value], index) => {
        names[`#set${index}`] = field;
        values[`:set${index}`] = value;
        return `#set${index} = :set${index}`;
      }).join(", ")}`);
    }
    const additions = incrementEntries.map(([field, delta], index) => {
      names[`#increment${index}`] = field;
      values[`:increment${index}`] = Number(delta || 0);
      return `#increment${index} :increment${index}`;
    });
    additions.push("#adapterVersion :versionOne");
    actions.push(`ADD ${additions.join(", ")}`);

    try {
      const result = await documentClient.update({
        TableName: tableName,
        Key: modelKey(model, String(item.id)),
        UpdateExpression: actions.join(" "),
        ConditionExpression: "#id = :expectedId AND #type = :expectedType",
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
        ReturnValues: "ALL_NEW",
      });
      return cleanRecord(result.Attributes as AdapterRecord | undefined) as T | null;
    } catch (error: any) {
      if (isConditionalFailure(error)) return null;
      throw error;
    }
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
      return updateRecordWithRetry<T>(model, where, (record) => ({
        ...record,
        ...(update as AdapterRecord),
      }));
    },
    updateMany: async <T>({ model, where, update }: { model: string; where?: BetterAuthAdapterCondition[]; update: T }) => {
      const items = await findMatching(model, where);
      let updated = 0;
      for (const item of items) {
        if (!item.id) continue;
        const result = await updateRecordWithRetry<T>(
          model,
          [{ field: "id", value: item.id }],
          (record) => ({ ...record, ...(update as AdapterRecord) }),
        );
        if (result) updated += 1;
      }
      return updated;
    },
    delete: async ({ model, where }: { model: string; where?: BetterAuthAdapterCondition[] }) => {
      if (!where?.length) return;
      const [item] = await findMatching(model, where);
      if (item) await deleteRecord(model, item);
    },
    deleteMany: async ({ model, where }: { model: string; where?: BetterAuthAdapterCondition[] }) => {
      const items = await findMatching(model, where);
      let deleted = 0;
      for (const item of items) {
        if (!item.pk || !item.sk) continue;
        await deleteRecord(model, item);
        deleted += 1;
      }
      return deleted;
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
        if (isConditionalFailure(error)) return null;
        throw error;
      }
      return cleanRecord(item) as T | null;
    },
    incrementOne: async <T>({
      model,
      where,
      increment = {},
      set = {},
    }: {
      model: string;
      where?: BetterAuthAdapterCondition[];
      increment?: Record<string, number>;
      set?: Record<string, unknown>;
    }) => {
      if (!where?.length) return null;
      if (canUseAtomicUpdate(model, where, increment, set)) {
        return atomicUpdate<T>(model, where, increment, set);
      }
      return updateRecordWithRetry<T>(model, where, (record) => {
        const next: AdapterRecord = { ...record, ...set };
        for (const [field, delta] of Object.entries(increment)) {
          next[field] = (typeof next[field] === "number" ? next[field] : 0) + Number(delta || 0);
        }
        return next;
      });
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

import { vi } from "vitest";

export const storageKey = (item: Record<string, unknown>) => `${String(item.pk)}|${String(item.sk)}`;
export const clone = <T>(value: T): T => structuredClone(value);

export function createFakeDocumentClient() {
  const state = {
    items: new Map<string, Record<string, any>>(),
    queryPageSize: Number.POSITIVE_INFINITY,
  };
  const client = {
    delete: vi.fn(),
    get: vi.fn(),
    put: vi.fn(),
    query: vi.fn(),
    scan: vi.fn(),
    transactWrite: vi.fn(),
    update: vi.fn(),
  };

  const reset = () => {
    vi.clearAllMocks();
    state.items.clear();
    state.queryPageSize = Number.POSITIVE_INFINITY;
    client.put.mockImplementation(async ({ Item, ConditionExpression, ExpressionAttributeNames, ExpressionAttributeValues }) => {
      const existing = state.items.get(storageKey(Item));
      if (ConditionExpression === "attribute_not_exists(#pk)" && existing) {
        const error = new Error("record exists");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      const versionName = Object.entries(ExpressionAttributeNames || {}).find(
        ([name]) => name === "#adapterVersion",
      )?.[1] as string | undefined;
      if (ConditionExpression?.includes("#adapterVersion = :previousVersion")) {
        const expected = ExpressionAttributeValues?.[":previousVersion"];
        if (!existing || existing[versionName || "adapterVersion"] !== expected) {
          const error = new Error("record changed");
          error.name = "ConditionalCheckFailedException";
          throw error;
        }
      }
      if (ConditionExpression?.includes("attribute_not_exists(#adapterVersion)") && existing?.adapterVersion !== undefined) {
        const error = new Error("record changed");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      state.items.set(storageKey(Item), clone(Item));
      return {};
    });
    client.get.mockImplementation(async ({ Key }) => ({
      Item: state.items.has(storageKey(Key)) ? clone(state.items.get(storageKey(Key))) : undefined,
    }));
    client.query.mockImplementation(async ({
      ExpressionAttributeNames,
      ExpressionAttributeValues,
      ExclusiveStartKey,
    }) => {
      const partitionAttribute = ExpressionAttributeNames["#indexpk"] || "GSI1PK";
      const partitionKey = ExpressionAttributeValues[":indexpk"];
      const sortAttribute = partitionAttribute === "GSI2PK" ? "GSI2SK" : "GSI1SK";
      const matching = Array.from(state.items.values())
        .filter((item) => item[partitionAttribute] === partitionKey)
        .sort((left, right) => String(left[sortAttribute]).localeCompare(String(right[sortAttribute])));
      const start = ExclusiveStartKey
        ? matching.findIndex((item) => storageKey(item) === storageKey(ExclusiveStartKey)) + 1
        : 0;
      const page = matching.slice(start, start + state.queryPageSize);
      const hasMore = start + page.length < matching.length;
      return {
        Items: clone(page),
        LastEvaluatedKey: hasMore
          ? { pk: page[page.length - 1].pk, sk: page[page.length - 1].sk }
          : undefined,
      };
    });
    client.scan.mockImplementation(async ({ ExpressionAttributeValues, ExclusiveStartKey }) => {
      const matching = Array.from(state.items.values()).filter(
        (item) => item.type === ExpressionAttributeValues[":type"],
      );
      const start = ExclusiveStartKey
        ? matching.findIndex((item) => storageKey(item) === storageKey(ExclusiveStartKey)) + 1
        : 0;
      const page = matching.slice(start, start + state.queryPageSize);
      const hasMore = start + page.length < matching.length;
      return {
        Items: clone(page),
        LastEvaluatedKey: hasMore
          ? { pk: page[page.length - 1].pk, sk: page[page.length - 1].sk }
          : undefined,
      };
    });
    client.delete.mockImplementation(async ({ Key, ConditionExpression }) => {
      const key = storageKey(Key);
      if (ConditionExpression && !state.items.has(key)) {
        const error = new Error("missing");
        error.name = "ConditionalCheckFailedException";
        throw error;
      }
      state.items.delete(key);
      return {};
    });
    client.transactWrite.mockImplementation(async ({ TransactItems }) => {
      const nextItems = new Map(
        Array.from(state.items.entries()).map(([key, value]) => [key, clone(value)]),
      );
      const cancel = (message: string) => {
        const error = new Error(message);
        error.name = "TransactionCanceledException";
        throw error;
      };

      for (const operation of TransactItems) {
        if (operation.Put) {
          const { Item, ConditionExpression, ExpressionAttributeValues } = operation.Put;
          const key = storageKey(Item);
          const current = nextItems.get(key);
          if (ConditionExpression?.includes("attribute_not_exists(#pk)") && current) {
            cancel("record exists");
          }
          if (
            ConditionExpression?.includes("#adapterVersion = :previousVersion") &&
            current?.adapterVersion !== ExpressionAttributeValues?.[":previousVersion"]
          ) {
            cancel("record changed");
          }
          if (
            ConditionExpression?.includes("attribute_not_exists(#adapterVersion)") &&
            current?.adapterVersion !== undefined
          ) {
            cancel("record changed");
          }
          if (
            ConditionExpression?.includes("#email = :oldEmail") &&
            current?.email !== ExpressionAttributeValues?.[":oldEmail"]
          ) {
            cancel("email changed");
          }
          nextItems.set(key, clone(Item));
          continue;
        }

        if (operation.Update) {
          const { Key, ExpressionAttributeValues, UpdateExpression } = operation.Update;
          const key = storageKey(Key);
          const current = nextItems.get(key) || { ...Key };
          const appUserId = ExpressionAttributeValues?.[":appUserId"];
          const betterAuthUserId = ExpressionAttributeValues?.[":betterAuthUserId"];
          if (
            (appUserId && current.appUserId && current.appUserId !== appUserId) ||
            (betterAuthUserId && current.betterAuthUserId && current.betterAuthUserId !== betterAuthUserId)
          ) {
            cancel("ownership collision");
          }
          const updated = {
            ...current,
            ...(ExpressionAttributeValues?.[":type"] ? { type: ExpressionAttributeValues[":type"] } : {}),
            ...(ExpressionAttributeValues?.[":email"] ? { email: ExpressionAttributeValues[":email"] } : {}),
            ...(appUserId ? { appUserId } : {}),
            ...(betterAuthUserId ? { betterAuthUserId } : {}),
          };
          if (UpdateExpression?.includes("REMOVE #betterAuthUserId")) {
            delete updated.betterAuthUserId;
          }
          nextItems.set(key, updated);
          continue;
        }

        if (operation.Delete) {
          nextItems.delete(storageKey(operation.Delete.Key));
        }
      }

      state.items.clear();
      for (const [key, value] of nextItems) state.items.set(key, value);
      return {};
    });
    client.update.mockImplementation(async ({
      Key,
      ConditionExpression,
      ExpressionAttributeNames,
      ExpressionAttributeValues,
    }) => {
      const key = storageKey(Key);
      const current = state.items.get(key) || {};
      if (ConditionExpression?.includes(":expectedId")) {
        if (
          current.id !== ExpressionAttributeValues[":expectedId"] ||
          current.type !== ExpressionAttributeValues[":expectedType"]
        ) {
          const error = new Error("record changed");
          error.name = "ConditionalCheckFailedException";
          throw error;
        }
        const next = { ...current };
        for (const [placeholder, field] of Object.entries(ExpressionAttributeNames || {})) {
          if (placeholder.startsWith("#set")) {
            const index = placeholder.slice("#set".length);
            next[field as string] = ExpressionAttributeValues[`:set${index}`];
          }
          if (placeholder.startsWith("#increment")) {
            const index = placeholder.slice("#increment".length);
            next[field as string] = (Number(next[field as string]) || 0) +
              Number(ExpressionAttributeValues[`:increment${index}`] || 0);
          }
        }
        next.adapterVersion = (Number(next.adapterVersion) || 0) + 1;
        state.items.set(key, next);
        return { Attributes: clone(next) };
      }
      const next = {
        ...current,
        ...Key,
        type: ExpressionAttributeValues[":type"],
        keyHash: ExpressionAttributeValues[":keyHash"],
        count: (current.count || 0) + ExpressionAttributeValues[":one"],
        lastRequest: ExpressionAttributeValues[":lastRequest"],
        windowStartedAt: ExpressionAttributeValues[":windowStartedAt"],
        windowSeconds: ExpressionAttributeValues[":windowSeconds"],
        expires: ExpressionAttributeValues[":expires"],
      };
      state.items.set(key, next);
      return { Attributes: { ...next } };
    });
  };

  reset();
  return { client, state, reset };
}

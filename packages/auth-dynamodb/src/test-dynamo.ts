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
    update: vi.fn(),
  };

  const reset = () => {
    vi.clearAllMocks();
    state.items.clear();
    state.queryPageSize = Number.POSITIVE_INFINITY;
    client.put.mockImplementation(async ({ Item }) => {
      state.items.set(storageKey(Item), clone(Item));
      return {};
    });
    client.get.mockImplementation(async ({ Key }) => ({
      Item: state.items.has(storageKey(Key)) ? clone(state.items.get(storageKey(Key))) : undefined,
    }));
    client.query.mockImplementation(async ({ ExpressionAttributeValues, ExclusiveStartKey }) => {
      const partitionKey = ExpressionAttributeValues[":gsi1pk"];
      const matching = Array.from(state.items.values())
        .filter((item) => item.GSI1PK === partitionKey)
        .sort((left, right) => String(left.GSI1SK).localeCompare(String(right.GSI1SK)));
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
    client.update.mockImplementation(async ({ Key, ExpressionAttributeValues }) => {
      const key = storageKey(Key);
      const current = state.items.get(key) || {};
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

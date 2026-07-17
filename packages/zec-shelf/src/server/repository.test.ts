import { describe, expect, it } from "vitest";
import type {
  DeleteCommandInput,
  GetCommandInput,
  PutCommandInput,
  QueryCommandInput,
  TransactWriteCommandInput,
} from "@aws-sdk/lib-dynamodb";
import { createZecShelfRepository, type ZecShelfDocumentClient } from "./repository";

function createMemoryClient() {
  const items = new Map<string, Record<string, unknown>>();
  const keyFor = (table: unknown, pk: unknown, sk: unknown) => `${String(table)}|${String(pk)}|${String(sk)}`;

  const client = {
    async get(input: GetCommandInput) {
      const key = input.Key || {};
      return { Item: items.get(keyFor(input.TableName, key.pk, key.sk)) };
    },
    async put(input: PutCommandInput) {
      const item = input.Item as Record<string, unknown>;
      const key = keyFor(input.TableName, item.pk, item.sk);
      if (input.ConditionExpression && items.has(key)) {
        throw Object.assign(new Error("already exists"), { name: "ConditionalCheckFailedException" });
      }
      items.set(key, { ...item });
      return {};
    },
    async query(input: QueryCommandInput) {
      const pk = input.ExpressionAttributeValues?.[":pk"];
      const prefix = String(input.ExpressionAttributeValues?.[":prefix"] || "");
      return {
        Items: [...items.values()].filter((item) => item.pk === pk && String(item.sk).startsWith(prefix)),
      };
    },
    async delete(input: DeleteCommandInput) {
      const key = input.Key || {};
      items.delete(keyFor(input.TableName, key.pk, key.sk));
      return {};
    },
    async transactWrite(input: TransactWriteCommandInput) {
      for (const operation of input.TransactItems || []) {
        if (operation.Put?.Item) {
          const item = operation.Put.Item as Record<string, unknown>;
          items.set(keyFor(operation.Put.TableName, item.pk, item.sk), { ...item });
        }
        if (operation.Delete?.Key) {
          items.delete(keyFor(operation.Delete.TableName, operation.Delete.Key.pk, operation.Delete.Key.sk));
        }
      }
      return {};
    },
  } as ZecShelfDocumentClient;

  return { client, items };
}

const SEED = [{
  id: "seed",
  title: "Seed",
  url: "https://seed.example/",
  description: "Seed resource",
  category: "Community",
}] as const;

describe("DynamoDB ZEC Shelf repository contract", () => {
  it("preserves the Community partition, sort keys, and item types while seeding", async () => {
    const memory = createMemoryClient();
    const repository = createZecShelfRepository({
      documentClient: memory.client,
      tableName: "CommunityTable",
      partitionKey: "ZEC_SHELF",
      initialResources: SEED,
      now: () => "2026-07-17T00:00:00.000Z",
    });

    await expect(repository.getResources()).resolves.toMatchObject([{ id: "seed", position: 0 }]);
    expect(memory.items.get("CommunityTable|ZEC_SHELF|RESOURCE#seed")).toMatchObject({
      pk: "ZEC_SHELF",
      sk: "RESOURCE#seed",
      itemType: "zec-shelf-resource",
      id: "seed",
    });
    expect(memory.items.get("CommunityTable|ZEC_SHELF|META")).toMatchObject({
      pk: "ZEC_SHELF",
      sk: "META",
      itemType: "zec-shelf-metadata",
    });
  });

  it("keeps differently configured catalogs isolated in the same table", async () => {
    const memory = createMemoryClient();
    const common = { documentClient: memory.client, tableName: "SharedTable", now: () => "2026-07-17T00:00:00.000Z" };
    const community = createZecShelfRepository({ ...common, partitionKey: "ZEC_SHELF", initialResources: SEED });
    const coalition = createZecShelfRepository({
      ...common,
      partitionKey: "ZEC_SHELF#COALITION",
      initialResources: [{ ...SEED[0], id: "coalition", title: "Coalition", url: "https://coalition.example/" }],
    });

    expect((await community.getResources()).map(({ id }) => id)).toEqual(["seed"]);
    expect((await coalition.getResources()).map(({ id }) => id)).toEqual(["coalition"]);
    expect((await community.getResources()).map(({ id }) => id)).toEqual(["seed"]);
  });

  it("rejects duplicate URLs and resets tracking when a URL changes", async () => {
    const memory = createMemoryClient();
    const repository = createZecShelfRepository({
      documentClient: memory.client,
      tableName: "CommunityTable",
      partitionKey: "ZEC_SHELF",
      initialResources: SEED,
      now: () => "2026-07-17T00:00:00.000Z",
      createId: () => "created",
    });
    const [seed] = await repository.getResources();
    await repository.saveCheckResult({
      ...seed,
      contentSignature: "signature",
      lastCheckedAt: "2026-07-17T01:00:00.000Z",
      lastChangedAt: "2026-07-17T01:00:00.000Z",
      lastHttpStatus: 200,
      checkState: "same",
      previewUrl: "https://cdn.microlink.io/preview.jpg",
      previewUpdatedAt: "2026-07-17T01:00:00.000Z",
    });

    await expect(repository.createResource({
      title: "Duplicate",
      url: "https://seed.example/",
      description: "Duplicate",
      category: "Community",
    })).rejects.toThrow("already on the shelf");

    await expect(repository.updateResource("seed", {
      title: "Seed",
      url: "https://new.example/",
      description: "Seed resource",
      category: "Community",
    })).resolves.toMatchObject({
      url: "https://new.example/",
      contentSignature: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastHttpStatus: null,
      checkState: "unchecked",
      previewUrl: null,
      previewUpdatedAt: null,
    });
  });

  it("validates complete order sets and compacts positions after deletion", async () => {
    const memory = createMemoryClient();
    const repository = createZecShelfRepository({
      documentClient: memory.client,
      tableName: "CommunityTable",
      partitionKey: "ZEC_SHELF",
      initialResources: SEED,
      now: () => "2026-07-17T00:00:00.000Z",
      createId: () => "second",
    });
    await repository.getResources();
    await repository.createResource({
      title: "Second",
      url: "https://second.example/",
      description: "Second resource",
      category: "Learning",
    });

    await expect(repository.reorderResources(["seed"])).rejects.toThrow("incomplete");
    await repository.reorderResources(["second", "seed"]);
    expect((await repository.getResources()).map(({ id }) => id)).toEqual(["second", "seed"]);
    await repository.deleteResource("second");
    await expect(repository.getResources()).resolves.toMatchObject([{ id: "seed", position: 0 }]);
  });
});

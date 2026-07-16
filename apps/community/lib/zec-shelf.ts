import "server-only";

import { randomUUID } from "node:crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type ZecShelfCheckState = "unchecked" | "baseline" | "same" | "changed" | "error";

export type ZecShelfResource = {
  id: string;
  title: string;
  url: string;
  description: string;
  category: string;
  position: number;
  contentSignature: string | null;
  lastCheckedAt: string | null;
  lastChangedAt: string | null;
  lastHttpStatus: number | null;
  checkState: ZecShelfCheckState;
  createdAt: string;
  updatedAt: string;
};

export type ZecShelfResourceDraft = Pick<ZecShelfResource, "title" | "url" | "description" | "category">;

const SHELF_PK = "ZEC_SHELF";
const RESOURCE_PREFIX = "RESOURCE#";
const SHELF_META_SK = "META";

const INITIAL_RESOURCES: Array<ZecShelfResourceDraft & { id: string }> = [
  {
    id: "zcash-community",
    title: "Zcash Community",
    url: "https://www.zcashcommunity.com/",
    description: "An independent community hub for Zcash education, wallets, mining guides, developer resources, projects, and news.",
    category: "Community",
  },
  {
    id: "zcash-ecosystem",
    title: "Zcash Ecosystem",
    url: "https://z.cash/ecosystem/",
    description: "The official directory of wallets, exchanges, builders, explorers, contributors, payment tools, and other Zcash projects.",
    category: "Official",
  },
  {
    id: "cipherscan",
    title: "CipherScan",
    url: "https://cipherscan.app/",
    description: "A privacy-first Zcash block explorer with live blocks, transactions, shielded-pool activity, privacy scores, and network health.",
    category: "Explorers",
  },
  {
    id: "zec-stats",
    title: "ZEC Stats",
    url: "https://zecstats.com/",
    description: "A deep analytics dashboard for ZEC markets, shielded adoption, network activity, supply, hashrate, liquidity, and long-range trends.",
    category: "Analytics",
  },
  {
    id: "scifi-money",
    title: "SCIFI.MONEY",
    url: "https://scifi.money/",
    description: "A curated collection of writing, podcasts, and videos about Zcash, privacy, freedom, and the encrypted-money thesis.",
    category: "Research & Media",
  },
  {
    id: "mastering-zcash",
    title: "Mastering Zcash",
    url: "https://maxdesalle.com/mastering-zcash/",
    description: "Maxime Desalle's comprehensive study of private money, covering Zcash history, mechanics, privacy philosophy, economics, comparisons, and the road ahead.",
    category: "Learning",
  },
  {
    id: "perfect-money",
    title: "Perfect Money",
    url: "https://github.com/perfect-money/perfect-money-book",
    description: "The free source repository, PDF, and EPUB for Frank Michael Porter's book on financial surveillance, zero-knowledge proofs, and Zcash.",
    category: "Learning",
  },
];

type StoredResource = ZecShelfResource & {
  pk: string;
  sk: string;
  itemType: "zec-shelf-resource";
};

function resourceKey(id: string) {
  return { pk: SHELF_PK, sk: `${RESOURCE_PREFIX}${id}` };
}

function toStored(resource: ZecShelfResource): StoredResource {
  return {
    ...resourceKey(resource.id),
    itemType: "zec-shelf-resource",
    ...resource,
  };
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
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
  };
}

function isCheckState(value: unknown): value is ZecShelfCheckState {
  return value === "unchecked" || value === "baseline" || value === "same" || value === "changed" || value === "error";
}

async function queryResources(): Promise<ZecShelfResource[]> {
  const result = await documentClient.query({
    TableName: TABLE_NAME,
    KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
    ExpressionAttributeValues: { ":pk": SHELF_PK, ":prefix": RESOURCE_PREFIX },
    ConsistentRead: true,
  });

  return (result.Items || [])
    .map((item) => fromStored(item))
    .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
}

async function seedResourcesIfEmpty() {
  const now = new Date().toISOString();
  await Promise.all(INITIAL_RESOURCES.map(async (draft, position) => {
    const resource: ZecShelfResource = {
      ...draft,
      position,
      contentSignature: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastHttpStatus: null,
      checkState: "unchecked",
      createdAt: now,
      updatedAt: now,
    };
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: toStored(resource),
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }).catch((error: unknown) => {
      if ((error as { name?: string })?.name !== "ConditionalCheckFailedException") throw error;
    });
  }));
}

export async function getZecShelfResources(): Promise<ZecShelfResource[]> {
  const metadata = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: SHELF_PK, sk: SHELF_META_SK },
    ConsistentRead: true,
  });
  if (!metadata.Item) {
    await seedResourcesIfEmpty();
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: {
        pk: SHELF_PK,
        sk: SHELF_META_SK,
        itemType: "zec-shelf-metadata",
        initializedAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk) AND attribute_not_exists(sk)",
    }).catch((error: unknown) => {
      if ((error as { name?: string })?.name !== "ConditionalCheckFailedException") throw error;
    });
  }
  return queryResources();
}

export function cleanZecShelfDraft(input: Partial<ZecShelfResourceDraft>): ZecShelfResourceDraft {
  return {
    title: cleanText(input.title, "Name", 120),
    url: cleanUrl(input.url || ""),
    description: cleanText(input.description, "Description", 500),
    category: cleanText(input.category, "Category", 60),
  };
}

function cleanText(value: string | undefined, label: string, maxLength: number) {
  const cleaned = value?.trim() || "";
  if (!cleaned) throw new Error(`${label} is required.`);
  if (cleaned.length > maxLength) throw new Error(`${label} is too long.`);
  return cleaned;
}

function cleanUrl(value: string) {
  const parsed = new URL(value.trim());
  if (parsed.protocol !== "https:") throw new Error("Please use a secure https:// website address.");
  parsed.hash = "";
  return parsed.toString();
}

export async function createZecShelfResource(input: Partial<ZecShelfResourceDraft>) {
  const resources = await getZecShelfResources();
  const draft = cleanZecShelfDraft(input);
  if (resources.some((resource) => resource.url === draft.url)) throw new Error("That website is already on the shelf.");
  const now = new Date().toISOString();
  const resource: ZecShelfResource = {
    id: randomUUID(),
    ...draft,
    position: resources.length,
    contentSignature: null,
    lastCheckedAt: null,
    lastChangedAt: null,
    lastHttpStatus: null,
    checkState: "unchecked",
    createdAt: now,
    updatedAt: now,
  };
  await documentClient.put({ TableName: TABLE_NAME, Item: toStored(resource) });
  return resource;
}

export async function updateZecShelfResource(id: string, input: Partial<ZecShelfResourceDraft>) {
  const resources = await getZecShelfResources();
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
    updatedAt: new Date().toISOString(),
    ...(urlChanged ? {
      contentSignature: null,
      lastCheckedAt: null,
      lastChangedAt: null,
      lastHttpStatus: null,
      checkState: "unchecked" as const,
    } : {}),
  };
  await documentClient.put({ TableName: TABLE_NAME, Item: toStored(resource) });
  return resource;
}

export async function reorderZecShelfResources(order: string[]) {
  const resources = await getZecShelfResources();
  if (order.length !== resources.length || new Set(order).size !== resources.length) {
    throw new Error("The saved order is incomplete.");
  }
  const byId = new Map(resources.map((resource) => [resource.id, resource]));
  if (order.some((id) => !byId.has(id))) throw new Error("The saved order includes an unknown resource.");
  const now = new Date().toISOString();
  await documentClient.transactWrite({
    TransactItems: order.map((id, position) => ({
      Put: {
        TableName: TABLE_NAME,
        Item: toStored({ ...byId.get(id)!, position, updatedAt: now }),
      },
    })),
  });
}

export async function deleteZecShelfResource(id: string) {
  const resources = await getZecShelfResources();
  if (!resources.some((resource) => resource.id === id)) throw new Error("That resource no longer exists.");
  const remaining = resources.filter((resource) => resource.id !== id);
  const now = new Date().toISOString();
  await documentClient.transactWrite({
    TransactItems: [
      { Delete: { TableName: TABLE_NAME, Key: resourceKey(id) } },
      ...remaining.map((resource, position) => ({
        Put: {
          TableName: TABLE_NAME,
          Item: toStored({ ...resource, position, updatedAt: now }),
        },
      })),
    ],
  });
}

export async function saveZecShelfCheckResult(resource: ZecShelfResource) {
  await documentClient.put({ TableName: TABLE_NAME, Item: toStored(resource) });
}

export async function getZecShelfResource(id: string) {
  const result = await documentClient.get({ TableName: TABLE_NAME, Key: resourceKey(id) });
  return result.Item ? fromStored(result.Item) : null;
}

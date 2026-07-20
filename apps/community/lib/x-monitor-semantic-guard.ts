import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type { FeedQuery, FeedResponse } from "@pgpz/x-monitor-core/contracts";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";
import { queryCommunityXMonitorSemantic } from "@/lib/x-monitor-server";

const CACHE_TTL_SECONDS = 5 * 60;
const LOCK_TTL_SECONDS = 60;
const CACHE_WAIT_INTERVAL_MS = 500;
const RATE_LIMIT_TTL_GRACE_SECONDS = 60 * 60;
const RATE_LIMIT_WINDOWS = [
  { key: "burst", seconds: 5 * 60, userLimit: 10, clientLimit: 120 },
  { key: "daily", seconds: 24 * 60 * 60, userLimit: 50, clientLimit: 1_000 },
] as const;

type SemanticCacheRecord = {
  items?: unknown;
  expires?: unknown;
};

export class CommunityXMonitorSemanticLimitError extends Error {
  constructor() {
    super("X Monitor semantic search limit reached");
    this.name = "CommunityXMonitorSemanticLimitError";
  }
}

export class CommunityXMonitorSemanticBusyError extends Error {
  constructor() {
    super("X Monitor semantic search is already in progress");
    this.name = "CommunityXMonitorSemanticBusyError";
  }
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalizedSemanticRequest(query: FeedQuery) {
  return {
    query_text: String(query.q || "").trim().replace(/\s+/g, " ").toLowerCase().slice(0, 500),
    tiers: [...(query.tiers || [])].sort(),
    themes: [...(query.themes || [])].sort(),
    handle: String(query.handle || "").trim().replace(/^@+/, "").toLowerCase(),
    significant: query.significant === true,
    limit: Math.min(24, Math.max(1, query.limit || 24)),
  };
}

export function communityXMonitorSemanticCacheKey(query: FeedQuery): string {
  return hash(JSON.stringify(normalizedSemanticRequest(query)));
}

function cacheKey(query: FeedQuery) {
  return {
    pk: `XMONITOR#SEMANTIC#CACHE#${communityXMonitorSemanticCacheKey(query)}`,
    sk: "RESULT",
  };
}

function lockKey(query: FeedQuery) {
  return {
    pk: `XMONITOR#SEMANTIC#CACHE#${communityXMonitorSemanticCacheKey(query)}`,
    sk: "LOCK",
  };
}

async function readCachedSemanticResult(query: FeedQuery): Promise<FeedResponse | null> {
  const response = await documentClient.get({
    TableName: TABLE_NAME,
    Key: cacheKey(query),
    ConsistentRead: true,
  });
  const item = response.Item as SemanticCacheRecord | undefined;
  const expires = typeof item?.expires === "number" ? item.expires : 0;
  if (!Array.isArray(item?.items) || expires <= Math.floor(Date.now() / 1000)) return null;
  return { items: item.items as FeedResponse["items"], next_cursor: null };
}

async function claimSemanticRequest(query: FeedQuery): Promise<string | null> {
  const owner = randomUUID();
  const now = Math.floor(Date.now() / 1000);
  try {
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: {
        ...lockKey(query),
        type: "XMONITOR_SEMANTIC_LOCK",
        owner,
        expires: now + LOCK_TTL_SECONDS,
      },
      ConditionExpression: "attribute_not_exists(pk) OR expires < :now",
      ExpressionAttributeValues: { ":now": now },
    });
    return owner;
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "ConditionalCheckFailedException"
    ) {
      return null;
    }
    throw error;
  }
}

async function releaseSemanticRequest(query: FeedQuery, owner: string): Promise<void> {
  try {
    await documentClient.delete({
      TableName: TABLE_NAME,
      Key: lockKey(query),
      ConditionExpression: "#owner = :owner",
      ExpressionAttributeNames: { "#owner": "owner" },
      ExpressionAttributeValues: { ":owner": owner },
    });
  } catch {
    console.warn("[x-monitor-semantic] request lock release failed");
  }
}

async function waitForSemanticResultOrClaim(
  query: FeedQuery,
): Promise<{ cached: FeedResponse } | { owner: string }> {
  await new Promise((resolve) => setTimeout(resolve, CACHE_WAIT_INTERVAL_MS));
  const cached = await readCachedSemanticResult(query);
  if (cached) return { cached };
  const owner = await claimSemanticRequest(query);
  if (owner) return { owner };
  throw new CommunityXMonitorSemanticBusyError();
}

async function enforceSemanticQueryBudget(userId: string): Promise<void> {
  const now = Date.now();
  const userDimension = `USER#${hash(userId).slice(0, 24)}`;
  const clientDimension = "CLIENT#pgpz-community";
  const updates = RATE_LIMIT_WINDOWS.flatMap((window) => {
    const windowMs = window.seconds * 1000;
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const expires = Math.floor(windowStart / 1000) + window.seconds + RATE_LIMIT_TTL_GRACE_SECONDS;
    return [
      { dimension: userDimension, limit: window.userLimit },
      { dimension: clientDimension, limit: window.clientLimit },
    ].map(({ dimension, limit }) => ({
      Update: {
        TableName: TABLE_NAME,
        Key: {
          pk: `RATE_LIMIT#XMONITOR#SEMANTIC#${dimension}`,
          sk: `WINDOW#${window.key}#${windowStart}`,
        },
        UpdateExpression:
          "SET #count = if_not_exists(#count, :zero) + :one, expires = :expires",
        ConditionExpression: "attribute_not_exists(#count) OR #count < :limit",
        ExpressionAttributeNames: { "#count": "count" },
        ExpressionAttributeValues: {
          ":zero": 0,
          ":one": 1,
          ":limit": limit,
          ":expires": expires,
        },
      },
    }));
  });

  try {
    await documentClient.transactWrite({ TransactItems: updates });
  } catch (error: unknown) {
    if (
      error &&
      typeof error === "object" &&
      "name" in error &&
      error.name === "TransactionCanceledException"
    ) {
      throw new CommunityXMonitorSemanticLimitError();
    }
    throw error;
  }
}

async function writeCachedSemanticResult(
  query: FeedQuery,
  response: FeedResponse,
): Promise<void> {
  const now = Date.now();
  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      ...cacheKey(query),
      type: "XMONITOR_SEMANTIC_CACHE",
      items: response.items,
      createdAt: new Date(now).toISOString(),
      expires: Math.floor(now / 1000) + CACHE_TTL_SECONDS,
    },
  });
}

export async function queryCommunityXMonitorSemanticForMember(
  query: FeedQuery,
  userId: string,
): Promise<FeedResponse> {
  if (!userId.trim()) throw new CommunityXMonitorSemanticLimitError();
  if (!String(query.q || "").trim()) return { items: [], next_cursor: null };

  const cached = await readCachedSemanticResult(query);
  if (cached) return cached;

  // Every cache miss consumes admission budget, including concurrent lock
  // losers, so identical-request fan-out cannot bypass member/client ceilings.
  await enforceSemanticQueryBudget(userId);
  let owner = await claimSemanticRequest(query);
  if (!owner) {
    const settled = await waitForSemanticResultOrClaim(query);
    if ("cached" in settled) return settled.cached;
    owner = settled.owner;
  }

  try {
    const claimedAfterCacheFill = await readCachedSemanticResult(query);
    if (claimedAfterCacheFill) return claimedAfterCacheFill;

    const response = await queryCommunityXMonitorSemantic(query);
    try {
      await writeCachedSemanticResult(query, response);
    } catch {
      console.warn("[x-monitor-semantic] result cache write failed");
    }
    return response;
  } finally {
    await releaseSemanticRequest(query, owner);
  }
}

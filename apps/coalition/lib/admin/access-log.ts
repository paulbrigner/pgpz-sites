import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type AccessEventType = "login" | "page_view";
export type AccessAuthProvider = "better-auth" | "next-auth";

export type AccessLogEvent = {
  id: string;
  eventType: AccessEventType;
  createdAt: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  membershipStatus: string | null;
  authProvider: AccessAuthProvider | null;
  path: string | null;
  title: string | null;
  referrer: string | null;
  userAgent: string | null;
  ipAddress: string | null;
};

export type RecordAccessEventParams = {
  eventType: AccessEventType;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  membershipStatus?: string | null;
  authProvider?: AccessAuthProvider | null;
  path?: string | null;
  title?: string | null;
  referrer?: string | null;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type ListAccessLogOptions = {
  eventType?: AccessEventType | "all";
  userId?: string | null;
  limit?: number;
  since?: string | null;
};

const ACCESS_LOG_GSI_PK = "ACCESS_LOG";

const cleanString = (value: unknown, maxLength = 512) =>
  typeof value === "string" ? value.trim().slice(0, maxLength) : "";

const nullableString = (value: unknown, maxLength = 512) => cleanString(value, maxLength) || null;

const normalizePath = (value: unknown) => {
  const path = cleanString(value, 2048);
  if (!path || !path.startsWith("/")) return null;
  if (path.startsWith("/api/")) return null;
  return path;
};

const normalizeEventType = (value: unknown): AccessEventType | null => {
  if (value === "login" || value === "page_view") return value;
  return null;
};

const normalizeAuthProvider = (value: unknown): AccessAuthProvider | null =>
  value === "better-auth" || value === "next-auth" ? value : null;

const normalizeSince = (value: unknown) => {
  const candidate = cleanString(value, 64);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
};

export function getAccessLogRequestMetadata(headers: Headers) {
  const forwardedFor = headers.get("x-forwarded-for") || "";
  const ipAddress =
    forwardedFor.split(",").map((part) => part.trim()).find(Boolean) ||
    headers.get("x-real-ip") ||
    headers.get("cf-connecting-ip") ||
    null;

  return {
    ipAddress: nullableString(ipAddress, 120),
    userAgent: nullableString(headers.get("user-agent"), 512),
  };
}

function toAccessLogEvent(item: Record<string, any> | undefined | null): AccessLogEvent | null {
  const eventType = normalizeEventType(item?.eventType);
  if (!item?.logId || !eventType || !item?.createdAt) return null;

  return {
    id: String(item.logId),
    eventType,
    createdAt: String(item.createdAt),
    userId: nullableString(item.userId, 180),
    email: nullableString(item.email, 320),
    name: nullableString(item.name, 240),
    membershipStatus: nullableString(item.membershipStatus, 80),
    authProvider: normalizeAuthProvider(item.authProvider),
    path: nullableString(item.path, 2048),
    title: nullableString(item.title, 240),
    referrer: nullableString(item.referrer, 2048),
    userAgent: nullableString(item.userAgent, 512),
    ipAddress: nullableString(item.ipAddress, 120),
  };
}

export async function recordAccessEvent(params: RecordAccessEventParams) {
  const eventType = normalizeEventType(params.eventType);
  if (!eventType) return null;

  const userId = nullableString(params.userId, 180);
  if (!userId) return null;

  const now = new Date().toISOString();
  const logId = randomUUID();
  const path = eventType === "page_view" ? normalizePath(params.path) : null;

  if (eventType === "page_view" && !path) return null;

  const item = {
    pk: `ACCESS_LOG#USER#${userId}`,
    sk: `ACCESS_LOG#${now}#${logId}`,
    type: "ACCESS_EVENT",
    logId,
    createdAt: now,
    eventType,
    userId,
    email: nullableString(params.email, 320),
    name: nullableString(params.name, 240),
    membershipStatus: nullableString(params.membershipStatus, 80),
    authProvider: normalizeAuthProvider(params.authProvider),
    path,
    title: nullableString(params.title, 240),
    referrer: nullableString(params.referrer, 2048),
    userAgent: nullableString(params.userAgent, 512),
    ipAddress: nullableString(params.ipAddress, 120),
    GSI1PK: ACCESS_LOG_GSI_PK,
    GSI1SK: `${now}#${logId}`,
  };

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
  });

  const updateParts = ["#lastAccessAt = :now"];
  const names: Record<string, string> = {
    "#pk": "pk",
    "#lastAccessAt": "lastAccessAt",
  };
  const values: Record<string, unknown> = {
    ":now": now,
  };

  if (eventType === "login") {
    names["#lastLoginAt"] = "lastLoginAt";
    updateParts.push("#lastLoginAt = :now");
  } else if (path) {
    names["#lastPageViewedAt"] = "lastPageViewedAt";
    names["#lastPageViewedPath"] = "lastPageViewedPath";
    values[":path"] = path;
    updateParts.push("#lastPageViewedAt = :now", "#lastPageViewedPath = :path");
  }

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
    UpdateExpression: `SET ${updateParts.join(", ")}`,
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: names,
    ExpressionAttributeValues: values,
  }).catch((err: any) => {
    if (err?.name !== "ConditionalCheckFailedException") throw err;
  });

  return toAccessLogEvent(item);
}

export async function listAccessLog(options: ListAccessLogOptions = {}) {
  const limit = Math.min(Math.max(Number(options.limit) || 100, 1), 500);
  const eventType = options.eventType === "login" || options.eventType === "page_view" ? options.eventType : null;
  const userId = nullableString(options.userId, 180);
  const since = normalizeSince(options.since);
  const events: AccessLogEvent[] = [];
  const uniqueMembers = new Set<string>();
  let totalCount = 0;
  let loginCount = 0;
  let pageViewCount = 0;
  let betterAuthCount = 0;
  let nextAuthCount = 0;
  let unknownAuthProviderCount = 0;
  let ExclusiveStartKey: Record<string, any> | undefined;
  let pageCount = 0;

  do {
    const res = userId
      ? await documentClient.query({
          TableName: TABLE_NAME,
          KeyConditionExpression: since ? "#pk = :pk AND #sk >= :since" : "#pk = :pk",
          ExpressionAttributeNames: {
            "#pk": "pk",
            ...(since ? { "#sk": "sk" } : {}),
            ...(eventType ? { "#eventType": "eventType" } : {}),
          },
          ExpressionAttributeValues: {
            ":pk": `ACCESS_LOG#USER#${userId}`,
            ...(since ? { ":since": `ACCESS_LOG#${since}` } : {}),
            ...(eventType ? { ":eventType": eventType } : {}),
          },
          FilterExpression: eventType ? "#eventType = :eventType" : undefined,
          ExclusiveStartKey,
          ScanIndexForward: false,
          Limit: Math.min(200, Math.max(limit * 2, 50)),
        })
      : await documentClient.query({
          TableName: TABLE_NAME,
          IndexName: "GSI1",
          KeyConditionExpression: since ? "#gsi1pk = :pk AND #gsi1sk >= :since" : "#gsi1pk = :pk",
          ExpressionAttributeNames: {
            "#gsi1pk": "GSI1PK",
            ...(since ? { "#gsi1sk": "GSI1SK" } : {}),
            ...(eventType ? { "#eventType": "eventType" } : {}),
          },
          ExpressionAttributeValues: {
            ":pk": ACCESS_LOG_GSI_PK,
            ...(since ? { ":since": since } : {}),
            ...(eventType ? { ":eventType": eventType } : {}),
          },
          FilterExpression: eventType ? "#eventType = :eventType" : undefined,
          ExclusiveStartKey,
          ScanIndexForward: false,
          Limit: Math.min(200, Math.max(limit * 2, 50)),
        });

    for (const item of res.Items || []) {
      const event = toAccessLogEvent(item as Record<string, any>);
      if (!event) continue;
      totalCount += 1;
      if (event.eventType === "login") loginCount += 1;
      if (event.eventType === "page_view") pageViewCount += 1;
      if (event.authProvider === "better-auth") betterAuthCount += 1;
      else if (event.authProvider === "next-auth") nextAuthCount += 1;
      else unknownAuthProviderCount += 1;
      if (event.userId) uniqueMembers.add(event.userId);
      if (events.length < limit) events.push(event);
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
    pageCount += 1;
  } while (ExclusiveStartKey && pageCount < 100);

  return {
    events,
    meta: {
      limit,
      returned: events.length,
      totalCount,
      loginCount,
      pageViewCount,
      uniqueMemberCount: uniqueMembers.size,
      betterAuthCount,
      nextAuthCount,
      unknownAuthProviderCount,
      since,
      complete: !ExclusiveStartKey,
    },
  };
}

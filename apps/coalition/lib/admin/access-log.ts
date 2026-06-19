import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type AccessEventType = "login" | "page_view";

export type AccessLogEvent = {
  id: string;
  eventType: AccessEventType;
  createdAt: string;
  userId: string | null;
  email: string | null;
  name: string | null;
  membershipStatus: string | null;
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
  const events: AccessLogEvent[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  let pageCount = 0;

  do {
    const res = userId
      ? await documentClient.query({
          TableName: TABLE_NAME,
          KeyConditionExpression: "#pk = :pk",
          ExpressionAttributeNames: {
            "#pk": "pk",
            ...(eventType ? { "#eventType": "eventType" } : {}),
          },
          ExpressionAttributeValues: {
            ":pk": `ACCESS_LOG#USER#${userId}`,
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
          KeyConditionExpression: "#gsi1pk = :pk",
          ExpressionAttributeNames: {
            "#gsi1pk": "GSI1PK",
            ...(eventType ? { "#eventType": "eventType" } : {}),
          },
          ExpressionAttributeValues: {
            ":pk": ACCESS_LOG_GSI_PK,
            ...(eventType ? { ":eventType": eventType } : {}),
          },
          FilterExpression: eventType ? "#eventType = :eventType" : undefined,
          ExclusiveStartKey,
          ScanIndexForward: false,
          Limit: Math.min(200, Math.max(limit * 2, 50)),
        });

    for (const item of res.Items || []) {
      const event = toAccessLogEvent(item as Record<string, any>);
      if (event) events.push(event);
      if (events.length >= limit) break;
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
    pageCount += 1;
  } while (ExclusiveStartKey && events.length < limit && pageCount < 10);

  const uniqueMembers = new Set(events.map((event) => event.userId).filter(Boolean));

  return {
    events,
    meta: {
      limit,
      returned: events.length,
      loginCount: events.filter((event) => event.eventType === "login").length,
      pageViewCount: events.filter((event) => event.eventType === "page_view").length,
      uniqueMemberCount: uniqueMembers.size,
    },
  };
}

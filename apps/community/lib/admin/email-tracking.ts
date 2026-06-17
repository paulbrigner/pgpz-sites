import "server-only";

import { createHmac, randomUUID } from "crypto";
import { NEXTAUTH_SECRET } from "@/lib/config";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type EmailMessageType = "newsletter" | "policy_update";
export type EmailTrackingAudienceMode = "all_active_members" | "selected_members";

export type TrackingClientInfo = {
  ip?: string | null;
  userAgent?: string | null;
  acceptLanguage?: string | null;
};

export type NewsletterTrackingRecord = {
  trackingId: string;
  newsletterId: string;
  sendRunId: string | null;
  messageType: EmailMessageType;
  audienceMode: EmailTrackingAudienceMode;
  userId: string | null;
  email: string | null;
  sentAt: string;
  providerMessageId: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
  openFingerprints: string[];
  uniqueOpenClientCount: number;
  possibleForwardOpenCount: number;
  firstClickedAt: string | null;
  lastClickedAt: string | null;
  lastClickedUrl: string | null;
  clickCount: number;
  unsubscribedAt: string | null;
};

const trackingKey = (trackingId: string) => ({
  pk: `EMAIL_TRACKING#${trackingId}`,
  sk: `EMAIL_TRACKING#${trackingId}`,
});

const normalizeTrackingId = (trackingId: string) => trackingId.trim().replace(/\.png$/i, "");

export function trackingClientInfoFromHeaders(headers: Headers): TrackingClientInfo {
  return {
    ip:
      headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headers.get("x-real-ip") ||
      headers.get("cf-connecting-ip") ||
      null,
    userAgent: headers.get("user-agent"),
    acceptLanguage: headers.get("accept-language"),
  };
}

function openClientFingerprint(clientInfo?: TrackingClientInfo | null) {
  const material = [
    clientInfo?.ip?.trim().toLowerCase() || "",
    clientInfo?.userAgent?.trim() || "",
    clientInfo?.acceptLanguage?.trim().toLowerCase() || "",
  ].join("\n");

  if (!material.trim()) return null;

  return createHmac("sha256", NEXTAUTH_SECRET || "pgpz-email-tracking")
    .update(material)
    .digest("hex")
    .slice(0, 32);
}

function toTrackingRecord(item: Record<string, any> | undefined | null): NewsletterTrackingRecord | null {
  if (!item?.trackingId || !item?.newsletterId) return null;

  const openFingerprints = Array.isArray(item.openFingerprints)
    ? item.openFingerprints.filter((value: unknown) => typeof value === "string")
    : [];

  return {
    trackingId: String(item.trackingId),
    newsletterId: String(item.newsletterId),
    sendRunId: typeof item.sendRunId === "string" ? item.sendRunId : null,
    messageType: item.messageType === "policy_update" ? "policy_update" : "newsletter",
    audienceMode: item.audienceMode === "selected_members" ? "selected_members" : "all_active_members",
    userId: typeof item.userId === "string" ? item.userId : null,
    email: typeof item.email === "string" ? item.email : null,
    sentAt: typeof item.sentAt === "string" ? item.sentAt : "",
    providerMessageId: typeof item.providerMessageId === "string" ? item.providerMessageId : null,
    firstOpenedAt: typeof item.firstOpenedAt === "string" ? item.firstOpenedAt : null,
    lastOpenedAt: typeof item.lastOpenedAt === "string" ? item.lastOpenedAt : null,
    openCount: Number(item.openCount || 0),
    openFingerprints,
    uniqueOpenClientCount: Number(item.uniqueOpenClientCount || openFingerprints.length || 0),
    possibleForwardOpenCount: Number(item.possibleForwardOpenCount || 0),
    firstClickedAt: typeof item.firstClickedAt === "string" ? item.firstClickedAt : null,
    lastClickedAt: typeof item.lastClickedAt === "string" ? item.lastClickedAt : null,
    lastClickedUrl: typeof item.lastClickedUrl === "string" ? item.lastClickedUrl : null,
    clickCount: Number(item.clickCount || 0),
    unsubscribedAt: typeof item.unsubscribedAt === "string" ? item.unsubscribedAt : null,
  };
}

export async function createNewsletterTrackingRecord({
  newsletterId,
  sendRunId,
  messageType = "newsletter",
  audienceMode = "all_active_members",
  userId,
  email,
}: {
  newsletterId: string;
  sendRunId?: string | null;
  messageType?: EmailMessageType;
  audienceMode?: EmailTrackingAudienceMode;
  userId: string | null;
  email: string;
}) {
  const now = new Date().toISOString();
  const trackingId = randomUUID();

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: {
      ...trackingKey(trackingId),
      type: "EMAIL_TRACKING",
      trackingId,
      newsletterId,
      sendRunId: sendRunId || null,
      messageType,
      audienceMode,
      userId,
      email,
      sentAt: now,
      providerMessageId: null,
      firstOpenedAt: null,
      lastOpenedAt: null,
      openCount: 0,
      openFingerprints: [],
      uniqueOpenClientCount: 0,
      possibleForwardOpenCount: 0,
      firstClickedAt: null,
      lastClickedAt: null,
      lastClickedUrl: null,
      clickCount: 0,
      unsubscribedAt: null,
      GSI1PK: `NEWSLETTER_TRACKING#${newsletterId}`,
      GSI1SK: `${now}#${trackingId}`,
    },
  });

  return { trackingId, sentAt: now };
}

export async function markNewsletterTrackingSent({
  trackingId,
  providerMessageId,
}: {
  trackingId: string;
  providerMessageId: string | null;
}) {
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: trackingKey(normalizeTrackingId(trackingId)),
    UpdateExpression: "SET providerMessageId = :providerMessageId",
    ExpressionAttributeValues: {
      ":providerMessageId": providerMessageId,
    },
  });
}

export async function getNewsletterTrackingRecord(trackingId: string) {
  const normalized = normalizeTrackingId(trackingId);
  if (!normalized) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: trackingKey(normalized),
  });

  return toTrackingRecord(res.Item);
}

export async function recordNewsletterOpen(trackingId: string, clientInfo?: TrackingClientInfo | null) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;

  const now = new Date().toISOString();
  const firstOpen = !tracking.firstOpenedAt;
  const fingerprint = openClientFingerprint(clientInfo);
  const previousFingerprints = tracking.openFingerprints || [];
  const newFingerprint = !!fingerprint && !previousFingerprints.includes(fingerprint);
  const nextFingerprints = newFingerprint ? [...previousFingerprints, fingerprint] : previousFingerprints;
  const possibleForwardOpen = newFingerprint && previousFingerprints.length > 0;

  const setParts = [
    firstOpen ? "firstOpenedAt = :now" : "",
    "lastOpenedAt = :now",
    "openCount = if_not_exists(openCount, :zero) + :one",
  ].filter(Boolean);
  const expressionValues: Record<string, unknown> = {
    ":now": now,
    ":zero": 0,
    ":one": 1,
  };

  if (fingerprint) {
    setParts.push("openFingerprints = :openFingerprints");
    setParts.push("uniqueOpenClientCount = :uniqueOpenClientCount");
    setParts.push("possibleForwardOpenCount = :possibleForwardOpenCount");
    expressionValues[":openFingerprints"] = nextFingerprints;
    expressionValues[":uniqueOpenClientCount"] = nextFingerprints.length;
    expressionValues[":possibleForwardOpenCount"] =
      tracking.possibleForwardOpenCount + (possibleForwardOpen ? 1 : 0);
  }

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: trackingKey(tracking.trackingId),
    UpdateExpression: `SET ${setParts.join(", ")}`,
    ExpressionAttributeValues: expressionValues,
  });

  if (firstOpen) {
    await incrementMessageAggregate(tracking, "openCount");
  }
  if (possibleForwardOpen) {
    await incrementMessageAggregate(tracking, "possibleForwardOpenCount");
  }

  return {
    ...tracking,
    firstOpenedAt: tracking.firstOpenedAt || now,
    lastOpenedAt: now,
    openCount: tracking.openCount + 1,
    openFingerprints: nextFingerprints,
    uniqueOpenClientCount: nextFingerprints.length,
    possibleForwardOpenCount: tracking.possibleForwardOpenCount + (possibleForwardOpen ? 1 : 0),
  };
}

export async function recordNewsletterClick(trackingId: string, url: string) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;

  const now = new Date().toISOString();
  const firstClick = !tracking.firstClickedAt;

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: trackingKey(tracking.trackingId),
    UpdateExpression: firstClick
      ? "SET firstClickedAt = :now, lastClickedAt = :now, lastClickedUrl = :url, clickCount = if_not_exists(clickCount, :zero) + :one"
      : "SET lastClickedAt = :now, lastClickedUrl = :url, clickCount = if_not_exists(clickCount, :zero) + :one",
    ExpressionAttributeValues: {
      ":now": now,
      ":url": url,
      ":zero": 0,
      ":one": 1,
    },
  });

  if (firstClick) {
    await incrementMessageAggregate(tracking, "clickCount");
  }

  return { ...tracking, firstClickedAt: tracking.firstClickedAt || now, lastClickedAt: now, lastClickedUrl: url };
}

export async function recordNewsletterUnsubscribe(trackingId: string) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;

  const now = new Date().toISOString();
  const firstUnsubscribe = !tracking.unsubscribedAt;

  if (firstUnsubscribe) {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: trackingKey(tracking.trackingId),
      UpdateExpression: "SET unsubscribedAt = :now",
      ExpressionAttributeValues: {
        ":now": now,
      },
    });
  }

  if (tracking.userId) {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${tracking.userId}`, sk: `USER#${tracking.userId}` },
      UpdateExpression: "SET emailSuppressed = :suppressed, emailSuppressedAt = :now, emailSuppressedReason = :reason",
      ExpressionAttributeValues: {
        ":suppressed": true,
        ":now": now,
        ":reason": "newsletter_unsubscribe",
      },
    });
  }

  if (firstUnsubscribe) {
    await incrementMessageAggregate(tracking, "unsubscribeCount");
  }

  return { ...tracking, unsubscribedAt: tracking.unsubscribedAt || now };
}

async function incrementMessageAggregate(
  tracking: NewsletterTrackingRecord,
  field: "openCount" | "clickCount" | "unsubscribeCount" | "possibleForwardOpenCount",
) {
  if (tracking.sendRunId) {
    const prefix = tracking.messageType === "policy_update" ? "POLICY_UPDATE_SEND" : "NEWSLETTER_SEND";
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `${prefix}#${tracking.sendRunId}`, sk: `${prefix}#${tracking.sendRunId}` },
      UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :one, lastEventAt = :now`,
      ExpressionAttributeValues: {
        ":zero": 0,
        ":one": 1,
        ":now": new Date().toISOString(),
      },
    });
    return;
  }

  if (tracking.messageType !== "newsletter") return;
  if (!(await shouldAggregateTrackingRecord(tracking))) return;

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${tracking.newsletterId}`, sk: `NEWSLETTER#${tracking.newsletterId}` },
    UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :one`,
    ExpressionAttributeValues: {
      ":zero": 0,
      ":one": 1,
    },
  });
}

async function shouldAggregateTrackingRecord(tracking: NewsletterTrackingRecord) {
  if (tracking.audienceMode !== "selected_members") return true;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${tracking.newsletterId}`, sk: `NEWSLETTER#${tracking.newsletterId}` },
  });
  const newsletter = res.Item || {};
  const status = newsletter.status === "sent" ? "sent" : "draft";
  const sentAt = typeof newsletter.sentAt === "string" ? newsletter.sentAt : null;

  return !(status === "sent" && sentAt && tracking.sentAt && tracking.sentAt < sentAt);
}

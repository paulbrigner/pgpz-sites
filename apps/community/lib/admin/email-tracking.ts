import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type NewsletterTrackingRecord = {
  trackingId: string;
  newsletterId: string;
  userId: string | null;
  email: string | null;
  sentAt: string;
  providerMessageId: string | null;
  firstOpenedAt: string | null;
  lastOpenedAt: string | null;
  openCount: number;
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

function toTrackingRecord(item: Record<string, any> | undefined | null): NewsletterTrackingRecord | null {
  if (!item?.trackingId || !item?.newsletterId) return null;

  return {
    trackingId: String(item.trackingId),
    newsletterId: String(item.newsletterId),
    userId: typeof item.userId === "string" ? item.userId : null,
    email: typeof item.email === "string" ? item.email : null,
    sentAt: typeof item.sentAt === "string" ? item.sentAt : "",
    providerMessageId: typeof item.providerMessageId === "string" ? item.providerMessageId : null,
    firstOpenedAt: typeof item.firstOpenedAt === "string" ? item.firstOpenedAt : null,
    lastOpenedAt: typeof item.lastOpenedAt === "string" ? item.lastOpenedAt : null,
    openCount: Number(item.openCount || 0),
    firstClickedAt: typeof item.firstClickedAt === "string" ? item.firstClickedAt : null,
    lastClickedAt: typeof item.lastClickedAt === "string" ? item.lastClickedAt : null,
    lastClickedUrl: typeof item.lastClickedUrl === "string" ? item.lastClickedUrl : null,
    clickCount: Number(item.clickCount || 0),
    unsubscribedAt: typeof item.unsubscribedAt === "string" ? item.unsubscribedAt : null,
  };
}

export async function createNewsletterTrackingRecord({
  newsletterId,
  userId,
  email,
}: {
  newsletterId: string;
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
      userId,
      email,
      sentAt: now,
      providerMessageId: null,
      firstOpenedAt: null,
      lastOpenedAt: null,
      openCount: 0,
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

export async function recordNewsletterOpen(trackingId: string) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;

  const now = new Date().toISOString();
  const firstOpen = !tracking.firstOpenedAt;

  await documentClient.update({
    TableName: TABLE_NAME,
    Key: trackingKey(tracking.trackingId),
    UpdateExpression: firstOpen
      ? "SET firstOpenedAt = :now, lastOpenedAt = :now, openCount = if_not_exists(openCount, :zero) + :one"
      : "SET lastOpenedAt = :now, openCount = if_not_exists(openCount, :zero) + :one",
    ExpressionAttributeValues: {
      ":now": now,
      ":zero": 0,
      ":one": 1,
    },
  });

  if (firstOpen) {
    await incrementNewsletterAggregate(tracking.newsletterId, "openCount");
  }

  return { ...tracking, firstOpenedAt: tracking.firstOpenedAt || now, lastOpenedAt: now };
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
    await incrementNewsletterAggregate(tracking.newsletterId, "clickCount");
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
    await incrementNewsletterAggregate(tracking.newsletterId, "unsubscribeCount");
  }

  return { ...tracking, unsubscribedAt: tracking.unsubscribedAt || now };
}

async function incrementNewsletterAggregate(
  newsletterId: string,
  field: "openCount" | "clickCount" | "unsubscribeCount",
) {
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
    UpdateExpression: `SET ${field} = if_not_exists(${field}, :zero) + :one`,
    ExpressionAttributeValues: {
      ":zero": 0,
      ":one": 1,
    },
  });
}

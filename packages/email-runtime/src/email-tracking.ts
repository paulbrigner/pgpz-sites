import { randomUUID } from "node:crypto";
import {
  newsletterTrackingRecordFromItem as toTrackingRecord,
  normalizeTrackingId,
  openClientFingerprint as fingerprintForClient,
  trackingClientInfoFromHeaders,
  type EmailMessageType,
  type EmailTrackingAudienceMode,
  type NewsletterTrackingRecord,
  type TrackingClientInfo,
} from "@pgpz/email-domain";
import type { EmailRuntimeDocumentClient } from "./types";

export {
  trackingClientInfoFromHeaders,
  type EmailMessageType,
  type EmailTrackingAudienceMode,
  type NewsletterTrackingRecord,
  type TrackingClientInfo,
} from "@pgpz/email-domain";

export type EmailTrackingRuntimeDependencies = {
  documentClient: EmailRuntimeDocumentClient;
  tableName: string;
  emailTrackingDigest(purpose: string, values: string[]): string;
  emailTrackingDigestCandidates(purpose: string, values: string[]): string[];
  getEmailTrackingSecret(): string;
  safeHttpDestination(value: string | null | undefined): string | null;
  unsubscribeMemberFromEmailCategory(input: {
    userId: string;
    category: EmailMessageType;
    now?: string;
  }): Promise<boolean>;
};

export function createEmailTrackingRuntime({
  documentClient,
  tableName: TABLE_NAME,
  emailTrackingDigest,
  emailTrackingDigestCandidates,
  getEmailTrackingSecret,
  safeHttpDestination,
  unsubscribeMemberFromEmailCategory,
}: EmailTrackingRuntimeDependencies) {
const trackingKey = (trackingId: string) => ({
  pk: `EMAIL_TRACKING#${trackingId}`,
  sk: `EMAIL_TRACKING#${trackingId}`,
});

function openClientFingerprint(clientInfo?: TrackingClientInfo | null) {
  return fingerprintForClient(clientInfo, getEmailTrackingSecret());
}
async function createNewsletterTrackingRecord({
  trackingId: requestedTrackingId,
  newsletterId,
  sendRunId,
  messageType = "newsletter",
  audienceMode = "all_active_members",
  userId,
  email,
}: {
  trackingId?: string | null;
  newsletterId: string;
  sendRunId?: string | null;
  messageType?: EmailMessageType;
  audienceMode?: EmailTrackingAudienceMode;
  userId: string | null;
  email: string;
}) {
  const now = new Date().toISOString();
  const trackingId = normalizeTrackingId(requestedTrackingId || randomUUID());

  try {
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
      ConditionExpression: "attribute_not_exists(pk)",
    });
  } catch (error: any) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
  }

  return { trackingId, sentAt: now };
}

async function markNewsletterTrackingSent({
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

async function getNewsletterTrackingRecord(trackingId: string, consistentRead = false) {
  const normalized = normalizeTrackingId(trackingId);
  if (!normalized) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: trackingKey(normalized),
    ...(consistentRead ? { ConsistentRead: true } : {}),
  });

  return toTrackingRecord(res.Item);
}

async function recordNewsletterOpen(trackingId: string, clientInfo?: TrackingClientInfo | null) {
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

function clickDestinationDigest(trackingId: string, url: string) {
  return emailTrackingDigest("email-click-destination-v1", [trackingId, url]);
}

async function bindNewsletterTrackingDestinations(
  trackingId: string,
  destinations: string[],
) {
  const normalizedTrackingId = normalizeTrackingId(trackingId);
  const canonicalDestinations = destinations.map((url) => {
    const canonical = safeHttpDestination(url);
    if (!canonical) {
      throw new Error("Tracked click destinations must be absolute HTTP(S) URLs");
    }
    return canonical;
  });
  const digests = [
    ...new Set(
      canonicalDestinations.map((url) => clickDestinationDigest(normalizedTrackingId, url)),
    ),
  ];
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: trackingKey(normalizedTrackingId),
      UpdateExpression: "SET allowedClickDestinationDigests = :digests",
      ConditionExpression:
        "attribute_exists(pk) AND attribute_not_exists(allowedClickDestinationDigests)",
      ExpressionAttributeValues: {
        ":digests": digests,
      },
    });
  } catch (error: any) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    const existing = await getNewsletterTrackingRecord(normalizedTrackingId);
    const stored = [...(existing?.allowedClickDestinationDigests || [])].sort();
    const requested = [...digests].sort();
    if (JSON.stringify(stored) !== JSON.stringify(requested)) throw error;
  }
  return digests;
}

async function recordBoundNewsletterClick(
  tracking: NewsletterTrackingRecord,
  url: string,
) {
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

async function recordNewsletterClick(trackingId: string, url: string) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;
  const canonicalUrl = safeHttpDestination(url);
  if (!canonicalUrl) return null;
  const digestMatches = emailTrackingDigestCandidates(
    "email-click-destination-v1",
    [tracking.trackingId, canonicalUrl],
  ).some((digest) => tracking.allowedClickDestinationDigests.includes(digest));
  if (!digestMatches) return null;
  return recordBoundNewsletterClick(tracking, canonicalUrl);
}

async function recordLegacyNewsletterSameSiteClick(trackingId: string, url: string) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;
  const canonicalUrl = safeHttpDestination(url);
  if (!canonicalUrl) return null;
  return recordBoundNewsletterClick(tracking, canonicalUrl);
}

async function recordNewsletterUnsubscribe(trackingId: string) {
  const tracking = await getNewsletterTrackingRecord(trackingId);
  if (!tracking) return null;

  const now = new Date().toISOString();

  if (tracking.userId) {
    await unsubscribeMemberFromEmailCategory({
      userId: tracking.userId,
      category: tracking.messageType,
      now,
    });
  }

  if (tracking.unsubscribedAt) return tracking;

  const aggregateUpdate = await unsubscribeAggregateTransactionItem(tracking, now);
  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Update: {
            TableName: TABLE_NAME,
            Key: trackingKey(tracking.trackingId),
            UpdateExpression: "SET #unsubscribedAt = :now",
            ConditionExpression:
              "attribute_exists(#pk) AND (attribute_not_exists(#unsubscribedAt) OR attribute_type(#unsubscribedAt, :nullType) OR #unsubscribedAt = :empty)",
            ExpressionAttributeNames: {
              "#pk": "pk",
              "#unsubscribedAt": "unsubscribedAt",
            },
            ExpressionAttributeValues: {
              ":now": now,
              ":nullType": "NULL",
              ":empty": "",
            },
          },
        },
        ...(aggregateUpdate ? [aggregateUpdate] : []),
      ],
    });
  } catch (error: any) {
    if (error?.name !== "TransactionCanceledException") throw error;
    const latest = await getNewsletterTrackingRecord(tracking.trackingId, true);
    if (!latest?.unsubscribedAt) throw error;
    return latest;
  }

  return { ...tracking, unsubscribedAt: now };
}

async function unsubscribeAggregateTransactionItem(
  tracking: NewsletterTrackingRecord,
  now: string,
) {
  if (tracking.sendRunId) {
    const prefix = tracking.messageType === "policy_update" ? "POLICY_UPDATE_SEND" : "NEWSLETTER_SEND";
    return {
      Update: {
        TableName: TABLE_NAME,
        Key: { pk: `${prefix}#${tracking.sendRunId}`, sk: `${prefix}#${tracking.sendRunId}` },
        UpdateExpression:
          "SET #unsubscribeCount = if_not_exists(#unsubscribeCount, :zero) + :one, lastEventAt = :now",
        ExpressionAttributeNames: { "#unsubscribeCount": "unsubscribeCount" },
        ExpressionAttributeValues: { ":zero": 0, ":one": 1, ":now": now },
      },
    };
  }

  if (tracking.messageType !== "newsletter") return null;
  if (!(await shouldAggregateTrackingRecord(tracking))) return null;
  return {
    Update: {
      TableName: TABLE_NAME,
      Key: { pk: `NEWSLETTER#${tracking.newsletterId}`, sk: `NEWSLETTER#${tracking.newsletterId}` },
      UpdateExpression:
        "SET #unsubscribeCount = if_not_exists(#unsubscribeCount, :zero) + :one",
      ExpressionAttributeNames: { "#unsubscribeCount": "unsubscribeCount" },
      ExpressionAttributeValues: { ":zero": 0, ":one": 1 },
    },
  };
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

  return {
    createNewsletterTrackingRecord,
    markNewsletterTrackingSent,
    getNewsletterTrackingRecord,
    recordNewsletterOpen,
    bindNewsletterTrackingDestinations,
    recordNewsletterClick,
    recordLegacyNewsletterSameSiteClick,
    recordNewsletterUnsubscribe,
  };
}

import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type NewsletterStatus = "draft" | "sending" | "sent";

export type NewsletterStats = {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  draftSendCount: number;
  openCount: number | null;
  clickCount: number | null;
  unsubscribeCount: number | null;
  possibleForwardOpenCount: number | null;
  lastDraftSentAt: string | null;
};

export type NewsletterAudienceMode = "all_active_members" | "selected_members";

export type AdminNewsletter = {
  id: string;
  subject: string;
  preheader: string;
  body: string;
  previewText: string;
  status: NewsletterStatus;
  audience: "active_members";
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  updatedBy: string | null;
  sentAt: string | null;
  sentBy: string | null;
  deliveryJobId: string | null;
  stats: NewsletterStats;
  failurePreview: Array<{ email: string; error: string }>;
};

export type NewsletterSendRun = {
  id: string;
  newsletterId: string;
  subject: string;
  preheader: string;
  body: string;
  previewText: string;
  audienceMode: NewsletterAudienceMode;
  sentAt: string;
  sentBy: string | null;
  stats: Omit<NewsletterStats, "draftSendCount" | "lastDraftSentAt">;
  failurePreview: Array<{ email: string; error: string }>;
};

export type NewsletterDraftInput = {
  id?: string | null;
  subject: string;
  preheader?: string | null;
  body: string;
  adminUserId?: string | null;
};

const NEWSLETTER_GSI_PK = "NEWSLETTER";
const NEWSLETTER_SEND_GSI_PK = "NEWSLETTER_SEND";

const textOrEmpty = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

export const newsletterPreviewText = (body: string) =>
  body
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 320);

function validateNewsletterDraft(input: NewsletterDraftInput) {
  const subject = input.subject.trim();
  const preheader = (input.preheader || "").trim();
  const body = input.body.trim();

  if (!subject) throw new Error("Newsletter subject is required.");
  if (!body) throw new Error("Newsletter body is required.");
  if (subject.length > 180) throw new Error("Newsletter subject must be 180 characters or fewer.");
  if (preheader.length > 240) throw new Error("Newsletter preheader must be 240 characters or fewer.");
  if (body.length > 25000) throw new Error("Newsletter body must be 25,000 characters or fewer.");

  return { subject, preheader, body };
}

function normalizeFailurePreview(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((failure: any) => ({
          email: textOrEmpty(failure?.email),
          error: textOrEmpty(failure?.error),
        }))
        .filter((failure: { email: string; error: string }) => failure.email || failure.error)
    : [];
}

function toNewsletter(item: Record<string, any> | undefined | null): AdminNewsletter | null {
  if (!item?.newsletterId) return null;

  const stats: NewsletterStats = {
    recipientCount: Number(item.recipientCount || 0),
    sentCount: Number(item.sentCount || 0),
    failedCount: Number(item.failedCount || 0),
    draftSendCount: Number(item.draftSendCount || 0),
    openCount: typeof item.openCount === "number" ? item.openCount : null,
    clickCount: typeof item.clickCount === "number" ? item.clickCount : null,
    unsubscribeCount: typeof item.unsubscribeCount === "number" ? item.unsubscribeCount : null,
    possibleForwardOpenCount: typeof item.possibleForwardOpenCount === "number" ? item.possibleForwardOpenCount : null,
    lastDraftSentAt: textOrNull(item.lastDraftSentAt),
  };

  return {
    id: String(item.newsletterId),
    subject: textOrEmpty(item.subject),
    preheader: textOrEmpty(item.preheader),
    body: textOrEmpty(item.body),
    previewText: textOrEmpty(item.previewText) || newsletterPreviewText(textOrEmpty(item.body)),
    status:
      item.status === "sent"
        ? "sent"
        : item.status === "sending"
          ? "sending"
          : "draft",
    audience: "active_members",
    createdAt: textOrEmpty(item.createdAt),
    updatedAt: textOrEmpty(item.updatedAt),
    createdBy: textOrNull(item.createdBy),
    updatedBy: textOrNull(item.updatedBy),
    sentAt: textOrNull(item.sentAt),
    sentBy: textOrNull(item.sentBy),
    deliveryJobId: textOrNull(item.deliveryJobId),
    stats,
    failurePreview: normalizeFailurePreview(item.failurePreview),
  };
}

function toNewsletterSendRun(item: Record<string, any> | undefined | null): NewsletterSendRun | null {
  if (!item?.sendRunId || !item?.newsletterId) return null;

  return {
    id: String(item.sendRunId),
    newsletterId: String(item.newsletterId),
    subject: textOrEmpty(item.subject),
    preheader: textOrEmpty(item.preheader),
    body: textOrEmpty(item.body),
    previewText: textOrEmpty(item.previewText) || newsletterPreviewText(textOrEmpty(item.body)),
    audienceMode: item.audienceMode === "selected_members" ? "selected_members" : "all_active_members",
    sentAt: textOrEmpty(item.sentAt),
    sentBy: textOrNull(item.sentBy),
    stats: {
      recipientCount: Number(item.recipientCount || 0),
      sentCount: Number(item.sentCount || 0),
      failedCount: Number(item.failedCount || 0),
      openCount: typeof item.openCount === "number" ? item.openCount : 0,
      clickCount: typeof item.clickCount === "number" ? item.clickCount : 0,
      unsubscribeCount: typeof item.unsubscribeCount === "number" ? item.unsubscribeCount : 0,
      possibleForwardOpenCount: typeof item.possibleForwardOpenCount === "number" ? item.possibleForwardOpenCount : 0,
    },
    failurePreview: normalizeFailurePreview(item.failurePreview),
  };
}

export async function listNewsletters(): Promise<AdminNewsletter[]> {
  const newsletters: AdminNewsletter[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": NEWSLETTER_GSI_PK },
      ExclusiveStartKey,
      ScanIndexForward: false,
    });

    for (const item of res.Items || []) {
      const newsletter = toNewsletter(item);
      if (newsletter) newsletters.push(newsletter);
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return newsletters.sort((a, b) => {
    const aDate = a.status === "sent" ? a.sentAt || a.updatedAt : a.updatedAt;
    const bDate = b.status === "sent" ? b.sentAt || b.updatedAt : b.updatedAt;
    return bDate.localeCompare(aDate);
  });
}

export async function listNewsletterSendRuns(): Promise<NewsletterSendRun[]> {
  const sends: NewsletterSendRun[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": NEWSLETTER_SEND_GSI_PK },
      ExclusiveStartKey,
      ScanIndexForward: false,
    });

    for (const item of res.Items || []) {
      const send = toNewsletterSendRun(item);
      if (send) sends.push(send);
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return sends.sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

export async function getNewsletterSendRun(id: string): Promise<NewsletterSendRun | null> {
  const sendRunId = id.trim();
  if (!sendRunId || sendRunId.startsWith("legacy-")) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER_SEND#${sendRunId}`, sk: `NEWSLETTER_SEND#${sendRunId}` },
  });

  return toNewsletterSendRun(res.Item);
}

export async function getNewsletter(id: string): Promise<AdminNewsletter | null> {
  const newsletterId = id.trim();
  if (!newsletterId) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
  });

  return toNewsletter(res.Item);
}

export async function saveNewsletterDraft(input: NewsletterDraftInput): Promise<AdminNewsletter> {
  const values = validateNewsletterDraft(input);
  const now = new Date().toISOString();
  const newsletterId = input.id?.trim() || randomUUID();
  const existing = input.id ? await getNewsletter(newsletterId) : null;

  if (existing && existing.status !== "draft") {
    throw new Error("Queued or sent newsletters cannot be edited. Create a new draft instead.");
  }

  const createdAt = existing?.createdAt || now;
  const createdBy = existing?.createdBy || input.adminUserId || null;
  const previewText = newsletterPreviewText(values.body);

  const item = {
    pk: `NEWSLETTER#${newsletterId}`,
    sk: `NEWSLETTER#${newsletterId}`,
    type: "NEWSLETTER",
    newsletterId,
    subject: values.subject,
    preheader: values.preheader,
    body: values.body,
    previewText,
    status: "draft",
    audience: "active_members",
    createdAt,
    updatedAt: now,
    createdBy,
    updatedBy: input.adminUserId || null,
    sentAt: null,
    sentBy: null,
    recipientCount: existing?.stats.recipientCount || 0,
    sentCount: existing?.stats.sentCount || 0,
    failedCount: existing?.stats.failedCount || 0,
    draftSendCount: existing?.stats.draftSendCount || 0,
    openCount: existing?.stats.openCount ?? null,
    clickCount: existing?.stats.clickCount ?? null,
    unsubscribeCount: existing?.stats.unsubscribeCount ?? null,
    possibleForwardOpenCount: existing?.stats.possibleForwardOpenCount ?? null,
    lastDraftSentAt: existing?.stats.lastDraftSentAt || null,
    failurePreview: existing?.failurePreview || [],
    GSI1PK: NEWSLETTER_GSI_PK,
    GSI1SK: `${now}#${newsletterId}`,
  };

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
  });

  return toNewsletter(item)!;
}

export async function recordNewsletterDraftSend(newsletterId: string) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
    UpdateExpression:
      "SET draftSendCount = if_not_exists(draftSendCount, :zero) + :one, lastDraftSentAt = :now, updatedAt = :now, GSI1SK = :gsi1sk",
    ExpressionAttributeValues: {
      ":zero": 0,
      ":one": 1,
      ":now": now,
      ":gsi1sk": `${now}#${newsletterId}`,
    },
  });
}

export async function recordNewsletterSendRun({
  sendRunId,
  newsletterId,
  newsletter,
  audienceMode,
  adminUserId,
  recipientCount,
  sentCount,
  failedCount,
  failurePreview,
}: {
  sendRunId: string;
  newsletterId: string;
  newsletter: Pick<AdminNewsletter, "subject" | "preheader" | "body" | "previewText">;
  audienceMode: NewsletterAudienceMode;
  adminUserId: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  failurePreview: Array<{ email: string; error: string }>;
}) {
  const now = new Date().toISOString();
  const item = {
    pk: `NEWSLETTER_SEND#${sendRunId}`,
    sk: `NEWSLETTER_SEND#${sendRunId}`,
    type: "NEWSLETTER_SEND",
    sendRunId,
    newsletterId,
    subject: newsletter.subject,
    preheader: newsletter.preheader,
    body: newsletter.body,
    previewText: newsletter.previewText || newsletterPreviewText(newsletter.body),
    audienceMode,
    sentAt: now,
    sentBy: adminUserId,
    recipientCount,
    sentCount,
    failedCount,
    openCount: 0,
    clickCount: 0,
    unsubscribeCount: 0,
    possibleForwardOpenCount: 0,
    failurePreview: failurePreview.slice(0, 10),
    GSI1PK: NEWSLETTER_SEND_GSI_PK,
    GSI1SK: `${now}#${sendRunId}`,
  };

  try {
    await documentClient.put({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: "attribute_not_exists(#pk)",
      ExpressionAttributeNames: { "#pk": "pk" },
    });
  } catch (error: any) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    const existing = await getNewsletterSendRun(sendRunId);
    if (existing) return existing;
    throw error;
  }

  return toNewsletterSendRun(item)!;
}

export async function updateNewsletterSendRunProgress({
  sendRunId,
  sentCount,
  failedCount,
  failurePreview,
}: {
  sendRunId: string;
  sentCount: number;
  failedCount: number;
  failurePreview: Array<{ email: string; error: string }>;
}) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER_SEND#${sendRunId}`, sk: `NEWSLETTER_SEND#${sendRunId}` },
    UpdateExpression:
      "SET sentCount = :sentCount, failedCount = :failedCount, failurePreview = :failurePreview, lastEventAt = :now",
    ConditionExpression: "attribute_exists(#pk)",
    ExpressionAttributeNames: { "#pk": "pk" },
    ExpressionAttributeValues: {
      ":sentCount": sentCount,
      ":failedCount": failedCount,
      ":failurePreview": failurePreview.slice(0, 10),
      ":now": now,
    },
  });
}

export async function deleteNewsletterDraft(newsletterId: string) {
  const id = newsletterId.trim();
  if (!id) throw new Error("Newsletter ID is required.");

  const newsletter = await getNewsletter(id);
  if (!newsletter) throw new Error("Newsletter not found.");
  if (newsletter.status !== "draft") throw new Error("Only draft newsletters can be deleted.");

  await documentClient.delete({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${id}`, sk: `NEWSLETTER#${id}` },
  });

  return { ok: true, newsletterId: id };
}

export async function markNewsletterSent({
  newsletterId,
  adminUserId,
  recipientCount,
  sentCount,
  failedCount,
  failurePreview,
  deliveryJobId,
}: {
  newsletterId: string;
  adminUserId: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  failurePreview: Array<{ email: string; error: string }>;
  deliveryJobId?: string | null;
}) {
  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
      UpdateExpression:
        `SET #status = :status, sentAt = if_not_exists(sentAt, :now), sentBy = if_not_exists(sentBy, :adminUserId), updatedAt = :now, updatedBy = :adminUserId, recipientCount = :recipientCount, sentCount = :sentCount, failedCount = :failedCount, openCount = if_not_exists(openCount, :zero), clickCount = if_not_exists(clickCount, :zero), unsubscribeCount = if_not_exists(unsubscribeCount, :zero), possibleForwardOpenCount = if_not_exists(possibleForwardOpenCount, :zero), failurePreview = :failurePreview, GSI1SK = :gsi1sk${deliveryJobId ? ", deliveryJobId = :deliveryJobId" : ""}`,
      ...(deliveryJobId
        ? {
            ConditionExpression:
              "#status IN (:sending, :status) AND deliveryJobId = :deliveryJobId",
          }
        : {}),
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":status": "sent",
        ":now": now,
        ":adminUserId": adminUserId,
        ":recipientCount": recipientCount,
        ":sentCount": sentCount,
        ":failedCount": failedCount,
        ":zero": 0,
        ":failurePreview": failurePreview.slice(0, 10),
        ":gsi1sk": `${now}#${newsletterId}`,
        ...(deliveryJobId ? { ":sending": "sending", ":deliveryJobId": deliveryJobId } : {}),
      },
    });
    return true;
  } catch (error: any) {
    if (deliveryJobId && error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

export async function claimNewsletterBackgroundDelivery({
  newsletterId,
  deliveryJobId,
  adminUserId,
}: {
  newsletterId: string;
  deliveryJobId: string;
  adminUserId: string | null;
}) {
  const now = new Date().toISOString();
  try {
    await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
      UpdateExpression:
        "SET #status = :sending, deliveryJobId = :deliveryJobId, deliveryClaimedAt = if_not_exists(deliveryClaimedAt, :now), updatedAt = :now, updatedBy = :adminUserId",
      ConditionExpression:
        "attribute_exists(#pk) AND (#status = :draft OR ((#status = :sending OR #status = :sent) AND deliveryJobId = :deliveryJobId))",
      ExpressionAttributeNames: { "#pk": "pk", "#status": "status" },
      ExpressionAttributeValues: {
        ":draft": "draft",
        ":sending": "sending",
        ":sent": "sent",
        ":deliveryJobId": deliveryJobId,
        ":now": now,
        ":adminUserId": adminUserId,
      },
    });
    return true;
  } catch (error: any) {
    if (error?.name === "ConditionalCheckFailedException") return false;
    throw error;
  }
}

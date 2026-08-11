import { randomUUID } from "node:crypto";
import {
  newsletterFromItem as toNewsletter,
  newsletterPreviewText,
  newsletterSendRunFromItem as toNewsletterSendRun,
  validateNewsletterDraft,
  type AdminNewsletter,
  type NewsletterAudienceMode,
  type NewsletterDraftInput,
  type NewsletterSendRun,
} from "@pgpz/email-domain";
import type { EmailRuntimeDocumentClient } from "./types";

export {
  newsletterPreviewText,
  type AdminNewsletter,
  type NewsletterAudienceMode,
  type NewsletterDraftInput,
  type NewsletterSendRun,
  type NewsletterStats,
  type NewsletterStatus,
} from "@pgpz/email-domain";

export type NewsletterRuntimeDependencies = {
  documentClient: EmailRuntimeDocumentClient;
  tableName: string;
};

export function createNewsletterRuntime({
  documentClient,
  tableName: TABLE_NAME,
}: NewsletterRuntimeDependencies) {
const NEWSLETTER_GSI_PK = "NEWSLETTER";
const NEWSLETTER_SEND_GSI_PK = "NEWSLETTER_SEND";

async function listNewsletters(): Promise<AdminNewsletter[]> {
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
async function listNewsletterSendRuns(): Promise<NewsletterSendRun[]> {
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

async function getNewsletterSendRun(id: string): Promise<NewsletterSendRun | null> {
  const sendRunId = id.trim();
  if (!sendRunId || sendRunId.startsWith("legacy-")) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER_SEND#${sendRunId}`, sk: `NEWSLETTER_SEND#${sendRunId}` },
  });

  return toNewsletterSendRun(res.Item);
}

async function getNewsletter(id: string): Promise<AdminNewsletter | null> {
  const newsletterId = id.trim();
  if (!newsletterId) return null;

  const res = await documentClient.get({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
  });

  return toNewsletter(res.Item);
}

async function saveNewsletterDraft(input: NewsletterDraftInput): Promise<AdminNewsletter> {
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

async function recordNewsletterDraftSend(newsletterId: string) {
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

async function recordNewsletterSendRun({
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

async function updateNewsletterSendRunProgress({
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

async function deleteNewsletterDraft(newsletterId: string) {
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

async function markNewsletterSent({
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

async function claimNewsletterBackgroundDelivery({
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

  return {
    listNewsletters,
    listNewsletterSendRuns,
    getNewsletterSendRun,
    getNewsletter,
    saveNewsletterDraft,
    recordNewsletterDraftSend,
    recordNewsletterSendRun,
    updateNewsletterSendRunProgress,
    deleteNewsletterDraft,
    markNewsletterSent,
    claimNewsletterBackgroundDelivery,
  };
}

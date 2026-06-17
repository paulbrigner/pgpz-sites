import "server-only";

import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type NewsletterStatus = "draft" | "sent";

export type NewsletterStats = {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  draftSendCount: number;
  openCount: number | null;
  clickCount: number | null;
  unsubscribeCount: number | null;
  lastDraftSentAt: string | null;
};

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
  stats: NewsletterStats;
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
    lastDraftSentAt: textOrNull(item.lastDraftSentAt),
  };

  return {
    id: String(item.newsletterId),
    subject: textOrEmpty(item.subject),
    preheader: textOrEmpty(item.preheader),
    body: textOrEmpty(item.body),
    previewText: textOrEmpty(item.previewText) || newsletterPreviewText(textOrEmpty(item.body)),
    status: item.status === "sent" ? "sent" : "draft",
    audience: "active_members",
    createdAt: textOrEmpty(item.createdAt),
    updatedAt: textOrEmpty(item.updatedAt),
    createdBy: textOrNull(item.createdBy),
    updatedBy: textOrNull(item.updatedBy),
    sentAt: textOrNull(item.sentAt),
    sentBy: textOrNull(item.sentBy),
    stats,
    failurePreview: Array.isArray(item.failurePreview)
      ? item.failurePreview
          .map((failure: any) => ({
            email: textOrEmpty(failure?.email),
            error: textOrEmpty(failure?.error),
          }))
          .filter((failure: { email: string; error: string }) => failure.email || failure.error)
      : [],
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

  if (existing?.status === "sent") {
    throw new Error("Sent newsletters cannot be edited. Create a new draft instead.");
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

export async function markNewsletterSent({
  newsletterId,
  adminUserId,
  recipientCount,
  sentCount,
  failedCount,
  failurePreview,
}: {
  newsletterId: string;
  adminUserId: string | null;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  failurePreview: Array<{ email: string; error: string }>;
}) {
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: TABLE_NAME,
    Key: { pk: `NEWSLETTER#${newsletterId}`, sk: `NEWSLETTER#${newsletterId}` },
    UpdateExpression:
      "SET #status = :status, sentAt = :now, sentBy = :adminUserId, updatedAt = :now, updatedBy = :adminUserId, recipientCount = :recipientCount, sentCount = :sentCount, failedCount = :failedCount, failurePreview = :failurePreview, GSI1SK = :gsi1sk",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": "sent",
      ":now": now,
      ":adminUserId": adminUserId,
      ":recipientCount": recipientCount,
      ":sentCount": sentCount,
      ":failedCount": failedCount,
      ":failurePreview": failurePreview.slice(0, 10),
      ":gsi1sk": `${now}#${newsletterId}`,
    },
  });
}

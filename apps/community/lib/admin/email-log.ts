import { randomUUID } from "crypto";
import { documentClient, TABLE_NAME } from "@/lib/dynamodb";

export type EmailLogStatus = "queued" | "sent" | "failed";

export interface EmailLogParams {
  userId?: string | null;
  email?: string | null;
  type: string;
  subject?: string | null;
  status: EmailLogStatus;
  providerMessageId?: string | null;
  error?: string | null;
  markWelcome?: boolean;
  emailBounceReason?: string | null;
  emailSuppressed?: boolean | null;
  metadata?: Record<string, unknown>;
}

export type PolicyUpdateEmailStats = {
  sent: number;
  failed: number;
  draftSent: number;
  lastSentAt: string | null;
};

const emptyPolicyUpdateStats = (): PolicyUpdateEmailStats => ({
  sent: 0,
  failed: 0,
  draftSent: 0,
  lastSentAt: null,
});

export async function recordEmailEvent(params: EmailLogParams) {
  const now = new Date().toISOString();
  const logId = randomUUID();
  const userId = params.userId || null;

  const pk = userId ? `EMAIL_LOG#USER#${userId}` : "EMAIL_LOG#UNKNOWN";
  const sk = `EMAIL_LOG#${now}#${logId}`;

  const item: Record<string, unknown> = {
    pk,
    sk,
    type: "EMAIL_LOG",
    logId,
    createdAt: now,
    status: params.status,
    emailType: params.type,
    subject: params.subject || null,
    userId,
    email: params.email || null,
    providerMessageId: params.providerMessageId || null,
    error: params.error || null,
    metadata: params.metadata || null,
  };

  // Sparse GSI entries for optional querying across all email logs by time.
  item["GSI1PK"] = "EMAIL_LOG";
  item["GSI1SK"] = `${now}#${logId}`;

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
  });

  if (userId) {
    const updateParts = ["lastEmailSentAt = :now", "lastEmailType = :type"];
    const values: Record<string, unknown> = {
      ":now": now,
      ":type": params.type,
    };

    if (params.markWelcome) {
      updateParts.push("welcomeEmailSentAt = if_not_exists(welcomeEmailSentAt, :now)");
    }
    if (typeof params.emailBounceReason === "string") {
      updateParts.push("emailBounceReason = :bounce");
      values[":bounce"] = params.emailBounceReason;
    }
    if (typeof params.emailSuppressed === "boolean") {
      updateParts.push("emailSuppressed = :suppressed");
      values[":suppressed"] = params.emailSuppressed;
    }

    await documentClient.update({
      TableName: TABLE_NAME,
      Key: { pk: `USER#${userId}`, sk: `USER#${userId}` },
      UpdateExpression: `SET ${updateParts.join(", ")}`,
      ExpressionAttributeValues: values,
    });
  }
}

export async function summarizePolicyUpdateEmailStats(slugs: string[]) {
  const requested = new Set(slugs);
  const stats: Record<string, PolicyUpdateEmailStats> = {};
  for (const slug of slugs) stats[slug] = emptyPolicyUpdateStats();

  if (!requested.size) return stats;

  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ProjectionExpression: "createdAt, emailType, #status, metadata",
      ExpressionAttributeNames: {
        "#gsi1pk": "GSI1PK",
        "#status": "status",
      },
      ExpressionAttributeValues: { ":pk": "EMAIL_LOG" },
      ExclusiveStartKey,
      ScanIndexForward: false,
      Limit: 500,
    });

    for (const item of res.Items || []) {
      const metadata = item.metadata as Record<string, unknown> | null | undefined;
      const slug = typeof metadata?.updateSlug === "string" ? metadata.updateSlug : "";
      if (!requested.has(slug)) continue;

      const aggregate = stats[slug] || emptyPolicyUpdateStats();
      const draft = metadata?.draft === true;
      const status = item.status === "failed" ? "failed" : item.status === "sent" ? "sent" : "";

      if (status === "sent" && draft) {
        aggregate.draftSent += 1;
      } else if (status === "sent") {
        aggregate.sent += 1;
        const createdAt = typeof item.createdAt === "string" ? item.createdAt : null;
        if (createdAt && (!aggregate.lastSentAt || createdAt > aggregate.lastSentAt)) {
          aggregate.lastSentAt = createdAt;
        }
      } else if (status === "failed" && !draft) {
        aggregate.failed += 1;
      }

      stats[slug] = aggregate;
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return stats;
}

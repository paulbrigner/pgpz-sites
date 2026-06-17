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

export type PolicyUpdateSendHistoryItem = {
  id: string;
  updateSlug: string;
  title: string;
  shortTitle: string;
  category: string;
  categoryLabel: string;
  subject: string;
  sentAt: string;
  lastEventAt: string;
  audienceMode: "all_active_members";
  stats: {
    recipientCount: number;
    sentCount: number;
    failedCount: number;
    openCount: number | null;
    clickCount: number | null;
    unsubscribeCount: number | null;
    possibleForwardOpenCount: number | null;
  };
  failurePreview: Array<{ email: string; error: string }>;
  source: "send_run" | "legacy_email_log";
  engagementTracked: boolean;
};

export type PolicyUpdateHistoryContext = {
  slug: string;
  title: string;
  shortTitle: string;
  category: string;
  categoryLabel: string;
  emailSubject: string;
};

type PolicyUpdateEmailLogItem = {
  createdAt?: unknown;
  emailType?: unknown;
  status?: unknown;
  subject?: unknown;
  email?: unknown;
  error?: unknown;
  metadata?: unknown;
};

const emptyPolicyUpdateStats = (): PolicyUpdateEmailStats => ({
  sent: 0,
  failed: 0,
  draftSent: 0,
  lastSentAt: null,
});

const POLICY_UPDATE_LEGACY_RUN_GAP_MS = 15 * 60 * 1000;
const POLICY_UPDATE_SEND_GSI_PK = "POLICY_UPDATE_SEND";

const textOrEmpty = (value: unknown) => (typeof value === "string" ? value : "");
const textOrNull = (value: unknown) => (typeof value === "string" && value.trim() ? value : null);

function policyUpdateRunDefaults(slug: string, updatesBySlug: Map<string, PolicyUpdateHistoryContext>) {
  const update = updatesBySlug.get(slug);
  return {
    title: update?.title || slug,
    shortTitle: update?.shortTitle || update?.title || slug,
    category: update?.category || "",
    categoryLabel: update?.categoryLabel || "Policy update",
    subject: update?.emailSubject || "",
  };
}

function createPolicyUpdateHistoryRun({
  id,
  slug,
  createdAt,
  metadata,
  subject,
  source,
  updatesBySlug,
}: {
  id: string;
  slug: string;
  createdAt: string;
  metadata: Record<string, unknown>;
  subject: string;
  source: PolicyUpdateSendHistoryItem["source"];
  updatesBySlug: Map<string, PolicyUpdateHistoryContext>;
}): PolicyUpdateSendHistoryItem {
  const defaults = policyUpdateRunDefaults(slug, updatesBySlug);
  const category = textOrEmpty(metadata.category) || defaults.category;
  return {
    id,
    updateSlug: slug,
    title: defaults.title,
    shortTitle: defaults.shortTitle,
    category,
    categoryLabel: defaults.categoryLabel,
    subject: subject || defaults.subject,
    sentAt: createdAt,
    lastEventAt: createdAt,
    audienceMode: "all_active_members",
    stats: {
      recipientCount: 0,
      sentCount: 0,
      failedCount: 0,
      openCount: null,
      clickCount: null,
      unsubscribeCount: null,
      possibleForwardOpenCount: null,
    },
    failurePreview: [],
    source,
    engagementTracked: false,
  };
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

function toPolicyUpdateSendHistoryItem(item: Record<string, any> | undefined | null): PolicyUpdateSendHistoryItem | null {
  if (!item?.sendRunId || !item?.updateSlug) return null;

  return {
    id: String(item.sendRunId),
    updateSlug: textOrEmpty(item.updateSlug),
    title: textOrEmpty(item.title) || textOrEmpty(item.shortTitle) || textOrEmpty(item.updateSlug),
    shortTitle: textOrEmpty(item.shortTitle) || textOrEmpty(item.title) || textOrEmpty(item.updateSlug),
    category: textOrEmpty(item.category),
    categoryLabel: textOrEmpty(item.categoryLabel) || "Policy update",
    subject: textOrEmpty(item.subject),
    sentAt: textOrEmpty(item.sentAt),
    lastEventAt: textOrEmpty(item.lastEventAt) || textOrEmpty(item.sentAt),
    audienceMode: "all_active_members",
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
    source: "send_run",
    engagementTracked: true,
  };
}

export function groupPolicyUpdateEmailLogs(
  items: PolicyUpdateEmailLogItem[],
  updates: PolicyUpdateHistoryContext[] = [],
) {
  const updatesBySlug = new Map(updates.map((update) => [update.slug, update]));
  const allowedSlugs = new Set(updates.map((update) => update.slug));
  const runs = new Map<string, PolicyUpdateSendHistoryItem>();
  const legacyRunsBySlug = new Map<string, PolicyUpdateSendHistoryItem>();

  const sortedItems = [...items].sort((a, b) => textOrEmpty(a.createdAt).localeCompare(textOrEmpty(b.createdAt)));

  for (const item of sortedItems) {
    const metadata =
      item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
        ? (item.metadata as Record<string, unknown>)
        : {};
    const slug = textOrEmpty(metadata.updateSlug);
    if (!slug || (allowedSlugs.size && !allowedSlugs.has(slug))) continue;
    if (metadata.draft === true) continue;

    const status = item.status === "sent" ? "sent" : item.status === "failed" ? "failed" : "";
    if (!status) continue;

    const createdAt = textOrEmpty(item.createdAt);
    if (!createdAt) continue;

    const explicitRunId = textOrNull(metadata.policyUpdateSendRunId) || textOrNull(metadata.sendRunId);
    const subject = textOrEmpty(item.subject);
    let run: PolicyUpdateSendHistoryItem | undefined;

    if (explicitRunId) {
      const key = `run:${explicitRunId}`;
      run = runs.get(key);
      if (!run) {
        run = createPolicyUpdateHistoryRun({
          id: explicitRunId,
          slug,
          createdAt,
          metadata,
          subject,
          source: "send_run",
          updatesBySlug,
        });
        runs.set(key, run);
      }
    } else {
      const previous = legacyRunsBySlug.get(slug);
      const previousTime = previous ? Date.parse(previous.lastEventAt) : NaN;
      const currentTime = Date.parse(createdAt);
      const sameLegacyRun =
        previous &&
        Number.isFinite(previousTime) &&
        Number.isFinite(currentTime) &&
        currentTime - previousTime <= POLICY_UPDATE_LEGACY_RUN_GAP_MS;

      if (sameLegacyRun) {
        run = previous;
      } else {
        const key = `legacy:${slug}:${createdAt}`;
        run = createPolicyUpdateHistoryRun({
          id: key,
          slug,
          createdAt,
          metadata,
          subject,
          source: "legacy_email_log",
          updatesBySlug,
        });
        runs.set(key, run);
        legacyRunsBySlug.set(slug, run);
      }
    }

    run.stats.recipientCount += 1;
    if (status === "sent") run.stats.sentCount += 1;
    if (status === "failed") {
      run.stats.failedCount += 1;
      if (run.failurePreview.length < 10) {
        run.failurePreview.push({
          email: textOrEmpty(item.email) || "Unknown recipient",
          error: textOrEmpty(item.error) || "Failed to send",
        });
      }
    }
    if (createdAt < run.sentAt) run.sentAt = createdAt;
    if (createdAt > run.lastEventAt) run.lastEventAt = createdAt;
    if (!run.subject && subject) run.subject = subject;
  }

  return Array.from(runs.values()).sort((a, b) => b.sentAt.localeCompare(a.sentAt));
}

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

export async function recordPolicyUpdateSendRun({
  sendRunId,
  update,
  recipientCount,
  sentCount,
  failedCount,
  failurePreview,
}: {
  sendRunId: string;
  update: PolicyUpdateHistoryContext;
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  failurePreview: Array<{ email: string; error: string }>;
}) {
  const now = new Date().toISOString();
  const item = {
    pk: `POLICY_UPDATE_SEND#${sendRunId}`,
    sk: `POLICY_UPDATE_SEND#${sendRunId}`,
    type: "POLICY_UPDATE_SEND",
    sendRunId,
    updateSlug: update.slug,
    title: update.title,
    shortTitle: update.shortTitle,
    category: update.category,
    categoryLabel: update.categoryLabel,
    subject: update.emailSubject,
    sentAt: now,
    lastEventAt: now,
    audienceMode: "all_active_members",
    recipientCount,
    sentCount,
    failedCount,
    openCount: 0,
    clickCount: 0,
    unsubscribeCount: 0,
    possibleForwardOpenCount: 0,
    failurePreview: failurePreview.slice(0, 10),
    GSI1PK: POLICY_UPDATE_SEND_GSI_PK,
    GSI1SK: `${now}#${sendRunId}`,
  };

  await documentClient.put({
    TableName: TABLE_NAME,
    Item: item,
  });

  return toPolicyUpdateSendHistoryItem(item)!;
}

export async function listPolicyUpdateSendHistory(updates: PolicyUpdateHistoryContext[]) {
  const requested = new Set(updates.map((update) => update.slug));
  const logs: PolicyUpdateEmailLogItem[] = [];
  const sendRuns: PolicyUpdateSendHistoryItem[] = [];

  if (!requested.size) return [];

  let ExclusiveStartKey: Record<string, any> | undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": POLICY_UPDATE_SEND_GSI_PK },
      ExclusiveStartKey,
      ScanIndexForward: false,
    });

    for (const item of res.Items || []) {
      const sendRun = toPolicyUpdateSendHistoryItem(item);
      if (sendRun && requested.has(sendRun.updateSlug)) sendRuns.push(sendRun);
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  const firstClassSendRunIds = new Set(sendRuns.map((sendRun) => sendRun.id));
  ExclusiveStartKey = undefined;

  do {
    const res = await documentClient.query({
      TableName: TABLE_NAME,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ProjectionExpression: "createdAt, emailType, #status, #subject, #email, #error, metadata",
      ExpressionAttributeNames: {
        "#gsi1pk": "GSI1PK",
        "#status": "status",
        "#subject": "subject",
        "#email": "email",
        "#error": "error",
      },
      ExpressionAttributeValues: { ":pk": "EMAIL_LOG" },
      ExclusiveStartKey,
      ScanIndexForward: false,
      Limit: 1000,
    });

    for (const item of res.Items || []) {
      const metadata = item.metadata as Record<string, unknown> | null | undefined;
      const slug = typeof metadata?.updateSlug === "string" ? metadata.updateSlug : "";
      if (!requested.has(slug)) continue;
      const explicitRunId =
        typeof metadata?.policyUpdateSendRunId === "string"
          ? metadata.policyUpdateSendRunId
          : typeof metadata?.sendRunId === "string"
            ? metadata.sendRunId
            : "";
      if (explicitRunId && firstClassSendRunIds.has(explicitRunId)) continue;
      logs.push(item);
    }

    ExclusiveStartKey = res.LastEvaluatedKey as any;
  } while (ExclusiveStartKey);

  return [...sendRuns, ...groupPolicyUpdateEmailLogs(logs, updates)].sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  );
}

import "server-only";

import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  deriveJobProgress,
  normalizeRecipients as normalizeBackgroundJobRecipients,
  sanitizeJobError,
} from "@pgpz/background-jobs";
import { documentClient, TABLE_NAME as APPLICATION_TABLE_NAME } from "@/lib/dynamodb";
import { awsRuntimeClientConfig } from "@/lib/aws-runtime";
import { normalizeEmail } from "@/lib/admin/email-transport";

export type BackgroundJobKind =
  | "newsletter"
  | "policy_update"
  | "bulk_invitation"
  | "community_sync";
export type BackgroundJobMode = "live" | "validate_only" | "smoke";
export type BackgroundJobStatus =
  | "building"
  | "dispatch_pending"
  | "queued"
  | "running"
  | "completed"
  | "partial"
  | "failed"
  | "needs_review"
  | "canceled";
export type BackgroundJobTaskStatus =
  | "pending"
  | "queued"
  | "processing"
  | "sent"
  | "validated"
  | "skipped"
  | "failed"
  | "delivery_unknown"
  | "canceled";

export type BackgroundJobRecipient = {
  recipientKey: string;
  userId: string | null;
  email: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  metadata?: Record<string, unknown>;
};

export type BackgroundJobRecord = {
  id: string;
  kind: BackgroundJobKind;
  mode: BackgroundJobMode;
  status: BackgroundJobStatus;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  payload: Record<string, unknown>;
  idempotencyKey: string;
  fingerprint: string;
  audienceManifestPageCount: number;
  recipientCount: number;
  pendingCount: number;
  queuedCount: number;
  processingCount: number;
  sentCount: number;
  validatedCount: number;
  skippedCount: number;
  failedCount: number;
  deliveryUnknownCount: number;
  canceledCount: number;
  expires: number;
  snapshotCompletedAt?: string | null;
};

export type BackgroundJobTaskRecord = {
  jobId: string;
  taskId: string;
  kind: BackgroundJobKind;
  mode: BackgroundJobMode;
  status: BackgroundJobTaskStatus;
  recipient: BackgroundJobRecipient;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
  leaseToken: string | null;
  leaseExpiresAt: string | null;
  deliveryStartedAt: string | null;
  providerMessageId: string | null;
  result: Record<string, unknown> | null;
  lastError: string | null;
  projectionCompletedAt: string | null;
  expires: number;
};

export type BackgroundJobMessage = {
  version: 1;
  jobId: string;
  taskId: string;
};

type EnqueueBackgroundJobInput = {
  kind: BackgroundJobKind;
  mode?: BackgroundJobMode;
  sourceId?: string | null;
  createdBy?: string | null;
  idempotencyKey: string;
  payload: Record<string, unknown>;
  recipients: BackgroundJobRecipient[];
};
export type { EnqueueBackgroundJobInput };

type ClaimResult =
  | { outcome: "claimed"; job: BackgroundJobRecord; task: BackgroundJobTaskRecord; leaseToken: string }
  | { outcome: "terminal" | "busy" | "missing"; job?: BackgroundJobRecord; task?: BackgroundJobTaskRecord };

const JOB_GSI_PK = "BACKGROUND_JOB";
const JOB_RETENTION_SECONDS = 60 * 60 * 24 * 180;
const AUDIENCE_MANIFEST_PAGE_MAX_BYTES = 240_000;
const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 3;
const LIVE_SMOKE_RECIPIENTS = new Set([
  "paul@paulbrigner.com",
  "div@accrediv.com",
]);
const TERMINAL_TASK_STATUSES = new Set<BackgroundJobTaskStatus>([
  "sent",
  "validated",
  "skipped",
  "failed",
  "delivery_unknown",
  "canceled",
]);
const TERMINAL_JOB_STATUSES = new Set<BackgroundJobStatus>([
  "completed",
  "partial",
  "failed",
  "needs_review",
  "canceled",
]);

let sqsClient: SQSClient | null = null;

function queueClient() {
  if (!sqsClient) {
    sqsClient = new SQSClient(
      awsRuntimeClientConfig(process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1"),
    );
  }
  return sqsClient;
}

const jobKey = (jobId: string) => ({
  pk: `BACKGROUND_JOB#${jobId}`,
  sk: `BACKGROUND_JOB#${jobId}`,
});
const taskKey = (jobId: string, taskId: string) => ({
  pk: `BACKGROUND_JOB#${jobId}`,
  sk: `TASK#${taskId}`,
});
const audienceManifestPageKey = (
  jobId: string,
  fingerprint: string,
  pageIndex: number,
) => ({
  pk: `BACKGROUND_JOB#${jobId}`,
  sk: `AUDIENCE#${fingerprint}#${String(pageIndex).padStart(8, "0")}`,
});
const idempotencyKey = (key: string) => ({
  pk: `BACKGROUND_JOB_IDEMPOTENCY#${key}`,
  sk: `BACKGROUND_JOB_IDEMPOTENCY#${key}`,
});

function requireConfiguration() {
  if (process.env.BACKGROUND_JOBS_ENABLED !== "true") throw new Error("Background jobs are not enabled.");
  const tableName = process.env.BACKGROUND_JOBS_TABLE?.trim();
  const queueUrl = process.env.BACKGROUND_JOBS_QUEUE_URL?.trim();
  if (!tableName) throw new Error("BACKGROUND_JOBS_TABLE is required.");
  if (!queueUrl) throw new Error("BACKGROUND_JOBS_QUEUE_URL is required.");
  return { tableName, queueUrl };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, canonicalize(nested)]),
    );
  }
  return value;
}

function requestFingerprint(input: EnqueueBackgroundJobInput, recipients: BackgroundJobRecipient[]) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize({
      kind: input.kind,
      mode: input.mode || "live",
      sourceId: input.sourceId || null,
      payload: input.payload,
      recipients,
    })))
    .digest("hex");
}

function safeError(value: unknown) {
  return sanitizeJobError(value).message;
}

function normalizeRecipients(recipients: BackgroundJobRecipient[]) {
  return normalizeBackgroundJobRecipients(recipients) as BackgroundJobRecipient[];
}

function taskIdForRecipient(recipient: BackgroundJobRecipient) {
  return createHash("sha256").update(recipient.recipientKey).digest("hex").slice(0, 40);
}

export function backgroundJobIdForIdempotencyKey(value: string) {
  const digest = createHash("sha256").update(value.trim()).digest("hex").slice(0, 32).split("");
  digest[12] = "4";
  digest[16] = ((Number.parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  return `${digest.slice(0, 8).join("")}-${digest.slice(8, 12).join("")}-${digest.slice(12, 16).join("")}-${digest.slice(16, 20).join("")}-${digest.slice(20).join("")}`;
}

function smokeAllowlist() {
  const configured = new Set(
    (process.env.BACKGROUND_JOB_SMOKE_ALLOWLIST || "")
      .split(",")
      .map(normalizeEmail)
      .filter(Boolean),
  );
  if (!configured.size) throw new Error("BACKGROUND_JOB_SMOKE_ALLOWLIST must be configured for smoke jobs.");
  for (const email of configured) {
    if (!LIVE_SMOKE_RECIPIENTS.has(email)) {
      throw new Error("The smoke allowlist may contain only Paul and Div.");
    }
  }
  return configured;
}

export async function assertSmokeRecipient(recipient: BackgroundJobRecipient) {
  const email = normalizeEmail(recipient.email);
  if (!recipient.userId || !email || !smokeAllowlist().has(email)) {
    throw new Error("Smoke jobs require one allowlisted active administrator.");
  }
  const user = await documentClient.get({
    TableName: APPLICATION_TABLE_NAME,
    Key: { pk: `USER#${recipient.userId}`, sk: `USER#${recipient.userId}` },
    ConsistentRead: true,
    ProjectionExpression:
      "id, email, isAdmin, membershipStatus, accountStatus, deactivatedAt, emailSuppressed",
  });
  const item = user.Item;
  if (
    !item?.id ||
    normalizeEmail(item.email) !== email ||
    item.isAdmin !== true ||
    item.membershipStatus !== "active" ||
    item.accountStatus === "deactivated" ||
    item.deactivatedAt ||
    item.emailSuppressed === true
  ) {
    throw new Error("Smoke recipient must still be an active, unsuppressed administrator.");
  }
}

export async function getCurrentEligibleRecipient(
  recipient: BackgroundJobRecipient,
  { requireInvited = false }: { requireInvited?: boolean } = {},
) {
  if (!recipient.userId || !recipient.email) return null;
  const user = await documentClient.get({
    TableName: APPLICATION_TABLE_NAME,
    Key: { pk: `USER#${recipient.userId}`, sk: `USER#${recipient.userId}` },
    ConsistentRead: true,
  });
  const item = user.Item;
  if (!item?.id || normalizeEmail(item.email) !== normalizeEmail(recipient.email)) return null;
  if (item.accountStatus === "deactivated" || item.deactivatedAt || item.emailSuppressed === true) return null;
  if (requireInvited) {
    if (
      item.membershipStatus !== "invited" ||
      item.invitationEmailSentAt ||
      item.manualApprovalStatus === "pending"
    ) return null;
  } else if (item.membershipStatus !== "active") {
    return null;
  }
  return item;
}

function toJob(item: Record<string, any> | undefined): BackgroundJobRecord | null {
  if (!item?.jobId) return null;
  return {
    id: String(item.jobId),
    kind: item.kind,
    mode: item.mode,
    status: item.status,
    sourceId: item.sourceId || null,
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
    createdBy: item.createdBy || null,
    payload: item.payload || {},
    idempotencyKey: String(item.idempotencyKey),
    fingerprint: typeof item.fingerprint === "string" ? item.fingerprint : "",
    audienceManifestPageCount: Number(item.audienceManifestPageCount || 0),
    recipientCount: Number(item.recipientCount || 0),
    pendingCount: Number(item.pendingCount || 0),
    queuedCount: Number(item.queuedCount || 0),
    processingCount: Number(item.processingCount || 0),
    sentCount: Number(item.sentCount || 0),
    validatedCount: Number(item.validatedCount || 0),
    skippedCount: Number(item.skippedCount || 0),
    failedCount: Number(item.failedCount || 0),
    deliveryUnknownCount: Number(item.deliveryUnknownCount || 0),
    canceledCount: Number(item.canceledCount || 0),
    expires: Number(item.expires || 0),
    snapshotCompletedAt: typeof item.snapshotCompletedAt === "string" ? item.snapshotCompletedAt : null,
  };
}

function toTask(item: Record<string, any> | undefined): BackgroundJobTaskRecord | null {
  if (!item?.jobId || !item?.taskId) return null;
  return {
    jobId: String(item.jobId),
    taskId: String(item.taskId),
    kind: item.kind,
    mode: item.mode,
    status: item.status,
    recipient: item.recipient,
    attemptCount: Number(item.attemptCount || 0),
    createdAt: String(item.createdAt),
    updatedAt: String(item.updatedAt),
    leaseToken: item.leaseToken || null,
    leaseExpiresAt: item.leaseExpiresAt || null,
    deliveryStartedAt: item.deliveryStartedAt || null,
    providerMessageId: item.providerMessageId || null,
    result: item.result || null,
    lastError: item.lastError || null,
    projectionCompletedAt: item.projectionCompletedAt || null,
    expires: Number(item.expires || 0),
  };
}

async function putImmutableItems(
  tableName: string,
  items: Record<string, unknown>[],
  failureMessage: string,
) {
  for (let offset = 0; offset < items.length; offset += 25) {
    await Promise.all(
      items.slice(offset, offset + 25).map(async (Item) => {
        try {
          await documentClient.put({
            TableName: tableName,
            Item,
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          });
        } catch (error: any) {
          if (error?.name !== "ConditionalCheckFailedException") throw error;
        }
      }),
    ).catch((error) => {
      throw new Error(`${failureMessage}: ${safeError(error)}`);
    });
  }
}

function buildAudienceManifestPages(recipients: BackgroundJobRecipient[]) {
  const pages: BackgroundJobRecipient[][] = [];
  let current: BackgroundJobRecipient[] = [];
  let currentBytes = 2;
  for (const recipient of recipients) {
    const recipientBytes = Buffer.byteLength(JSON.stringify(recipient), "utf8") + 1;
    if (current.length && currentBytes + recipientBytes > AUDIENCE_MANIFEST_PAGE_MAX_BYTES) {
      pages.push(current);
      current = [];
      currentBytes = 2;
    }
    current.push(recipient);
    currentBytes += recipientBytes;
  }
  if (current.length) pages.push(current);
  return pages;
}

async function persistAudienceManifest({
  tableName,
  jobId,
  fingerprint,
  pages,
  createdAt,
  expires,
}: {
  tableName: string;
  jobId: string;
  fingerprint: string;
  pages: BackgroundJobRecipient[][];
  createdAt: string;
  expires: number;
}) {
  await putImmutableItems(
    tableName,
    pages.map((recipients, pageIndex) => ({
      ...audienceManifestPageKey(jobId, fingerprint, pageIndex),
      type: "BACKGROUND_JOB_AUDIENCE_PAGE",
      jobId,
      fingerprint,
      pageIndex,
      pageCount: pages.length,
      recipients,
      createdAt,
      expires,
    })),
    "Unable to persist the recoverable background-job audience manifest",
  );
}

async function readAudienceManifest(job: BackgroundJobRecord) {
  if (!job.fingerprint || job.audienceManifestPageCount < 1) {
    throw new Error("The background job does not have a recoverable audience manifest.");
  }
  const { tableName } = requireConfiguration();
  const items: Record<string, any>[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const response = await documentClient.query({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :audience)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: {
        ":pk": `BACKGROUND_JOB#${job.id}`,
        ":audience": `AUDIENCE#${job.fingerprint}#`,
      },
      ConsistentRead: true,
      ExclusiveStartKey,
    });
    items.push(...(response.Items || []));
    ExclusiveStartKey = response.LastEvaluatedKey as Record<string, any> | undefined;
  } while (ExclusiveStartKey);

  const pages = items.sort((left, right) => Number(left.pageIndex) - Number(right.pageIndex));
  if (
    pages.length !== job.audienceManifestPageCount ||
    pages.some(
      (page, index) =>
        page.type !== "BACKGROUND_JOB_AUDIENCE_PAGE" ||
        page.fingerprint !== job.fingerprint ||
        Number(page.pageIndex) !== index ||
        Number(page.pageCount) !== job.audienceManifestPageCount ||
        !Array.isArray(page.recipients),
    )
  ) {
    throw new Error("The background-job audience manifest is incomplete or inconsistent.");
  }
  const recipients = pages.flatMap((page) => page.recipients) as BackgroundJobRecipient[];
  if (recipients.length !== job.recipientCount) {
    throw new Error("The background-job audience manifest recipient count is inconsistent.");
  }
  return recipients;
}

function taskItemForRecipient(
  job: BackgroundJobRecord,
  recipient: BackgroundJobRecipient,
) {
  const taskId = taskIdForRecipient(recipient);
  return {
    ...taskKey(job.id, taskId),
    type: "BACKGROUND_JOB_TASK",
    jobId: job.id,
    taskId,
    kind: job.kind,
    mode: job.mode,
    status: "pending",
    recipient,
    attemptCount: 0,
    createdAt: job.createdAt,
    updatedAt: job.createdAt,
    leaseToken: null,
    leaseExpiresAt: null,
    deliveryStartedAt: null,
    providerMessageId: null,
    result: null,
    lastError: null,
    projectionCompletedAt: null,
    expires: job.expires,
  };
}

export async function getBackgroundJob(jobId: string) {
  const { tableName } = requireConfiguration();
  const response = await documentClient.get({ TableName: tableName, Key: jobKey(jobId), ConsistentRead: true });
  return toJob(response.Item);
}

export async function listBackgroundJobTasks(jobId: string) {
  const { tableName } = requireConfiguration();
  const tasks: BackgroundJobTaskRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const response = await documentClient.query({
      TableName: tableName,
      KeyConditionExpression: "#pk = :pk AND begins_with(#sk, :task)",
      ExpressionAttributeNames: { "#pk": "pk", "#sk": "sk" },
      ExpressionAttributeValues: { ":pk": `BACKGROUND_JOB#${jobId}`, ":task": "TASK#" },
      ConsistentRead: true,
      ExclusiveStartKey,
    });
    tasks.push(
      ...((response.Items || [])
        .map((item) => toTask(item))
        .filter(Boolean) as BackgroundJobTaskRecord[]),
    );
    ExclusiveStartKey = response.LastEvaluatedKey as Record<string, any> | undefined;
  } while (ExclusiveStartKey);
  return tasks;
}

export async function repairBuildingBackgroundJobSnapshot(job: BackgroundJobRecord) {
  const { tableName } = requireConfiguration();
  let tasks = await listBackgroundJobTasks(job.id);
  if (tasks.length !== job.recipientCount) {
    const recipients = await readAudienceManifest(job);
    const existingTaskIds = new Set(tasks.map((task) => task.taskId));
    const missingTaskItems = recipients
      .map((recipient) => taskItemForRecipient(job, recipient))
      .filter((item) => !existingTaskIds.has(item.taskId));
    await putImmutableItems(
      tableName,
      missingTaskItems,
      "Unable to materialize the complete background-job audience",
    );
    tasks = await listBackgroundJobTasks(job.id);
  }
  if (tasks.length !== job.recipientCount) {
    throw new Error("The background-job task snapshot is incomplete.");
  }
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: tableName,
    Key: jobKey(job.id),
    UpdateExpression:
      "SET #status = :pending, updatedAt = :now, snapshotCompletedAt = :now REMOVE buildError",
    ConditionExpression: "#status = :building",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":building": "building",
      ":pending": "dispatch_pending",
      ":now": now,
    },
  }).catch((error: any) => {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
  });
  return tasks;
}

function deriveProgress(tasks: BackgroundJobTaskRecord[]) {
  const progress = deriveJobProgress(tasks);
  return {
    status: progress.status,
    pendingCount: progress.pending,
    queuedCount: progress.queued,
    processingCount: progress.processing,
    sentCount: progress.sent,
    validatedCount: progress.validated,
    skippedCount: progress.skipped,
    failedCount: progress.failed,
    deliveryUnknownCount: progress.deliveryUnknown,
    canceledCount: progress.canceled,
  };
}

export async function refreshBackgroundJob(jobId: string) {
  const { tableName } = requireConfiguration();
  const tasks = await listBackgroundJobTasks(jobId);
  const progress = deriveProgress(tasks);
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: tableName,
    Key: jobKey(jobId),
    UpdateExpression:
      "SET #status = :status, updatedAt = :now, pendingCount = :pending, queuedCount = :queued, processingCount = :processing, sentCount = :sent, validatedCount = :validated, skippedCount = :skipped, failedCount = :failed, deliveryUnknownCount = :unknown, canceledCount = :canceled",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":status": progress.status,
      ":now": now,
      ":pending": progress.pendingCount,
      ":queued": progress.queuedCount,
      ":processing": progress.processingCount,
      ":sent": progress.sentCount,
      ":validated": progress.validatedCount,
      ":skipped": progress.skippedCount,
      ":failed": progress.failedCount,
      ":unknown": progress.deliveryUnknownCount,
      ":canceled": progress.canceledCount,
    },
  });
  return getBackgroundJob(jobId);
}

async function dispatchTasks(jobId: string, tasks: BackgroundJobTaskRecord[]) {
  const { tableName, queueUrl } = requireConfiguration();
  let dispatched = 0;
  const failures: string[] = [];
  for (let offset = 0; offset < tasks.length; offset += 10) {
    const batch = tasks.slice(offset, offset + 10);
    const response = await queueClient().send(new SendMessageBatchCommand({
      QueueUrl: queueUrl,
      Entries: batch.map((task, index) => ({
        Id: `task-${offset + index}`,
        MessageBody: JSON.stringify({ version: 1, jobId, taskId: task.taskId } satisfies BackgroundJobMessage),
      })),
    }));
    const successful = new Set((response.Successful || []).map((entry) => entry.Id));
    for (let index = 0; index < batch.length; index += 1) {
      const task = batch[index];
      if (!successful.has(`task-${offset + index}`)) {
        failures.push(task.taskId);
        continue;
      }
      dispatched += 1;
      await documentClient.update({
        TableName: tableName,
        Key: taskKey(jobId, task.taskId),
        UpdateExpression: "SET #status = :queued, updatedAt = :now, queuedAt = :now",
        ConditionExpression: "#status = :pending",
        ExpressionAttributeNames: { "#status": "status" },
        ExpressionAttributeValues: { ":pending": "pending", ":queued": "queued", ":now": new Date().toISOString() },
      }).catch((error: any) => {
        if (error?.name !== "ConditionalCheckFailedException") throw error;
      });
    }
  }
  await refreshBackgroundJob(jobId);
  return { dispatched, failedToDispatch: failures.length };
}

export async function prepareSingleRecipientBackgroundJob(input: EnqueueBackgroundJobInput) {
  const { tableName } = requireConfiguration();
  const recipients = normalizeRecipients(input.recipients);
  if (recipients.length !== 1) throw new Error("Atomic background-job staging requires exactly one recipient.");
  const mode = input.mode || "live";
  if (mode === "smoke") await assertSmokeRecipient(recipients[0]);
  const stableIdempotencyKey = input.idempotencyKey.trim();
  if (!stableIdempotencyKey || stableIdempotencyKey.length > 180) throw new Error("A valid idempotency key is required.");
  const fingerprint = requestFingerprint(input, recipients);
  const now = new Date().toISOString();
  const expires = Math.floor(Date.now() / 1000) + JOB_RETENTION_SECONDS;
  const jobId = backgroundJobIdForIdempotencyKey(stableIdempotencyKey);
  const recipient = recipients[0];
  const taskId = taskIdForRecipient(recipient);
  const jobItem = {
    ...jobKey(jobId),
    type: "BACKGROUND_JOB",
    jobId,
    kind: input.kind,
    mode,
    status: "building",
    sourceId: input.sourceId || null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy || null,
    payload: input.payload,
    idempotencyKey: stableIdempotencyKey,
    fingerprint,
    recipientCount: 1,
    pendingCount: 1,
    queuedCount: 0,
    processingCount: 0,
    sentCount: 0,
    validatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    deliveryUnknownCount: 0,
    canceledCount: 0,
    expires,
    GSI1PK: JOB_GSI_PK,
    GSI1SK: `${now}#${jobId}`,
  };
  const taskItem = {
    ...taskKey(jobId, taskId),
    type: "BACKGROUND_JOB_TASK",
    jobId,
    taskId,
    kind: input.kind,
    mode,
    status: "pending",
    recipient,
    attemptCount: 0,
    createdAt: now,
    updatedAt: now,
    leaseToken: null,
    leaseExpiresAt: null,
    deliveryStartedAt: null,
    providerMessageId: null,
    result: null,
    lastError: null,
    projectionCompletedAt: null,
    expires,
  };
  return {
    job: toJob(jobItem)!,
    task: toTask(taskItem)!,
    transactItems: [
      {
        Put: {
          TableName: tableName,
          Item: jobItem,
          ConditionExpression: "attribute_not_exists(#pk)",
          ExpressionAttributeNames: { "#pk": "pk" },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: taskItem,
          ConditionExpression: "attribute_not_exists(#pk)",
          ExpressionAttributeNames: { "#pk": "pk" },
        },
      },
      {
        Put: {
          TableName: tableName,
          Item: {
            ...idempotencyKey(stableIdempotencyKey),
            type: "BACKGROUND_JOB_IDEMPOTENCY",
            idempotencyKey: stableIdempotencyKey,
            fingerprint,
            jobId,
            createdAt: now,
            expires,
          },
          ConditionExpression: "attribute_not_exists(#pk)",
          ExpressionAttributeNames: { "#pk": "pk" },
        },
      },
    ],
  };
}

export async function dispatchStagedBackgroundJob(jobId: string) {
  const { tableName } = requireConfiguration();
  await documentClient.update({
    TableName: tableName,
    Key: jobKey(jobId),
    UpdateExpression: "SET #status = :pending, updatedAt = :now, snapshotCompletedAt = :now",
    ConditionExpression: "#status = :building",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":building": "building", ":pending": "dispatch_pending", ":now": new Date().toISOString() },
  }).catch((error: any) => {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
  });
  const pending = (await listBackgroundJobTasks(jobId)).filter((task) => task.status === "pending");
  return dispatchTasks(jobId, pending);
}

export async function enqueueBackgroundJob(input: EnqueueBackgroundJobInput) {
  const { tableName } = requireConfiguration();
  const recipients = normalizeRecipients(input.recipients);
  if (!recipients.length) throw new Error("Background job requires at least one recipient.");
  const mode = input.mode || "live";
  if (mode === "smoke") {
    if (recipients.length !== 1) throw new Error("Smoke jobs must contain exactly one recipient.");
    await assertSmokeRecipient(recipients[0]);
  }
  const stableIdempotencyKey = input.idempotencyKey.trim();
  if (!stableIdempotencyKey || stableIdempotencyKey.length > 180) {
    throw new Error("A valid idempotency key is required.");
  }
  const fingerprint = requestFingerprint(input, recipients);
  if (Buffer.byteLength(JSON.stringify(input.payload), "utf8") > 300_000) {
    throw new Error("Background-job content snapshot exceeds the safe DynamoDB item-size budget.");
  }
  if (recipients.some((recipient) => Buffer.byteLength(JSON.stringify(recipient), "utf8") > 50_000)) {
    throw new Error("A background-job recipient snapshot exceeds the safe DynamoDB item-size budget.");
  }

  const now = new Date().toISOString();
  const expires = Math.floor(Date.now() / 1000) + JOB_RETENTION_SECONDS;
  const jobId = backgroundJobIdForIdempotencyKey(stableIdempotencyKey);
  const audienceManifestPages = buildAudienceManifestPages(recipients);
  await persistAudienceManifest({
    tableName,
    jobId,
    fingerprint,
    pages: audienceManifestPages,
    createdAt: now,
    expires,
  });
  const jobItem = {
    ...jobKey(jobId),
    type: "BACKGROUND_JOB",
    jobId,
    kind: input.kind,
    mode,
    status: "building",
    sourceId: input.sourceId || null,
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy || null,
    payload: input.payload,
    idempotencyKey: stableIdempotencyKey,
    fingerprint,
    audienceManifestPageCount: audienceManifestPages.length,
    recipientCount: recipients.length,
    pendingCount: recipients.length,
    queuedCount: 0,
    processingCount: 0,
    sentCount: 0,
    validatedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    deliveryUnknownCount: 0,
    canceledCount: 0,
    expires,
    GSI1PK: JOB_GSI_PK,
    GSI1SK: `${now}#${jobId}`,
  };
  try {
    await documentClient.transactWrite({
      TransactItems: [
        {
          Put: {
            TableName: tableName,
            Item: jobItem,
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          },
        },
        {
          Put: {
            TableName: tableName,
            Item: {
              ...idempotencyKey(stableIdempotencyKey),
              type: "BACKGROUND_JOB_IDEMPOTENCY",
              idempotencyKey: stableIdempotencyKey,
              fingerprint,
              jobId,
              createdAt: now,
              expires,
            },
            ConditionExpression: "attribute_not_exists(#pk)",
            ExpressionAttributeNames: { "#pk": "pk" },
          },
        },
      ],
    });
  } catch (error: any) {
    if (error?.name !== "TransactionCanceledException") throw error;
    const existing = await documentClient.get({
      TableName: tableName,
      Key: idempotencyKey(stableIdempotencyKey),
      ConsistentRead: true,
    });
    if (!existing.Item?.jobId || existing.Item.fingerprint !== fingerprint) {
      throw new Error("That idempotency key was already used for a different request.");
    }
    const job = await getBackgroundJob(String(existing.Item.jobId));
    if (!job) throw new Error("The idempotent background job could not be loaded.");
    if (job.status !== "building") {
      return { job, duplicate: true, dispatched: 0, failedToDispatch: 0 };
    }
    const recoveredTasks = await repairBuildingBackgroundJobSnapshot(job);
    const recoveredDispatch = await dispatchTasks(
      job.id,
      recoveredTasks.filter((task) => task.status === "pending"),
    ).catch(() => ({ dispatched: 0, failedToDispatch: recoveredTasks.length }));
    return {
      job: (await getBackgroundJob(job.id)) || job,
      duplicate: true,
      ...recoveredDispatch,
    };
  }

  const persistedJob = toJob(jobItem)!;
  let tasks: BackgroundJobTaskRecord[];
  try {
    tasks = await repairBuildingBackgroundJobSnapshot(persistedJob);
  } catch (error) {
    await documentClient.update({
      TableName: tableName,
      Key: jobKey(jobId),
      UpdateExpression: "SET updatedAt = :now, buildError = :error",
      ConditionExpression: "#status = :building",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":building": "building",
        ":now": new Date().toISOString(),
        ":error": safeError(error),
      },
    }).catch(() => undefined);
    throw error;
  }

  const dispatch = await dispatchTasks(jobId, tasks).catch(() => ({
    dispatched: 0,
    failedToDispatch: tasks.length,
  }));
  const job = await getBackgroundJob(jobId);
  if (!job) throw new Error("Background job was persisted but could not be loaded.");
  return { job, duplicate: false, ...dispatch };
}

export async function listBackgroundJobs(limit = 30) {
  const { tableName } = requireConfiguration();
  const requested = Math.min(Math.max(limit, 1), 1000);
  const items: BackgroundJobRecord[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const response = await documentClient.query({
      TableName: tableName,
      IndexName: "GSI1",
      KeyConditionExpression: "#gsi1pk = :pk",
      ExpressionAttributeNames: { "#gsi1pk": "GSI1PK" },
      ExpressionAttributeValues: { ":pk": JOB_GSI_PK },
      ScanIndexForward: false,
      Limit: Math.min(requested - items.length, 100),
      ExclusiveStartKey,
    });
    items.push(...(response.Items || []).map((item) => toJob(item)).filter(Boolean) as BackgroundJobRecord[]);
    ExclusiveStartKey = response.LastEvaluatedKey as Record<string, any> | undefined;
  } while (ExclusiveStartKey && items.length < requested);
  return items.slice(0, requested);
}

export async function claimBackgroundJobTask(jobId: string, taskId: string): Promise<ClaimResult> {
  const { tableName } = requireConfiguration();
  const [job, existingResponse] = await Promise.all([
    getBackgroundJob(jobId),
    documentClient.get({ TableName: tableName, Key: taskKey(jobId, taskId), ConsistentRead: true }),
  ]);
  const existing = toTask(existingResponse.Item);
  if (!job || !existing) return { outcome: "missing" };
  if (TERMINAL_TASK_STATUSES.has(existing.status)) return { outcome: "terminal", job, task: existing };
  if (job.status === "canceled") return { outcome: "terminal", job, task: existing };
  const now = new Date();
  const leaseToken = randomUUID();
  const leaseExpiresAt = new Date(now.getTime() + LEASE_SECONDS * 1000).toISOString();
  try {
    const response = await documentClient.update({
      TableName: tableName,
      Key: taskKey(jobId, taskId),
      UpdateExpression:
        "SET #status = :processing, updatedAt = :now, startedAt = if_not_exists(startedAt, :now), leaseToken = :leaseToken, leaseExpiresAt = :leaseExpiresAt, attemptCount = if_not_exists(attemptCount, :zero) + :one REMOVE lastError",
      ConditionExpression:
        "#status IN (:pending, :queued) OR (#status = :processing AND leaseExpiresAt < :now AND attribute_not_exists(deliveryStartedAt))",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: {
        ":pending": "pending",
        ":queued": "queued",
        ":processing": "processing",
        ":now": now.toISOString(),
        ":leaseToken": leaseToken,
        ":leaseExpiresAt": leaseExpiresAt,
        ":zero": 0,
        ":one": 1,
      },
      ReturnValues: "ALL_NEW",
    });
    return { outcome: "claimed", job, task: toTask(response.Attributes)!, leaseToken };
  } catch (error: any) {
    if (error?.name !== "ConditionalCheckFailedException") throw error;
    return { outcome: "busy", job, task: existing };
  }
}

export async function markBackgroundJobDeliveryStarted(jobId: string, taskId: string, leaseToken: string) {
  const { tableName } = requireConfiguration();
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: tableName,
    Key: taskKey(jobId, taskId),
    UpdateExpression: "SET deliveryStartedAt = :now, updatedAt = :now",
    ConditionExpression: "#status = :processing AND leaseToken = :leaseToken",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":processing": "processing", ":leaseToken": leaseToken, ":now": now },
  });
}

export async function completeBackgroundJobTask({
  jobId,
  taskId,
  leaseToken,
  status,
  providerMessageId,
  result,
  error,
}: {
  jobId: string;
  taskId: string;
  leaseToken: string;
  status: Extract<BackgroundJobTaskStatus, "sent" | "validated" | "skipped" | "failed" | "delivery_unknown">;
  providerMessageId?: string | null;
  result?: Record<string, unknown> | null;
  error?: unknown;
}) {
  const { tableName } = requireConfiguration();
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: tableName,
    Key: taskKey(jobId, taskId),
    UpdateExpression:
      "SET #status = :status, updatedAt = :now, completedAt = :now, providerMessageId = :messageId, #result = :result, lastError = :error REMOVE leaseToken, leaseExpiresAt",
    ConditionExpression: "#status = :processing AND leaseToken = :leaseToken",
    ExpressionAttributeNames: { "#status": "status", "#result": "result" },
    ExpressionAttributeValues: {
      ":processing": "processing",
      ":status": status,
      ":leaseToken": leaseToken,
      ":now": now,
      ":messageId": providerMessageId || null,
      ":result": result || null,
      ":error": error ? safeError(error) : null,
    },
  });
  try {
    return await refreshBackgroundJob(jobId);
  } catch (error) {
    console.error("Background-job task completed but parent progress refresh failed", {
      jobId,
      taskId,
      error: safeError(error),
    });
    return getBackgroundJob(jobId).catch(() => null);
  }
}

export async function releaseBackgroundJobTaskForRetry({
  jobId,
  taskId,
  leaseToken,
  error,
}: {
  jobId: string;
  taskId: string;
  leaseToken: string;
  error: unknown;
}) {
  const { tableName } = requireConfiguration();
  const current = await documentClient.get({ TableName: tableName, Key: taskKey(jobId, taskId), ConsistentRead: true });
  const task = toTask(current.Item);
  if (!task) return null;
  if (TERMINAL_TASK_STATUSES.has(task.status)) {
    return refreshBackgroundJob(jobId).catch(() => getBackgroundJob(jobId));
  }
  if (task.deliveryStartedAt) {
    return completeBackgroundJobTask({
      jobId,
      taskId,
      leaseToken,
      status: "delivery_unknown",
      error: new Error(
        `Processing failed after delivery began: ${safeError(error)}`,
      ),
    });
  }
  if (task.attemptCount >= MAX_ATTEMPTS) {
    return completeBackgroundJobTask({ jobId, taskId, leaseToken, status: "failed", error });
  }
  await documentClient.update({
    TableName: tableName,
    Key: taskKey(jobId, taskId),
    UpdateExpression: "SET #status = :pending, updatedAt = :now, lastError = :error REMOVE leaseToken, leaseExpiresAt",
    ConditionExpression: "#status = :processing AND leaseToken = :leaseToken",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: {
      ":processing": "processing",
      ":pending": "pending",
      ":leaseToken": leaseToken,
      ":now": new Date().toISOString(),
      ":error": safeError(error),
    },
  });
  await refreshBackgroundJob(jobId);
  return null;
}

export async function retryBackgroundJob(
  jobId: string,
  {
    acknowledgeDeliveryUnknown = false,
    deliveryUnknownTaskIds = [],
  }: {
    acknowledgeDeliveryUnknown?: boolean;
    deliveryUnknownTaskIds?: string[];
  } = {},
) {
  const { tableName } = requireConfiguration();
  const tasks = await listBackgroundJobTasks(jobId);
  const deliveryUnknown = tasks.filter((task) => task.status === "delivery_unknown");
  const requestedUnknownIds = new Set(deliveryUnknownTaskIds);
  if (requestedUnknownIds.size && !acknowledgeDeliveryUnknown) {
    throw new Error(
      "Retrying delivery-uncertain recipients requires explicit duplicate-delivery acknowledgement.",
    );
  }
  const availableUnknownIds = new Set(deliveryUnknown.map((task) => task.taskId));
  if ([...requestedUnknownIds].some((taskId) => !availableUnknownIds.has(taskId))) {
    throw new Error("A requested delivery-uncertain task is no longer eligible for retry.");
  }
  const retryable = tasks.filter(
    (task) =>
      task.status === "failed" ||
      (acknowledgeDeliveryUnknown &&
        task.status === "delivery_unknown" &&
        requestedUnknownIds.has(task.taskId)),
  );
  if (!retryable.length) throw new Error("This job has no failed recipients to retry.");
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: tableName,
    Key: jobKey(jobId),
    UpdateExpression: "SET #status = :pending, updatedAt = :now, retryRequestedAt = :now",
    ConditionExpression: "attribute_exists(#pk) AND #status IN (:completed, :partial, :failed, :review)",
    ExpressionAttributeNames: { "#pk": "pk", "#status": "status" },
    ExpressionAttributeValues: {
      ":pending": "dispatch_pending",
      ":completed": "completed",
      ":partial": "partial",
      ":failed": "failed",
      ":review": "needs_review",
      ":now": now,
    },
  });
  for (const task of retryable) {
    await documentClient.update({
      TableName: tableName,
      Key: taskKey(jobId, task.taskId),
      UpdateExpression:
        "SET #status = :pending, updatedAt = :now, retryRequestedAt = :now REMOVE leaseToken, leaseExpiresAt, deliveryStartedAt, providerMessageId, #result, lastError, projectionCompletedAt",
      ConditionExpression: "#status IN (:failed, :unknown)",
      ExpressionAttributeNames: { "#status": "status", "#result": "result" },
      ExpressionAttributeValues: { ":pending": "pending", ":failed": "failed", ":unknown": "delivery_unknown", ":now": now },
    });
  }
  const pending = (await listBackgroundJobTasks(jobId)).filter((task) => task.status === "pending");
  const dispatch = await dispatchTasks(jobId, pending);
  return { job: await getBackgroundJob(jobId), ...dispatch };
}

export async function markBackgroundJobTaskProjectionCompleted(
  jobId: string,
  taskId: string,
) {
  const { tableName } = requireConfiguration();
  const now = new Date().toISOString();
  await documentClient.update({
    TableName: tableName,
    Key: taskKey(jobId, taskId),
    UpdateExpression:
      "SET projectionCompletedAt = if_not_exists(projectionCompletedAt, :now), updatedAt = :now",
    ConditionExpression: "#status = :sent",
    ExpressionAttributeNames: { "#status": "status" },
    ExpressionAttributeValues: { ":sent": "sent", ":now": now },
  });
}

export async function cancelBackgroundJob(jobId: string) {
  const { tableName } = requireConfiguration();
  const tasks = await listBackgroundJobTasks(jobId);
  for (const task of tasks.filter((candidate) => candidate.status === "pending" || candidate.status === "queued")) {
    await documentClient.update({
      TableName: tableName,
      Key: taskKey(jobId, task.taskId),
      UpdateExpression: "SET #status = :canceled, updatedAt = :now, completedAt = :now",
      ConditionExpression: "#status IN (:pending, :queued)",
      ExpressionAttributeNames: { "#status": "status" },
      ExpressionAttributeValues: { ":pending": "pending", ":queued": "queued", ":canceled": "canceled", ":now": new Date().toISOString() },
    }).catch((error: any) => {
      if (error?.name !== "ConditionalCheckFailedException") throw error;
    });
  }
  return refreshBackgroundJob(jobId);
}

export async function reconcileBackgroundJobs() {
  const { tableName } = requireConfiguration();
  const jobs = await listBackgroundJobs(1000);
  const active = jobs.filter((job) => !TERMINAL_JOB_STATUSES.has(job.status));
  let dispatched = 0;
  let deliveryUnknown = 0;
  for (const job of active) {
    let tasks = await listBackgroundJobTasks(job.id);
    if (job.status === "building") {
      try {
        tasks = await repairBuildingBackgroundJobSnapshot(job);
      } catch (error) {
        await documentClient.update({
          TableName: tableName,
          Key: jobKey(job.id),
          UpdateExpression: "SET updatedAt = :now, buildError = :error",
          ConditionExpression: "#status = :building",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: {
            ":building": "building",
            ":now": new Date().toISOString(),
            ":error": safeError(error),
          },
        }).catch(() => undefined);
        continue;
      }
    }
    const now = new Date().toISOString();
    for (const task of tasks.filter((candidate) =>
      candidate.status === "processing" && !!candidate.leaseExpiresAt && candidate.leaseExpiresAt < now,
    )) {
      if (task.deliveryStartedAt) {
        await documentClient.update({
          TableName: tableName,
          Key: taskKey(job.id, task.taskId),
          UpdateExpression: "SET #status = :unknown, updatedAt = :now, completedAt = :now, lastError = :error REMOVE leaseToken, leaseExpiresAt",
          ConditionExpression: "#status = :processing AND leaseExpiresAt < :now",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":processing": "processing", ":unknown": "delivery_unknown", ":now": now, ":error": "Delivery outcome is unknown after an expired provider-call lease; manual review is required." },
        }).catch(() => undefined);
        deliveryUnknown += 1;
      } else {
        await documentClient.update({
          TableName: tableName,
          Key: taskKey(job.id, task.taskId),
          UpdateExpression: "SET #status = :pending, updatedAt = :now REMOVE leaseToken, leaseExpiresAt",
          ConditionExpression: "#status = :processing AND leaseExpiresAt < :now AND attribute_not_exists(deliveryStartedAt)",
          ExpressionAttributeNames: { "#status": "status" },
          ExpressionAttributeValues: { ":processing": "processing", ":pending": "pending", ":now": now },
        }).catch(() => undefined);
      }
    }
    tasks = await listBackgroundJobTasks(job.id);
    const pending = tasks.filter((task) => task.status === "pending");
    if (pending.length) {
      const result = await dispatchTasks(job.id, pending).catch(() => ({ dispatched: 0, failedToDispatch: pending.length }));
      dispatched += result.dispatched;
    } else {
      await refreshBackgroundJob(job.id);
    }
  }
  return { inspectedJobs: active.length, dispatched, deliveryUnknown };
}

export function isAuthorizedBackgroundJobRequest(request: Request) {
  const secret = process.env.BACKGROUND_JOBS_INTERNAL_SECRET || "";
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (secret.length < 32 || supplied.length !== secret.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(secret));
}

export function isTerminalBackgroundJobTask(status: BackgroundJobTaskStatus) {
  return TERMINAL_TASK_STATUSES.has(status);
}

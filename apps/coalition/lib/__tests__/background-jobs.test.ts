import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

const dynamoMocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  query: vi.fn(),
  update: vi.fn(),
  batchWrite: vi.fn(),
  transactWrite: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dynamodb", () => ({
  documentClient: dynamoMocks,
  TABLE_NAME: "ApplicationTable",
}));
vi.mock("@/lib/admin/email-transport", () => ({
  normalizeEmail: (value: unknown) =>
    typeof value === "string" ? value.trim().toLowerCase() : "",
}));

import {
  assertSmokeRecipient,
  isAuthorizedBackgroundJobRequest,
  listBackgroundJobTasks,
  repairBuildingBackgroundJobSnapshot,
  releaseBackgroundJobTaskForRetry,
  retryBackgroundJob,
} from "@/lib/admin/background-jobs";

const originalEnvironment = { ...process.env };

const recipient = {
  recipientKey: "admin-1",
  userId: "admin-1",
  email: "paul@paulbrigner.com",
};

const taskItem = (overrides: Record<string, unknown> = {}) => ({
  pk: "BACKGROUND_JOB#job-1",
  sk: "TASK#task-1",
  type: "BACKGROUND_JOB_TASK",
  jobId: "job-1",
  taskId: "task-1",
  kind: "newsletter",
  mode: "live",
  status: "processing",
  recipient,
  attemptCount: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:00:00.000Z",
  leaseToken: "lease-1",
  leaseExpiresAt: "2026-07-19T00:02:00.000Z",
  deliveryStartedAt: null,
  providerMessageId: null,
  result: null,
  lastError: null,
  expires: 2_000_000_000,
  ...overrides,
});

const jobItem = {
  pk: "BACKGROUND_JOB#job-1",
  sk: "BACKGROUND_JOB#job-1",
  type: "BACKGROUND_JOB",
  jobId: "job-1",
  kind: "newsletter",
  mode: "live",
  status: "needs_review",
  sourceId: "newsletter-1",
  createdAt: "2026-07-19T00:00:00.000Z",
  updatedAt: "2026-07-19T00:03:00.000Z",
  createdBy: "admin-1",
  payload: {},
  idempotencyKey: "key-1",
  recipientCount: 1,
  pendingCount: 0,
  queuedCount: 0,
  processingCount: 0,
  sentCount: 0,
  validatedCount: 0,
  skippedCount: 0,
  failedCount: 0,
  deliveryUnknownCount: 1,
  canceledCount: 0,
  expires: 2_000_000_000,
};

describe("durable background-job safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = {
      ...originalEnvironment,
      BACKGROUND_JOBS_ENABLED: "true",
      BACKGROUND_JOBS_TABLE: "JobsTable",
      BACKGROUND_JOBS_QUEUE_URL: "https://sqs.us-east-1.amazonaws.com/123/jobs",
      BACKGROUND_JOB_SMOKE_ALLOWLIST:
        "paul@paulbrigner.com,div@accrediv.com",
    };
    dynamoMocks.update.mockResolvedValue({});
  });

  afterEach(() => {
    process.env = { ...originalEnvironment };
  });

  it("fails closed if the configured smoke allowlist contains anyone else", async () => {
    process.env.BACKGROUND_JOB_SMOKE_ALLOWLIST =
      "paul@paulbrigner.com,member@example.com";

    await expect(assertSmokeRecipient(recipient)).rejects.toThrow(
      "The smoke allowlist may contain only Paul and Div.",
    );
    expect(dynamoMocks.get).not.toHaveBeenCalled();
  });

  it.each([
    { isAdmin: false, membershipStatus: "active", accountStatus: "active" },
    { isAdmin: true, membershipStatus: "unverified", accountStatus: "active" },
    { isAdmin: true, membershipStatus: "active", accountStatus: "deactivated" },
    { isAdmin: true, membershipStatus: "active", accountStatus: "active", emailSuppressed: true },
  ])("rejects a smoke recipient who is not currently an eligible admin", async (state) => {
    dynamoMocks.get.mockResolvedValue({
      Item: { id: "admin-1", email: recipient.email, ...state },
    });

    await expect(assertSmokeRecipient(recipient)).rejects.toThrow(
      "Smoke recipient must still be an active, unsuppressed administrator.",
    );
  });

  it("accepts an allowlisted active, unsuppressed administrator", async () => {
    dynamoMocks.get.mockResolvedValue({
      Item: {
        id: "admin-1",
        email: recipient.email,
        isAdmin: true,
        membershipStatus: "active",
        accountStatus: "active",
        emailSuppressed: false,
      },
    });

    await expect(assertSmokeRecipient(recipient)).resolves.toBeUndefined();
  });

  it("marks post-delivery processing failures for review instead of retrying", async () => {
    dynamoMocks.get
      .mockResolvedValueOnce({
        Item: taskItem({ deliveryStartedAt: "2026-07-19T00:01:00.000Z" }),
      })
      .mockResolvedValueOnce({ Item: jobItem });
    dynamoMocks.query.mockResolvedValue({
      Items: [taskItem({ status: "delivery_unknown", deliveryStartedAt: "2026-07-19T00:01:00.000Z" })],
    });

    await releaseBackgroundJobTaskForRetry({
      jobId: "job-1",
      taskId: "task-1",
      leaseToken: "lease-1",
      error: new Error("provider outcome unavailable"),
    });

    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "BACKGROUND_JOB#job-1", sk: "TASK#task-1" },
        ExpressionAttributeValues: expect.objectContaining({
          ":status": "delivery_unknown",
          ":leaseToken": "lease-1",
        }),
      }),
    );
    expect(dynamoMocks.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        ExpressionAttributeValues: expect.objectContaining({ ":pending": "pending" }),
      }),
    );
  });

  it("paginates through every task in a large job", async () => {
    dynamoMocks.query
      .mockResolvedValueOnce({
        Items: [taskItem({ taskId: "task-1", sk: "TASK#task-1" })],
        LastEvaluatedKey: { pk: "BACKGROUND_JOB#job-1", sk: "TASK#task-1" },
      })
      .mockResolvedValueOnce({
        Items: [taskItem({ taskId: "task-2", sk: "TASK#task-2" })],
      });

    await expect(listBackgroundJobTasks("job-1")).resolves.toHaveLength(2);
    expect(dynamoMocks.query).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        ExclusiveStartKey: {
          pk: "BACKGROUND_JOB#job-1",
          sk: "TASK#task-1",
        },
      }),
    );
  });

  it("repairs a partially materialized building job from its durable audience manifest", async () => {
    const secondRecipient = {
      recipientKey: "admin-2",
      userId: "admin-2",
      email: "div@accrediv.com",
    };
    const fingerprint = "f".repeat(64);
    const firstTaskId = createHash("sha256").update(recipient.recipientKey).digest("hex").slice(0, 40);
    const secondTaskId = createHash("sha256").update(secondRecipient.recipientKey).digest("hex").slice(0, 40);
    const secondTask = taskItem({
      sk: `TASK#${secondTaskId}`,
      taskId: secondTaskId,
      status: "pending",
      recipient: secondRecipient,
      leaseToken: null,
      leaseExpiresAt: null,
    });
    dynamoMocks.query
      .mockResolvedValueOnce({
        Items: [taskItem({ sk: `TASK#${firstTaskId}`, taskId: firstTaskId, status: "pending" })],
      })
      .mockResolvedValueOnce({
        Items: [{
          type: "BACKGROUND_JOB_AUDIENCE_PAGE",
          fingerprint,
          pageIndex: 0,
          pageCount: 1,
          recipients: [recipient, secondRecipient],
        }],
      })
      .mockResolvedValueOnce({
        Items: [
          taskItem({ sk: `TASK#${firstTaskId}`, taskId: firstTaskId, status: "pending" }),
          secondTask,
        ],
      });

    const repaired = await repairBuildingBackgroundJobSnapshot({
      ...jobItem,
      id: "job-1",
      kind: "newsletter",
      mode: "live",
      status: "building",
      fingerprint,
      audienceManifestPageCount: 1,
      recipientCount: 2,
      pendingCount: 2,
      deliveryUnknownCount: 0,
    });

    expect(repaired).toHaveLength(2);
    expect(dynamoMocks.put).toHaveBeenCalledTimes(1);
    expect(dynamoMocks.put).toHaveBeenCalledWith(
      expect.objectContaining({
        TableName: "JobsTable",
        Item: expect.objectContaining({ recipient: secondRecipient, status: "pending" }),
        ConditionExpression: "attribute_not_exists(#pk)",
      }),
    );
    expect(dynamoMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({
        Key: { pk: "BACKGROUND_JOB#job-1", sk: "BACKGROUND_JOB#job-1" },
        ExpressionAttributeValues: expect.objectContaining({
          ":building": "building",
          ":pending": "dispatch_pending",
        }),
      }),
    );
  });

  it("does not retry a delivery-uncertain task without a targeted acknowledgement", async () => {
    dynamoMocks.query.mockResolvedValueOnce({
      Items: [taskItem({ status: "delivery_unknown" })],
    });

    await expect(retryBackgroundJob("job-1")).rejects.toThrow(
      "This job has no failed recipients to retry.",
    );
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("rejects targeted delivery-uncertain retries unless duplicate delivery is acknowledged", async () => {
    dynamoMocks.query.mockResolvedValueOnce({
      Items: [taskItem({ status: "delivery_unknown" })],
    });

    await expect(
      retryBackgroundJob("job-1", { deliveryUnknownTaskIds: ["task-1"] }),
    ).rejects.toThrow(
      "Retrying delivery-uncertain recipients requires explicit duplicate-delivery acknowledgement.",
    );
    expect(dynamoMocks.update).not.toHaveBeenCalled();
  });

  it("reactivates the parent before resetting only explicitly acknowledged uncertain tasks", async () => {
    dynamoMocks.query
      .mockResolvedValueOnce({
        Items: [
          taskItem({ taskId: "task-1", sk: "TASK#task-1", status: "delivery_unknown" }),
          taskItem({ taskId: "task-2", sk: "TASK#task-2", status: "delivery_unknown" }),
        ],
      })
      .mockResolvedValue({ Items: [] });
    dynamoMocks.get.mockResolvedValue({ Item: jobItem });

    await retryBackgroundJob("job-1", {
      acknowledgeDeliveryUnknown: true,
      deliveryUnknownTaskIds: ["task-1"],
    });

    const parentReactivation = dynamoMocks.update.mock.calls.findIndex(
      ([input]) =>
        input.Key.sk === "BACKGROUND_JOB#job-1" &&
        input.ExpressionAttributeValues?.[":pending"] === "dispatch_pending",
    );
    const taskReset = dynamoMocks.update.mock.calls.findIndex(
      ([input]) =>
        input.Key.sk === "TASK#task-1" &&
        input.ExpressionAttributeValues?.[":pending"] === "pending",
    );
    expect(parentReactivation).toBeGreaterThanOrEqual(0);
    expect(taskReset).toBeGreaterThan(parentReactivation);
    expect(dynamoMocks.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ Key: { pk: "BACKGROUND_JOB#job-1", sk: "TASK#task-2" } }),
    );
  });

  it("requires a 32-byte shared secret for internal worker requests", () => {
    process.env.BACKGROUND_JOBS_INTERNAL_SECRET = "short";
    expect(
      isAuthorizedBackgroundJobRequest(
        new Request("https://community.pgpz.org/api/internal/background-jobs/process", {
          headers: { authorization: "Bearer short" },
        }),
      ),
    ).toBe(false);
  });
});

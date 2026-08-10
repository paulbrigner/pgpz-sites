import "server-only";

import { SendMessageBatchCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  configureBackgroundJobRuntime,
  type BackgroundJobQueueBatch,
} from "@pgpz/background-jobs";
import { awsRuntimeClientConfig } from "@/lib/aws-runtime";
import { normalizeEmail } from "@/lib/admin/email-transport";
import { documentClient, TABLE_NAME as APPLICATION_TABLE_NAME } from "@/lib/dynamodb";

let sqsClient: SQSClient | null = null;

function queueClient() {
  if (!sqsClient) {
    sqsClient = new SQSClient(
      awsRuntimeClientConfig(process.env.REGION_AWS || process.env.AWS_REGION || "us-east-1"),
    );
  }
  return sqsClient;
}

configureBackgroundJobRuntime({
  documentClient,
  applicationTableName: APPLICATION_TABLE_NAME,
  normalizeEmail,
  sendMessageBatch: (input: BackgroundJobQueueBatch) =>
    queueClient().send(new SendMessageBatchCommand(input)),
});

export {
  assertSmokeRecipient,
  backgroundJobIdForIdempotencyKey,
  cancelBackgroundJob,
  claimBackgroundJobTask,
  completeBackgroundJobTask,
  dispatchStagedBackgroundJob,
  enqueueBackgroundJob,
  getBackgroundJob,
  getCurrentEligibleRecipient,
  isAuthorizedBackgroundJobRequest,
  isTerminalBackgroundJobTask,
  listBackgroundJobs,
  listBackgroundJobsPage,
  listBackgroundJobTasks,
  listBackgroundJobTasksPage,
  markBackgroundJobDeliveryStarted,
  markBackgroundJobTaskProjectionCompleted,
  prepareSingleRecipientBackgroundJob,
  reconcileBackgroundJobs,
  refreshBackgroundJob,
  releaseBackgroundJobTaskForRetry,
  repairBuildingBackgroundJobSnapshot,
  retryBackgroundJob,
} from "@pgpz/background-jobs";
export type {
  BackgroundJobKind,
  BackgroundJobMessage,
  BackgroundJobMode,
  BackgroundJobPage,
  BackgroundJobRecipient,
  BackgroundJobRecord,
  BackgroundJobStatus,
  BackgroundJobTaskPage,
  BackgroundJobTaskRecord,
  BackgroundJobTaskStatus,
  EnqueueBackgroundJobInput,
} from "@pgpz/background-jobs";

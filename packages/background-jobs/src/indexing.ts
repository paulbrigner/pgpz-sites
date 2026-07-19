import type { BackgroundJobStatus, BackgroundJobTaskStatus } from "./contracts";

export const BACKGROUND_JOB_RECENT_INDEX = "GSI1";
export const BACKGROUND_JOB_STATUS_INDEX = "GSI2";

export type BackgroundJobIndexKeys = Readonly<{
  GSI1PK?: string;
  GSI1SK?: string;
  GSI2PK?: string;
  GSI2SK?: string;
}>;

export function recentJobIndexKeys({
  jobId,
  createdAt,
}: Readonly<{ jobId: string; createdAt: string }>): BackgroundJobIndexKeys {
  return {
    GSI1PK: "BACKGROUND_JOB",
    GSI1SK: `${createdAt}#${jobId}`,
  };
}

export function jobStatusIndexKeys({
  jobId,
  status,
  updatedAt,
}: Readonly<{
  jobId: string;
  status: BackgroundJobStatus;
  updatedAt: string;
}>): BackgroundJobIndexKeys {
  return {
    GSI2PK: `BACKGROUND_JOB_STATUS#${status}`,
    GSI2SK: `${updatedAt}#${jobId}`,
  };
}

export function taskStatusIndexKeys({
  jobId,
  taskId,
  status,
  updatedAt,
}: Readonly<{
  jobId: string;
  taskId: string;
  status: BackgroundJobTaskStatus;
  updatedAt: string;
}>): BackgroundJobIndexKeys {
  return {
    GSI2PK: `BACKGROUND_JOB#${jobId}#TASK_STATUS#${status}`,
    GSI2SK: `${updatedAt}#${taskId}`,
  };
}

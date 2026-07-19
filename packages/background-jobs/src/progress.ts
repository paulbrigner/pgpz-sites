import type {
  BackgroundJobProgress,
  BackgroundJobStatus,
  BackgroundJobTask,
  BackgroundJobTaskStatus,
} from "./contracts";
import { isActiveTaskStatus, isRetryableTaskStatus, isTerminalTaskStatus } from "./state-machine";

type TaskOrStatus = BackgroundJobTaskStatus | Pick<BackgroundJobTask, "status">;

function statusOf(task: TaskOrStatus): BackgroundJobTaskStatus {
  return typeof task === "string" ? task : task.status;
}

function aggregateStatus(counts: {
  total: number;
  pending: number;
  queued: number;
  processing: number;
  sent: number;
  validated: number;
  skipped: number;
  failed: number;
  deliveryUnknown: number;
  canceled: number;
}): BackgroundJobStatus {
  if (counts.total === 0) return "building";
  const successful = counts.sent + counts.validated + counts.skipped;
  const completed = successful + counts.failed + counts.deliveryUnknown + counts.canceled;

  if (completed < counts.total) {
    if (counts.processing > 0 || successful > 0) return "running";
    if (counts.queued > 0) return "queued";
    return "dispatch_pending";
  }

  if (counts.deliveryUnknown > 0) return "needs_review";
  if (counts.failed > 0 && successful > 0) return "partial";
  if (counts.failed > 0) return "failed";
  if (counts.canceled === counts.total) return "canceled";
  if (counts.canceled > 0 && successful > 0) return "partial";
  return "completed";
}

/** Derives display-safe counts from the task records rather than trusting counters. */
export function deriveJobProgress(tasks: readonly TaskOrStatus[]): BackgroundJobProgress {
  const counts = {
    pending: 0,
    queued: 0,
    processing: 0,
    sent: 0,
    validated: 0,
    skipped: 0,
    failed: 0,
    deliveryUnknown: 0,
    canceled: 0,
  };

  let completed = 0;
  let active = 0;
  let retryable = 0;

  for (const task of tasks) {
    const status = statusOf(task);
    switch (status) {
      case "pending":
        counts.pending += 1;
        break;
      case "queued":
        counts.queued += 1;
        break;
      case "processing":
        counts.processing += 1;
        break;
      case "sent":
        counts.sent += 1;
        break;
      case "validated":
        counts.validated += 1;
        break;
      case "skipped":
        counts.skipped += 1;
        break;
      case "failed":
        counts.failed += 1;
        break;
      case "delivery_unknown":
        counts.deliveryUnknown += 1;
        break;
      case "canceled":
        counts.canceled += 1;
        break;
    }

    if (isTerminalTaskStatus(status)) completed += 1;
    if (isActiveTaskStatus(status)) active += 1;
    if (isRetryableTaskStatus(status)) retryable += 1;
  }

  const total = tasks.length;
  return {
    status: aggregateStatus({ total, ...counts }),
    total,
    completed,
    active,
    retryable,
    ...counts,
    percentComplete: total === 0 ? 0 : Math.floor((completed / total) * 100),
  };
}

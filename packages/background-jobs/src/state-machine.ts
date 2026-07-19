import type { BackgroundJobStatus, BackgroundJobTask, BackgroundJobTaskStatus } from "./contracts";

const TERMINAL_JOB_STATUSES = new Set<BackgroundJobStatus>([
  "completed",
  "partial",
  "failed",
  "needs_review",
  "canceled",
]);

const ACTIVE_JOB_STATUSES = new Set<BackgroundJobStatus>([
  "building",
  "dispatch_pending",
  "queued",
  "running",
]);

const TERMINAL_TASK_STATUSES = new Set<BackgroundJobTaskStatus>([
  "sent",
  "validated",
  "skipped",
  "failed",
  "delivery_unknown",
  "canceled",
]);

const ACTIVE_TASK_STATUSES = new Set<BackgroundJobTaskStatus>([
  "pending",
  "queued",
  "processing",
]);

const RETRYABLE_TASK_STATUSES = new Set<BackgroundJobTaskStatus>([
  "failed",
]);

const JOB_TRANSITIONS: Readonly<Record<BackgroundJobStatus, ReadonlySet<BackgroundJobStatus>>> = {
  building: new Set(["dispatch_pending", "failed", "canceled"]),
  dispatch_pending: new Set(["queued", "running", "failed", "canceled"]),
  queued: new Set(["running", "completed", "partial", "failed", "needs_review", "canceled"]),
  running: new Set([
    "queued",
    "dispatch_pending",
    "completed",
    "partial",
    "failed",
    "needs_review",
    "canceled",
  ]),
  completed: new Set(),
  partial: new Set(["dispatch_pending", "queued", "running"]),
  failed: new Set(["dispatch_pending", "queued", "running"]),
  // `dispatch_pending` is reserved for an operator-authorized retry of an
  // explicitly selected delivery-unknown task. It is never an automatic
  // transition; `isRetryableTaskStatus` intentionally excludes that state.
  needs_review: new Set(["dispatch_pending", "completed", "partial", "failed", "canceled"]),
  canceled: new Set(),
};

const TASK_TRANSITIONS: Readonly<
  Record<BackgroundJobTaskStatus, ReadonlySet<BackgroundJobTaskStatus>>
> = {
  pending: new Set(["queued", "skipped", "canceled"]),
  queued: new Set(["pending", "processing", "skipped", "canceled"]),
  processing: new Set([
    "pending",
    "sent",
    "validated",
    "skipped",
    "failed",
    "delivery_unknown",
    "canceled",
  ]),
  sent: new Set(),
  validated: new Set(),
  skipped: new Set(),
  failed: new Set(["pending", "queued", "canceled"]),
  // A delivery-unknown task may be reopened only after an operator accepts
  // the duplicate-delivery risk and targets this exact task.
  delivery_unknown: new Set(["pending", "sent", "failed", "canceled"]),
  canceled: new Set(),
};

export function isTerminalJobStatus(status: BackgroundJobStatus): boolean {
  return TERMINAL_JOB_STATUSES.has(status);
}

export function isActiveJobStatus(status: BackgroundJobStatus): boolean {
  return ACTIVE_JOB_STATUSES.has(status);
}

export function isTerminalTaskStatus(status: BackgroundJobTaskStatus): boolean {
  return TERMINAL_TASK_STATUSES.has(status);
}

export function isActiveTaskStatus(status: BackgroundJobTaskStatus): boolean {
  return ACTIVE_TASK_STATUSES.has(status);
}

/**
 * Returns whether a task status may be retried. `delivery_unknown` is
 * intentionally excluded: automatically retrying an email after an ambiguous
 * provider response can deliver a duplicate message.
 */
export function isRetryableTaskStatus(status: BackgroundJobTaskStatus): boolean {
  return RETRYABLE_TASK_STATUSES.has(status);
}

export function canTransitionJobStatus(
  from: BackgroundJobStatus,
  to: BackgroundJobStatus,
): boolean {
  return from === to || JOB_TRANSITIONS[from].has(to);
}

export function canTransitionTaskStatus(
  from: BackgroundJobTaskStatus,
  to: BackgroundJobTaskStatus,
): boolean {
  return from === to || TASK_TRANSITIONS[from].has(to);
}

export function assertJobStatusTransition(
  from: BackgroundJobStatus,
  to: BackgroundJobStatus,
): void {
  if (!canTransitionJobStatus(from, to)) {
    throw new Error(`Invalid background job status transition: ${from} -> ${to}`);
  }
}

export function assertTaskStatusTransition(
  from: BackgroundJobTaskStatus,
  to: BackgroundJobTaskStatus,
): void {
  if (!canTransitionTaskStatus(from, to)) {
    throw new Error(`Invalid background job task status transition: ${from} -> ${to}`);
  }
}

export function isTaskRetryEligible(
  task: Pick<BackgroundJobTask, "status" | "attemptCount" | "maxAttempts" | "availableAt" | "error">,
  options: Readonly<{ maxAttempts?: number; now?: Date | string | number }> = {},
): boolean {
  if (!isRetryableTaskStatus(task.status)) return false;
  if (task.error?.retryable === false) return false;
  const maxAttempts = task.maxAttempts ?? options.maxAttempts ?? 3;
  if (!Number.isInteger(task.attemptCount) || !Number.isInteger(maxAttempts)) return false;
  if (task.attemptCount < 0 || maxAttempts <= 0 || task.attemptCount >= maxAttempts) return false;

  if (!task.availableAt) return true;

  const now = options.now ?? Date.now();
  const nowTimestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  const availableTimestamp = new Date(task.availableAt).getTime();
  return Number.isFinite(nowTimestamp) && Number.isFinite(availableTimestamp) && availableTimestamp <= nowTimestamp;
}

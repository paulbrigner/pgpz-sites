export const BACKGROUND_JOB_KINDS = [
  "newsletter",
  "policy_update",
  "admin_signup_notification",
  "bulk_invitation",
  "community_sync",
] as const;

export type BackgroundJobKind = (typeof BACKGROUND_JOB_KINDS)[number];

export const BACKGROUND_JOB_MODES = ["live", "validate_only", "smoke"] as const;

export type BackgroundJobMode = (typeof BACKGROUND_JOB_MODES)[number];

export const BACKGROUND_JOB_STATUSES = [
  "building",
  "dispatch_pending",
  "queued",
  "running",
  "completed",
  "partial",
  "failed",
  "needs_review",
  "canceled",
] as const;

export type BackgroundJobStatus = (typeof BACKGROUND_JOB_STATUSES)[number];

export const BACKGROUND_JOB_TASK_STATUSES = [
  "pending",
  "queued",
  "processing",
  "sent",
  "validated",
  "skipped",
  "failed",
  "delivery_unknown",
  "canceled",
] as const;

export type BackgroundJobTaskStatus = (typeof BACKGROUND_JOB_TASK_STATUSES)[number];

export type SanitizedJobError = Readonly<{
  name: string;
  message: string;
  code?: string;
  retryable?: boolean;
}>;

export type BackgroundJobRecipientInput = Readonly<{
  recipientKey?: string | null;
  userId?: string | null;
  email?: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type NormalizedBackgroundJobRecipient = Readonly<{
  /** Stable task identity. Prefers an explicit key, then user ID, then email. */
  recipientKey: string;
  userId: string | null;
  email: string | null;
  name?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  metadata?: Readonly<Record<string, unknown>>;
}>;

export type BackgroundJob = Readonly<{
  id: string;
  kind: BackgroundJobKind;
  mode: BackgroundJobMode;
  status: BackgroundJobStatus;
  idempotencyKey: string;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
  payload: Readonly<Record<string, unknown>>;
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
  startedAt?: string;
  completedAt?: string;
  error?: SanitizedJobError;
}>;

export type BackgroundJobTask = Readonly<{
  jobId: string;
  taskId: string;
  kind: BackgroundJobKind;
  mode: BackgroundJobMode;
  status: BackgroundJobTaskStatus;
  recipient: NormalizedBackgroundJobRecipient;
  /** Number of execution attempts that have started, including the current one. */
  attemptCount: number;
  maxAttempts?: number;
  createdAt: string;
  updatedAt: string;
  availableAt?: string | null;
  leaseToken?: string | null;
  leaseExpiresAt?: string | null;
  deliveryStartedAt?: string | null;
  providerMessageId?: string | null;
  result?: Readonly<Record<string, unknown>> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  error?: SanitizedJobError;
}>;

export type BackgroundJobMessage = Readonly<{
  version: 1;
  jobId: string;
  taskId: string;
}>;

export type BackgroundJobProgress = Readonly<{
  status: BackgroundJobStatus;
  total: number;
  completed: number;
  active: number;
  retryable: number;
  pending: number;
  queued: number;
  processing: number;
  sent: number;
  validated: number;
  skipped: number;
  failed: number;
  deliveryUnknown: number;
  canceled: number;
  percentComplete: number;
}>;

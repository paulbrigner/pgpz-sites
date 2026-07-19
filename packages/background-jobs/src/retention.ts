export const BACKGROUND_JOB_RETENTION_DAYS = Object.freeze({
  /** Parent summaries and idempotency claims preserve operator history. */
  job: 180,
  idempotency: 180,
  /** Per-recipient results contain more sensitive operational data. */
  task: 90,
  /** Audience manifests are needed only to repair interrupted snapshot creation. */
  audienceManifest: 30,
});

export type BackgroundJobRetentionClass =
  keyof typeof BACKGROUND_JOB_RETENTION_DAYS;

const SECONDS_PER_DAY = 24 * 60 * 60;

export function backgroundJobExpiration(
  retentionClass: BackgroundJobRetentionClass,
  now: Date | string | number = Date.now(),
): number {
  const timestamp = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(timestamp)) throw new TypeError("A valid retention timestamp is required");
  return (
    Math.floor(timestamp / 1000) +
    BACKGROUND_JOB_RETENTION_DAYS[retentionClass] * SECONDS_PER_DAY
  );
}

import { describe, expect, expectTypeOf, it } from "vitest";
import {
  BACKGROUND_JOB_KINDS,
  BACKGROUND_JOB_MODES,
  BACKGROUND_JOB_STATUSES,
  BACKGROUND_JOB_TASK_STATUSES,
} from "./contracts";
import type {
  BackgroundJobKind,
  BackgroundJobMessage,
  BackgroundJobMode,
  BackgroundJobStatus,
  BackgroundJobTaskStatus,
} from "./contracts";

describe("background-job contracts", () => {
  it("publishes every supported kind and execution mode", () => {
    expect(BACKGROUND_JOB_KINDS).toEqual([
      "newsletter",
      "policy_update",
      "admin_signup_notification",
      "bulk_invitation",
      "community_sync",
    ]);
    expect(BACKGROUND_JOB_MODES).toEqual(["live", "validate_only", "smoke"]);
    expectTypeOf<(typeof BACKGROUND_JOB_KINDS)[number]>().toEqualTypeOf<BackgroundJobKind>();
    expectTypeOf<(typeof BACKGROUND_JOB_MODES)[number]>().toEqualTypeOf<BackgroundJobMode>();
  });

  it("keeps persisted status values explicit and stable", () => {
    expect(BACKGROUND_JOB_STATUSES).toEqual([
      "building",
      "dispatch_pending",
      "queued",
      "running",
      "completed",
      "partial",
      "failed",
      "needs_review",
      "canceled",
    ]);
    expect(BACKGROUND_JOB_TASK_STATUSES).toEqual([
      "pending",
      "queued",
      "processing",
      "sent",
      "validated",
      "skipped",
      "failed",
      "delivery_unknown",
      "canceled",
    ]);
    expectTypeOf<(typeof BACKGROUND_JOB_STATUSES)[number]>().toEqualTypeOf<BackgroundJobStatus>();
    expectTypeOf<
      (typeof BACKGROUND_JOB_TASK_STATUSES)[number]
    >().toEqualTypeOf<BackgroundJobTaskStatus>();
  });

  it("uses a small versioned queue-message envelope", () => {
    const message = {
      version: 1,
      jobId: "job-1",
      taskId: "task-1",
    } satisfies BackgroundJobMessage;
    expect(message).toEqual({ version: 1, jobId: "job-1", taskId: "task-1" });
  });
});

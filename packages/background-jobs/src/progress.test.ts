import { describe, expect, it } from "vitest";
import { deriveJobProgress } from "./progress";

describe("background-job progress", () => {
  it("starts an empty snapshot in building state", () => {
    expect(deriveJobProgress([])).toEqual({
      status: "building",
      total: 0,
      completed: 0,
      active: 0,
      retryable: 0,
      pending: 0,
      queued: 0,
      processing: 0,
      sent: 0,
      validated: 0,
      skipped: 0,
      failed: 0,
      deliveryUnknown: 0,
      canceled: 0,
      percentComplete: 0,
    });
  });

  it.each([
    [["pending"], "dispatch_pending"],
    [["queued"], "queued"],
    [["processing"], "running"],
    [["sent", "pending"], "running"],
    [["validated", "queued"], "running"],
  ] as const)("derives active progress %# as %s", (statuses, expected) => {
    expect(deriveJobProgress(statuses).status).toBe(expected);
  });

  it("counts every status and floors the completion percentage", () => {
    const progress = deriveJobProgress([
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

    expect(progress).toMatchObject({
      total: 9,
      completed: 6,
      active: 3,
      retryable: 1,
      pending: 1,
      queued: 1,
      processing: 1,
      sent: 1,
      validated: 1,
      skipped: 1,
      failed: 1,
      deliveryUnknown: 1,
      canceled: 1,
      percentComplete: 66,
    });
  });

  it.each([
    [["sent", "validated", "skipped"], "completed"],
    [["failed", "failed"], "failed"],
    [["sent", "failed"], "partial"],
    [["validated", "canceled"], "partial"],
    [["canceled", "canceled"], "canceled"],
    [["sent", "delivery_unknown"], "needs_review"],
    [["failed", "delivery_unknown"], "needs_review"],
  ] as const)("derives terminal progress %# as %s", (statuses, expected) => {
    const progress = deriveJobProgress(statuses);
    expect(progress.status).toBe(expected);
    expect(progress.completed).toBe(statuses.length);
    expect(progress.percentComplete).toBe(100);
  });

  it("accepts task-like objects as well as bare statuses", () => {
    expect(deriveJobProgress([{ status: "sent" }, { status: "skipped" }])).toMatchObject({
      status: "completed",
      total: 2,
      sent: 1,
      skipped: 1,
    });
  });
});

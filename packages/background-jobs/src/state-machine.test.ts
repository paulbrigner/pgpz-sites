import { describe, expect, it } from "vitest";
import {
  BACKGROUND_JOB_STATUSES,
  BACKGROUND_JOB_TASK_STATUSES,
} from "./contracts";
import {
  assertJobStatusTransition,
  assertTaskStatusTransition,
  canTransitionJobStatus,
  canTransitionTaskStatus,
  isActiveJobStatus,
  isActiveTaskStatus,
  isRetryableTaskStatus,
  isTaskRetryEligible,
  isTerminalJobStatus,
  isTerminalTaskStatus,
} from "./state-machine";

describe("background-job state machine", () => {
  it("classifies every job status without gaps", () => {
    const terminal = BACKGROUND_JOB_STATUSES.filter(isTerminalJobStatus);
    const active = BACKGROUND_JOB_STATUSES.filter(isActiveJobStatus);

    expect(terminal).toEqual(["completed", "partial", "failed", "needs_review", "canceled"]);
    expect(active).toEqual(["building", "dispatch_pending", "queued", "running"]);
    expect(new Set([...terminal, ...active]).size).toBe(BACKGROUND_JOB_STATUSES.length);
  });

  it("classifies every task status without gaps", () => {
    const terminal = BACKGROUND_JOB_TASK_STATUSES.filter(isTerminalTaskStatus);
    const active = BACKGROUND_JOB_TASK_STATUSES.filter(isActiveTaskStatus);

    expect(terminal).toEqual([
      "sent",
      "validated",
      "skipped",
      "failed",
      "delivery_unknown",
      "canceled",
    ]);
    expect(active).toEqual(["pending", "queued", "processing"]);
    expect(new Set([...terminal, ...active]).size).toBe(BACKGROUND_JOB_TASK_STATUSES.length);
  });

  it("accepts idempotent updates for every status", () => {
    for (const status of BACKGROUND_JOB_STATUSES) {
      expect(canTransitionJobStatus(status, status)).toBe(true);
    }
    for (const status of BACKGROUND_JOB_TASK_STATUSES) {
      expect(canTransitionTaskStatus(status, status)).toBe(true);
    }
  });

  it.each([
    ["building", "dispatch_pending"],
    ["dispatch_pending", "queued"],
    ["queued", "running"],
    ["running", "completed"],
    ["running", "partial"],
    ["running", "needs_review"],
    ["partial", "dispatch_pending"],
    ["failed", "queued"],
    ["needs_review", "dispatch_pending"],
    ["needs_review", "completed"],
  ] as const)("allows the job transition %s -> %s", (from, to) => {
    expect(canTransitionJobStatus(from, to)).toBe(true);
    expect(() => assertJobStatusTransition(from, to)).not.toThrow();
  });

  it.each([
    ["building", "running"],
    ["dispatch_pending", "completed"],
    ["completed", "running"],
    ["canceled", "queued"],
    ["needs_review", "queued"],
  ] as const)("rejects the job transition %s -> %s", (from, to) => {
    expect(canTransitionJobStatus(from, to)).toBe(false);
    expect(() => assertJobStatusTransition(from, to)).toThrow(`${from} -> ${to}`);
  });

  it.each([
    ["pending", "queued"],
    ["queued", "processing"],
    ["processing", "sent"],
    ["processing", "validated"],
    ["processing", "pending"],
    ["failed", "pending"],
    ["delivery_unknown", "pending"],
    ["delivery_unknown", "sent"],
  ] as const)("allows the task transition %s -> %s", (from, to) => {
    expect(canTransitionTaskStatus(from, to)).toBe(true);
    expect(() => assertTaskStatusTransition(from, to)).not.toThrow();
  });

  it.each([
    ["pending", "sent"],
    ["queued", "sent"],
    ["sent", "pending"],
    ["validated", "processing"],
    ["canceled", "queued"],
  ] as const)("rejects the task transition %s -> %s", (from, to) => {
    expect(canTransitionTaskStatus(from, to)).toBe(false);
    expect(() => assertTaskStatusTransition(from, to)).toThrow(`${from} -> ${to}`);
  });
});

describe("retry eligibility", () => {
  const now = "2026-07-19T12:00:00.000Z";

  it("only treats definite failures as retryable", () => {
    expect(BACKGROUND_JOB_TASK_STATUSES.filter(isRetryableTaskStatus)).toEqual(["failed"]);
    expect(isRetryableTaskStatus("delivery_unknown")).toBe(false);
  });

  it("allows a failed task below its attempt budget", () => {
    expect(
      isTaskRetryEligible(
        { status: "failed", attemptCount: 2, maxAttempts: 3 },
        { now },
      ),
    ).toBe(true);
  });

  it("uses a configurable default attempt budget", () => {
    const task = { status: "failed" as const, attemptCount: 3 };
    expect(isTaskRetryEligible(task, { now })).toBe(false);
    expect(isTaskRetryEligible(task, { maxAttempts: 4, now })).toBe(true);
  });

  it("waits for the retry availability time", () => {
    const task = {
      status: "failed" as const,
      attemptCount: 1,
      availableAt: "2026-07-19T12:05:00.000Z",
    };
    expect(isTaskRetryEligible(task, { now })).toBe(false);
    expect(isTaskRetryEligible(task, { now: "2026-07-19T12:05:00.000Z" })).toBe(true);
  });

  it.each([
    { status: "sent" as const, attemptCount: 1 },
    { status: "delivery_unknown" as const, attemptCount: 1 },
    { status: "failed" as const, attemptCount: 3, maxAttempts: 3 },
    { status: "failed" as const, attemptCount: -1, maxAttempts: 3 },
    { status: "failed" as const, attemptCount: 1.5, maxAttempts: 3 },
    { status: "failed" as const, attemptCount: 1, error: { name: "Fatal", message: "No", retryable: false } },
    { status: "failed" as const, attemptCount: 1, availableAt: "not-a-date" },
  ])("rejects an ineligible task %#", (task) => {
    expect(isTaskRetryEligible(task, { now })).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import {
  decodeBackgroundJobCursor,
  encodeBackgroundJobCursor,
  normalizeBackgroundJobPageSize,
} from "./pagination";

describe("background-job pagination", () => {
  it("round trips an opaque, index-bound DynamoDB cursor", () => {
    const key = {
      pk: "BACKGROUND_JOB#job-1",
      sk: "BACKGROUND_JOB#job-1",
      GSI2PK: "BACKGROUND_JOB_STATUS#running",
      GSI2SK: "2026-07-19T12:00:00.000Z#job-1",
    };
    const cursor = encodeBackgroundJobCursor("job_status", key);
    expect(cursor).not.toContain("BACKGROUND_JOB");
    expect(decodeBackgroundJobCursor(cursor, "job_status")).toEqual(key);
  });

  it("rejects malformed, cross-index, and overlong cursors", () => {
    const cursor = encodeBackgroundJobCursor("recent_jobs", {
      pk: "p",
      sk: "s",
      GSI1PK: "BACKGROUND_JOB",
      GSI1SK: "time#job",
    });
    expect(() => decodeBackgroundJobCursor(cursor, "job_status")).toThrow(/Invalid/);
    const incomplete = encodeBackgroundJobCursor("job_status", {
      pk: "p",
      sk: "s",
    });
    expect(() => decodeBackgroundJobCursor(incomplete, "job_status")).toThrow(/Invalid/);
    expect(() => decodeBackgroundJobCursor("not valid!", "recent_jobs")).toThrow(/Invalid/);
    expect(() => decodeBackgroundJobCursor("a".repeat(4097), "recent_jobs")).toThrow(/Invalid/);
  });

  it("normalizes bounded page sizes", () => {
    expect(normalizeBackgroundJobPageSize(undefined)).toBe(30);
    expect(normalizeBackgroundJobPageSize("0")).toBe(1);
    expect(normalizeBackgroundJobPageSize("25.9")).toBe(25);
    expect(normalizeBackgroundJobPageSize("10000")).toBe(100);
    expect(normalizeBackgroundJobPageSize("invalid", 20)).toBe(20);
  });
});

import { describe, expect, it } from "vitest";
import {
  BACKGROUND_JOB_RETENTION_DAYS,
  backgroundJobExpiration,
} from "./retention";

describe("background-job retention", () => {
  it("applies shorter retention to recipient and audience data", () => {
    expect(BACKGROUND_JOB_RETENTION_DAYS).toEqual({
      job: 180,
      idempotency: 180,
      task: 90,
      audienceManifest: 30,
    });
    const now = Date.parse("2026-07-19T00:00:00.000Z");
    expect(backgroundJobExpiration("audienceManifest", now)).toBe(
      Math.floor(now / 1000) + 30 * 86400,
    );
    expect(backgroundJobExpiration("job", now)).toBe(
      Math.floor(now / 1000) + 180 * 86400,
    );
  });

  it("rejects invalid timestamps", () => {
    expect(() => backgroundJobExpiration("task", "not-a-date")).toThrow(/valid/);
  });
});

import { describe, expect, it } from "vitest";
import { resolveAuditPage } from "./audit-pagination";

describe("audit pagination", () => {
  it("defaults to the newest page and reports its visible range", () => {
    expect(resolveAuditPage(undefined, 83, 82)).toEqual({
      page: 1,
      totalPages: 4,
      firstOrdinal: 1,
      lastOrdinal: 25,
      beforeSequenceExclusive: 83,
    });
  });

  it("clamps invalid and out-of-range pages", () => {
    expect(resolveAuditPage("nope", 0, null).page).toBe(1);
    expect(resolveAuditPage("99", 83, 82)).toMatchObject({
      page: 4,
      firstOrdinal: 76,
      lastOrdinal: 83,
      beforeSequenceExclusive: 8,
    });
  });
});

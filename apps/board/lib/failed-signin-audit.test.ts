import { describe, expect, it } from "vitest";
import { sanitizeClaimedEmail, shouldRecordFailureAudit } from "./failed-signin-audit";

describe("sanitizeClaimedEmail", () => {
  it("normalizes a plausible email to lowercase/trimmed form", () => {
    expect(sanitizeClaimedEmail("  Ada@Example.Org ")).toBe("ada@example.org");
  });

  it("rejects junk, control characters, and over-length inputs so attacker text is never echoed into the immutable ledger", () => {
    expect(sanitizeClaimedEmail(null)).toBeNull();
    expect(sanitizeClaimedEmail(undefined)).toBeNull();
    expect(sanitizeClaimedEmail("")).toBeNull();
    expect(sanitizeClaimedEmail("   ")).toBeNull();
    expect(sanitizeClaimedEmail("not-an-email")).toBeNull();
    expect(sanitizeClaimedEmail("a@b\ngarbage")).toBeNull(); // control char
    expect(sanitizeClaimedEmail(`${"x".repeat(300)}@example.org`)).toBeNull(); // over length
  });

  it("accepts a normal email and keeps the domain bounded", () => {
    const result = sanitizeClaimedEmail("ada.lovelace@example.org");
    expect(result).toBe("ada.lovelace@example.org");
  });
});

describe("shouldRecordFailureAudit", () => {
  it("allows a bounded number of failures, then coalesces repeated failures for the same key within the window", () => {
    // Each distinct key starts fresh; reuse one key to observe throttling.
    const key = "203.0.113.7|victim@example.org";
    // The first MAX_FAILURES (5) are recorded...
    expect(shouldRecordFailureAudit(key)).toBe(true);
    expect(shouldRecordFailureAudit(key)).toBe(true);
    expect(shouldRecordFailureAudit(key)).toBe(true);
    expect(shouldRecordFailureAudit(key)).toBe(true);
    expect(shouldRecordFailureAudit(key)).toBe(true);
    // ...and subsequent attempts within the window are suppressed (bounded write volume).
    expect(shouldRecordFailureAudit(key)).toBe(false);
    expect(shouldRecordFailureAudit(key)).toBe(false);
  });

  it("does not cross-throttle different clients or emails", () => {
    const a = "203.0.113.1|one@example.org";
    const b = "203.0.113.2|two@example.org";
    for (let i = 0; i < 6; i += 1) shouldRecordFailureAudit(a);
    expect(shouldRecordFailureAudit(b)).toBe(true);
  });
});

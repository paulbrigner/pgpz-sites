import "server-only";

/**
 * Guards that bound how much unauthenticated input reaches the append-only
 * audit ledger on a failed sign-in. The ledger is immutable — noise written now
 * can never be deleted later — so we bound both what value is echoed and how
 * often we write, at write time.
 */

// A loose but bounded email shape: local part <= 64 chars, domain >= 2 chars,
// no whitespace/control characters. Anything that doesn't look like an email is
// attacker-supplied junk (or a forged attribution string) and must not be echoed
// into the trusted ledger as if it were a real claimed identity.
const EMAIL_LIKE_RE = /^[^\s@]{1,64}@[^\s@]{2,190}$/;

/**
 * Returns the value safe to record for an attacker-claimed email on a failed
 * sign-in, or `null` when nothing should be echoed (junk strings, control
 * characters, over-length payloads). The result is always normalized,
 * bounded, and free of anything that could inject into metadata.
 */
export function sanitizeClaimedEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const cleaned = raw.trim().toLowerCase();
  // Reject empty/whitespace-only and over-long inputs outright.
  if (!cleaned || cleaned.length > 254) return null;
  // Control characters could smuggle newlines / injection into serialized metadata.
  if (/[\x00-\x1f\x7f]/.test(cleaned)) return null;
  return EMAIL_LIKE_RE.test(cleaned) ? cleaned : null;
}

const FAILURE_AUDIT_WINDOW_MS = 60_000;
const MAX_FAILURES_PER_KEY_PER_WINDOW = 5;
// Hard cap on tracked keys so a large distributed spray cannot grow memory unboundedly.
const MAX_TRACKED_KEYS = 5000;

/**
 * In-memory sliding-window limiter that coalesces repeated failed-sign-in audit
 * writes for the same (client, claimed email) key. A brute-force / junk spray is
 * thereby recorded as a handful of bounded entries per window instead of one line
 * per attempt in an immutable store.
 *
 * Best-effort by design: this complements Better Auth's own DynamoDB-backed sign-in
 * rate limiting and the value sanitizer; it does not need to be globally accurate
 * across cold-start instances, only to bound write volume on a hot path.
 */
const recentFailures = new Map<string, number[]>();

export function shouldRecordFailureAudit(key: string): boolean {
  const now = Date.now();
  let stamps = recentFailures.get(key);
  if (!stamps) stamps = [];

  // Drop stamps outside the window.
  const cutoff = now - FAILURE_AUDIT_WINDOW_MS;
  while (stamps.length > 0 && stamps[0]! <= cutoff) stamps.shift();

  if (stamps.length >= MAX_FAILURES_PER_KEY_PER_WINDOW) {
    recentFailures.set(key, stamps);
    return false;
  }
  stamps.push(now);
  recentFailures.set(key, stamps);

  // Bound total memory: drop stale keys once we exceed the cap.
  if (recentFailures.size > MAX_TRACKED_KEYS) {
    recentFailures.forEach((existingStamps, existingKey) => {
      const remaining = existingStamps.filter((stamp) => stamp > cutoff);
      if (remaining.length === 0) {
        recentFailures.delete(existingKey);
      } else {
        recentFailures.set(existingKey, remaining);
      }
    });
  }
  return true;
}

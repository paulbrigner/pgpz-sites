import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/config", () => ({
  BETTER_AUTH_SECRET: "test-secret-that-is-long-enough-for-signing",
  SITE_URL: "https://community.example.test",
  ZCASHME_AUTH_ISSUER: "https://auth.zcash.example.test",
}));

import {
  createZcashMeAuthorization,
  decodeZcashMeOidcAttempt,
  encodeZcashMeOidcAttempt,
} from "@/lib/zcashme-oidc";

const secret = "another-test-secret-that-is-long-enough";

describe("ZcashMe OAuth attempt", () => {
  it("builds a PKCE authorization and round-trips a signed dry-run attempt", () => {
    const { attempt, authorizationUrl } = createZcashMeAuthorization(
      "user-1",
      "PGPZ-0123456789",
      "admin_dry_run",
    );
    const url = new URL(authorizationUrl);

    expect(url.origin).toBe("https://auth.zcash.example.test");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("label")).toBe("PGPZ-0123456789");
    expect(decodeZcashMeOidcAttempt(encodeZcashMeOidcAttempt(attempt, secret), secret))
      .toEqual(attempt);
  });

  it("rejects tampered, expired, and incorrectly signed attempts", () => {
    const now = Date.now();
    const attempt = createZcashMeAuthorization("user-1", "PGPZ-0123456789").attempt;
    const encoded = encodeZcashMeOidcAttempt(attempt, secret);
    const [payload, signature] = encoded.split(".");

    expect(decodeZcashMeOidcAttempt(`${payload}x.${signature}`, secret)).toBeNull();
    expect(decodeZcashMeOidcAttempt(encoded, `${secret}-wrong`)).toBeNull();

    vi.spyOn(Date, "now").mockReturnValue(now + 11 * 60 * 1000);
    expect(decodeZcashMeOidcAttempt(encoded, secret)).toBeNull();
    vi.restoreAllMocks();
  });
});

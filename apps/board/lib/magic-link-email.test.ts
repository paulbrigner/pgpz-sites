import { describe, expect, it } from "vitest";
import { buildBoardMagicLinkEmail } from "@/lib/magic-link-email";
import { buildBoardEmailLinkLandingUrl } from "@/lib/email-link";

describe("Board magic-link email", () => {
  it("describes the ten-minute one-time sign-in and escapes HTML", () => {
    const email = buildBoardMagicLinkEmail("https://board.pgpz.org/callback?a=1&b=<bad>");
    expect(email.subject).toContain("PGPZ Board");
    expect(email.text).toContain("expires in 10 minutes");
    expect(email.text).toContain("passkey is required");
    expect(email.html).toContain("a=1&amp;b=&lt;bad&gt;");
    expect(email.html).not.toContain("<bad>");
  });

  it("emails a landing page with explicit continuation and first-time passkey instructions", () => {
    const origin = "https://board.pgpz.org";
    const token = "abcdefghijklmnopqrstuvwxyzABCDEF";
    const landing = buildBoardEmailLinkLandingUrl(`${origin}/api/better-auth/magic-link/verify?token=${token}&callbackURL=%2Fmeetings`, origin);
    const email = buildBoardMagicLinkEmail(landing);
    expect(email.text).toContain("then select Continue");
    expect(email.text).toContain("For first-time setup, add a passkey and verify it");
    expect(email.text).toContain("/signin/email-link?");
    expect(email.html).toContain("/signin/email-link?");
    expect(email.text).not.toContain("/api/better-auth/magic-link/verify");
    expect(email.html).not.toContain("/api/better-auth/magic-link/verify");
  });
});

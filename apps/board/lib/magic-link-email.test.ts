import { describe, expect, it } from "vitest";
import { buildBoardMagicLinkEmail } from "@/lib/magic-link-email";

describe("Board magic-link email", () => {
  it("describes the ten-minute one-time sign-in and escapes HTML", () => {
    const email = buildBoardMagicLinkEmail("https://board.pgpz.org/callback?a=1&b=<bad>");
    expect(email.subject).toContain("PGPZ Board");
    expect(email.text).toContain("expires in 10 minutes");
    expect(email.html).toContain("a=1&amp;b=&lt;bad&gt;");
    expect(email.html).not.toContain("<bad>");
  });
});

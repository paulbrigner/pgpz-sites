import { describe, expect, it } from "vitest";
import { buildNewsletterEmail } from "@/lib/newsletter-email";

const newsletter = {
  subject: "PGPZ Community Newsletter",
  preheader: "A short member update.",
  body: "Here is a policy note.\n\nRead more at https://community.pgpz.org/updates.",
};

describe("buildNewsletterEmail", () => {
  it("greets recipients by profile name and links URLs", () => {
    const built = buildNewsletterEmail(
      newsletter,
      { email: "paul@example.com", name: "Paul Brigner" },
      "https://community.pgpz.org",
    );

    expect(built.subject).toBe("PGPZ Community Newsletter");
    expect(built.html).toContain("Hi Paul Brigner,");
    expect(built.html).toContain('href="https://community.pgpz.org/updates"');
    expect(built.text).toContain("Hi Paul Brigner,");
    expect(built.text).toContain("Read more at https://community.pgpz.org/updates.");
  });

  it("falls back to a generic greeting", () => {
    const built = buildNewsletterEmail(newsletter, { email: "unknown@example.com" });

    expect(built.html).toContain("Hi there,");
    expect(built.text).toContain("Hi there,");
  });

  it("adds tracking links, an open pixel, and unsubscribe URL when tracking is enabled", () => {
    const built = buildNewsletterEmail(
      newsletter,
      { email: "paul@example.com", name: "Paul Brigner" },
      "https://community.pgpz.org",
      {
        trackingId: "track-123",
        trackLinks: true,
        includeOpenPixel: true,
        includeUnsubscribe: true,
      },
    );

    expect(built.html).toContain("/api/email/open/track-123.png");
    expect(built.html).toContain(
      "/api/email/click/track-123?url=https%3A%2F%2Fcommunity.pgpz.org%2Fupdates",
    );
    expect(built.html).toContain("/api/email/unsubscribe/track-123");
    expect(built.text).toContain("Unsubscribe: https://community.pgpz.org/api/email/unsubscribe/track-123");
  });
});

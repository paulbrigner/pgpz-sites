import { describe, expect, it } from "vitest";
import { buildNewsletterEmail } from "@/lib/newsletter-email";

const newsletter = {
  subject: "PGPZ Coalition Newsletter",
  preheader: "A short member update.",
  body: "Here is a policy note.\n\nRead more at https://coalition.pgpz.org/updates.",
};

describe("buildNewsletterEmail", () => {
  it("greets recipients by first name and links URLs", () => {
    const built = buildNewsletterEmail(
      newsletter,
      { email: "paul@example.com", name: "Paul Brigner", firstName: "Paul", lastName: "Brigner" },
      "https://coalition.pgpz.org",
    );

    expect(built.subject).toBe("PGPZ Coalition Newsletter");
    expect(built.html).toContain("Hi Paul,");
    expect(built.html).toContain('href="https://coalition.pgpz.org/updates"');
    expect(built.html).toContain("Did someone forward you this email?");
    expect(built.html).toContain('src="https://coalition.pgpz.org/coalition-join-qr.png"');
    expect(built.text).toContain("Hi Paul,");
    expect(built.text).toContain("Read more at https://coalition.pgpz.org/updates.");
    expect(built.text).toContain("Request PGPZ Coalition access to receive updates directly");
  });

  it("falls back to a generic greeting", () => {
    const built = buildNewsletterEmail(newsletter, { email: "unknown@example.com" });

    expect(built.html).toContain("Hi there,");
    expect(built.text).toContain("Hi there,");
  });

  it("adds tracking links, an open pixel, and unsubscribe URL when tracking is enabled", () => {
    const built = buildNewsletterEmail(
      newsletter,
      { email: "paul@example.com", name: "Paul Brigner", firstName: "Paul", lastName: "Brigner" },
      "https://coalition.pgpz.org",
      {
        trackingId: "track-123",
        trackLinks: true,
        includeOpenPixel: true,
        includeUnsubscribe: true,
      },
    );

    expect(built.html).toContain("/api/email/open/track-123.png");
    expect(built.html).toContain(
      "/api/email/click/track-123?url=https%3A%2F%2Fcoalition.pgpz.org%2Fupdates",
    );
    expect(built.html).toContain(
      'href="https://coalition.pgpz.org/api/email/click/track-123?url=https%3A%2F%2Fcoalition.pgpz.org"',
    );
    expect(built.html).toContain("/api/email/unsubscribe/track-123");
    expect(built.text).toContain("Unsubscribe: https://coalition.pgpz.org/api/email/unsubscribe/track-123");
  });
});

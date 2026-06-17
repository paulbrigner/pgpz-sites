import { describe, expect, it } from "vitest";
import {
  buildCustomAdminEmail,
  buildEmailChangeConfirmationEmail,
  buildMagicLinkEmail,
  buildWelcomeEmail,
} from "@/lib/system-email";

describe("system email builders", () => {
  it("renders magic-link email with the refreshed branded shell", () => {
    const built = buildMagicLinkEmail({
      url: "https://community.pgpz.org/api/auth/callback/email?token=abc",
      host: "community.pgpz.org",
    });

    expect(built.subject).toBe("Sign in to community.pgpz.org");
    expect(built.html).toContain("linear-gradient");
    expect(built.html).toContain("PGPZ Community");
    expect(built.html).toContain("Secure member access");
    expect(built.html).toContain("Sign in");
    expect(built.text).toContain("Use this secure link to sign in to PGPZ Community");
  });

  it("renders profile email-change confirmations with the branded shell", () => {
    const built = buildEmailChangeConfirmationEmail(
      "https://community.pgpz.org/api/profile/confirm-email-change?token=abc",
    );

    expect(built.subject).toBe("Confirm your email change");
    expect(built.html).toContain("Profile security");
    expect(built.html).toContain("Confirm email change");
    expect(built.html).toContain("linear-gradient");
    expect(built.text).toContain("This link expires in 30 minutes");
  });

  it("renders welcome emails with member footer and portal CTA", () => {
    const built = buildWelcomeEmail({
      recipientName: "Paul Brigner",
      fallbackEmail: "paul@example.com",
      portalUrl: "https://community.pgpz.org",
    });

    expect(built.html).toContain("Hi Paul Brigner,");
    expect(built.html).toContain("Visit PGPZ Community");
    expect(built.html).toContain("You are receiving this because your PGPZ Community membership is active");
    expect(built.text).toContain("Hi Paul Brigner,");
  });

  it("wraps custom admin emails in the branded shell", () => {
    const built = buildCustomAdminEmail({
      subject: "Member note",
      text: "A short update for members.",
    });

    expect(built.html).toContain("<title>Member note</title>");
    expect(built.html).toContain("Member message");
    expect(built.html).toContain("A short update for members.");
    expect(built.text).toBe("A short update for members.");
  });
});

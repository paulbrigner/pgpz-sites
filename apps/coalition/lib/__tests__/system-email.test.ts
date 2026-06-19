import { describe, expect, it } from "vitest";
import {
  buildCustomAdminEmail,
  buildEmailChangeConfirmationEmail,
  buildInvitationEmail,
  buildMagicLinkEmail,
  buildWelcomeEmail,
} from "@/lib/system-email";

describe("system email builders", () => {
  it("renders magic-link email with the refreshed branded shell", () => {
    const built = buildMagicLinkEmail({
      url: "https://coalition.pgpz.org/api/auth/callback/email?token=abc",
      host: "coalition.pgpz.org",
    });

    expect(built.subject).toBe("Sign in to coalition.pgpz.org");
    expect(built.html).toContain("linear-gradient");
    expect(built.html).toContain("PGPZ Coalition");
    expect(built.html).toContain("Secure member access");
    expect(built.html).toContain("Sign in");
    expect(built.text).toContain("Use this secure link to sign in to PGPZ Coalition");
  });

  it("renders profile email-change confirmations with the branded shell", () => {
    const built = buildEmailChangeConfirmationEmail(
      "https://coalition.pgpz.org/api/profile/confirm-email-change?token=abc",
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
      recipientFirstName: "Paul",
      recipientLastName: "Brigner",
      fallbackEmail: "paul@example.com",
      portalUrl: "https://coalition.pgpz.org",
    });

    expect(built.html).toContain("Hi Paul,");
    expect(built.html).toContain("Visit PGPZ Coalition");
    expect(built.html).toContain("Join Signal group");
    expect(built.html).toContain("https://signal.group/#CjQKIK5Li1s23K9yp5UbvHeyzVXAs-1WpSFKxyLslxXIqOJCEhCbzgPjjoDLC3hsdoeeDxPX");
    expect(built.html).toContain("You are receiving this because your PGPZ Coalition membership is active");
    expect(built.text).toContain("Hi Paul,");
    expect(built.text).toContain("Join the members-only Signal group");
  });

  it("falls back to a generic welcome greeting when first name is unavailable", () => {
    const built = buildWelcomeEmail({
      recipientName: "Paul Brigner",
      fallbackEmail: "paul@example.com",
      portalUrl: "https://coalition.pgpz.org",
    });

    expect(built.html).toContain("Hi there,");
    expect(built.text).toContain("Hi there,");
  });

  it("renders invitation emails with an activation CTA", () => {
    const built = buildInvitationEmail({
      recipientFirstName: "Paul",
      activationUrl: "https://coalition.pgpz.org/api/invitations/activate?token=abc",
    });

    expect(built.subject).toBe("Activate your PGPZ Coalition account");
    expect(built.html).toContain("Coalition invitation");
    expect(built.html).toContain("Activate account");
    expect(built.text).toContain("You have been invited to the PGPZ Coalition member workspace.");
    expect(built.text).toContain("https://coalition.pgpz.org/api/invitations/activate?token=abc");
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

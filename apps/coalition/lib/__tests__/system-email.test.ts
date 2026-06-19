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

    expect(built.subject).toBe("Special invitation to join the PGPZ Coalition");
    expect(built.html).toContain("Coalition invitation");
    expect(built.html).toContain("Activate PGPZ Coalition account");
    expect(built.html).toContain("PGPZ Coalition Launch Breakfast");
    expect(built.html).toContain("RSVP for the PGPZ Coalition Launch Breakfast");
    expect(built.html).toContain("Hi Paul,");
    expect(built.text).toContain("PGPZ — Pretty Good Policy for Zcash");
    expect(built.text).toContain("https://coalition.pgpz.org/api/invitations/activate?token=abc");
  });

  it("supports editable invitation templates with member placeholders", () => {
    const built = buildInvitationEmail({
      recipientFirstName: "Alice",
      recipientLastName: "Policy",
      activationUrl: "https://coalition.pgpz.org/api/invitations/activate?token=xyz",
      template: {
        subject: "Join PGPZ, [First Name]",
        body: "Hi [Name],\n\nPlease activate here too: [Activation Link]\n\nBest,\nPGPZ",
      },
    });

    expect(built.subject).toBe("Join PGPZ, Alice");
    expect(built.html).toContain("Hi Alice,");
    expect(built.html).toContain("Activate PGPZ Coalition account");
    expect(built.text).toContain("Please activate here too: https://coalition.pgpz.org/api/invitations/activate?token=xyz");
  });

  it("renders spaced markdown links in editable invitation templates", () => {
    const activationUrl = "https://coalition.pgpz.org/api/invitations/activate?token=draft-preview-token";
    const built = buildInvitationEmail({
      recipientFirstName: "Alice",
      activationUrl,
      template: {
        subject: "Preview invitation",
        body:
          "Hi [Name],\n\nJoin the [PGPZ Coalition] (https://coalition.pgpz.org) and [activate today] ([Activation Link]).",
      },
    });

    expect(built.html).toContain('href="https://coalition.pgpz.org"');
    expect(built.html).toContain(">PGPZ Coalition</a>");
    expect(built.html).toContain(`href="${activationUrl}"`);
    expect(built.html).toContain(">activate today</a>");
    expect(built.html).not.toContain("[PGPZ Coalition]");
    expect(built.text).toContain(`activate today: ${activationUrl}`);
  });

  it("renders a safe markdown subset in editable invitation templates", () => {
    const built = buildInvitationEmail({
      recipientFirstName: "Alice",
      activationUrl: "https://coalition.pgpz.org/api/invitations/activate?token=abc",
      template: {
        subject: "Preview invitation",
        body: [
          "Hi [Name],",
          "",
          "Please review **important details**, *policy context*, and `PGPZ` before joining.",
          "",
          "- **Capacity** is limited",
          "- Bring [questions](https://coalition.pgpz.org/questions)",
          "",
          "1. RSVP",
          "2. Activate your account",
          "",
          "Raw HTML stays escaped: <strong>not bold</strong>",
        ].join("\n"),
      },
    });

    expect(built.html).toContain("<strong");
    expect(built.html).toContain(">important details</strong>");
    expect(built.html).toContain("<em");
    expect(built.html).toContain(">policy context</em>");
    expect(built.html).toContain("<code");
    expect(built.html).toContain(">PGPZ</code>");
    expect(built.html).toContain("<ul");
    expect(built.html).toContain("<ol");
    expect(built.html).toContain('href="https://coalition.pgpz.org/questions"');
    expect(built.html).toContain("&lt;strong&gt;not bold&lt;/strong&gt;");
    expect(built.html).not.toContain("<strong>not bold</strong>");
    expect(built.text).toContain("Please review important details, policy context, and PGPZ before joining.");
    expect(built.text).toContain("- Capacity is limited");
    expect(built.text).toContain("Bring questions: https://coalition.pgpz.org/questions");
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

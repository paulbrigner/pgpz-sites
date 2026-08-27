import { describe, expect, it } from "vitest";
import { buildBoardWelcomeEmail } from "./welcome-email";

describe("Board welcome email", () => {
  it("explains role, magic-link onboarding, and required passkey enrollment", () => {
    const email = buildBoardWelcomeEmail({
      name: "Ada Director",
      email: "ADA@EXAMPLE.ORG",
      role: "member",
      siteUrl: "https://board.pgpz.org",
    });
    expect(email.subject).toBe("Welcome to the PGPZ Board portal");
    expect(email.text).toContain("as Director");
    expect(email.text).toContain("https://board.pgpz.org/signin");
    expect(email.text).toContain("ada@example.org");
    expect(email.text).toContain("one-time email link");
    expect(email.text).toContain("register a passkey");
    expect(email.text).toContain("cannot open Board content");
  });

  it("uses current role names and escapes user-controlled HTML", () => {
    const email = buildBoardWelcomeEmail({
      name: "<Chair & Co>",
      email: "chair@example.org",
      role: "chair",
      siteUrl: "https://board.pgpz.org/base",
    });
    expect(email.text).toContain("as Board Chair");
    expect(email.html).toContain("&lt;Chair &amp; Co&gt;");
    expect(email.html).not.toContain("<Chair & Co>");
    expect(email.html).toContain('href="https://board.pgpz.org/signin"');
  });
});

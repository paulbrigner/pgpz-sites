import { describe, expect, it } from "vitest";
import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import { buildBoardSesTransport, buildBoardSmtpTransport, resolveBoardEmailTransportMode } from "@/lib/email-transport";

describe("Board email transport", () => {
  it("requires SES in production", () => {
    expect(resolveBoardEmailTransportMode({ configuredTransport: "ses", nodeEnv: "production" })).toBe("ses");
    expect(() => resolveBoardEmailTransportMode({ configuredTransport: "smtp", nodeEnv: "production" })).toThrow("EMAIL_TRANSPORT=ses is required in production");
    expect(() => resolveBoardEmailTransportMode({ nodeEnv: "production" })).toThrow("EMAIL_TRANSPORT=ses is required in production");
  });

  it("defaults non-production environments to SMTP", () => {
    expect(resolveBoardEmailTransportMode({ nodeEnv: "test" })).toBe("smtp");
  });

  it("uses the default AWS credential chain for SES", () => {
    const config = buildBoardSesTransport("us-east-1");
    expect(config.SES.sesClient).toBeInstanceOf(SESv2Client);
    expect(config.SES.SendEmailCommand).toBe(SendEmailCommand);
  });

  it("disables opportunistic TLS only for local MailHog", () => {
    expect(buildBoardSmtpTransport({ host: "localhost", port: "1025", secure: "false" })).toMatchObject({
      host: "localhost", port: 1025, secure: false, ignoreTLS: true,
    });
    expect(buildBoardSmtpTransport({ host: "smtp.example.org", port: "587", secure: "false" })).not.toHaveProperty("ignoreTLS");
  });
});
